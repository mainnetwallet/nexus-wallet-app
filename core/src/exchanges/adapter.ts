/**
 * Exchange adapter: public market data, signed account/order calls, and
 * encrypted key storage. Signing is delegated to `sign.ts`; transport is
 * injectable so tests never hit the network.
 */
import { timeoutSignal, type FetchLike } from '../http.js';
import type { ExchangeConfig, ExchangeCredentials, ExchangeId } from './config.js';
import { getExchange, splitSymbol } from './config.js';
import { signRequest, type SignedRequestInput } from './sign.js';

export interface ExchangeAdapterOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => number;
}

export interface MarketRow {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  change: number;
  volume: number;
  high?: number;
  low?: number;
}

export class ExchangeError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ExchangeError';
    this.status = status;
    this.payload = payload;
  }
}

export class ExchangeAdapter {
  readonly config: ExchangeConfig;
  private readonly creds: ExchangeCredentials | null;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(id: ExchangeId, creds: ExchangeCredentials | null, opts: ExchangeAdapterOptions = {}) {
    this.config = getExchange(id);
    this.creds = creds;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.now = opts.now ?? (() => Date.now());
  }

  get id(): ExchangeId {
    return this.config.id;
  }

  private async send(url: string, init: RequestInit, label: string): Promise<any> {
    const t = timeoutSignal(this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, { ...init, signal: t.signal });
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = text; }
      if (!res.ok) {
        const msg = json && typeof json === 'object' && 'msg' in json ? String((json as any).msg) : `HTTP ${res.status}`;
        throw new ExchangeError(`${label}: ${msg.slice(0, 140)}`, res.status, json);
      }
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        const record = json as Record<string, unknown>;
        if (typeof record.code !== 'undefined' && typeof record.msg === 'string') {
          const code = String(record.code);
          const ok = code === '0' || code === '00000' || code === '200000' || /^(success|ok|)$/i.test(record.msg);
          if (!ok) throw new ExchangeError(`${label}: ${code} ${record.msg.slice(0, 120)}`, 200, json);
        }
      }
      return json;
    } finally {
      t.cancel();
    }
  }

  async publicJson(path: string, params: Record<string, string | number> = {}): Promise<any> {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    return this.send(`${this.config.baseUrl}${path}${q ? `?${q}` : ''}`, { method: 'GET' }, this.config.name);
  }

  private requireCreds(): ExchangeCredentials {
    if (!this.creds || !this.creds.apiKey || !this.creds.secret) throw new Error(`${this.config.name} API keys are not configured`);
    return this.creds;
  }

  async signed(input: SignedRequestInput): Promise<any> {
    const req = signRequest(this.config, this.requireCreds(), { ...input, now: input.now ?? this.now() });
    return this.send(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    }, this.config.name);
  }

  async markets(): Promise<MarketRow[]> {
    const raw = await this.publicJson(this.config.endpoints.ticker, this.config.id === 'bybit' ? { category: 'spot' } : {});
    return normalizeMarkets(this.config.id, raw);
  }

  async balances(): Promise<any> {
    return this.signed({ method: 'GET', path: this.config.endpoints.balance });
  }

  async openOrders(): Promise<any> {
    return this.signed({ method: 'GET', path: this.config.endpoints.openOrders });
  }

  async placeOrder(body: Record<string, unknown>): Promise<any> {
    return this.signed({ method: 'POST', path: this.config.endpoints.order, body });
  }

  async cancelOrder(params: Record<string, string | number>): Promise<any> {
    return this.signed({ method: 'DELETE', path: this.config.endpoints.cancelOrder, params });
  }
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Curated per-exchange market normalizers; unknown shapes yield [] not garbage. */
export function normalizeMarkets(id: ExchangeId, raw: any): MarketRow[] {
  try {
    switch (id) {
      case 'binance':
      case 'mexc':
      case 'bingx':
        return (Array.isArray(raw) ? raw : []).map((t: any) => ({
          symbol: String(t.symbol), ...splitSymbol(String(t.symbol)),
          price: num(t.lastPrice), change: num(t.priceChangePercent), volume: num(t.quoteVolume),
          high: num(t.highPrice), low: num(t.lowPrice),
        })).filter((m) => m.quote && m.price > 0);
      case 'kucoin':
        return (raw?.data?.ticker ?? []).map((t: any) => ({
          symbol: String(t.symbol).replace('-', ''), ...splitSymbol(String(t.symbol).replace('-', '')),
          price: num(t.last), change: num(t.changeRate) * 100, volume: num(t.volValue),
          high: num(t.high), low: num(t.low),
        })).filter((m: MarketRow) => m.quote);
      case 'bybit':
        return (raw?.result?.list ?? []).map((t: any) => ({
          symbol: String(t.symbol), ...splitSymbol(String(t.symbol)),
          price: num(t.lastPrice), change: num(t.price24hPcnt) * 100, volume: num(t.turnover24h),
          high: num(t.highPrice24h), low: num(t.lowPrice24h),
        })).filter((m: MarketRow) => m.quote);
      case 'bitget':
        return (raw?.data ?? []).map((t: any) => ({
          symbol: String(t.symbol), ...splitSymbol(String(t.symbol)),
          price: num(t.lastPr), change: num(t.change24h) * 100, volume: num(t.quoteVolume ?? t.usdtVolume),
        }));
      case 'gateio':
        return (Array.isArray(raw) ? raw : []).map((t: any) => ({
          symbol: String(t.currency_pair).replace('_', ''), ...splitSymbol(String(t.currency_pair).replace('_', '')),
          price: num(t.last), change: num(t.change_percentage), volume: num(t.quote_volume),
          high: num(t.high_24h), low: num(t.low_24h),
        })).filter((m) => m.quote);
      case 'bitmart':
        return (raw?.data ?? []).map((t: any) => ({
          symbol: String(t.symbol).replace('_', ''), ...splitSymbol(String(t.symbol).replace('_', '')),
          price: num(t.last), change: num(t.change ?? t.change_percent), volume: num(t.quote_volume ?? t.vol),
        }));
      case 'kraken': {
        const result = raw?.result ?? {};
        return Object.entries(result).filter(([k]) => !['last', 'today', 'tomorrow'].includes(k)).map(([symbol, t]: [string, any]) => {
          const s = symbol.length > 6 ? symbol.replace(/^X/, '') : symbol;
          return {
            symbol: s, ...splitSymbol(s), price: num(t?.c?.[0]), change: 0,
            volume: num(t?.v?.[1]), high: num(t?.h?.[1]), low: num(t?.l?.[1]),
          };
        });
      }
      case 'coinbase':
        return (Array.isArray(raw) ? raw : []).filter((t: any) => t?.status === 'online').map((t: any) => ({
          symbol: String(t.id).replace('-', ''), base: String(t.base_currency), quote: String(t.quote_currency),
          price: 0, change: 0, volume: 0,
        }));
      case 'htx':
        return (raw?.data ?? []).filter((t: any) => /usdt$|usdc$|btc$|eth$/i.test(String(t.symbol))).map((t: any) => ({
          symbol: String(t.symbol).toUpperCase(), ...splitSymbol(String(t.symbol).toUpperCase()),
          price: num(t.close), change: num(t.open) > 0 ? ((num(t.close) - num(t.open)) / num(t.open)) * 100 : 0,
          volume: num(t.amount ?? t.vol), high: num(t.high), low: num(t.low),
        }));
      case 'phemex':
        return (raw?.data ?? raw ?? []).map((t: any) => ({
          symbol: String(t.symbol ?? '').replace(/-|\//g, '').toUpperCase(),
          ...splitSymbol(String(t.symbol ?? '').replace(/-|\//g, '').toUpperCase()),
          price: num(t.lastEp) / 1e8, change: num(t.changePct) / 1e4, volume: num(t.turnoverEv) / 1e8,
        })).filter((m: MarketRow) => m.quote);
      case 'digifinex':
        return (raw?.ticker ?? []).map((t: any) => ({
          symbol: String(t.symbol).replace('_', '').toUpperCase(), ...splitSymbol(String(t.symbol).replace('_', '').toUpperCase()),
          price: num(t.last), change: num(t.change), volume: num(t.vol),
        })).filter((m: MarketRow) => m.quote);
      case 'lbank':
        return (Array.isArray(raw) ? raw : []).map((t: any) => ({
          symbol: String(t.symbol).replace('_', '').toUpperCase(), ...splitSymbol(String(t.symbol).replace('_', '').toUpperCase()),
          price: num(t.ticker?.latest), change: num(t.ticker?.change) * 100, volume: num(t.ticker?.vol),
        })).filter((m: MarketRow) => m.quote);
      case 'bitfinex':
        return (Array.isArray(raw) ? raw : []).filter((t: any) => typeof t?.[0] === 'string' && t[0].startsWith('t')).map((t: any) => {
          const symbol = String(t[0]).slice(1).toUpperCase();
          return { symbol, ...splitSymbol(symbol), price: num(t[7]), change: num(t[6]) * 100, volume: num(t[8]) };
        }).filter((m: MarketRow) => m.quote);
      default:
        return [];
    }
  } catch {
    return [];
  }
}
