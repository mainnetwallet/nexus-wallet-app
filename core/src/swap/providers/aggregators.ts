import { NATIVE_EEEE, NATIVE_ZERO, isNativeAddress } from '../../util/address.js';
import { floatToWeiFloor, decimalToHex } from '../../util/units.js';
import type { ProviderQuote, SwapProvider, SwapRequest } from '../types.js';

const LIFI_NATIVE = NATIVE_ZERO;
const EVM_NATIVE_EEEE = NATIVE_EEEE;

function tokenAddress(token: SwapRequest['fromToken'], sentinel: string): string | null {
  if (isNativeAddress(token.address)) return sentinel;
  return token.address || null;
}

export const lifiProvider: SwapProvider = {
  id: 'lifi',
  label: 'LI.FI',
  supportsChain: () => true,
  async quote(req, ctx) {
    const fromAddr = tokenAddress(req.fromToken, LIFI_NATIVE);
    const toAddr = tokenAddress(req.toToken, LIFI_NATIVE);
    if (!fromAddr || !toAddr) return null;
    const body = {
      fromChainId: req.chainId,
      toChainId: req.chainId,
      fromTokenAddress: fromAddr,
      toTokenAddress: toAddr,
      fromAmount: req.amountWei.toString(),
      fromAddress: req.userAddress,
      options: {
        slippage: req.slippagePct / 100,
        integrator: 'NexusWallet',
        order: 'RECOMMENDED',
      },
    };
    const json = await ctx.transport.json('https://li.quest/v1/advanced/routes', {
      method: 'POST',
      body,
      secretKind: 'lifi',
      timeoutMs: 10_000,
      signal: ctx.signal,
    });
    const routes: any[] = Array.isArray(json?.routes) ? json.routes : [];
    if (!routes.length) return null;
    const out: ProviderQuote[] = [];
    const seen = new Set<string>();
    for (const route of routes) {
      const step = route?.steps?.[0];
      if (!step) continue;
      const outputWei = String(route.toAmount ?? route.toAmountMin ?? '0');
      if (outputWei === '0') continue;
      const name = step.toolDetails?.name || step.tool || 'LiFi';
      if (seen.has(name)) continue;
      seen.add(name);
      const gasCosts: any[] = step.estimate?.gasCosts ?? [];
      const gasUsd = gasCosts.reduce((s, c) => s + parseFloat(c?.amountUSD || '0'), 0);
      const feeCosts = [
        ...(route.estimate?.feeCosts ?? []),
        ...(route.steps?.flatMap((s: any) => s.estimate?.feeCosts ?? []) ?? []),
      ];
      const feeUsd = feeCosts.reduce((s: number, f: any) => s + parseFloat(f?.amountUSD || '0'), 0);
      out.push({
        provider: 'lifi',
        displayName: name,
        outputWei,
        to: '0x0000000000000000000000000000000000000001',
        data: '0x',
        value: '0x0',
        gasLimit: Number(gasCosts[0]?.estimate || 300000),
        routerLogoURI: step.toolDetails?.logoURI ?? null,
        apiGasUsd: gasUsd > 0 ? gasUsd : null,
        protocolFeeUsd: parseFloat(feeUsd.toFixed(4)),
        priceOnly: true,
        quoteRef: { kind: 'lifi-step', payload: route },
      });
    }
    return out.length ? out : null;
  },
};

export const odosProvider: SwapProvider = {
  id: 'odos',
  label: 'Odos',
  supportsChain: () => true,
  async quote(req, ctx) {
    const inToken = tokenAddress(req.fromToken, NATIVE_ZERO);
    const outToken = tokenAddress(req.toToken, NATIVE_ZERO);
    if (!inToken || !outToken) return null;
    const quote = await ctx.transport.json('https://api.odos.xyz/sor/quote/v2', {
      method: 'POST',
      secretKind: 'odos',
      timeoutMs: 8_000,
      signal: ctx.signal,
      body: {
        chainId: req.chainId,
        inputTokens: [{ tokenAddress: inToken, amount: req.amountWei.toString() }],
        outputTokens: [{ tokenAddress: outToken, proportion: 1 }],
        userAddr: req.userAddress,
        slippageLimitPercent: req.slippagePct,
        compact: true,
        simple: false,
      },
    });
    const outputWei = String(quote?.outAmounts?.[0] || '0');
    if (!quote?.pathId || outputWei === '0') return null;
    const assembled = await ctx.transport.json('https://api.odos.xyz/sor/assemble', {
      method: 'POST',
      secretKind: 'odos',
      timeoutMs: 8_000,
      signal: ctx.signal,
      body: { pathId: quote.pathId, userAddr: req.userAddress, simulate: false },
    });
    if (!assembled?.transaction?.to) return null;
    const gasUsd = parseFloat(quote.gasEstimateValue || '0');
    return [{
      provider: 'odos',
      displayName: 'Odos',
      outputWei,
      to: assembled.transaction.to,
      data: assembled.transaction.data,
      value: assembled.transaction.value || '0x0',
      gasLimit: Number(assembled.transaction.gas) || 300000,
      apiGasUsd: gasUsd > 0 ? gasUsd : null,
      priceOnly: false,
      meta: { pathId: quote.pathId },
    }];
  },
};

const ONEINCH_CHAINS = new Set([1, 56, 137, 42161, 10, 8453, 43114, 324, 250, 100, 59144, 534352, 81457]);

export const oneInchProvider: SwapProvider = {
  id: '1inch',
  label: '1inch',
  supportsChain: (chainId) => ONEINCH_CHAINS.has(chainId),
  async quote(req, ctx) {
    if (!ONEINCH_CHAINS.has(req.chainId)) return null;
    const src = tokenAddress(req.fromToken, EVM_NATIVE_EEEE);
    const dst = tokenAddress(req.toToken, EVM_NATIVE_EEEE);
    if (!src || !dst) return null;
    const params = new URLSearchParams({
      src,
      dst,
      amount: req.amountWei.toString(),
      from: req.userAddress,
      slippage: Math.min(req.slippagePct, 50).toFixed(2),
      disableEstimate: 'true',
      allowPartialFill: 'false',
    });
    const json = await ctx.transport.json(`https://api.1inch.dev/swap/v6.0/${req.chainId}/swap?${params}`, {
      secretKind: 'oneInch',
      timeoutMs: 9_000,
      signal: ctx.signal,
    });
    if (!json?.tx?.to || !json?.tx?.data) return null;
    const outputWei = String(json.dstAmount || '0');
    if (outputWei === '0') return null;
    return [{
      provider: '1inch',
      displayName: '1inch',
      outputWei,
      to: json.tx.to,
      data: json.tx.data,
      value: json.tx.value && json.tx.value !== '0' ? json.tx.value : '0x0',
      gasLimit: Number(json.tx.gas) || 300000,
      priceOnly: false,
    }];
  },
};

const SWAPAPI_NAME_MAP: Record<string, string> = {
  uniswap_v2: 'Uniswap V2', uniswap_v3: 'Uniswap V3', uniswap_v4: 'Uniswap V4',
  uniswapv2: 'Uniswap V2', uniswapv3: 'Uniswap V3', uniswapv4: 'Uniswap V4', uniswap: 'Uniswap',
  pancakeswap: 'PancakeSwap', pancakeswap_v3: 'PancakeSwap V3', pancakev3: 'PancakeSwap V3',
  sushiswap: 'SushiSwap', sushi: 'SushiSwap', curve: 'Curve', curve_finance: 'Curve Finance',
  balancer: 'Balancer', balancer_v2: 'Balancer', dodo: 'DODO', dodo_v2: 'DODO',
  velodrome: 'Velodrome', velodrome_v2: 'Velodrome', aerodrome: 'Aerodrome', aerodrome_v2: 'Aerodrome',
  camelot: 'Camelot', camelot_v3: 'Camelot', traderjoe: 'Trader Joe', trader_joe: 'Trader Joe',
  joe_v2: 'Trader Joe', quickswap: 'QuickSwap', quickswap_v3: 'QuickSwap', spookyswap: 'SpookySwap',
  biswap: 'Biswap', maverick: 'Maverick', maverick_v2: 'Maverick', ambient: 'Ambient',
  kyberswap: 'KyberSwap', kyber: 'KyberSwap', odos: 'Odos', '1inch': '1inch', '1inch_v5': '1inch',
  '1inch_v6': '1inch', '0x': '0x', '0x_v4': '0x', openocean: 'OpenOcean', open_ocean: 'OpenOcean',
  cow: 'CoW Protocol', cowswap: 'CoW Protocol', cow_protocol: 'CoW Protocol', hashflow: 'Hashflow',
  clipper: 'Clipper', bancor: 'Bancor', izumi: 'Izumi', izumi_finance: 'Izumi', zyberswap: 'Zyberswap',
  rango: 'Rango', squid: 'Squid', lifi: 'LiFi', 'li.fi': 'LiFi', socket: 'Socket',
  symbiosis: 'Symbiosis', enso: 'Enso', velora: 'Velora',
};

export function normalizeDexName(raw: string | undefined | null): string {
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/[\s\-. ]/g, '_');
  if (SWAPAPI_NAME_MAP[key]) return SWAPAPI_NAME_MAP[key];
  for (const [k, v] of Object.entries(SWAPAPI_NAME_MAP)) {
    if (key.startsWith(k) || k.startsWith(key)) return v;
  }
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const swapApiProvider: SwapProvider = {
  id: 'swapapi',
  label: 'SwapAPI',
  supportsChain: (chainId) => chainId > 0,
  async quote(req, ctx) {
    const src = tokenAddress(req.fromToken, EVM_NATIVE_EEEE);
    const dst = tokenAddress(req.toToken, EVM_NATIVE_EEEE);
    if (!src || !dst) return null;
    const params = new URLSearchParams({
      tokenIn: src,
      tokenOut: dst,
      amount: req.amountWei.toString(),
      sender: req.userAddress,
      maxSlippage: (req.slippagePct / 100).toFixed(4),
    });
    const json = await ctx.transport.json(`https://api.swapapi.dev/v1/swap/${req.chainId}?${params}`, {
      timeoutMs: 9_000,
      signal: ctx.signal,
    });
    if (!json?.success || json?.data?.status !== 'Successful') return null;
    const tx = json.data.tx;
    if (!tx?.to || !tx?.data) return null;
    const outputWei = String(json.data.expectedAmountOut || '0');
    if (outputWei === '0') return null;
    const display = normalizeDexName(json.data.aggregator || json.data.protocol || json.data.dex || json.data.exchange || json.data.router);
    return [{
      provider: 'swapapi',
      displayName: display || 'SwapAPI',
      outputWei,
      to: tx.to,
      data: tx.data,
      value: tx.value && tx.value !== '0' ? tx.value : '0x0',
      gasLimit: Number(tx.gas) || 300000,
      priceOnly: false,
      meta: { dex: display, gasPriceWei: tx.gasPrice ?? null },
    }];
  },
};

const KYBER_CHAIN: Record<number, string> = {
  1: 'ethereum', 56: 'bsc', 137: 'polygon', 42161: 'arbitrum', 10: 'optimism', 8453: 'base',
  43114: 'avalanche', 250: 'fantom', 25: 'cronos', 1313161554: 'aurora', 1101: 'polygon-zkevm',
  324: 'zksync', 59144: 'linea', 534352: 'scroll', 81457: 'blast', 7777777: 'zora',
  5000: 'mantle', 169: 'manta-pacific',
};

export const kyberProvider: SwapProvider = {
  id: 'kyberswap',
  label: 'KyberSwap',
  supportsChain: (chainId) => !!KYBER_CHAIN[chainId],
  async quote(req, ctx) {
    const slug = KYBER_CHAIN[req.chainId];
    if (!slug) return null;
    const tokenIn = tokenAddress(req.fromToken, EVM_NATIVE_EEEE);
    const tokenOut = tokenAddress(req.toToken, EVM_NATIVE_EEEE);
    if (!tokenIn || !tokenOut) return null;
    const routeParams = new URLSearchParams({
      tokenIn,
      tokenOut,
      amountIn: req.amountWei.toString(),
      origin: req.userAddress,
    });
    const route = await ctx.transport.json(`https://aggregator-api.kyberswap.com/${slug}/api/v1/routes?${routeParams}`, {
      headers: { 'X-Client-Id': 'NexusWallet' },
      timeoutMs: 7_000,
      signal: ctx.signal,
    });
    const summary = route?.data?.routeSummary;
    if (!summary) return null;
    const built = await ctx.transport.json(`https://aggregator-api.kyberswap.com/${slug}/api/v1/route/build`, {
      method: 'POST',
      headers: { 'X-Client-Id': 'NexusWallet' },
      timeoutMs: 7_000,
      signal: ctx.signal,
      body: {
        routeSummary: summary,
        sender: req.userAddress,
        recipient: req.userAddress,
        slippageTolerance: Math.round(req.slippagePct * 100),
        deadline: Math.floor((ctx.now?.() ?? Date.now()) / 1000) + 1200,
      },
    });
    if (!built?.data?.data) return null;
    const outputWei = String(summary.amountOut || '0');
    if (outputWei === '0') return null;
    const gasUsd = parseFloat(summary.gasUsd || route?.data?.gasUsd || '0');
    return [{
      provider: 'kyberswap',
      displayName: 'KyberSwap',
      outputWei,
      to: route.data.routerAddress,
      data: built.data.data,
      value: isNativeAddress(req.fromToken.address) ? decimalToHex(req.amountWei) : '0x0',
      gasLimit: Number(summary.gas) || 300000,
      apiGasUsd: gasUsd > 0 ? gasUsd : null,
      priceOnly: false,
      meta: { router: route.data.routerAddress },
    }];
  },
};

const OPENOCEAN_CHAIN: Record<number, string> = {
  1: 'eth', 56: 'bsc', 137: 'polygon', 42161: 'arbitrum', 10: 'optimism', 8453: 'base', 43114: 'avax',
};

export const openOceanProvider: SwapProvider = {
  id: 'openocean',
  label: 'OpenOcean',
  supportsChain: (chainId) => !!OPENOCEAN_CHAIN[chainId],
  async quote(req, ctx) {
    const slug = OPENOCEAN_CHAIN[req.chainId];
    if (!slug) return null;
    const inAddr = tokenAddress(req.fromToken, EVM_NATIVE_EEEE);
    const outAddr = tokenAddress(req.toToken, EVM_NATIVE_EEEE);
    if (!inAddr || !outAddr) return null;
    const humanAmt = (Number(req.amountWei) / Math.pow(10, req.fromToken.decimals || 18)).toFixed(8);
    const params = new URLSearchParams({
      inTokenAddress: inAddr,
      outTokenAddress: outAddr,
      amount: humanAmt,
      slippage: String(req.slippagePct),
      account: req.userAddress,
      gasPrice: '5',
    });
    const json = await ctx.transport.json(`https://open-api.openocean.finance/v4/${slug}/swap?${params}`, {
      timeoutMs: 7_000,
      signal: ctx.signal,
    });
    if (!json?.data?.to || !json?.data?.data) return null;
    const outputWei = String(json.data.outAmount || '0');
    if (outputWei === '0') return null;
    return [{
      provider: 'openocean',
      displayName: 'OpenOcean',
      outputWei,
      to: json.data.to,
      data: json.data.data,
      value: json.data.value || '0x0',
      gasLimit: Number(json.data.estimatedGas) || 300000,
      priceOnly: false,
      meta: { gasPriceWei: json.data.gasPrice ?? null },
    }];
  },
};

export { floatToWeiFloor };
