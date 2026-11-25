import { isNativeAddress, NATIVE_EEEE, NATIVE_ZERO } from '../../util/address.js';
import { decimalToHex, floatToWeiFloor, fromWei } from '../../util/units.js';
import type { ProviderQuote, SwapProvider } from '../types.js';

function src(token: { address: string }, sentinel: string): string | null {
  return isNativeAddress(token.address) ? sentinel : token.address || null;
}

function nativeHumanToWei(human: string, decimals: number): string | null {
  const trimmed = String(human ?? '').trim();
  if (!trimmed || Number(trimmed) <= 0) return null;
  try {
    const [intPart, fracRaw = ''] = trimmed.split('.');
    const frac = fracRaw.slice(0, decimals);
    const wei = BigInt(intPart || '0') * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0');
    return wei > 0n ? wei.toString() : null;
  } catch {
    return floatToWeiFloor(Number(trimmed), decimals);
  }
}

export const bungeeProvider: SwapProvider = {
  id: 'bungee',
  label: 'Bungee',
  supportsChain: () => true,
  async quote(req, ctx) {
    const srcAddr = src(req.fromToken, NATIVE_EEEE);
    const dstAddr = src(req.toToken, NATIVE_EEEE);
    if (!srcAddr || !dstAddr || !req.userAddress) return null;
    const params = new URLSearchParams({
      userAddress: req.userAddress,
      receiverAddress: req.userAddress,
      originChainId: String(req.chainId),
      destinationChainId: String(req.chainId),
      inputToken: srcAddr,
      outputToken: dstAddr,
      inputAmount: req.amountWei.toString(),
      slippage: req.slippagePct.toFixed(1),
      enableManual: 'true',
      disableAuto: 'true',
    });
    const json = await ctx.transport.json(`https://public-backend.bungee.exchange/api/v1/bungee/quote?${params}`, {
      timeoutMs: 10_000,
      signal: ctx.signal,
    });
    const routes: any[] = json?.result?.manualRoutes ?? [];
    const out: ProviderQuote[] = [];
    const seen = new Set<string>();
    for (const route of routes) {
      if (!route?.quoteId) continue;
      const outputWei = String(route.output?.amount ?? '0');
      if (outputWei === '0') continue;
      const name = route.routeDetails?.name || 'Bungee';
      if (seen.has(name)) continue;
      seen.add(name);
      const feeUsd = parseFloat(route.routeDetails?.routeFee?.feeInUsd || '0');
      out.push({
        provider: 'bungee',
        displayName: name,
        outputWei,
        to: '0x0000000000000000000000000000000000000001',
        data: '0x',
        value: '0x0',
        gasLimit: Number(route.gasFee?.gasLimit) || 350000,
        routerLogoURI: route.routeDetails?.logoURI ?? null,
        protocolFeeUsd: parseFloat(feeUsd.toFixed(4)),
        priceOnly: true,
        quoteRef: { kind: 'bungee', payload: { quoteId: route.quoteId } },
        meta: {
          gasPriceWei: route.gasFee?.gasPrice ?? null,
          gasToken: route.gasFee?.gasToken ?? null,
          routeName: name,
        },
      });
    }
    return out.length ? out : null;
  },
};

export const RANGO_CHAIN: Record<number, string> = {
  1: 'ETH', 56: 'BSC', 137: 'POLYGON', 42161: 'ARBITRUM', 10: 'OPTIMISM', 8453: 'BASE', 43114: 'AVAX_CCHAIN',
};
export const RANGO_NATIVE: Record<number, string> = {
  1: 'ETH', 56: 'BNB', 137: 'MATIC', 42161: 'ETH', 10: 'ETH', 8453: 'ETH', 43114: 'AVAX',
};

const RANGO_NAME_FIXES: Record<string, string> = {
  UNISWAP_V2: 'Uniswap V2', UNISWAP_V3: 'Uniswap V3', UNISWAP_V4: 'Uniswap V4', UNISWAP: 'Uniswap V3',
  UNI_SWAP: 'Uniswap V3', UNI_SWAP_V2: 'Uniswap V2', UNI_SWAP_V3: 'Uniswap V3', UNI_SWAP_V4: 'Uniswap V4',
  PANCAKESWAP: 'PancakeSwap', PANCAKE_SWAP: 'PancakeSwap', PANCAKESWAP_V2: 'PancakeSwap V2',
  PANCAKE_SWAP_V2: 'PancakeSwap V2', PANCAKESWAP_V3: 'PancakeSwap V3', PANCAKE_SWAP_V3: 'PancakeSwap V3',
  SUSHISWAP: 'SushiSwap', SUSHI_SWAP: 'SushiSwap', QUICKSWAP: 'QuickSwap', QUICK_SWAP: 'QuickSwap',
  QUICKSWAP_V3: 'QuickSwap V3', QUICK_SWAP_V3: 'QuickSwap V3', TRADERJOE: 'Trader Joe',
  TRADER_JOE: 'Trader Joe', KYBERSWAP: 'KyberSwap', KYBER_SWAP: 'KyberSwap', OPENOCEAN: 'OpenOcean',
  OPEN_OCEAN: 'OpenOcean', COWSWAP: 'CoW Protocol', COW_SWAP: 'CoW Protocol', COW_PROTOCOL: 'CoW Protocol',
  '1INCH': '1inch', ONE_INCH: '1inch', ONEINCH: '1inch', NATIVE_ROUTER: 'Native Router', NATIVE: 'Native Router',
  CURVE: 'Curve', CURVE_FINANCE: 'Curve Finance', BALANCER: 'Balancer', BALANCER_V2: 'Balancer V2',
  VELODROME: 'Velodrome', VELODROME_V2: 'Velodrome V2', AERODROME: 'Aerodrome', CAMELOT: 'Camelot',
  CAMELOT_V3: 'Camelot V3', SPOOKYSWAP: 'SpookySwap', BISWAP: 'BiSwap', WOOFI: 'WOOFi',
};

export const rangoProvider: SwapProvider = {
  id: 'rango',
  label: 'Rango',
  supportsChain: (chainId) => !!RANGO_CHAIN[chainId],
  async quote(req, ctx) {
    const blockchain = RANGO_CHAIN[req.chainId];
    if (!blockchain) return null;
    const nativeSym = RANGO_NATIVE[req.chainId] || 'ETH';
    const fromSym = isNativeAddress(req.fromToken.address) ? nativeSym : req.fromToken.symbol;
    const toSym = isNativeAddress(req.toToken.address) ? nativeSym : req.toToken.symbol;
    if (!fromSym || !toSym) return null;
    const body: Record<string, unknown> = {
      from: {
        blockchain,
        symbol: fromSym,
        address: isNativeAddress(req.fromToken.address) ? null : req.fromToken.address,
      },
      to: {
        blockchain,
        symbol: toSym,
        address: isNativeAddress(req.toToken.address) ? null : req.toToken.address,
      },
      amount: fromWei(req.amountWei, req.fromToken.decimals || 18),
      slippage: String(req.slippagePct),
      checkPrerequisites: false,
    };
    if (req.userAddress) body.selectedWallets = { [blockchain]: req.userAddress };
    const json = await ctx.transport.json('https://api.rango.exchange/routing/bests?limit=20', {
      method: 'POST',
      secretKind: 'rango',
      timeoutMs: 12_000,
      signal: ctx.signal,
      body,
    });
    const routes: any[] = json?.results ?? [];
    const out: ProviderQuote[] = [];
    for (const route of routes) {
      const swaps: any[] = route.swaps ?? [];
      const swapperId = swaps[0]?.swapperId || 'Rango';
      const swapperLogo = swaps[0]?.swapperLogo || '';
      const outputWei = nativeHumanToWei(String(route.outputAmount || '0'), req.toToken.decimals || 18);
      if (!outputWei) continue;
      const display = RANGO_NAME_FIXES[swapperId.toUpperCase()] || swapperId
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      const fees: any[] = (route.fee && route.fee.length) ? route.fee : swaps.flatMap((s) => s.fee ?? []);
      let gasUsd = 0;
      let protoFeeUsd = 0;
      for (const fee of fees) {
        const amt = parseFloat(fee.amount || '0');
        const price = parseFloat(fee.token?.usdPrice || fee.price || '0');
        if (fee.expenseType === 'FROM_SOURCE_WALLET') gasUsd += amt * price;
        if (fee.expenseType === 'DECREASE_FROM_OUTPUT') protoFeeUsd += amt * price;
      }
      if (gasUsd === 0 && route.feeUsd) gasUsd = parseFloat(route.feeUsd);
      out.push({
        provider: 'rango',
        displayName: display,
        outputWei,
        to: '0x0000000000000000000000000000000000000001',
        data: '0x',
        value: '0x0',
        gasLimit: 300000,
        routerLogoURI: swapperLogo || null,
        apiGasUsd: gasUsd > 0 ? gasUsd : null,
        protocolFeeUsd: parseFloat(protoFeeUsd.toFixed(4)),
        priceOnly: true,
        quoteRef: { kind: 'rango', payload: route },
        meta: { requestId: route.requestId ?? null },
      });
    }
    return out.length ? out : null;
  },
};

const SYMBIOSIS_CHAINS = new Set([1, 56, 137, 42161, 10, 8453, 43114]);

export const symbiosisProvider: SwapProvider = {
  id: 'symbiosis',
  label: 'Symbiosis',
  supportsChain: (chainId) => SYMBIOSIS_CHAINS.has(chainId),
  async quote(req, ctx) {
    const srcAddr = src(req.fromToken, NATIVE_ZERO);
    const dstAddr = src(req.toToken, NATIVE_ZERO);
    if (!srcAddr || !dstAddr) return null;
    const json = await ctx.transport.json('https://api.symbiosis.finance/crosschain/v1/swap', {
      method: 'POST',
      timeoutMs: 9_000,
      signal: ctx.signal,
      body: {
        tokenAmountIn: {
          chainId: req.chainId,
          address: srcAddr,
          amount: req.amountWei.toString(),
          decimals: req.fromToken.decimals || 18,
          symbol: req.fromToken.symbol,
        },
        tokenOut: {
          chainId: req.chainId,
          address: dstAddr,
          decimals: req.toToken.decimals || 18,
          symbol: req.toToken.symbol,
        },
        from: req.userAddress,
        to: req.userAddress,
        revertableAddress: req.userAddress,
        slippage: Math.round(req.slippagePct * 100),
      },
    });
    if (!json?.tx?.to || !json?.tx?.data) return null;
    const outputWei = String(json.tokenAmountOut?.amount || '0');
    if (outputWei === '0') return null;
    return [{
      provider: 'symbiosis',
      displayName: 'Symbiosis',
      outputWei,
      to: json.tx.to,
      data: json.tx.data,
      value: json.tx.value ? decimalToHex(json.tx.value) : '0x0',
      gasLimit: Number(json.tx.gas) || 400000,
      priceOnly: false,
    }];
  },
};

export const ensoProvider: SwapProvider = {
  id: 'enso',
  label: 'Enso',
  supportsChain: () => true,
  async quote(req, ctx) {
    const srcAddr = src(req.fromToken, '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    const dstAddr = src(req.toToken, '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    if (!srcAddr || !dstAddr) return null;
    const params = new URLSearchParams({
      chainId: String(req.chainId),
      fromAddress: req.userAddress,
      spender: req.userAddress,
      receiver: req.userAddress,
      amountIn: req.amountWei.toString(),
      tokenIn: srcAddr,
      tokenOut: dstAddr,
      slippage: String(Math.round(req.slippagePct * 100)),
    });
    const json = await ctx.transport.json(`https://api.enso.finance/api/v1/shortcuts/route?${params}`, {
      secretKind: 'enso',
      timeoutMs: 8_000,
      signal: ctx.signal,
    });
    if (!json?.tx?.to || !json?.tx?.data) return null;
    const outputWei = String(json.amountOut || '0');
    if (outputWei === '0') return null;
    return [{
      provider: 'enso',
      displayName: 'Enso',
      outputWei,
      to: json.tx.to,
      data: json.tx.data,
      value: json.tx.value ? decimalToHex(json.tx.value) : '0x0',
      gasLimit: Number(json.gas) || 300000,
      priceOnly: false,
    }];
  },
};

export const veloraProvider: SwapProvider = {
  id: 'velora',
  label: 'Velora',
  supportsChain: () => true,
  async quote(req, ctx) {
    const srcAddr = src(req.fromToken, NATIVE_EEEE);
    const destAddr = src(req.toToken, NATIVE_EEEE);
    if (!srcAddr || !destAddr) return null;
    const params = new URLSearchParams({
      srcToken: srcAddr,
      destToken: destAddr,
      amount: req.amountWei.toString(),
      srcDecimals: String(req.fromToken.decimals || 18),
      destDecimals: String(req.toToken.decimals || 18),
      side: 'SELL',
      network: String(req.chainId),
      userAddress: req.userAddress,
      version: '6.2',
      partner: 'nexus-wallet',
      ignoreBadUsdPrice: 'true',
    });
    const json = await ctx.transport.json(`https://api.velora.xyz/prices/?${params}`, {
      timeoutMs: 8_000,
      signal: ctx.signal,
    });
    const priceRoute = json?.priceRoute;
    const outputWei = String(priceRoute?.destAmount || '0');
    if (!priceRoute || outputWei === '0') return null;
    const gasUsd = parseFloat(priceRoute.gasCostUSD || '0');
    return [{
      provider: 'velora',
      displayName: 'Velora',
      outputWei,
      to: priceRoute.contractAddress || NATIVE_ZERO,
      data: '0x',
      value: '0x0',
      gasLimit: Number(priceRoute.gasCost) || 300000,
      apiGasUsd: gasUsd > 0 ? gasUsd : null,
      priceOnly: true,
      quoteRef: { kind: 'velora-price', payload: priceRoute },
      meta: { executable: false },
    }];
  },
};

const DODO_CHAINS = new Set([1, 10, 56, 137, 8453, 42161, 43114, 534352, 59144, 5000]);

export const dodoProvider: SwapProvider = {
  id: 'dodo',
  label: 'DODO',
  supportsChain: (chainId) => DODO_CHAINS.has(chainId),
  async quote(req, ctx) {
    const fromAddr = src(req.fromToken, NATIVE_EEEE);
    const toAddr = src(req.toToken, NATIVE_EEEE);
    if (!fromAddr || !toAddr) return null;
    const params = new URLSearchParams({
      chainId: String(req.chainId),
      fromAmount: req.amountWei.toString(),
      fromTokenAddress: fromAddr,
      toTokenAddress: toAddr,
      slippage: String(req.slippagePct / 100),
      userAddr: req.userAddress,
    });
    const json = await ctx.transport.json(`https://api.dodoex.io/route-service/developer/swap?${params}`, {
      secretKind: 'dodo',
      timeoutMs: 9_000,
      signal: ctx.signal,
    });
    if (json?.status !== 200 || !json?.data?.to || !json?.data?.data) return null;
    const resAmount = json.data.resAmount;
    const outputWei = resAmount != null
      ? floatToWeiFloor(Number(resAmount), req.toToken.decimals || 18)
      : '0';
    if (!outputWei || outputWei === '0') return null;
    return [{
      provider: 'dodo',
      displayName: 'DODO',
      outputWei,
      to: json.data.to,
      data: json.data.data,
      value: json.data.value && json.data.value !== '0x0' ? decimalToHex(json.data.value) : '0x0',
      gasLimit: 350000,
      priceOnly: false,
    }];
  },
};
