/**
 * Price engine — faithful port of the legacy "smart parallel price engine v2"
 * (index.html ~21786–22622):
 *   STEP 1 Binance batch (keyless) → STEP 2 CoinGecko → STEP 3 CoinMarketCap
 *   (opt-in secret) → STEP 4 DexScreener per contract.
 * Legacy TTLs: 15 s in-memory, 5 min persisted under `nexus_price_cache_v1`.
 */
import { fetchJson, type FetchLike } from '../http.js';
import { CG_TO_BINANCE, CORE_BINANCE_SYMBOLS, STABLE_IDS, cgIdToSymbol } from './map.js';

export interface PriceQuote {
  usd: number;
  change24h: number;
}

export type PriceMap = Record<string, PriceQuote>;

export interface PriceToken {
  cgId?: string | null;
  address?: string | null;
}

export interface PriceCacheStorage {
  read(key: string): string | null;
  write?(key: string, value: string): void;
  remove?(key: string): void;
}

export type PriceSecretName = 'cgPro' | 'cgDemo' | 'cmcPro';

export interface PriceServiceOptions {
  fetchImpl: FetchLike;
  storage?: PriceCacheStorage;
  /** Runtime-injected keys only; never bundle billing keys in the client. */
  secrets?: Partial<Record<PriceSecretName, string>>;
  now?: () => number;
  /** In-memory cache TTL (legacy `_PRICE_CACHE_TTL`, 15 s). */
  cacheTtlMs?: number;
  /** Persisted cache TTL (legacy `_PRICE_LS_TTL`, 5 min). */
  persistTtlMs?: number;
  binanceBase?: string;
  coingeckoBase?: string;
  dexscreenerBase?: string;
  cmcBase?: string;
  /** CoinGecko demo backoff after HTTP 429 (legacy 120 s). */
  cgBackoffMs?: number;
}

export const PRICE_CACHE_KEY = 'nexus_price_cache_v1';
export const PRICE_CACHE_TTL = 15_000;
export const PRICE_PERSIST_TTL = 5 * 60_000;

interface PersistedCache {
  cache: PriceMap;
  saved: number;
}

export class PriceService {
  private readonly fetchImpl: FetchLike;
  private readonly storage?: PriceCacheStorage;
  private readonly secrets: Partial<Record<PriceSecretName, string>>;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly persistTtlMs: number;
  private readonly binanceBase: string;
  private readonly coingeckoBase: string;
  private readonly dexscreenerBase: string;
  private readonly cmcBase: string;
  private readonly cgBackoffMs: number;

  private cache: PriceMap | null = null;
  private cacheTime = 0;
  private cgDemoBackoffUntil = 0;

  constructor(opts: PriceServiceOptions) {
    this.fetchImpl = opts.fetchImpl;
    this.storage = opts.storage;
    this.secrets = opts.secrets ?? {};
    this.now = opts.now ?? Date.now;
    this.cacheTtlMs = opts.cacheTtlMs ?? PRICE_CACHE_TTL;
    this.persistTtlMs = opts.persistTtlMs ?? PRICE_PERSIST_TTL;
    this.binanceBase = opts.binanceBase ?? 'https://api.binance.com';
    this.coingeckoBase = opts.coingeckoBase ?? 'https://api.coingecko.com/api/v3';
    this.dexscreenerBase = opts.dexscreenerBase ?? 'https://api.dexscreener.com';
    this.cmcBase = opts.cmcBase ?? 'https://pro-api.coinmarketcap.com';
    this.cgBackoffMs = opts.cgBackoffMs ?? 120_000;
    this.restore();
  }

  /** Legacy `_restorePriceCache` — keeps the saved timestamp for TTL math. */
  private restore(): void {
    const raw = this.storage?.read(PRICE_CACHE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as Partial<PersistedCache>;
      if (!data?.cache || typeof data.saved !== 'number') return;
      if (this.now() - data.saved > this.persistTtlMs) return;
      this.cache = data.cache;
      this.cacheTime = data.saved;
    } catch {
      /* ignore corrupt cache */
    }
  }

  private persist(): void {
    if (!this.storage?.write || !this.cache) return;
    try {
      this.storage.write(PRICE_CACHE_KEY, JSON.stringify({ cache: this.cache, saved: this.now() } satisfies PersistedCache));
    } catch {
      /* quota — ignore like legacy */
    }
  }

  /** Cached price map without any network IO. */
  peek(): PriceMap | null {
    return this.cache;
  }

  price(cgId: string): PriceQuote | null {
    return this.cache?.[cgId.toLowerCase()] ?? null;
  }

  /**
   * Fetch prices for every cgId; tokens with an `address` feed the DexScreener
   * step. Returns the merged map. Throws only when every source fails.
   */
  async fetchAll(tokens: Array<string | PriceToken>, opts: { force?: boolean } = {}): Promise<PriceMap> {
    const cgIds = [...new Set(tokens.map((t) => (typeof t === 'string' ? t : t.cgId)).filter((id): id is string => !!id))];
    if (!cgIds.length) throw new Error('No tokens to price');

    if (!opts.force && this.cache && this.now() - this.cacheTime < this.cacheTtlMs) {
      return this.cache;
    }

    const addressByCgId = new Map<string, string>();
    for (const t of tokens) {
      if (typeof t !== 'string' && t.cgId && t.address?.startsWith('0x')) addressByCgId.set(t.cgId, t.address);
    }

    const result: PriceMap = {};
    const binance = await this.batchBinance(cgIds).catch(() => ({}) as PriceMap);
    Object.assign(result, binance);

    const missingAfterBinance = cgIds.filter((id) => !result[id]);
    if (missingAfterBinance.length) {
      const cg = await this.batchCoinGecko(missingAfterBinance).catch(() => ({}) as PriceMap);
      Object.assign(result, cg);
    }

    const missingAfterCg = cgIds.filter((id) => !result[id]);
    if (missingAfterCg.length) {
      const symbolByCgId: Record<string, string> = {};
      for (const id of missingAfterCg) {
        const sym = cgIdToSymbol(id);
        if (sym) symbolByCgId[id] = sym;
      }
      const cmc = await this.batchCmc(missingAfterCg, symbolByCgId).catch(() => ({}) as PriceMap);
      Object.assign(result, cmc);
    }

    const missingAfterCmc = cgIds.filter((id) => !result[id] && addressByCgId.has(id));
    if (missingAfterCmc.length) {
      const dex = await this.batchDexScreener(missingAfterCmc, addressByCgId).catch(() => ({}) as PriceMap);
      Object.assign(result, dex);
    }

    if (!Object.keys(result).length) throw new Error('All price sources failed');

    this.cache = result;
    this.cacheTime = this.now();
    this.persist();
    return result;
  }

  /** STEP 1 — one batch request; stables short-circuit to $1. */
  async batchBinance(cgIds: string[]): Promise<PriceMap> {
    const symbols = new Set<string>();
    const symByCgId: Record<string, string> = {};
    for (const id of cgIds) {
      if (STABLE_IDS.has(id)) continue;
      const sym = CG_TO_BINANCE[id];
      if (!sym || sym === 'USDTUSDT') continue;
      symbols.add(sym);
      symByCgId[id] = sym;
    }
    for (const s of CORE_BINANCE_SYMBOLS) symbols.add(s);
    if (!symbols.size) throw new Error('No Binance symbols');

    const list = [...symbols];
    const url = `${this.binanceBase}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(list))}`;
    const raw = await fetchJson(this.fetchImpl, url, { timeoutMs: 8000 });
    if (!Array.isArray(raw)) throw new Error('Binance bad response');

    const tickers: Record<string, { lastPrice?: string; priceChangePercent?: string }> = {};
    for (const t of raw as Array<{ symbol?: string; lastPrice?: string; priceChangePercent?: string }>) {
      if (t.symbol) tickers[t.symbol] = t;
    }

    const result: PriceMap = {};
    for (const id of cgIds) {
      if (STABLE_IDS.has(id)) result[id] = { usd: 1, change24h: 0 };
    }
    for (const id of cgIds) {
      if (result[id]) continue;
      const sym = symByCgId[id];
      if (!sym) continue;
      const entry = tickers[sym];
      if (!entry) continue;
      const usd = parseFloat(entry.lastPrice || '0');
      if (usd > 0) result[id] = { usd, change24h: parseFloat(entry.priceChangePercent || '0') };
    }
    return result;
  }

  /** STEP 2 — CoinGecko batch. Uses Pro/Demo keys only when injected. */
  async batchCoinGecko(cgIds: string[]): Promise<PriceMap> {
    if (!cgIds.length) return {};
    const path = `simple/price?ids=${cgIds.filter(Boolean).join(',')}&vs_currencies=usd&include_24hr_change=true`;
    const data = await this.cgFetch(path);
    if (!data || typeof data !== 'object' || data.status?.error_code) throw new Error('CoinGecko empty');
    const result: PriceMap = {};
    for (const id of cgIds) {
      const d = (data as Record<string, { usd?: number; usd_24h_change?: number }>)[id];
      if (d && typeof d.usd === 'number' && d.usd > 0) result[id] = { usd: d.usd, change24h: d.usd_24h_change || 0 };
    }
    return result;
  }

  /**
   * Legacy `_cgFetch` without disk cache (the service caches at the top level):
   * Pro key → public demo → native bridge retry.
   */
  async cgFetch(path: string): Promise<any> {
    const cgPro = this.secrets.cgPro;
    if (cgPro) {
      const sep = path.includes('?') ? '&' : '?';
      try {
        const data = await fetchJson(this.fetchImpl, `https://pro-api.coingecko.com/api/v3/${path}${sep}x_cg_pro_api_key=${cgPro}`, { timeoutMs: 8000 });
        if (data && !data.status?.error_code) return data;
      } catch {
        /* fall through to demo */
      }
    }

    if (this.now() > this.cgDemoBackoffUntil) {
      const sep = path.includes('?') ? '&' : '?';
      const demo = this.secrets.cgDemo;
      const url = `${this.coingeckoBase}/${path}${demo ? `${sep}x_cg_demo_api_key=${demo}` : ''}`;
      try {
        const data = await fetchJson(this.fetchImpl, url, { timeoutMs: 8000 });
        if (data && !data.status?.error_code) return data;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 429) this.cgDemoBackoffUntil = this.now() + this.cgBackoffMs;
      }
    }

    // Last resort: retry once (native bridge in the legacy app).
    const data = await fetchJson(this.fetchImpl, `${this.coingeckoBase}/${path}`, { timeoutMs: 10_000 });
    if (!data || data.status?.error_code) throw new Error(`CoinGecko fetch failed: ${path}`);
    return data;
  }

  /** STEP 3 — CMC only when a key is injected (never bundled). */
  async batchCmc(cgIds: string[], symbolByCgId: Record<string, string> = {}): Promise<PriceMap> {
    const key = this.secrets.cmcPro;
    if (!cgIds.length || !key) return {};
    const symToCg: Record<string, string> = {};
    for (const id of cgIds) {
      const sym = symbolByCgId[id];
      if (sym) symToCg[sym.toUpperCase()] = id;
    }
    const symList = Object.keys(symToCg).join(',');
    if (!symList) throw new Error('CMC no symbols');

    const data = await fetchJson(this.fetchImpl, `${this.cmcBase}/v1/cryptocurrency/quotes/latest?symbol=${symList}&convert=USD`, {
      headers: { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' },
      timeoutMs: 9000,
    });
    const result: PriceMap = {};
    const entries = Object.values((data?.data ?? {}) as Record<string, { symbol?: string; quote?: { USD?: { price?: number; percent_change_24h?: number } } }>);
    for (const item of entries) {
      const sym = (item.symbol || '').toUpperCase();
      const cgId = symToCg[sym];
      const q = item.quote?.USD;
      if (cgId && q && typeof q.price === 'number' && q.price > 0) {
        result[cgId] = { usd: q.price, change24h: q.percent_change_24h || 0 };
      }
    }
    return result;
  }

  /** STEP 4 — DexScreener by contract; highest-liquidity pair wins. */
  async batchDexScreener(cgIds: string[], addressByCgId: Map<string, string>): Promise<PriceMap> {
    if (!cgIds.length) return {};
    const result: PriceMap = {};
    await Promise.allSettled(
      cgIds.map(async (id) => {
        const address = addressByCgId.get(id);
        if (!address) return;
        const data = await fetchJson(this.fetchImpl, `${this.dexscreenerBase}/latest/dex/tokens/${address}`, { timeoutMs: 6000 });
        const pairs = (data?.pairs ?? []) as Array<{ priceUsd?: string; priceChange?: { h24?: string }; liquidity?: { usd?: number } }>;
        const pair = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
        if (!pair?.priceUsd) return;
        const usd = parseFloat(pair.priceUsd);
        if (usd > 0) result[id] = { usd, change24h: parseFloat(pair.priceChange?.h24 || '0') };
      }),
    );
    return result;
  }
}

/** USD value helper used by home/swap/bridge. */
export function usdValue(amount: number, quote: PriceQuote | null | undefined): number {
  return quote ? amount * quote.usd : 0;
}
