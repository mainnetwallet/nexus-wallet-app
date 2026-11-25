/**
 * Wallet-group model and operations. Ported from index.html ~24610+:
 * - id format `wg-${Date.now()}`
 * - duplicate group names rejected case-insensitively
 * - new groups auto-selected in the settings multi-select
 * - edit mode updates existing group in place
 * - creation generates random wallets (source 'created')
 * - migration verification derives an address for every key before commit
 */
import { Wallet } from 'ethers';
import {
  deriveFromPhrases,
  isValidPrivateKey,
  normalizeKey,
  addressFromKey,
  type DeriveOptions,
} from './keys.js';

export interface WalletGroup {
  id: string;
  name: string;
  keys: string[];
  mnemonics: string[];
  createdAt: number;
  source: 'imported' | 'created';
}

export type CreateGroupResult =
  | { ok: true; group: WalletGroup; groups: WalletGroup[]; selectedGroupIds: string[] }
  | { ok: false; error: string };

export function makeGroupId(now = Date.now()): string {
  return `wg-${now}`;
}

export function validateGroupName(name: string, groups: WalletGroup[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Group name cannot be empty';
  if (groups.some((g) => g.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    return 'Name already exists — please choose a different name';
  }
  return null;
}

export function parsePrivateKeys(raw: string): { valid: string[]; total: number } {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const valid = [...new Set(lines.filter(isValidPrivateKey).map(normalizeKey))];
  return { valid, total: lines.length };
}

export interface ImportGroupInput {
  name: string;
  groups: WalletGroup[];
  selectedGroupIds: string[];
  privateKeysText?: string;
  phrases?: string[];
  derive?: DeriveOptions;
  source?: WalletGroup['source'];
  createdAt?: number;
}

export function importWalletGroup(input: ImportGroupInput): CreateGroupResult {
  const name = input.name.trim();
  const nameError = validateGroupName(name, input.groups);
  if (nameError) return { ok: false, error: nameError };

  let keys: string[] = [];
  let mnemonics: string[] = [];

  if (input.phrases && input.phrases.length > 0) {
    const derived = deriveFromPhrases(input.phrases, input.derive);
    keys = [...new Set(derived.map((d) => d.privateKey))];
    mnemonics = input.phrases;
    if (keys.length === 0) return { ok: false, error: 'No wallets derived. Enter valid seed phrase(s)' };
  } else {
    const parsed = parsePrivateKeys(input.privateKeysText ?? '');
    keys = parsed.valid;
    if (parsed.total > 0 && keys.length === 0) {
      return { ok: false, error: 'No valid private keys found. Check format (0x + 64 hex chars)' };
    }
    if (keys.length === 0) return { ok: false, error: 'Please enter at least one private key' };
  }

  const group: WalletGroup = {
    id: makeGroupId(input.createdAt ?? Date.now()),
    name,
    keys,
    mnemonics: mnemonics.length === keys.length ? mnemonics : [],
    createdAt: input.createdAt ?? Date.now(),
    source: input.source ?? 'imported',
  };
  const groups = [...input.groups, group];
  const selectedGroupIds = input.selectedGroupIds.includes(group.id)
    ? input.selectedGroupIds
    : [...input.selectedGroupIds, group.id];
  return { ok: true, group, groups, selectedGroupIds };
}

export function createRandomWallets(count: number): { privateKey: string; address: string }[] {
  const n = Math.max(1, Math.min(1000, Math.trunc(count)));
  return Array.from({ length: n }, () => {
    const w = Wallet.createRandom();
    return { privateKey: w.privateKey.toLowerCase(), address: w.address };
  });
}

export function createRandomGroup(input: {
  name: string;
  groups: WalletGroup[];
  selectedGroupIds: string[];
  count: number;
  createdAt?: number;
}): CreateGroupResult {
  const name = input.name.trim();
  const nameError = validateGroupName(name, input.groups);
  if (nameError) return { ok: false, error: nameError };
  const wallets = createRandomWallets(input.count);
  const group: WalletGroup = {
    id: makeGroupId(input.createdAt ?? Date.now()),
    name,
    keys: wallets.map((w) => w.privateKey),
    mnemonics: [],
    createdAt: input.createdAt ?? Date.now(),
    source: 'created',
  };
  return {
    ok: true,
    group,
    groups: [...input.groups, group],
    selectedGroupIds: input.selectedGroupIds.includes(group.id)
      ? input.selectedGroupIds
      : [...input.selectedGroupIds, group.id],
  };
}

export function updateGroup(
  groups: WalletGroup[],
  groupId: string,
  patch: { name?: string; keys?: string[] },
): CreateGroupResult {
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx === -1) return { ok: false, error: 'Group not found' };
  const next = groups.map((g) => ({ ...g }));
  if (patch.name !== undefined) {
    const nameError = validateGroupName(
      patch.name,
      groups.filter((g) => g.id !== groupId),
    );
    if (nameError) return { ok: false, error: nameError };
    next[idx]!.name = patch.name.trim();
  }
  if (patch.keys !== undefined) {
    const keys = [...new Set(patch.keys.filter(isValidPrivateKey).map(normalizeKey))];
    if (keys.length === 0) return { ok: false, error: 'Please enter at least one private key' };
    next[idx]!.keys = keys;
  }
  return { ok: true, group: next[idx]!, groups: next, selectedGroupIds: [] };
}

/**
 * Multi-group selection flattening, ported from `applyMultiGroupSelection`:
 * ordered by group order, deduped, with group metadata per key.
 */
export interface OrderedKey {
  key: string;
  groupId: string;
  groupName: string;
  groupIndex: number;
  keyIndexInGroup: number;
}

export function flattenSelectedKeys(groups: WalletGroup[], selectedGroupIds: string[]): OrderedKey[] {
  const selected = selectedGroupIds
    .map((id) => groups.find((g) => g.id === id))
    .filter((g): g is WalletGroup => Boolean(g));
  const seen = new Set<string>();
  const out: OrderedKey[] = [];
  selected.forEach((g, groupIndex) => {
    g.keys.forEach((k, keyIndexInGroup) => {
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ key: k, groupId: g.id, groupName: g.name, groupIndex, keyIndexInGroup });
      }
    });
  });
  return out;
}

/**
 * Settings selection honors per-key selection (`_cwSelectedKeys[groupId]`) when
 * present, else takes the whole group (ported from `applySettingsGroupSelection`).
 */
export function flattenSettingsKeys(
  groups: WalletGroup[],
  selectedGroupIds: string[],
  perKeySelection?: Record<string, Set<number>>,
): string[] {
  const selected = selectedGroupIds
    .map((id) => groups.find((g) => g.id === id))
    .filter((g): g is WalletGroup => Boolean(g));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of selected) {
    const perKey = perKeySelection?.[g.id];
    if (perKey && perKey.size > 0) {
      g.keys.forEach((k, i) => {
        if (perKey.has(i) && !seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      });
    } else {
      for (const k of g.keys) {
        if (!seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      }
    }
  }
  return out;
}

export interface MigrationVerification {
  ok: boolean;
  totalKeys: number;
  validKeys: number;
  invalidKeys: string[];
  addresses: string[];
}

/**
 * Section 10 requirement: only mark migration complete when every decrypted key
 * derives a valid address. Invalid keys are reported masked; none are dropped.
 */
export function verifyMigratedGroups(groups: WalletGroup[]): MigrationVerification {
  const invalidKeys: string[] = [];
  const addresses: string[] = [];
  let total = 0;
  for (const g of groups) {
    for (const k of g.keys) {
      total++;
      const addr = addressFromKey(k);
      if (addr) addresses.push(addr);
      else invalidKeys.push(`${k.slice(0, 8)}…`);
    }
  }
  return { ok: invalidKeys.length === 0, totalKeys: total, validKeys: addresses.length, invalidKeys, addresses };
}
