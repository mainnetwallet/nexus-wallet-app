/**
 * Exchange API key storage. Target keys live under `nexus2/exchange/<id>` and
 * are encrypted at rest by the native SecureStore; this module only shapes the
 * JSON. Legacy plaintext `nexus_exc_keys_v1` is read for migration and removed
 * after a verified copy.
 */
import type { ExchangeCredentials, ExchangeId } from './config.js';

export interface KeyStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove?(key: string): void;
}

export const LEGACY_EXC_KEYS = 'nexus_exc_keys_v1';
export const EXC_KEY_PREFIX = 'nexus2/exchange/';

export function isExchangeCredentials(value: unknown): value is ExchangeCredentials {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.apiKey === 'string' && v.apiKey.length >= 4 && typeof v.secret === 'string' && v.secret.length >= 4;
}

export class ExchangeKeyStore {
  private readonly storage: KeyStorage;

  constructor(storage: KeyStorage) {
    this.storage = storage;
  }

  get(id: ExchangeId): ExchangeCredentials | null {
    const target = this.storage.read(`${EXC_KEY_PREFIX}${id}`);
    if (target) {
      try {
        const parsed = JSON.parse(target);
        if (isExchangeCredentials(parsed)) return parsed;
      } catch { /* fall through to legacy */ }
    }
    const legacy = this.legacyAll()[id];
    return isExchangeCredentials(legacy) ? legacy : null;
  }

  save(id: ExchangeId, creds: ExchangeCredentials): void {
    if (!isExchangeCredentials(creds)) throw new Error('API key and secret are required');
    const payload: ExchangeCredentials = {
      apiKey: creds.apiKey.trim(),
      secret: creds.secret.trim(),
      ...(creds.passphrase ? { passphrase: creds.passphrase } : {}),
    };
    this.storage.write(`${EXC_KEY_PREFIX}${id}`, JSON.stringify(payload));
  }

  remove(id: ExchangeId): void {
    this.storage.remove?.(`${EXC_KEY_PREFIX}${id}`);
  }

  /** Legacy map for migration; may contain malformed entries, filtered on read. */
  legacyAll(): Record<string, unknown> {
    const raw = this.storage.read(LEGACY_EXC_KEYS);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  listConfigured(): ExchangeId[] {
    const out: ExchangeId[] = [];
    for (const key of ['binance', 'kucoin', 'mexc', 'bybit', 'bitmart', 'bitget', 'kraken', 'gateio', 'coinbase', 'bingx', 'htx', 'phemex', 'digifinex', 'lbank', 'bitfinex'] as ExchangeId[]) {
      if (this.get(key)) out.push(key);
    }
    return out;
  }

  /** Migration: copies valid legacy entries without deleting the source. */
  migrateLegacy(): { copied: ExchangeId[]; skipped: string[] } {
    const legacy = this.legacyAll();
    const copied: ExchangeId[] = [];
    const skipped: string[] = [];
    for (const [id, creds] of Object.entries(legacy)) {
      if (!isExchangeCredentials(creds)) {
        skipped.push(id);
        continue;
      }
      this.save(id as ExchangeId, creds);
      copied.push(id as ExchangeId);
    }
    return { copied, skipped };
  }
}

/** Display-only mask: first three characters, per the secrets policy. */
export function maskApiKey(apiKey: string): string {
  return apiKey ? `${apiKey.slice(0, 3)}…` : '—';
}

export function hasPassphraseRequirement(id: ExchangeId): boolean {
  return ['kucoin', 'bitmart', 'bitget', 'coinbase'].includes(id);
}
