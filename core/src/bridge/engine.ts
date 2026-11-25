import { errorSummary, timeoutSignal } from '../http.js';
import type { BridgeProvider, BridgeQuote, BridgeRequest } from './providers.js';
import { BRIDGE_PROVIDERS } from './providers.js';
import type { ProviderContext, SwapTransport } from '../swap/types.js';
import { fromWei } from '../util/units.js';

export interface BridgeEngineOptions {
  transport: SwapTransport;
  providers?: BridgeProvider[];
  quoteTimeoutMs?: number;
  now?: () => number;
}

export interface BridgeQuoteSet {
  quotes: BridgeQuote[];
  best: BridgeQuote | null;
  errors: { provider: string; message: string }[];
}

export class BridgeEngine {
  private readonly transport: SwapTransport;
  private readonly providers: BridgeProvider[];
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(opts: BridgeEngineOptions) {
    this.transport = opts.transport;
    this.providers = opts.providers ?? BRIDGE_PROVIDERS;
    this.timeoutMs = opts.quoteTimeoutMs ?? 23_000;
    this.now = opts.now ?? Date.now;
  }

  async quote(req: BridgeRequest, signal?: AbortSignal): Promise<BridgeQuoteSet> {
    const errors: { provider: string; message: string }[] = [];
    const quotes: BridgeQuote[] = [];
    const providers = this.providers.filter((p) => p.supports(req.fromChainId, req.toChainId));

    await Promise.all(providers.map(async (provider) => {
      const t = timeoutSignal(this.timeoutMs, signal);
      const ctx: ProviderContext = { transport: this.transport, signal: t.signal, now: this.now };
      try {
        const list = await provider.quote(req, ctx);
        for (const q of list ?? []) {
          if (!q || !q.outputWei || q.outputWei === '0') continue;
          quotes.push(q);
        }
      } catch (err) {
        if (!signal?.aborted) errors.push({ provider: provider.id, message: errorSummary(err) });
      } finally {
        t.cancel();
      }
    }));

    const byOutput = (a: BridgeQuote, b: BridgeQuote) => (BigInt(a.outputWei) > BigInt(b.outputWei) ? -1 : BigInt(a.outputWei) < BigInt(b.outputWei) ? 1 : 0);
    const free = quotes.filter((q) => (q.protocolFeeUsd ?? 0) === 0);
    const pool = free.length ? free : quotes;
    const bestCandidate = [...pool].sort(byOutput)[0] ?? null;
    const rest = quotes.filter((q) => q !== bestCandidate).sort(byOutput);
    const sorted = bestCandidate ? [bestCandidate, ...rest] : rest;

    return { quotes: sorted, best: sorted[0] ?? null, errors };
  }
}

export function bridgeOutputAmount(q: BridgeQuote, toDecimals: number): number {
  return Number(fromWei(q.outputWei, toDecimals));
}
