import { describe, expect, it } from '@jest/globals';
import { Wallet, encodeBase64 } from 'ethers';
import {
  MASTER_SECRET_KEY,
  WALLET_GROUP_STORAGE_KEY,
  decryptLegacyGroups,
  encryptNcx4,
  generateLegacyMasterSecret,
  isNcx4,
  xorPad,
} from '../src/index.js';
import {
  TARGET_EXCHANGES,
  TARGET_GROUPS,
  TARGET_MANIFEST,
  TARGET_ROLLBACK,
  TARGET_SETTINGS,
  decryptLegacyKeyValue,
  migrateLegacy,
  type EncryptedStore,
  type LegacyReader,
} from '../src/migration/index.js';

class MemoryStore implements EncryptedStore {
  readonly map = new Map<string, string>();
  failOn?: string;
  corruptOnGet?: string;
  async set(key: string, value: string): Promise<void> {
    if (this.failOn === key) throw new Error('disk full');
    this.map.set(key, value);
  }
  async get(key: string): Promise<string | null> {
    if (this.corruptOnGet === key) {
      const v = this.map.get(key);
      if (!v) return v ?? null;
      const parsed = JSON.parse(v) as { keys: string[] }[];
      parsed.pop();
      return JSON.stringify(parsed);
    }
    return this.map.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

function readerOf(legacy: Record<string, string>): LegacyReader & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async readAll() {
      return { ...legacy };
    },
    async deleteKeys(keys: string[]) {
      deleted.push(...keys);
    },
  };
}

function xorEncode(plain: string, secret: string): string {
  const pad = xorPad(secret);
  const bytes = new TextEncoder().encode(plain);
  for (let i = 0; i < bytes.length; i++) bytes[i] = bytes[i]! ^ pad[i % pad.length]!;
  return `ncx3:${encodeBase64(bytes)}`;
}

async function buildLegacy(secret: string) {
  const w1 = Wallet.createRandom();
  const w2 = Wallet.createRandom();
  const w3 = Wallet.createRandom();
  const phrase = 'test phrase for legacy mnemonic storage';
  const groups = [
    {
      id: 'wg-1',
      name: 'Main',
      keys: [await encryptNcx4(w1.privateKey, secret), w2.privateKey],
      mnemonics: [await encryptNcx4(phrase, secret)],
      createdAt: 111,
      source: 'imported',
    },
    {
      id: 'wg-2',
      name: 'Alt',
      keys: [await encryptNcx4(w3.privateKey, secret)],
      mnemonics: [],
      createdAt: 222,
      source: 'created',
    },
  ];
  const legacy: Record<string, string> = {
    [WALLET_GROUP_STORAGE_KEY]: JSON.stringify(groups),
    [MASTER_SECRET_KEY]: secret,
    nexus_active_chain: '1',
    'nexus-theme': 'dark',
    nexus_display_currency: 'BDT',
    nexus_exc_keys_v1: JSON.stringify({
      binance: { apiKey: 'AK123456', secret: 'SK123456' },
      broken: { apiKey: 'only-key' },
    }),
    nexus_exc_active: 'binance',
    nexus_send_from_pk: await encryptNcx4(w1.privateKey, secret),
    nexus_tx_history: JSON.stringify([{ hash: '0x1' }]),
    nexus_custom_rpcs_v1: JSON.stringify({ 1: { rpcs: [] } }),
    'nexus_custom_chains_wg-1': JSON.stringify([]),
    nexus_token_cache: '{"cached":true}',
    __nexus_fsk_v1__: 'device-fallback',
    npc: 'unrelated',
  };
  return { legacy, addresses: [w1.address, w2.address, w3.address], phrase };
}

describe('migrateLegacy', () => {
  it('reports none when there is no legacy data', async () => {
    const result = await migrateLegacy(readerOf({ npc: 'x' }), new MemoryStore());
    expect(result).toEqual({ status: 'none' });
  });

  it('migrates groups, settings, exchange keys and history after verification', async () => {
    const secret = generateLegacyMasterSecret();
    const { legacy, addresses, phrase } = await buildLegacy(secret);
    const store = new MemoryStore();
    const reader = readerOf(legacy);

    const result = await migrateLegacy(reader, store);
    expect(result.status).toBe('verified');
    if (result.status !== 'verified') return;

    expect(result.counts).toMatchObject({
      groups: 2,
      keys: 3,
      mnemonics: 1,
      exchangeKeys: 1,
      skippedExchangeKeys: 1,
      unrecoverableKeys: 0,
      partialGroups: 0,
    });
    expect(result.counts.settings).toBeGreaterThanOrEqual(5);
    expect(result.manifest.status).toBe('verified');
    expect(result.manifest.verifiedAt).toBeGreaterThan(0);
    expect(result.manifest.legacyKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.manifest.legacyDeleted).toBe(false);

    const groups = JSON.parse(store.map.get(TARGET_GROUPS)!) as { keys: string[]; mnemonics: string[] }[];
    expect(groups).toHaveLength(2);
    const storedKeys = groups.flatMap((g) => g.keys);
    expect(storedKeys).toHaveLength(3);
    for (const key of storedKeys) expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    const { Wallet: W } = await import('ethers');
    const derived = storedKeys.map((k) => new W(k).address);
    expect(new Set(derived)).toEqual(new Set(addresses));
    expect(groups[0]!.mnemonics).toEqual([phrase]);

    const settings = JSON.parse(store.map.get(TARGET_SETTINGS)!) as Record<string, string>;
    expect(settings['nexus-theme']).toBe('dark');
    expect(settings.nexus_active_chain).toBe('1');
    expect(settings.nexus_token_cache).toBeUndefined();
    expect(settings.__nexus_fsk_v1__).toBeUndefined();

    const exchanges = JSON.parse(store.map.get(TARGET_EXCHANGES)!) as {
      keys: Record<string, unknown>;
      active: string;
    };
    expect(Object.keys(exchanges.keys)).toEqual(['binance']);
    expect(exchanges.active).toBe('binance');

    const rollback = JSON.parse(store.map.get(TARGET_ROLLBACK)!) as Record<string, string>;
    expect(rollback[MASTER_SECRET_KEY]).toBe(secret);
    expect(rollback[WALLET_GROUP_STORAGE_KEY]).toBe(legacy[WALLET_GROUP_STORAGE_KEY]);

    expect(reader.deleted).toEqual([]);
    const manifest = JSON.parse(store.map.get(TARGET_MANIFEST)!) as { status: string };
    expect(manifest.status).toBe('verified');
  });

  it('decrypts ncx3 XOR keys and counts ncx1 as unrecoverable without dropping good keys', async () => {
    const secret = generateLegacyMasterSecret();
    const w = Wallet.createRandom();
    const legacy: Record<string, string> = {
      [WALLET_GROUP_STORAGE_KEY]: JSON.stringify([
        { id: 'wg-x', name: 'Old', keys: [xorEncode(w.privateKey, secret), 'ncx1:deadbeef'], createdAt: 1 },
      ]),
      [MASTER_SECRET_KEY]: secret,
    };
    const result = await migrateLegacy(readerOf(legacy), new MemoryStore());
    expect(result.status).toBe('verified');
    if (result.status !== 'verified') return;
    expect(result.counts.keys).toBe(1);
    expect(result.counts.unrecoverableKeys).toBe(1);
  });

  it('fails with nothing-decrypted on a wrong secret and keeps legacy intact', async () => {
    const secret = generateLegacyMasterSecret();
    const groups = [
      { id: 'wg-1', name: 'Main', keys: [await encryptNcx4(Wallet.createRandom().privateKey, secret)], createdAt: 1 },
    ];
    const legacy: Record<string, string> = {
      [WALLET_GROUP_STORAGE_KEY]: JSON.stringify(groups),
      [MASTER_SECRET_KEY]: generateLegacyMasterSecret(),
    };
    const store = new MemoryStore();
    const reader = readerOf(legacy);
    const result = await migrateLegacy(reader, store);
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.reason).toBe('nothing-decrypted');
    expect(store.map.size).toBe(0);
    expect(reader.deleted).toEqual([]);
  });

  it('fails with missing-secret when only groups are present', async () => {
    const result = await migrateLegacy(
      readerOf({ [WALLET_GROUP_STORAGE_KEY]: JSON.stringify([{ id: 'g', name: 'G', keys: [] }]) }),
      new MemoryStore(),
    );
    expect(result).toMatchObject({ status: 'failed', reason: 'missing-secret' });
  });

  it('refuses to overwrite a verified manifest unless forced', async () => {
    const secret = generateLegacyMasterSecret();
    const { legacy } = await buildLegacy(secret);
    const store = new MemoryStore();
    store.map.set(TARGET_MANIFEST, JSON.stringify({ status: 'verified' }));

    const blocked = await migrateLegacy(readerOf(legacy), store);
    expect(blocked).toMatchObject({ status: 'failed', reason: 'already-migrated' });

    const forced = await migrateLegacy(readerOf(legacy), store, { force: true });
    expect(forced.status).toBe('verified');
  });

  it('deletes legacy keys only after a verified commit', async () => {
    const secret = generateLegacyMasterSecret();
    const { legacy } = await buildLegacy(secret);
    const store = new MemoryStore();
    const reader = readerOf(legacy);
    const result = await migrateLegacy(reader, store, { commitLegacy: true });
    expect(result.status).toBe('verified');
    if (result.status !== 'verified') return;
    expect(result.manifest.legacyDeleted).toBe(true);
    expect(reader.deleted).toContain(WALLET_GROUP_STORAGE_KEY);
    expect(reader.deleted).toContain(MASTER_SECRET_KEY);
    expect(reader.deleted).toContain('nexus_exc_keys_v1');
    expect(reader.deleted).not.toContain('npc');
  });

  it('fails verification when read-back loses a key and cleans partial writes', async () => {
    const secret = generateLegacyMasterSecret();
    const { legacy } = await buildLegacy(secret);
    const store = new MemoryStore();
    store.corruptOnGet = TARGET_GROUPS;
    const reader = readerOf(legacy);
    const result = await migrateLegacy(reader, store);
    expect(result).toMatchObject({ status: 'failed', reason: 'verification-failed' });
    expect(store.map.has(TARGET_GROUPS)).toBe(false);
    expect(store.map.has(TARGET_MANIFEST)).toBe(false);
    expect(reader.deleted).toEqual([]);
  });

  it('fails cleanly when the target store rejects a write', async () => {
    const secret = generateLegacyMasterSecret();
    const { legacy } = await buildLegacy(secret);
    const store = new MemoryStore();
    store.failOn = TARGET_GROUPS;
    const result = await migrateLegacy(readerOf(legacy), store);
    expect(result).toMatchObject({ status: 'failed', reason: 'store-error' });
    expect(store.map.has(TARGET_MANIFEST)).toBe(false);
  });

  it('refuses keys that decrypt to a non-key value', async () => {
    const secret = generateLegacyMasterSecret();
    const legacy: Record<string, string> = {
      [WALLET_GROUP_STORAGE_KEY]: JSON.stringify([
        { id: 'wg-1', name: 'Bad', keys: [await encryptNcx4('not a private key', secret)], createdAt: 1 },
      ]),
      [MASTER_SECRET_KEY]: secret,
    };
    const store = new MemoryStore();
    const result = await migrateLegacy(readerOf(legacy), store);
    expect(result).toMatchObject({ status: 'failed', reason: 'verification-failed' });
    expect(store.map.has(TARGET_GROUPS)).toBe(false);
  });

  it('reports a read failure as store-error', async () => {
    const broken: LegacyReader = {
      async readAll() {
        throw new Error('no webview data');
      },
      async deleteKeys() {},
    };
    const result = await migrateLegacy(broken, new MemoryStore());
    expect(result).toMatchObject({ status: 'failed', reason: 'store-error' });
  });
});

describe('migration helpers', () => {
  it('decrypts JSON arrays of encrypted keys and counts failures', async () => {
    const secret = generateLegacyMasterSecret();
    const k1 = Wallet.createRandom().privateKey;
    const k2 = Wallet.createRandom().privateKey;
    const stored = JSON.stringify([await encryptNcx4(k1, secret), await encryptNcx4(k2, secret), 'ncx1:00']);
    const dec = await decryptLegacyKeyValue(stored, secret);
    expect(dec.values).toEqual([k1.toLowerCase(), k2.toLowerCase()]);
    expect(dec.failed).toBe(1);
  });

  it('legacy group decryption keeps plaintext keys and flags all-failed groups', async () => {
    const secret = generateLegacyMasterSecret();
    const plain = Wallet.createRandom().privateKey;
    const result = await decryptLegacyGroups(
      [
        { id: 'a', name: 'A', keys: [plain, 'ncx1:00'] },
        { id: 'b', name: 'B', keys: ['ncx1:00'] },
      ],
      secret,
    );
    expect(result.groups[0]!.keys).toEqual([plain]);
    expect(result.groups[1]!._decryptFailed).toBe(true);
    expect(result.partial).toBe(true);
    expect(isNcx4('ncx4:a.b')).toBe(true);
  });
});
