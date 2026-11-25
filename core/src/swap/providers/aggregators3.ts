import { encodeBase64 } from 'ethers';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { isNativeAddress, NATIVE_EEEE, NATIVE_LOWER_EEEE, NATIVE_ZERO } from '../../util/address.js';
import { decimalToHex } from '../../util/units.js';
import type { ProviderQuote, SwapProvider } from '../types.js';

function src(token: { address: string }, sentinel: string): string | null {
  return isNativeAddress(token.address) ? sentinel : token.address || null;
}

const PORTALS_NET: Record<number, string> = {
  1: 'ethereum', 56: 'bsc', 137: 'polygon', 8453: 'base', 42161: 'arbitrum', 10: 'optimism',
  43114: 'avalanche', 250: 'fantom', 324: 'zksync', 100: 'gnosis', 1101: 'polygon-zkevm',
  59144: 'linea', 534352: 'scroll', 81457: 'blast',
};

export const portalsProvider: SwapProvider = {
  id: 'portals',
  label: 'Portals',
  supportsChain: (chainId) => !!PORTALS_NET[chainId],
  async quote(req, ctx) {
    const net = PORTALS_NET[req.chainId];
    if (!net) return null;
    const fromAddr = src(req.fromToken, NATIVE_ZERO);
    const toAddr = src(req.toToken, NATIVE_ZERO);
    if (!fromAddr || !toAddr) return null;
    const params = new URLSearchParams({
      inputToken: `${net}:${fromAddr}`,
      inputAmount: req.amountWei.toString(),
      outputToken: `${net}:${toAddr}`,
      sender: req.userAddress,
      slippageTolerancePercentage: req.slippagePct.toFixed(1),
      validate: 'false',
    });
    const json = await ctx.transport.json(`https://api.portals.fi/v2/portal?${params}`, {
      timeoutMs: 10_000,
      signal: ctx.signal,
    });
    if (!json?.tx?.to || !json?.tx?.data) return null;
    const outputWei = String(json.context?.outputAmount || json.context?.minOutputAmount || '0');
    if (outputWei === '0') return null;
    return [{
      provider: 'portals',
      displayName: 'Portals',
      outputWei,
      to: json.tx.to,
      data: json.tx.data,
      value: json.tx.value && json.tx.value !== '0x0' ? decimalToHex(json.tx.value) : '0x0',
      gasLimit: Number(json.context?.gasLimit) || 350000,
      priceOnly: false,
    }];
  },
};

const FLY_NETS: Record<number, string> = {
  1: 'ethereum', 56: 'bsc', 137: 'polygon', 8453: 'base', 42161: 'arbitrum', 10: 'optimism',
  43114: 'avalanche', 250: 'fantom', 324: 'zksync', 59144: 'linea', 534352: 'scroll',
  81457: 'blast', 1101: 'polygonzk',
};

export const flyProvider: SwapProvider = {
  id: 'fly',
  label: 'Fly',
  supportsChain: (chainId) => !!FLY_NETS[chainId],
  async quote(req, ctx) {
    const net = FLY_NETS[req.chainId];
    if (!net) return null;
    const fromAddr = src(req.fromToken, NATIVE_ZERO);
    const toAddr = src(req.toToken, NATIVE_ZERO);
    if (!fromAddr || !toAddr) return null;
    const q = new URLSearchParams({
      network: net,
      fromTokenAddress: fromAddr,
      toTokenAddress: toAddr,
      sellAmount: req.amountWei.toString(),
      slippage: (req.slippagePct / 100).toFixed(4),
      fromAddress: req.userAddress,
      toAddress: req.userAddress,
      gasless: 'false',
    });
    const quote = await ctx.transport.json(`https://api.fly.trade/aggregator/quote?${q}`, {
      timeoutMs: 9_000,
      signal: ctx.signal,
    });
    if (!quote?.id || !quote?.amountOut || quote.amountOut === '0') return null;
    const tx = await ctx.transport.json(`https://api.fly.trade/aggregator/transaction?quoteId=${encodeURIComponent(quote.id)}&estimateGas=false`, {
      timeoutMs: 9_000,
      signal: ctx.signal,
    });
    if (!tx?.to || !tx?.data) return null;
    return [{
      provider: 'fly',
      displayName: 'Fly',
      outputWei: String(quote.amountOut),
      to: tx.to,
      data: tx.data,
      value: tx.value && tx.value !== '0x0' ? decimalToHex(tx.value) : '0x0',
      gasLimit: Number(tx.gasLimit) || 350000,
      priceOnly: false,
    }];
  },
};

export const squidProvider: SwapProvider = {
  id: 'squid',
  label: 'Squid',
  supportsChain: () => true,
  async quote(req, ctx) {
    const fromAddr = src(req.fromToken, NATIVE_EEEE);
    const toAddr = src(req.toToken, NATIVE_EEEE);
    if (!fromAddr || !toAddr) return null;
    const json = await ctx.transport.json('https://v2.api.squidrouter.com/v2/route', {
      method: 'POST',
      secretKind: 'squid',
      timeoutMs: 12_000,
      signal: ctx.signal,
      body: {
        fromChain: String(req.chainId),
        toChain: String(req.chainId),
        fromToken: fromAddr,
        toToken: toAddr,
        fromAmount: req.amountWei.toString(),
        fromAddress: req.userAddress,
        toAddress: req.userAddress,
        slippage: Number(req.slippagePct),
      },
    });
    const route = json?.route;
    const tx = route?.transactionRequest;
    if (!route?.estimate || !tx?.target || !tx?.data) return null;
    const outputWei = String(route.estimate.toAmountMin || route.estimate.toAmount || '0');
    if (outputWei === '0') return null;
    let dexName = 'Squid';
    try {
      const swapAction = (route.estimate?.actions ?? []).find((a: any) => a?.type === 'swap');
      dexName = swapAction?.data?.dex || swapAction?.provider || 'Squid';
    } catch {
      dexName = 'Squid';
    }
    return [{
      provider: 'squid',
      displayName: dexName,
      outputWei,
      to: tx.target,
      data: tx.data,
      value: tx.value && tx.value !== '0' && tx.value !== '0x0' ? tx.value : '0x0',
      gasLimit: Number(tx.gasLimit) || 400000,
      routerLogoURI: 'https://icons.llamao.fi/icons/protocols/squid?w=48&h=48',
      priceOnly: false,
    }];
  },
};

export const OKX_CHAINS: Record<number, string> = {
  1: '1', 56: '56', 137: '137', 8453: '8453', 42161: '42161', 10: '10', 43114: '43114',
  324: '324', 59144: '59144', 534352: '534352', 81457: '81457', 1101: '1101', 5000: '5000',
  169: '169', 130: '130',
};

function okxTimestamp(nowMs: number): string {
  return new Date(nowMs).toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

export function okxSign(secret: string, timestamp: string, method: string, path: string): string {
  const message = new TextEncoder().encode(timestamp + method.toUpperCase() + path);
  const key = new TextEncoder().encode(secret);
  return encodeBase64(hmac(sha256, key, message));
}

export async function okxGet(ctx: { transport: import('../types.js').SwapTransport; signal?: AbortSignal; now?: () => number }, path: string): Promise<any> {
  const creds = ctx.transport.getSecret('okx');
  const direct = !!creds && ctx.transport.hasSecret('okx');
  if (!direct) {
    return ctx.transport.json(`https://www.okx.com${path}`, {
      secretKind: 'okx',
      timeoutMs: 15_000,
      signal: ctx.signal,
    });
  }
  const ts = okxTimestamp(ctx.now?.() ?? Date.now());
  const sign = okxSign(creds!.secret, ts, 'GET', path);
  return ctx.transport.raw(`https://www.okx.com${path}`, {
    timeoutMs: 15_000,
    signal: ctx.signal,
    headers: {
      'OK-ACCESS-KEY': creds!.apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': ts,
      'OK-ACCESS-PASSPHRASE': creds!.passphrase,
      'Content-Type': 'application/json',
    },
  });
}

export const okxProvider: SwapProvider = {
  id: 'okxdex',
  label: 'OKX DEX',
  supportsChain: (chainId) => !!OKX_CHAINS[chainId],
  async quote(req, ctx) {
    const ci = OKX_CHAINS[req.chainId];
    if (!ci) return null;
    const fromAddr = src(req.fromToken, NATIVE_LOWER_EEEE);
    const toAddr = src(req.toToken, NATIVE_LOWER_EEEE);
    if (!fromAddr || !toAddr) return null;

    const okxCtx = { transport: ctx.transport, signal: ctx.signal, now: ctx.now };

    const liquidity = await okxGet(okxCtx, `/api/v6/dex/aggregator/get-liquidity?chainIndex=${ci}`);
    const dexes: any[] = Array.isArray(liquidity?.data) ? liquidity.data : [];
    if (!dexes.length) return null;

    const cap = Math.max(1, Math.min(ctx.maxFanout ?? 25, dexes.length));
    const sliced = dexes.slice(0, cap);
    const baseQuery = `chainIndex=${ci}&amount=${req.amountWei.toString()}&fromTokenAddress=${fromAddr}&toTokenAddress=${toAddr}&swapMode=exactIn`;

    const results: ProviderQuote[] = [];
    const concurrency = 5;
    for (let i = 0; i < sliced.length; i += concurrency) {
      if (ctx.signal?.aborted) break;
      const batch = sliced.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(async (dex) => {
        try {
          const json = await okxGet(okxCtx, `/api/v6/dex/aggregator/quote?${baseQuery}&dexIds=${encodeURIComponent(String(dex.id))}`);
          const d = json?.data?.[0];
          if (json?.code !== '0' || !d) return null;
          const outputWei = String(d.toTokenAmount || '0');
          if (outputWei === '0') return null;
          return {
            provider: 'okxdex' as const,
            displayName: String(dex.name || 'OKX DEX'),
            outputWei,
            to: NATIVE_ZERO,
            data: '0x',
            value: '0x0',
            gasLimit: Number(d.estimateGasFee) || 350000,
            routerLogoURI: dex.logo || 'https://static.okx.com/cdn/assets/imgs/232/4B1D6E8E0FD09F52.png',
            priceOnly: true,
            quoteRef: {
              kind: 'okx-dex',
              payload: { dexId: String(dex.id), name: String(dex.name || 'OKX DEX') },
            },
            meta: { dexId: String(dex.id), chainIndex: ci },
          };
        } catch {
          return null;
        }
      }));
      for (const r of batchResults) if (r) results.push(r);
    }
    return results.length ? results : null;
  },
};
