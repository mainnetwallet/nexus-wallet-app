/**
 * Balance cache — port of `_saveBalanceCache` / `_restoreBalanceCache`
 * (index.html 23153–23197) with one deliberate security change:
 * the legacy payload embedded the raw wallet private key (`walletKey`) and
 * keyed the cache by its last 8 characters. This port keys by wallet ADDRESS
 * and never persists key material. Legacy payloads are ignored unless the
 * caller explicitly supplies the legacy key for verification.
 *
 * Legacy TTL is `Infinity`: cache never expires, RPC overwrites it.
 */
import { weiToNumber } from '../util/units.js';
import type { RpcClient } from '../rpc/client.js';
import { readErc20Balance } from './erc20.js';

export interface BalanceStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove?(key: string): void;
}

export interface BalanceCachePayload {
  walletId?: string;
  walletKey?: string;
  cache: Record<string, number>;
  cacheTime: Record<string, number>;
  saved: number;
}

export const BALANCE_CACHE_PREFIX = 'nexus_bal_cache_';

export function balanceCacheStorageKey(walletId: string): string {
  return BALANCE_CACHE_PREFIX + walletId.slice(-8).toLowerCase();
}

export function balanceCacheKey(tokenId: string, chainId: number, walletSuffix: string): string {
  return `${tokenId}:${chainId}:${walletSuffix}`;
}

export interface BalanceCacheOptions {
  now?: () => number;
  /** Only used to validate legacy (private-key-keyed) payloads on first open. */
  legacyWalletKey?: string;
}

export class BalanceCache {
  private readonly storage: BalanceStorage;
  private readonly walletId: string;
  private readonly now: () => number;
  private readonly legacyWalletKey?: string;
  private cache: Record<string, number> = {};
  private cacheTime: Record<string, number> = {};

  constructor(storage: BalanceStorage, walletId: string, opts: BalanceCacheOptions = {}) {
    this.storage = storage;
    this.walletId = walletId;
    this.now = opts.now ?? Date.now;
    this.legacyWalletKey = opts.legacyWalletKey;
    this.restore();
  }

  get storageKey(): string {
    return balanceCacheStorageKey(this.walletId);
  }

  get suffix(): string {
    return this.walletId.slice(-8).toLowerCase();
  }

  private restore(): void {
    const raw = this.storage.read(this.storageKey);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as BalanceCachePayload;
      if (!data || typeof data.cache !== 'object') return;
      if (data.walletId && data.walletId.toLowerCase() !== this.walletId.toLowerCase()) return;
      if (!data.walletId) {
        // Legacy payload: contains the private key. Require explicit verification.
        if (!this.legacyWalletKey || data.walletKey !== this.legacyWalletKey) return;
      }
      for (const [k, v] of Object.entries(data.cache)) {
        if (this.cache[k] === undefined) {
          this.cache[k] = v;
          this.cacheTime[k] = data.cacheTime?.[k] ?? data.saved;
        }
      }
    } catch {
      /* ignore corrupt cache */
    }
  }

  get(tokenId: string, chainId: number): number | undefined {
    return this.cache[balanceCacheKey(tokenId, chainId, this.suffix)];
  }

  time(tokenId: string, chainId: number): number | undefined {
    return this.cacheTime[balanceCacheKey(tokenId, chainId, this.suffix)];
  }

  set(tokenId: string, chainId: number, balance: number): void {
    const key = balanceCacheKey(tokenId, chainId, this.suffix);
    this.cache[key] = balance;
    this.cacheTime[key] = this.now();
    this.persist();
  }

  snapshot(): Readonly<Record<string, number>> {
    return { ...this.cache };
  }

  persist(): void {
    try {
      const payload: BalanceCachePayload = {
        walletId: this.walletId,
        cache: this.cache,
        cacheTime: this.cacheTime,
        saved: this.now(),
      };
      this.storage.write(this.storageKey, JSON.stringify(payload));
    } catch {
      /* quota — ignore */
    }
  }

  clear(): void {
    this.cache = {};
    this.cacheTime = {};
    try {
      this.storage.remove?.(this.storageKey);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Legacy `refreshTokenBalance`: native balance or ERC-20 balanceOf, summed
 * across wallet addresses. Returns null when every address failed (so callers
 * never overwrite the cache with a fake zero).
 */
export async function fetchTokenBalance(
  rpc: RpcClient,
  token: { isNative?: boolean; contract?: string; decimals?: number },
  addresses: string[],
): Promise<number | null> {
  const decimals = token.decimals ?? 18;
  const results = await Promise.all(
    addresses.map(async (addr) => {
      try {
        if (token.isNative) {
          const wei = BigInt(await rpc.getBalance(addr));
          return weiToNumber(wei, decimals);
        }
        if (!token.contract || token.contract.length <= 10) return null;
        const raw = await readErc20Balance(rpc, token.contract, addr);
        return weiToNumber(raw, decimals);
      } catch {
        return null;
      }
    }),
  );
  const valid = results.filter((b): b is number => b !== null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) : null;
}
