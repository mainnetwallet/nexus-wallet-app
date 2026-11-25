import { errorSummary } from '../http.js';
import { timeoutSignal } from '../http.js';
import { fromWei } from '../util/units.js';
import type { ProviderContext, ProviderQuote, SwapProvider, SwapRequest, SwapTransport } from './types.js';
import { lifiProvider, odosProvider, oneInchProvider, swapApiProvider, kyberProvider, openOceanProvider } from './providers/aggregators.js';
import { bungeeProvider, rangoProvider, symbiosisProvider, ensoProvider, veloraProvider, dodoProvider } from './providers/aggregators2.js';
import { portalsProvider, flyProvider, squidProvider, okxProvider } from './providers/aggregators3.js';

export const DEFAULT_PROVIDERS: SwapProvider[] = [
  lifiProvider, odosProvider, oneInchProvider, swapApiProvider, kyberProvider, openOceanProvider,
  bungeeProvider, rangoProvider, symbiosisProvider, ensoProvider, veloraProvider, dodoProvider,
  portalsProvider, flyProvider, squidProvider, okxProvider,
];

export interface SwapEngineOptions {
  transport: SwapTransport;
  providers?: SwapProvider[];
  nativePriceUSD?: number;
  gasPriceGwei?: number;
  quoteTimeoutMs?: number;
  maxFanout?: number;
  now?: () => number;
}

export interface EnrichedQuote extends ProviderQuote {
  outputAmount: number;
  gasUsd: number | null;
  priceImpactPct: number;
  executable: boolean;
  providerLabel: string;
}

export interface QuoteFailure {
  provider: string;
  message: string;
}

export interface QuoteSet {
  quotes: EnrichedQuote[];
  best: EnrichedQuote | null;
  errors: QuoteFailure[];
}

export class SwapEngine {
  private readonly transport: SwapTransport;
  private readonly providers: SwapProvider[];
  private readonly nativePriceUSD: number;
  private readonly gasPriceGwei: number;
  private readonly quoteTimeoutMs: number;
  private readonly maxFanout: number;
  private readonly now: () => number;

  constructor(opts: SwapEngineOptions) {
    this.transport = opts.transport;
    this.providers = opts.providers ?? DEFAULT_PROVIDERS;
    this.nativePriceUSD = opts.nativePriceUSD ?? 0;
    this.gasPriceGwei = opts.gasPriceGwei ?? 1;
    this.quoteTimeoutMs = opts.quoteTimeoutMs ?? 15_000;
    this.maxFanout = opts.maxFanout ?? 25;
    this.now = opts.now ?? Date.now;
  }

  async quote(req: SwapRequest, signal?: AbortSignal): Promise<QuoteSet> {
    const errors: QuoteFailure[] = [];
    const quotes: EnrichedQuote[] = [];
    const providers = this.providers.filter((p) => p.supportsChain(req.chainId));

    const runs = providers.map(async (provider) => {
      const t = timeoutSignal(this.quoteTimeoutMs, signal);
      const ctx: ProviderContext = {
        transport: this.transport,
        signal: t.signal,
        maxFanout: this.maxFanout,
        now: this.now,
      };
      try {
        const results = await provider.quote(req, ctx);
        for (const q of results ?? []) {
          if (!q || !q.outputWei || q.outputWei === '0') continue;
          quotes.push(this.enrich(q, req));
        }
      } catch (err) {
        if (!signal?.aborted) errors.push({ provider: provider.id, message: errorSummary(err) });
      } finally {
        t.cancel();
      }
    });

    await Promise.all(runs);

    quotes.sort((a, b) => {
      const av = BigInt(a.outputWei);
      const bv = BigInt(b.outputWei);
      return av === bv ? 0 : av > bv ? -1 : 1;
    });

    return { quotes, best: quotes[0] ?? null, errors };
  }

  private enrich(q: ProviderQuote, req: SwapRequest): EnrichedQuote {
    const outputAmount = Number(fromWei(q.outputWei, req.toToken.decimals));
    let gasUsd = q.apiGasUsd ?? null;
    if (gasUsd == null || !Number.isFinite(gasUsd)) {
      const nativePrice = this.nativePriceUSD > 0 ? this.nativePriceUSD : nativeTokenPrice(req);
      if (nativePrice > 0 && this.gasPriceGwei > 0) {
        gasUsd = (q.gasLimit * this.gasPriceGwei * 1e-9) * nativePrice;
      } else {
        gasUsd = null;
      }
    }
    let priceImpactPct = 0;
    const fromPrice = req.fromToken.priceUSD ?? 0;
    const toPrice = req.toToken.priceUSD ?? 0;
    const fromAmount = Number(fromWei(req.amountWei, req.fromToken.decimals));
    if (fromPrice > 0 && toPrice > 0 && fromAmount > 0 && outputAmount > 0) {
      const fromUsd = fromAmount * fromPrice;
      const toUsd = outputAmount * toPrice;
      priceImpactPct = ((toUsd - fromUsd) / fromUsd) * 100;
    }
    const executable = !q.priceOnly || !!q.quoteRef;
    return {
      ...q,
      outputAmount,
      gasUsd,
      priceImpactPct,
      executable,
      providerLabel: providerLabel(q.provider),
    };
  }
}

function nativeTokenPrice(req: SwapRequest): number {
  if (isNativeLike(req.fromToken.address)) return req.fromToken.priceUSD ?? 0;
  if (isNativeLike(req.toToken.address)) return req.toToken.priceUSD ?? 0;
  return 0;
}

function isNativeLike(address: string | undefined): boolean {
  if (!address) return true;
  const c = address.toLowerCase().replace(/^0x/, '');
  return !c || /^0+$/.test(c) || c === 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
}

const PROVIDER_LABELS: Record<string, string> = {
  lifi: 'LI.FI', odos: 'Odos', '1inch': '1inch', swapapi: 'SwapAPI', kyberswap: 'KyberSwap',
  openocean: 'OpenOcean', bungee: 'Bungee', rango: 'Rango', symbiosis: 'Symbiosis',
  enso: 'Enso', velora: 'Velora', dodo: 'DODO', portals: 'Portals', fly: 'Fly',
  okxdex: 'OKX DEX', squid: 'Squid',
};

export function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id;
}
