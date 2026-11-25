/**
 * Legacy → native migration, per docs/MIGRATION_PLAN.md.
 *
 * Reads the legacy WebView localStorage map once, decrypts wallet material with
 * the legacy master secret (ncx4 AES-GCM / ncx3-nsx2 XOR), verifies that every
 * decrypted key derives an address, writes an encrypted payload to the target
 * store, reads it back and compares, then (optionally) deletes legacy keys.
 * Legacy values are never printed; counts are masked.
 */
import { sha256 } from '@noble/hashes/sha256';
import {
  decryptLegacyGroups,
  decryptLegacyValue,
  isNcx4,
  type LegacyWalletGroup,
} from '../crypto/legacyCrypto.js';
import { LEGACY_STORAGE_SCHEMA, MASTER_SECRET_KEY, WALLET_GROUP_BACKUP_KEY, WALLET_GROUP_STORAGE_KEY } from '../storage/schema.js';
import { addressFromKey, isValidPrivateKey, normalizeKey } from '../wallet/keys.js';
import type { WalletGroup } from '../wallet/groups.js';

export const TARGET_PREFIX = 'nexus2/';
export const TARGET_GROUPS = `${TARGET_PREFIX}groups`;
export const TARGET_SETTINGS = `${TARGET_PREFIX}settings`;
export const TARGET_CHAINS = `${TARGET_PREFIX}chains`;
export const TARGET_HISTORY = `${TARGET_PREFIX}history`;
export const TARGET_EXCHANGES = `${TARGET_PREFIX}exchange`;
export const TARGET_ROLLBACK = `${TARGET_PREFIX}migration/rollback`;
export const TARGET_MANIFEST = `${TARGET_PREFIX}migration`;
export const TARGET_LEGACY_KEYS = `${TARGET_PREFIX}legacyKeys/`;

export interface LegacyReader {
  /** Returns every legacy localStorage entry, values as strings. */
  readAll(): Promise<Record<string, string>>;
  /** Deletes the given legacy keys. Called only after a verified migration. */
  deleteKeys(keys: string[]): Promise<void>;
}

/** Encrypted, Keystore-backed store implemented by the native layer. */
export interface EncryptedStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

export interface MigrationManifest {
  status: 'verified' | 'pending';
  verifiedAt: number | null;
  /** SHA-256 over the sorted names of consumed legacy keys (no values). */
  legacyKeyHash: string;
  groups: number;
  keys: number;
  mnemonics: number;
  exchangeKeys: number;
  skippedExchangeKeys: number;
  unrecoverableKeys: number;
  settings: number;
  partialGroups: number;
  legacyDeleted: boolean;
}

export interface MigrationCounts {
  groups: number;
  keys: number;
  mnemonics: number;
  exchangeKeys: number;
  skippedExchangeKeys: number;
  unrecoverableKeys: number;
  settings: number;
  partialGroups: number;
}

export type MigrationFailure =
  | 'already-migrated'
  | 'missing-secret'
  | 'bad-groups-json'
  | 'no-source-keys'
  | 'nothing-decrypted'
  | 'verification-failed'
  | 'store-error';

export type MigrationResult =
  | { status: 'none' }
  | { status: 'verified'; counts: MigrationCounts; manifest: MigrationManifest }
  | { status: 'failed'; reason: MigrationFailure; message: string; counts?: MigrationCounts };

export interface MigrationOptions {
  /** Delete legacy wallet/secret keys after read-back verification (default false). */
  commitLegacy?: boolean;
  now?: () => number;
  /** Overwrite an existing verified nexus2 manifest. */
  force?: boolean;
  maxGroups?: number;
  maxKeysPerGroup?: number;
}

interface ExchangeEntry {
  apiKey: string;
  secret: string;
  passphrase?: string;
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function keyHash(keys: string[]): string {
  const joined = [...keys].sort().join('\n');
  return Array.from(sha256(new TextEncoder().encode(joined)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Decrypts a legacy value that may be a single string or a JSON array of strings. */
export async function decryptLegacyKeyValue(
  stored: string,
  secret: string,
): Promise<{ values: string[]; failed: number }> {
  const arr = stored.trim().startsWith('[') ? parseJson<unknown[]>(stored) : null;
  const source = Array.isArray(arr) ? arr.map((v) => String(v)) : [stored];
  const values: string[] = [];
  let failed = 0;
  for (const raw of source) {
    if (!raw) continue;
    const plain = await decryptLegacyValue(raw, secret);
    if (plain) values.push(plain);
    else failed++;
  }
  return { values, failed };
}

function toWalletGroups(groups: LegacyWalletGroup[]): WalletGroup[] {
  const out: WalletGroup[] = [];
  for (const g of groups) {
    if (!g || typeof g.id !== 'string' || !Array.isArray(g.keys)) continue;
    out.push({
      id: g.id,
      name: typeof g.name === 'string' ? g.name : g.id,
      keys: g.keys
        .filter((k) => typeof k === 'string' && k.trim())
        .map((k) => (isValidPrivateKey(k) ? normalizeKey(k) : k.trim())),
      mnemonics: Array.isArray(g.mnemonics) ? g.mnemonics.filter((m) => typeof m === 'string' && m.trim()) : [],
      createdAt: typeof g.createdAt === 'number' ? g.createdAt : 0,
      source: g.source === 'created' ? 'created' : 'imported',
    });
  }
  return out;
}

async function readLegacyGroups(
  legacy: Record<string, string>,
  secret: string,
  opts: MigrationOptions,
): Promise<{ groups: LegacyWalletGroup[]; partial: boolean; failed: boolean; source: string; storedKeys: number }> {
  for (const key of [WALLET_GROUP_STORAGE_KEY, WALLET_GROUP_BACKUP_KEY]) {
    const stored = legacy[key];
    if (!stored) continue;
    let json = stored;
    if (isNcx4(stored)) {
      const plain = await decryptLegacyValue(stored, secret);
      if (!plain) continue;
      json = plain;
    }
    const parsed = parseJson<unknown>(json);
    if (!Array.isArray(parsed)) continue;
    const result = await decryptLegacyGroups(parsed, secret, {
      maxGroups: opts.maxGroups,
      maxKeysPerGroup: opts.maxKeysPerGroup,
    });
    for (const g of result.groups) {
      if (!Array.isArray(g.mnemonics)) continue;
      const plain: string[] = [];
      for (const m of g.mnemonics) {
        const p = await decryptLegacyValue(String(m), secret);
        if (p) plain.push(p);
      }
      g.mnemonics = plain;
    }
    const storedKeys = parsed.reduce<number>((n, raw) => {
      const g = raw as LegacyWalletGroup;
      return n + (g && Array.isArray(g.keys) ? g.keys.length : 0);
    }, 0);
    if (result.groups.length) {
      return { groups: result.groups, partial: result.partial, failed: result.failed, source: key, storedKeys };
    }
  }
  return { groups: [], partial: false, failed: false, source: '', storedKeys: 0 };
}

function parseExchangeKeys(raw: string | undefined): { entries: Record<string, ExchangeEntry>; skipped: number } {
  const parsed = parseJson<Record<string, unknown>>(raw);
  const entries: Record<string, ExchangeEntry> = {};
  let skipped = 0;
  if (!parsed || typeof parsed !== 'object') return { entries, skipped };
  for (const [id, value] of Object.entries(parsed)) {
    const v = value as Partial<ExchangeEntry> | null;
    if (v && typeof v.apiKey === 'string' && v.apiKey.trim() && typeof v.secret === 'string' && v.secret.trim()) {
      entries[id] = {
        apiKey: v.apiKey,
        secret: v.secret,
        ...(typeof v.passphrase === 'string' && v.passphrase ? { passphrase: v.passphrase } : {}),
      };
    } else {
      skipped++;
    }
  }
  return { entries, skipped };
}

function collectSettings(legacy: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of LEGACY_STORAGE_SCHEMA) {
    if (def.migrate !== 'value') continue;
    if (!def.dynamicPrefix) {
      if (def.key in legacy) out[def.key] = legacy[def.key] as string;
      continue;
    }
    for (const [key, value] of Object.entries(legacy)) {
      if (key.startsWith(def.dynamicPrefix) && key !== def.dynamicPrefix) out[key] = value;
    }
  }
  return out;
}

function addressesOf(groups: WalletGroup[]): string[] {
  return groups.flatMap((g) => g.keys.map((k) => addressFromKey(k) ?? ''));
}

export async function migrateLegacy(
  reader: LegacyReader,
  store: EncryptedStore,
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const now = options.now ?? (() => Date.now());
  let legacy: Record<string, string>;
  try {
    legacy = await reader.readAll();
  } catch (err) {
    return { status: 'failed', reason: 'store-error', message: `Cannot read legacy store: ${errorText(err)}` };
  }

  if (!legacy[WALLET_GROUP_STORAGE_KEY] && !legacy[WALLET_GROUP_BACKUP_KEY] && !legacy[MASTER_SECRET_KEY]) {
    return { status: 'none' };
  }

  if (!options.force) {
    const existing = parseJson<MigrationManifest>(await safeGet(store, TARGET_MANIFEST));
    if (existing?.status === 'verified') return { status: 'failed', reason: 'already-migrated', message: 'nexus2 data already verified' };
  }

  const secret = legacy[MASTER_SECRET_KEY];
  if (!secret) {
    return { status: 'failed', reason: 'missing-secret', message: 'Legacy master secret is missing; enter the legacy PIN to retry' };
  }

  let legacyGroups: Awaited<ReturnType<typeof readLegacyGroups>>;
  try {
    legacyGroups = await readLegacyGroups(legacy, secret, options);
  } catch (err) {
    return { status: 'failed', reason: 'bad-groups-json', message: `Legacy groups are unreadable: ${errorText(err)}` };
  }

  let unrecoverable = 0;
  const extraKeys: Record<string, string[]> = {};
  for (const def of LEGACY_STORAGE_SCHEMA) {
    if (def.migrate !== 'keys' || def.dynamicPrefix) continue;
    if ([WALLET_GROUP_STORAGE_KEY, WALLET_GROUP_BACKUP_KEY, MASTER_SECRET_KEY, 'nexus_exc_keys_v1'].includes(def.key)) continue;
    const stored = legacy[def.key];
    if (!stored) continue;
    const dec = await decryptLegacyKeyValue(stored, secret);
    unrecoverable += dec.failed;
    if (dec.values.length) extraKeys[def.key] = dec.values;
  }

  const groups = toWalletGroups(legacyGroups.groups);
  const sourceKeyCount = legacyGroups.storedKeys;
  const decryptedKeyCount = legacyGroups.groups.reduce((n, g) => n + (Array.isArray(g.keys) ? g.keys.length : 0), 0);
  // decryptLegacyGroups drops values that failed to decrypt, so the difference
  // between the stored key count and the decrypted count is unrecoverable.
  unrecoverable += Math.max(0, sourceKeyCount - decryptedKeyCount);
  const mnemonics = groups.reduce((n, g) => n + g.mnemonics.length, 0);
  const exchange = parseExchangeKeys(legacy.nexus_exc_keys_v1);
  const settings = collectSettings(legacy);

  const counts: MigrationCounts = {
    groups: groups.length,
    keys: groups.reduce((n, g) => n + g.keys.length, 0),
    mnemonics,
    exchangeKeys: Object.keys(exchange.entries).length,
    skippedExchangeKeys: exchange.skipped,
    unrecoverableKeys: unrecoverable,
    settings: Object.keys(settings).length,
    partialGroups: legacyGroups.groups.filter((g) => g._decryptFailed || g.keys.length === 0).length,
  };

  if (groups.length && counts.keys === 0) {
    return { status: 'failed', reason: 'nothing-decrypted', message: 'No private key could be decrypted; legacy PIN or secret is wrong', counts };
  }
  if (!groups.length && sourceKeyCount > 0) {
    return { status: 'failed', reason: 'nothing-decrypted', message: 'No group could be decrypted; legacy PIN or secret is wrong', counts };
  }

  const invalid = groups.flatMap((g) => g.keys.filter((k) => !addressFromKey(k)));
  if (invalid.length) {
    return {
      status: 'failed',
      reason: 'verification-failed',
      message: `${invalid.length} decrypted key(s) do not derive an address; migration stopped`,
      counts,
    };
  }

  const consumedKeys = LEGACY_STORAGE_SCHEMA.map((d) => d.key).filter((k) => k in legacy);
  const manifest: MigrationManifest = {
    status: 'pending',
    verifiedAt: null,
    legacyKeyHash: keyHash(consumedKeys),
    groups: counts.groups,
    keys: counts.keys,
    mnemonics: counts.mnemonics,
    exchangeKeys: counts.exchangeKeys,
    skippedExchangeKeys: counts.skippedExchangeKeys,
    unrecoverableKeys: counts.unrecoverableKeys,
    settings: counts.settings,
    partialGroups: counts.partialGroups,
    legacyDeleted: false,
  };

  const history = ['nexus_tx_history', 'nexus_bridge_history', 'nexus_swap_history'].reduce<Record<string, string>>(
    (acc, key) => {
      if (legacy[key]) acc[key] = legacy[key] as string;
      return acc;
    },
    {},
  );

  try {
    await store.set(TARGET_ROLLBACK, JSON.stringify(legacy));
    await store.set(TARGET_GROUPS, JSON.stringify(groups));
    await store.set(TARGET_SETTINGS, JSON.stringify(settings));
    if (Object.keys(extraKeys).length) await store.set(TARGET_LEGACY_KEYS + 'all', JSON.stringify(extraKeys));
    if (Object.keys(history).length) await store.set(TARGET_HISTORY, JSON.stringify(history));
    await store.set(
      TARGET_CHAINS,
      JSON.stringify({
        customRpcs: parseJson(legacy.nexus_custom_rpcs_v1),
        customChains: pickDynamic(legacy, 'nexus_custom_chains_'),
      }),
    );
    await store.set(TARGET_EXCHANGES, JSON.stringify({ keys: exchange.entries, active: legacy.nexus_exc_active ?? null }));
    await store.set(TARGET_MANIFEST, JSON.stringify(manifest));
  } catch (err) {
    await safeDelete(store, [TARGET_GROUPS, TARGET_SETTINGS, TARGET_CHAINS, TARGET_HISTORY, TARGET_EXCHANGES, TARGET_MANIFEST]);
    return { status: 'failed', reason: 'store-error', message: `Write failed: ${errorText(err)}`, counts };
  }

  const readBack = parseJson<WalletGroup[]>(await safeGet(store, TARGET_GROUPS));
  if (!Array.isArray(readBack)) {
    await safeDelete(store, [TARGET_GROUPS, TARGET_SETTINGS, TARGET_CHAINS, TARGET_HISTORY, TARGET_EXCHANGES, TARGET_MANIFEST]);
    return { status: 'failed', reason: 'verification-failed', message: 'Read-back of migrated groups failed', counts };
  }
  const expected = addressesOf(groups);
  const actual = addressesOf(readBack);
  const keysMatch = actual.length === expected.length && actual.every((a, i) => a === expected[i]);
  if (!keysMatch) {
    await safeDelete(store, [TARGET_GROUPS, TARGET_SETTINGS, TARGET_CHAINS, TARGET_HISTORY, TARGET_EXCHANGES, TARGET_MANIFEST]);
    return { status: 'failed', reason: 'verification-failed', message: 'Read-back address mismatch; legacy data kept', counts };
  }

  manifest.status = 'verified';
  manifest.verifiedAt = now();
  await store.set(TARGET_MANIFEST, JSON.stringify(manifest));

  if (options.commitLegacy) {
    try {
      await reader.deleteKeys(consumedKeys);
      manifest.legacyDeleted = true;
      await store.set(TARGET_MANIFEST, JSON.stringify(manifest));
    } catch {
      // Data is verified; deletion can be retried on the next boot.
    }
  }

  return { status: 'verified', counts, manifest };
}

function pickDynamic(legacy: Record<string, string>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(legacy)) {
    if (key.startsWith(prefix) && key !== prefix) out[key] = value;
  }
  return out;
}

async function safeGet(store: EncryptedStore, key: string): Promise<string | null> {
  try {
    return await store.get(key);
  } catch {
    return null;
  }
}

async function safeDelete(store: EncryptedStore, keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await store.delete(key);
    } catch {
      /* best-effort cleanup */
    }
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 160) : 'unknown error';
}
