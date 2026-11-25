import { describe, expect, it } from '@jest/globals';
import { PriceService, PRICE_CACHE_KEY } from '../src/prices/service.js';

type Handler = (url: string) => unknown;

function fakeFetch(handler: Handler) {
  const calls: string[] = [];
  const impl = async (url: string): Promise<Response> => {
    calls.push(url);
    const out = handler(url);
    const payload = out ?? {};
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) } as unknown as Response;
  };
  return { impl, calls };
}

function memoryStorage(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    data,
    read: (k: string) => data[k] ?? null,
    write: (k: string, v: string) => { data[k] = v; },
    remove: (k: string) => { delete data[k]; },
  };
}

const binanceBatch = [
  { symbol: 'ETHUSDT', lastPrice: '2500.5', priceChangePercent: '2.5' },
  { symbol: 'BTCUSDT', lastPrice: '60000', priceChangePercent: '-1.2' },
];

describe('PriceService — Binance primary', () => {
  it('prices stables at $1 and parses the single batch request', async () => {
    const { impl, calls } = fakeFetch(() => binanceBatch);
    const svc = new PriceService({ fetchImpl: impl });

    const prices = await svc.fetchAll(['ethereum', 'bitcoin', 'usd-coin']);
    expect(prices['usd-coin']).toEqual({ usd: 1, change24h: 0 });
    expect(prices.ethereum).toEqual({ usd: 2500.5, change24h: 2.5 });
    expect(prices.bitcoin?.usd).toBe(60000);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('api.binance.com/api/v3/ticker/24hr');
    const symbols = JSON.parse(decodeURIComponent(calls[0]!.split('symbols=')[1]!));
    expect(symbols).toContain('ETHUSDT');
    expect(symbols).toContain('WLDUSDT'); // core pairs always included
  });

  it('falls back to CoinGecko for tokens Binance misses', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.includes('binance.com')) return [];
      if (url.includes('simple/price')) return { ethereum: { usd: 2501, usd_24h_change: 1.1 } };
      return {};
    });
    const svc = new PriceService({ fetchImpl: impl });
    const prices = await svc.fetchAll(['ethereum']);
    expect(prices.ethereum).toEqual({ usd: 2501, change24h: 1.1 });
    expect(calls.some((u) => u.includes('api.coingecko.com/api/v3/simple/price'))).toBe(true);
  });

  it('uses CMC only when a key is injected', async () => {
    const noKey = fakeFetch((url) => (url.includes('binance.com') ? [] : url.includes('coingecko') ? { status: { error_code: 100 } } : {}));
    await expect(new PriceService({ fetchImpl: noKey.impl }).fetchAll(['fookoin'])).rejects.toThrow('All price sources failed');
    expect(noKey.calls.some((u) => u.includes('coinmarketcap'))).toBe(false);

    const withKey = fakeFetch((url) => {
      if (url.includes('binance.com')) return [];
      if (url.includes('coingecko')) return { status: { error_code: 100 } };
      if (url.includes('coinmarketcap')) {
        return { data: { 1: { symbol: 'FOOKOIN', quote: { USD: { price: 4.2, percent_change_24h: -3 } } } } };
      }
      return {};
    });
    const prices = await new PriceService({ fetchImpl: withKey.impl, secrets: { cmcPro: 'test-key' } }).fetchAll(['fookoin']);
    expect(prices.fookoin).toEqual({ usd: 4.2, change24h: -3 });
    expect(withKey.calls.some((u) => u.includes('symbol=FOOKOIN'))).toBe(true);
  });

  it('uses DexScreener with the highest-liquidity pair as last resort', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.includes('binance.com')) return [];
      if (url.includes('coingecko')) return { status: { error_code: 100 } };
      if (url.includes('dexscreener')) {
        return {
          pairs: [
            { priceUsd: '0.01', liquidity: { usd: 100 }, priceChange: { h24: '1' } },
            { priceUsd: '0.02', liquidity: { usd: 5000 }, priceChange: { h24: '7' } },
          ],
        };
      }
      return {};
    });
    const svc = new PriceService({ fetchImpl: impl });
    const prices = await svc.fetchAll([{ cgId: 'weird-token', address: '0xabc' }]);
    expect(prices['weird-token']).toEqual({ usd: 0.02, change24h: 7 });
    expect(calls.some((u) => u.includes('/latest/dex/tokens/0xabc'))).toBe(true);
  });
});

describe('PriceService — cache', () => {
  it('serves memory cache for 15 s, then refetches', async () => {
    let now = 1_000_000;
    const { impl, calls } = fakeFetch(() => binanceBatch);
    const svc = new PriceService({ fetchImpl: impl, now: () => now });

    await svc.fetchAll(['ethereum']);
    await svc.fetchAll(['ethereum']);
    expect(calls).toHaveLength(1);

    now += 15_001;
    await svc.fetchAll(['ethereum']);
    expect(calls).toHaveLength(2);
  });

  it('restores the persisted cache for 5 min and expires after', async () => {
    const storage = memoryStorage();
    const now = 2_000_000;
    const first = new PriceService({ fetchImpl: fakeFetch(() => binanceBatch).impl, storage, now: () => now });
    await first.fetchAll(['ethereum', 'bitcoin']);
    expect(storage.data[PRICE_CACHE_KEY]).toContain('2500.5');

    const restored = new PriceService({ fetchImpl: fakeFetch(() => binanceBatch).impl, storage, now: () => now });
    expect(restored.peek()?.ethereum?.usd).toBe(2500.5);
    expect(restored.price('bitcoin')?.usd).toBe(60000);

    const expired = new PriceService({ fetchImpl: fakeFetch(() => binanceBatch).impl, storage, now: () => now + 300_001 });
    expect(expired.peek()).toBeNull();

    const saved = JSON.parse(storage.data[PRICE_CACHE_KEY]!);
    storage.data[PRICE_CACHE_KEY] = JSON.stringify({ cache: saved.cache, saved: now - 400_000 });
    expect(new PriceService({ fetchImpl: fakeFetch(() => binanceBatch).impl, storage, now: () => now }).peek()).toBeNull();
  });
});
