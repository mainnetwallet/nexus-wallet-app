import { createHmac } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { SwapTransport, type SwapRequest } from '../src/swap/types.js';
import { lifiProvider } from '../src/swap/providers/aggregators.js';
import { odosProvider, oneInchProvider, kyberProvider, normalizeDexName } from '../src/swap/providers/aggregators.js';
import { rangoProvider } from '../src/swap/providers/aggregators2.js';
import { okxSign } from '../src/swap/providers/aggregators3.js';
import { SwapEngine } from '../src/swap/engine.js';
import { buildSwapTransaction } from '../src/swap/execute.js';
import type { ProviderContext } from '../src/swap/types.js';

interface Recorded {
  url: string;
  init?: RequestInit;
}

function fakeFetch(responder: (url: string, init?: RequestInit) => { status?: number; body: unknown; text?: string }) {
  const calls: Recorded[] = [];
  const impl = async (input: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url: input, init });
    const { status = 200, body, text } = responder(input, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => text ?? JSON.stringify(body),
    } as unknown as Response;
  };
  return { impl, calls };
}

function makeReq(overrides: Partial<SwapRequest> = {}): SwapRequest {
  return {
    chainId: 8453,
    fromToken: { address: '', symbol: 'ETH', decimals: 18, priceUSD: 3000 },
    toToken: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6, priceUSD: 1 },
    amountWei: 1_000_000_000_000_000_000n,
    userAddress: '0x1111111111111111111111111111111111111111',
    slippagePct: 0.5,
    ...overrides,
  };
}

function ctx(fetchImpl: any, secrets: any = {}): ProviderContext {
  return { transport: new SwapTransport({ fetchImpl, secrets }) };
}

describe('LiFi provider', () => {
  it('posts the legacy advanced/routes body and dedupes by tool', async () => {
    const { impl, calls } = fakeFetch(() => ({
      body: {
        routes: [
          {
            toAmount: '2500000000',
            steps: [{
              tool: 'uniswap',
              toolDetails: { name: 'Uniswap V3', logoURI: 'https://logo/uni.png' },
              estimate: { gasCosts: [{ estimate: '180000', amountUSD: '0.42' }], feeCosts: [] },
            }],
            estimate: { feeCosts: [{ amountUSD: '0.10' }] },
          },
          {
            toAmount: '2400000000',
            steps: [{ tool: 'uniswap', toolDetails: { name: 'Uniswap V3' }, estimate: { gasCosts: [] } }],
          },
        ],
      },
    }));
    const quotes = await lifiProvider.quote(makeReq(), ctx(impl, { lifi: 'lifi-test-key' }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://li.quest/v1/advanced/routes');
    expect((calls[0]!.init!.headers as any)['x-lifi-api-key']).toBe('lifi-test-key');
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body).toMatchObject({
      fromChainId: 8453,
      toChainId: 8453,
      fromTokenAddress: '0x0000000000000000000000000000000000000000',
      toTokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      fromAmount: '1000000000000000000',
      options: { slippage: 0.005, integrator: 'NexusWallet', order: 'RECOMMENDED' },
    });
    expect(quotes).toHaveLength(1);
    expect(quotes![0]).toMatchObject({
      provider: 'lifi',
      displayName: 'Uniswap V3',
      outputWei: '2500000000',
      priceOnly: true,
      apiGasUsd: 0.42,
      protocolFeeUsd: 0.1,
      routerLogoURI: 'https://logo/uni.png',
    });
    expect(quotes![0]!.quoteRef?.kind).toBe('lifi-step');
  });
});

describe('Odos provider', () => {
  it('quotes then assembles using the pathId', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.includes('/sor/quote/v2')) {
        return { body: { pathId: 'path-1', outAmounts: ['1230000'], gasEstimateValue: 0.03 } };
      }
      return { body: { transaction: { to: '0xRouter', data: '0xdeadbeef', value: '0x0', gas: 210000 } } };
    });
    const quotes = await odosProvider.quote(makeReq(), ctx(impl, { odos: 'odos-key' }));
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/sor/quote/v2', '/sor/assemble']);
    const quoteBody = JSON.parse(String(calls[0]!.init!.body));
    expect(quoteBody.inputTokens[0]).toEqual({ tokenAddress: '0x0000000000000000000000000000000000000000', amount: '1000000000000000000' });
    expect(quoteBody.slippageLimitPercent).toBe(0.5);
    expect(JSON.parse(String(calls[1]!.init!.body))).toEqual({ pathId: 'path-1', userAddr: '0x1111111111111111111111111111111111111111', simulate: false });
    expect(quotes![0]).toMatchObject({ outputWei: '1230000', to: '0xRouter', data: '0xdeadbeef', apiGasUsd: 0.03, priceOnly: false });
  });
});

describe('1inch provider', () => {
  it('uses the v6 swap endpoint with native sentinel and slippage in percent', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { dstAmount: '999', tx: { to: '0x1inch', data: '0x12', value: '0', gas: 190000 } } }));
    const quotes = await oneInchProvider.quote(makeReq(), ctx(impl, { oneInch: 'inch-key' }));
    expect(calls[0]!.url).toContain('https://api.1inch.dev/swap/v6.0/8453/swap?');
    expect(calls[0]!.url).toContain('src=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
    expect(calls[0]!.url).toContain('slippage=0.50');
    expect((calls[0]!.init!.headers as any).Authorization).toBe('Bearer inch-key');
    expect(quotes![0]).toMatchObject({ outputWei: '999', value: '0x0', gasLimit: 190000 });
  });

  it('skips unsupported chains without calling the API', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: {} }));
    const quotes = await oneInchProvider.quote(makeReq({ chainId: 9999 }), ctx(impl));
    expect(quotes).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('Kyber provider', () => {
  it('builds the route with basis-point slippage and a 20 minute deadline', async () => {
    const now = 1_700_000_000_000;
    const { impl, calls } = fakeFetch((url) => {
      if (url.includes('/api/v1/routes')) {
        return { body: { data: { routerAddress: '0xKyberRouter', routeSummary: { amountOut: '777', gas: '200000', gasUsd: '0.02' } } } };
      }
      return { body: { data: { data: '0xkyber' } } };
    });
    const c = ctx(impl);
    const quotes = await kyberProvider.quote(makeReq(), { ...c, now: () => now });
    expect(calls[0]!.url).toContain('https://aggregator-api.kyberswap.com/base/api/v1/routes?');
    expect(calls[0]!.init!.headers).toMatchObject({ 'X-Client-Id': 'NexusWallet' });
    const build = JSON.parse(String(calls[1]!.init!.body));
    expect(build).toMatchObject({ sender: '0x1111111111111111111111111111111111111111', recipient: '0x1111111111111111111111111111111111111111', slippageTolerance: 50, deadline: 1_700_001_200 });
    expect(quotes![0]).toMatchObject({ outputWei: '777', to: '0xKyberRouter', value: '0xde0b6b3a7640000', apiGasUsd: 0.02 });
  });
});

describe('Rango provider', () => {
  it('parses multiple bests and converts human output to wei', async () => {
    const { impl } = fakeFetch(() => ({
      body: {
        results: [{
          outputAmount: '12.5',
          requestId: 'req-1',
          swaps: [{ swapperId: 'UNISWAP_V3', swapperLogo: 'https://logo/u3.png' }],
          fee: [{ expenseType: 'FROM_SOURCE_WALLET', amount: '0.001', token: { usdPrice: '3000' } }],
        }],
      },
    }));
    const quotes = await rangoProvider.quote(makeReq(), ctx(impl, { rango: 'rango-key' }));
    expect(quotes![0]).toMatchObject({
      displayName: 'Uniswap V3',
      outputWei: '12500000',
      apiGasUsd: 3,
      priceOnly: true,
      routerLogoURI: 'https://logo/u3.png',
    });
  });
});

describe('DEX name normalization', () => {
  it('maps known DEX ids to display names', () => {
    expect(normalizeDexName('uniswap_v3')).toBe('Uniswap V3');
    expect(normalizeDexName('trader_joe')).toBe('Trader Joe');
    expect(normalizeDexName('pancakeswap')).toBe('PancakeSwap');
    expect(normalizeDexName('some_new_dex')).toBe('Some New Dex');
  });
});

describe('SwapEngine', () => {
  it('sorts by output, computes gas USD and price impact, reports failures', async () => {
    const fakeProvider = (id: any, outputWei: string, meta: any = {}) => ({
      id,
      label: id,
      supportsChain: () => true,
      quote: async () => [{
        provider: id, displayName: id, outputWei, to: '0x1', data: '0x1', value: '0x0', gasLimit: 200000, priceOnly: false, ...meta,
      }],
    });
    const failing = {
      id: 'dodo' as const, label: 'DODO', supportsChain: () => true,
      quote: async () => { throw new Error('boom'); },
    };
    const engine = new SwapEngine({
      transport: new SwapTransport({ fetchImpl: (async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }) as any) }),
      providers: [fakeProvider('odos' as any, '1000000'), fakeProvider('lifi' as any, '2000000'), failing as any],
      gasPriceGwei: 2,
      nativePriceUSD: 3000,
    });
    const result = await engine.quote(makeReq());
    expect(result.quotes.map((q) => q.outputWei)).toEqual(['2000000', '1000000']);
    expect(result.best!.provider).toBe('lifi');
    expect(result.errors).toEqual([{ provider: 'dodo', message: 'boom' }]);
    const best = result.best!;
    // 200k gas * 2 gwei = 0.0004 ETH * $3000 = $1.2
    expect(best.gasUsd).toBeCloseTo(1.2, 5);
    expect(best.outputAmount).toBeCloseTo(2, 6);
    expect(best.priceImpactPct).toBeCloseTo(-99.9333, 3);
    expect(best.executable).toBe(true);
  });
});

describe('OKX signing', () => {
  it('matches an independent HMAC-SHA256 base64 implementation', () => {
    const ts = '2024-01-01T00:00:00.000Z';
    const path = '/api/v6/dex/aggregator/get-liquidity?chainIndex=1';
    const expected = createHmac('sha256', 'topsecret').update(ts + 'GET' + path).digest('base64');
    expect(okxSign('topsecret', ts, 'GET', path)).toBe(expected);
  });
});

describe('proxy transport', () => {
  it('forwards secret-bearing requests through /v1/forward', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { status: 200, body: { routes: [] } } }));
    const transport = new SwapTransport({ fetchImpl: impl, proxyBaseUrl: 'https://proxy.example' });
    const json = await transport.json('https://li.quest/v1/advanced/routes', {
      method: 'POST', body: { a: 1 }, secretKind: 'lifi',
    });
    expect(json).toEqual({ routes: [] });
    expect(calls[0]!.url).toBe('https://proxy.example/v1/forward');
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body).toMatchObject({ provider: 'lifi', url: 'https://li.quest/v1/advanced/routes', method: 'POST', body: { a: 1 } });
  });
});

describe('execution builders', () => {
  it('injects wallet addresses into a LiFi step', async () => {
    const step = { action: { fromAmount: '', fromAddress: '', toAddress: '' }, estimate: {} };
    const quote = {
      provider: 'lifi' as const, displayName: 'Uniswap', outputWei: '1', to: '0x1', data: '0x', value: '0x0',
      gasLimit: 1, priceOnly: true, quoteRef: { kind: 'lifi-step', payload: step },
    };
    const { impl, calls } = fakeFetch((url) => url.includes('stepTransaction')
      ? { body: { transactionRequest: { to: '0xLiFiRouter', data: '0xlifi', value: '0x0', gasLimit: '250000', approvalAddress: '0xSpender' } } }
      : { body: {} });
    const tx = await buildSwapTransaction(quote, makeReq(), { transport: new SwapTransport({ fetchImpl: impl, secrets: { lifi: 'k' } }) });
    const sent = JSON.parse(String(calls[0]!.init!.body));
    expect(sent.action.fromAddress).toBe('0x1111111111111111111111111111111111111111');
    expect(sent.action.toAddress).toBe('0x1111111111111111111111111111111111111111');
    expect(sent.action.fromAmount).toBe('1000000000000000000');
    expect(tx).toMatchObject({ to: '0xLiFiRouter', data: '0xlifi', gasLimit: 250000, allowanceTarget: '0xSpender' });
  });

  it('builds Bungee calldata and defaults native value', async () => {
    const quote = {
      provider: 'bungee' as const, displayName: 'Across', outputWei: '1', to: '0x1', data: '0x', value: '0x0',
      gasLimit: 1, priceOnly: true, quoteRef: { kind: 'bungee', payload: { quoteId: 'q 1' } },
    };
    const { impl, calls } = fakeFetch(() => ({
      body: { result: { txData: { to: '0xBungee', data: '0xb' }, approvalData: { spenderAddress: '0xSpender' } } },
    }));
    const tx = await buildSwapTransaction(quote, makeReq({ slippagePct: 1 }), { transport: new SwapTransport({ fetchImpl: impl }) });
    expect(calls[0]!.url).toContain('build-tx?quoteId=q%201');
    expect(tx.value).toBe('0xde0b6b3a7640000');
    expect(tx.allowanceTarget).toBe('0xSpender');
  });

  it('builds OKX swap calldata with approve spender and dex id', async () => {
    const quote = {
      provider: 'okxdex' as const, displayName: 'Uniswap V3', outputWei: '1', to: '0x0', data: '0x', value: '0x0',
      gasLimit: 1, priceOnly: true, quoteRef: { kind: 'okx-dex', payload: { dexId: '12' } },
    };
    const { impl, calls } = fakeFetch((url) => {
      if (url.includes('approve-transaction')) return { body: { code: '0', data: [{ dexContractAddress: '0xApprove' }] } };
      return { body: { code: '0', data: [{ tx: { to: '0xOkxRouter', data: '0xokx', value: '0', gas: '300000' } }] } };
    });
    const tx = await buildSwapTransaction(
      quote,
      makeReq({
        fromToken: { address: '0xFromToken', symbol: 'FROM', decimals: 18 },
        toToken: { address: '0xToken', symbol: 'TKN', decimals: 18 },
      }),
      { transport: new SwapTransport({ fetchImpl: impl, secrets: { okx: { apiKey: 'a', secret: 's', passphrase: 'p' } } }) },
    );
    expect(calls.some((c) => c.url.includes('approve-transaction'))).toBe(true);
    expect(calls.some((c) => c.url.includes('/swap?') && c.url.includes('dexIds=12'))).toBe(true);
    expect(tx).toMatchObject({ to: '0xOkxRouter', allowanceTarget: '0xApprove' });
  });
});
