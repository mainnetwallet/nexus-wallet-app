import { describe, expect, it } from '@jest/globals';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { encodeBase64 } from 'ethers';
import { getExchange, EXCHANGES, splitSymbol, toKucoinSymbol, toKrakenPair } from '../src/exchanges/config.js';
import { signRequest } from '../src/exchanges/sign.js';
import { normalizeMarkets, ExchangeAdapter } from '../src/exchanges/adapter.js';
import { ExchangeKeyStore, maskApiKey, LEGACY_EXC_KEYS } from '../src/exchanges/keys.js';
import { futuresOrderBody, futuresConfigFor } from '../src/exchanges/futures.js';

const CREDS = { apiKey: 'KEY12345', secret: 'SECRET12345', passphrase: 'PASS' };
const NOW = 1_700_000_000_000;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('exchange configs', () => {
  it('defines the legacy 15 adapters', () => {
    expect(EXCHANGES).toHaveLength(15);
    expect(getExchange('binance').baseUrl).toBe('https://api.binance.com');
  });

  it('converts symbols like legacy', () => {
    expect(splitSymbol('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT' });
    expect(toKucoinSymbol('ETHUSDC')).toBe('ETH-USDC');
    expect(toKrakenPair('BTCUSD')).toBe('XBTUSD');
  });
});

describe('exchange signing', () => {
  it('signs Binance query with HMAC-SHA256', () => {
    const req = signRequest(getExchange('binance'), CREDS, { path: '/api/v3/account', params: { a: '1' }, now: NOW });
    const query = `a=1&timestamp=${NOW}&recvWindow=10000`;
    const expected = hex(hmac(sha256, new TextEncoder().encode(CREDS.secret), new TextEncoder().encode(query)));
    expect(req.url).toBe(`https://api.binance.com/api/v3/account?${query}&signature=${expected}`);
    expect(req.headers['X-MBX-APIKEY']).toBe(CREDS.apiKey);
  });

  it('signs KuCoin with base64 HMAC and passphrase', () => {
    const req = signRequest(getExchange('kucoin'), CREDS, { path: '/api/v1/accounts', now: NOW });
    const expected = encodeBase64(hmac(sha256, new TextEncoder().encode(CREDS.secret), new TextEncoder().encode(`${NOW}GET/api/v1/accounts`)));
    expect(req.headers['KC-API-SIGN']).toBe(expected);
    expect(req.headers['KC-API-PASSPHRASE']).toBe(encodeBase64(hmac(sha256, new TextEncoder().encode(CREDS.secret), new TextEncoder().encode('PASS'))));
  });

  it('signs Bybit GET with sorted query', () => {
    const req = signRequest(getExchange('bybit'), CREDS, { path: '/v5/order/realtime', params: { b: '2', a: '1' }, now: NOW });
    const expected = hex(hmac(sha256, new TextEncoder().encode(CREDS.secret), new TextEncoder().encode(`${NOW}${CREDS.apiKey}5000a=1&b=2`)));
    expect(req.headers['X-BAPI-SIGN']).toBe(expected);
    expect(req.url.endsWith('?a=1&b=2')).toBe(true);
  });

  it('signs POST bodies for Bitget and Gate.io', () => {
    const bitget = signRequest(getExchange('bitget'), CREDS, { method: 'POST', path: '/api/v2/spot/trade/place-order', body: { symbol: 'BTCUSDT' }, now: NOW });
    expect(bitget.body).toBe('{"symbol":"BTCUSDT"}');
    expect(bitget.headers['ACCESS-SIGN']).toBeTruthy();
    const gate = signRequest(getExchange('gateio'), CREDS, { method: 'POST', path: '/api/v4/spot/orders', body: { currency_pair: 'BTC_USDT' }, now: NOW });
    expect(gate.headers.SIGN).toMatch(/^[0-9a-f]{128}$/);
  });

  it('rejects LBank signing instead of shipping an untested digest', () => {
    expect(() => signRequest(getExchange('lbank'), CREDS, { path: '/v2/supplier/order.do', now: NOW })).toThrow(/LBank/);
  });
});

describe('market normalization', () => {
  it('maps Binance tickers', () => {
    const rows = normalizeMarkets('binance', [{ symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '1.5', quoteVolume: '9', highPrice: '101', lowPrice: '99' }]);
    expect(rows[0]).toMatchObject({ symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', price: 100, change: 1.5 });
  });

  it('maps Bybit result.list', () => {
    const rows = normalizeMarkets('bybit', { result: { list: [{ symbol: 'ETHUSDT', lastPrice: '2', price24hPcnt: '0.1', turnover24h: '5' }] } });
    expect(rows[0]!.change).toBeCloseTo(10);
  });

  it('returns [] for unknown shapes', () => {
    expect(normalizeMarkets('binance', { err: 1 })).toEqual([]);
  });
});

describe('exchange keys', () => {
  it('migrates legacy plaintext entries into nexus2 keys and masks', () => {
    const mem = new Map<string, string>();
    mem.set(LEGACY_EXC_KEYS, JSON.stringify({ binance: { apiKey: 'abc123', secret: 'def456' }, broken: { apiKey: 'x' } }));
    const store = new ExchangeKeyStore({ read: (k) => mem.get(k) ?? null, write: (k, v) => void mem.set(k, v) });
    const result = store.migrateLegacy();
    expect(result.copied).toEqual(['binance']);
    expect(result.skipped).toEqual(['broken']);
    expect(store.get('binance')?.secret).toBe('def456');
    expect(maskApiKey('abc123')).toBe('abc…');
    expect(store.listConfigured()).toEqual(['binance']);
  });
});

describe('futures helpers', () => {
  it('builds Binance and Bybit order bodies', () => {
    expect(futuresOrderBody('binance', { symbol: 'btcusdt', side: 'long', type: 'market', quantity: '0.1' })).toMatchObject({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET' });
    expect(futuresOrderBody('bybit', { symbol: 'ethusdt', side: 'sell', type: 'limit', quantity: '1', price: '2' })).toMatchObject({ category: 'linear', side: 'Sell', orderType: 'Limit' });
    expect(futuresConfigFor('kraken')).toBeNull();
  });

  it('adapter passes requests through the injected fetch', async () => {
    const calls: string[] = [];
    const adapter = new ExchangeAdapter('binance', CREDS, {
      now: () => NOW,
      fetchImpl: async (url) => {
        calls.push(url);
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }), json: async () => ({ ok: true }) } as unknown as Response;
      },
    });
    await adapter.signed({ path: '/api/v3/account' });
    expect(calls[0]).toContain('signature=');
  });
});
