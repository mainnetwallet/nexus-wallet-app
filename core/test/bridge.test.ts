import { describe, expect, it } from '@jest/globals';
import { BridgeEngine } from '../src/bridge/engine.js';
import { lifiBridgeProvider, bungeeBridgeProvider, rangoBridgeProvider, rubicBridgeProvider, type BridgeRequest } from '../src/bridge/providers.js';
import { buildBridgeTransaction } from '../src/bridge/execute.js';
import { checkBridgeStatus } from '../src/bridge/status.js';
import { SwapTransport, type ProviderContext } from '../src/swap/types.js';

type Responder = (url: string, init?: RequestInit) => { status?: number; body: unknown };

function fakeFetch(responder: Responder) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = async (input: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url: input, init });
    const { status = 200, body } = responder(input, init);
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
  };
  return { impl, calls };
}

function req(overrides: Partial<BridgeRequest> = {}): BridgeRequest {
  return {
    fromChainId: 8453,
    toChainId: 42161,
    fromToken: { address: '', symbol: 'ETH', decimals: 18, priceUSD: 3000 },
    toToken: { address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', symbol: 'USDC', decimals: 6, priceUSD: 1 },
    amountWei: 500_000_000_000_000_000n,
    senderAddress: '0x1111111111111111111111111111111111111111',
    recipientAddress: '0x2222222222222222222222222222222222222222',
    slippagePct: 1,
    ...overrides,
  };
}

function ctx(impl: any, secrets: any = {}): ProviderContext {
  return { transport: new SwapTransport({ fetchImpl: impl, secrets }) };
}

describe('LiFi bridge provider', () => {
  it('normalizes route output, gas, fees and duration', async () => {
    const { impl, calls } = fakeFetch(() => ({
      body: {
        routes: [{
          estimate: { toAmount: '499000000', feeCosts: [{ amountUSD: '0.25' }] },
          steps: [
            { tool: 'approve', toolDetails: { name: 'Approve' }, estimate: { feeCosts: [] } },
            { tool: 'across', toolDetails: { name: 'Across', logoURI: 'https://logo/across.png' }, estimate: { executionDuration: 90, gasCosts: [{ amountUSD: '0.40' }] } },
          ],
        }],
      },
    }));
    const quotes = await lifiBridgeProvider.quote(req(), ctx(impl, { lifi: 'k' }));
    expect(calls[0]!.url).toBe('https://li.quest/v1/advanced/routes');
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body).toMatchObject({ fromChainId: 8453, toChainId: 42161, fromTokenAddress: '0x0000000000000000000000000000000000000000', fromAddress: '0x1111111111111111111111111111111111111111', toAddress: '0x2222222222222222222222222222222222222222' });
    expect(quotes![0]).toMatchObject({
      displayName: 'Across', outputWei: '499000000', gasUsd: 0.4, protocolFeeUsd: 0.25, durationSec: 90, priceOnly: true,
    });
  });
});

describe('Rubic bridge provider', () => {
  it('posts quoteAll and maps fees/duration/provider names', async () => {
    const { impl, calls } = fakeFetch(() => ({
      body: {
        trades: [{
          id: 'r-1', providerType: 'across', estimate: { destinationWeiAmount: '1234', durationInMinutes: 5 },
          fees: { gasTokenFees: { gas: { totalUsdAmount: '1.10' }, protocol: { fixedUsdAmount: '0.30' } } },
        }],
      },
    }));
    const quotes = await rubicBridgeProvider.quote(req(), ctx(impl));
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body).toMatchObject({ srcTokenBlockchain: 'BASE', dstTokenBlockchain: 'ARBITRUM', srcTokenAmount: '0.5', srcTokenAddress: '0x0000000000000000000000000000000000000000' });
    expect(quotes![0]).toMatchObject({ displayName: 'Across', outputWei: '1234', gasUsd: 1.1, protocolFeeUsd: 0.3, durationSec: 300 });
  });
});

describe('Rango bridge provider', () => {
  it('computes gas vs protocol fees from expenseType', async () => {
    const { impl } = fakeFetch(() => ({
      body: {
        results: [{
          outputAmount: '12.5', requestId: 'req-9',
          swaps: [{ swapperId: 'STARGATE', swapperLogo: 'https://logo/stargate.png' }],
          fee: [
            { expenseType: 'FROM_SOURCE_WALLET', amount: '0.001', token: { usdPrice: '3000' } },
            { expenseType: 'DECREASE_FROM_OUTPUT', amount: '0.5', token: { usdPrice: '1' } },
          ],
        }],
      },
    }));
    const quotes = await rangoBridgeProvider.quote(req(), ctx(impl, { rango: 'k' }));
    expect(quotes![0]).toMatchObject({ displayName: 'Stargate', outputWei: '12500000', gasUsd: 3, protocolFeeUsd: 0.5 });
  });
});

describe('Bungee bridge provider', () => {
  it('dedupes manual and auto routes by name', async () => {
    const { impl } = fakeFetch(() => ({
      body: {
        result: {
          manualRoutes: [{ quoteId: 'q1', output: { amount: '100' }, routeDetails: { name: 'Across' }, gasFee: { feeInUsd: '0.2' } }],
          autoRoutes: [{ quoteId: 'q2', output: { amount: '90' }, routeDetails: { name: 'Across' } }],
        },
      },
    }));
    const quotes = await bungeeBridgeProvider.quote(req(), ctx(impl));
    expect(quotes).toHaveLength(1);
    expect(quotes![0]).toMatchObject({ displayName: 'Across', outputWei: '100', gasUsd: 0.2 });
  });
});

describe('BridgeEngine', () => {
  it('prefers the highest fee-free route as best', async () => {
    const mk = (id: any, outputWei: string, protocolFeeUsd: number) => ({
      id, label: id, supports: () => true,
      quote: async () => [{
        provider: id, displayName: id, outputWei, gasUsd: 0, protocolFeeUsd, durationSec: 10,
        priceOnly: true, quoteRef: { kind: 'bungee' as const, payload: { quoteId: 'q' } },
      }],
    });
    const engine = new BridgeEngine({
      transport: new SwapTransport({ fetchImpl: (async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }) as any) }),
      providers: [mk('lifi', '200', 1), mk('rubic', '150', 0), mk('rango', '100', 0)] as any,
    });
    const set = await engine.quote(req());
    expect(set.best!.displayName).toBe('rubic');
    expect(set.quotes.map((q) => q.outputWei)).toEqual(['150', '200', '100']);
  });
});

describe('bridge execution', () => {
  it('confirms and creates a Rango transaction with requestId', async () => {
    const quote = {
      provider: 'rango' as const, displayName: 'Stargate', outputWei: '100', gasUsd: null, protocolFeeUsd: 0,
      durationSec: 10, priceOnly: true,
      quoteRef: { kind: 'rango' as const, payload: { requestId: 'req-9' } },
    };
    const { impl, calls } = fakeFetch((url) => {
      if (url.includes('/routing/confirm')) return { body: { ok: true } };
      return { body: { transaction: { to: '0xRangoRouter', data: '0xrango', value: '0', gasLimit: '260000' } } };
    });
    const tx = await buildBridgeTransaction(quote, req(), { transport: new SwapTransport({ fetchImpl: impl, secrets: { rango: 'k' } }) });
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/routing/confirm', '/tx/create']);
    expect(JSON.parse(String(calls[1]!.init!.body))).toMatchObject({ requestId: 'req-9', step: 1, userSettings: { slippage: '1', infiniteApprove: false } });
    expect(tx).toMatchObject({ to: '0xRangoRouter', data: '0xrango', value: '0x6f05b59d3b20000', gasLimit: 260000, requestId: 'req-9' });
  });

  it('builds a Rubic swap tx with approval target and native value fallback', async () => {
    const quote = {
      provider: 'rubic' as const, displayName: 'Across', outputWei: '100', gasUsd: null, protocolFeeUsd: 0,
      durationSec: 10, priceOnly: true,
      quoteRef: { kind: 'rubic' as const, payload: { route: { id: 'r-1' }, quoteHumanAmt: '0.5' } },
    };
    const { impl, calls } = fakeFetch(() => ({
      body: { transaction: { to: '0xRubicRouter', data: '0xrubic', value: '0', approvalAddress: '0xRubicApprove' }, fees: { gasTokenFees: { gas: { gasLimit: '310000' } } } },
    }));
    const tx = await buildBridgeTransaction(quote, req(), { transport: new SwapTransport({ fetchImpl: impl }) });
    expect(JSON.parse(String(calls[0]!.init!.body))).toMatchObject({ id: 'r-1', srcTokenAmount: '0.5', fromAddress: '0x1111111111111111111111111111111111111111' });
    expect(tx).toMatchObject({ to: '0xRubicRouter', value: '0x6f05b59d3b20000', gasLimit: 310000, allowanceTarget: '0xRubicApprove' });
  });
});

describe('bridge status', () => {
  it('maps LiFi DONE to success with destination hash', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { status: 'DONE', receiving: { txHash: '0xdest' } } }));
    const res = await checkBridgeStatus({
      provider: 'lifi', txHash: '0xsrc', fromChainId: 8453, toChainId: 42161,
      transport: new SwapTransport({ fetchImpl: impl, secrets: { lifi: 'k' } }),
    });
    expect(calls[0]!.url).toContain('fromChain=8453');
    expect(res).toEqual({ state: 'success', destTxHash: '0xdest', raw: { status: 'DONE', receiving: { txHash: '0xdest' } } });
  });

  it('extracts the Rango destination hash from bridgeData', async () => {
    const { impl } = fakeFetch(() => ({ body: { status: 'SUCCESS', bridgeData: { destTxHash: '0xr' } } }));
    const res = await checkBridgeStatus({ provider: 'rango', txHash: '0xs', requestId: 'req', transport: new SwapTransport({ fetchImpl: impl, secrets: { rango: 'k' } }) });
    expect(res).toMatchObject({ state: 'success', destTxHash: '0xr' });
  });

  it('returns null for unknown providers', async () => {
    const { impl } = fakeFetch(() => ({ body: {} }));
    const res = await checkBridgeStatus({ provider: 'unknown', txHash: '0x', transport: new SwapTransport({ fetchImpl: impl }) });
    expect(res).toBeNull();
  });
});
