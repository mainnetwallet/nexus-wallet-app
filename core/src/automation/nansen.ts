/**
 * Nansen & Jumper (Profile → TOOLS). Public API calls only; premium keys are
 * user-supplied and routed through the key proxy. No key is bundled.
 */
import { fetchJson, type FetchLike } from '../http.js';

export interface NansenOptions {
  fetchImpl?: FetchLike;
  proxyBaseUrl?: string;
  apiKey?: string;
  signal?: AbortSignal;
}

const NANSEN_BASE = 'https://api.nansen.ai';

function headers(apiKey?: string): Record<string, string> {
  return apiKey ? { apiKey } : {};
}

export class NansenClient {
  private readonly fetchImpl: FetchLike;
  private readonly proxyBaseUrl?: string;
  private readonly apiKey?: string;
  private readonly signal?: AbortSignal;

  constructor(opts: NansenOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.proxyBaseUrl = opts.proxyBaseUrl?.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.signal = opts.signal;
  }

  private async get(path: string, query: Record<string, string> = {}): Promise<any> {
    const qs = new URLSearchParams(query).toString();
    const url = `${NANSEN_BASE}${path}${qs ? `?${qs}` : ''}`;
    if (this.proxyBaseUrl && !this.apiKey) {
      const res = await fetchJson(this.fetchImpl, `${this.proxyBaseUrl}/v1/forward`, {
        method: 'POST',
        body: { provider: 'nansen', url, method: 'GET', headers: {}, query },
        signal: this.signal,
      });
      return (res as any)?.body ?? res;
    }
    return fetchJson(this.fetchImpl, url, { headers: headers(this.apiKey), signal: this.signal });
  }

  async smartMoneyHoldings(chain: string, address: string): Promise<any> {
    return this.get(`/api/v1/smart-money/holdings`, { chain, address });
  }

  async walletPnl(chain: string, address: string): Promise<any> {
    return this.get(`/api/v1/profiler/address/pnl-summary`, { chain, address });
  }

  async tokenFlow(chain: string, token: string): Promise<any> {
    return this.get(`/api/v1/token/flow`, { chain, token });
  }
}

/** Jumper quote (keyless); returns the raw route JSON for the UI. */
export function jumperQuoteUrl(params: {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
}): string {
  const qs = new URLSearchParams({
    fromChain: String(params.fromChain),
    toChain: String(params.toChain),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
  });
  return `https://li.quest/v1/quote?${qs.toString()}`;
}

export function hasNansenKey(key: string | null | undefined): boolean {
  return typeof key === 'string' && key.trim().length > 0;
}
