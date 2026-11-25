import type { FetchLike } from '../http.js';
import { fetchJson, timeoutSignal, type JsonRequest } from '../http.js';

export interface TokenInfo {
  /** Empty string or zero address means the chain native asset. */
  address: string;
  symbol: string;
  name?: string;
  decimals: number;
  logoURI?: string | null;
  priceUSD?: number | null;
}

export interface SwapRequest {
  chainId: number;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  amountWei: bigint;
  userAddress: string;
  /** Percent, e.g. 0.5 = 0.5%. */
  slippagePct: number;
  fromUsdValue?: number;
}

export interface QuoteRef {
  /** Provider-specific identifier used to build calldata at execution time. */
  kind: string;
  payload: unknown;
}

export interface ProviderQuote {
  provider: SwapProviderId;
  /** Name shown on the route card (may be a specific DEX reported by the aggregator). */
  displayName: string;
  outputWei: string;
  to: string;
  data: string;
  value: string;
  gasLimit: number;
  routerLogoURI?: string | null;
  apiGasUsd?: number | null;
  protocolFeeUsd?: number | null;
  /** True when calldata is a placeholder and must be built at execution time. */
  priceOnly: boolean;
  quoteRef?: QuoteRef;
  meta?: Record<string, unknown>;
}

export type SwapProviderId =
  | 'lifi'
  | 'odos'
  | '1inch'
  | 'swapapi'
  | 'kyberswap'
  | 'openocean'
  | 'bungee'
  | 'rango'
  | 'symbiosis'
  | 'enso'
  | 'velora'
  | 'dodo'
  | 'portals'
  | 'fly'
  | 'okxdex'
  | 'squid';

export interface SwapProvider {
  readonly id: SwapProviderId;
  readonly label: string;
  supportsChain(chainId: number): boolean;
  quote(req: SwapRequest, ctx: ProviderContext): Promise<ProviderQuote[] | null>;
}

export type SecretKind = 'lifi' | 'odos' | 'oneInch' | 'okx' | 'enso' | 'rango' | 'squid' | 'dodo';

export interface OkxCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface ProviderSecrets {
  lifi?: string;
  odos?: string;
  oneInch?: string;
  okx?: OkxCredentials;
  enso?: string;
  rango?: string;
  squid?: string;
  dodo?: string;
}

export interface TransportOptions {
  fetchImpl?: FetchLike;
  secrets?: ProviderSecrets;
  /** When set, secret-bearing calls go through the key proxy instead of direct. */
  proxyBaseUrl?: string;
}

export interface RequestOptions extends JsonRequest {
  secretKind?: SecretKind;
  query?: Record<string, string>;
}

export class SwapTransport {
  private readonly fetchImpl: FetchLike;
  private readonly secrets: ProviderSecrets;
  private readonly proxyBaseUrl?: string;

  constructor(opts: TransportOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.secrets = opts.secrets ?? {};
    this.proxyBaseUrl = opts.proxyBaseUrl?.replace(/\/$/, '');
  }

  usesProxy(kind: SecretKind): boolean {
    if (!this.proxyBaseUrl) return false;
    return !this.hasSecret(kind);
  }

  hasSecret(kind: SecretKind): boolean {
    switch (kind) {
      case 'lifi': return !!this.secrets.lifi;
      case 'odos': return !!this.secrets.odos;
      case 'oneInch': return !!this.secrets.oneInch;
      case 'okx': return !!this.secrets.okx;
      case 'enso': return !!this.secrets.enso;
      case 'rango': return !!this.secrets.rango;
      case 'squid': return !!this.secrets.squid;
      case 'dodo': return !!this.secrets.dodo;
    }
  }

  getSecret<K extends SecretKind>(kind: K): ProviderSecrets[K] {
    return this.secrets[kind];
  }

  async json(url: string, opts: RequestOptions = {}): Promise<any> {
    const kind = opts.secretKind;
    if (kind && this.usesProxy(kind)) {
      const headers: Record<string, string> = {};
      if (kind === 'odos' && this.secrets.odos) headers['x-api-key'] = this.secrets.odos;
      if (kind === 'oneInch' && this.secrets.oneInch) headers.Authorization = `Bearer ${this.secrets.oneInch}`;
      if (kind === 'lifi' && this.secrets.lifi) headers['x-lifi-api-key'] = this.secrets.lifi;
      if (kind === 'enso' && this.secrets.enso) headers.Authorization = `Bearer ${this.secrets.enso}`;
      const proxied = await fetchJson(this.fetchImpl, `${this.proxyBaseUrl}/v1/forward`, {
        method: 'POST',
        timeoutMs: opts.timeoutMs ?? 15_000,
        signal: opts.signal,
        body: {
          provider: kind,
          url,
          method: opts.method ?? 'GET',
          headers: { ...headers, ...(opts.headers ?? {}) },
          body: opts.body,
          query: opts.query,
        },
      });
      if (proxied && typeof proxied === 'object' && 'status' in proxied && 'body' in proxied) {
        const status = Number((proxied as any).status);
        if (status >= 400) throw new Error(`Proxy upstream HTTP ${status}: ${String((proxied as any).body).slice(0, 160)}`);
        return (proxied as any).body;
      }
      return proxied;
    }

    const headers = { ...(opts.headers ?? {}) };
    const params = new URLSearchParams(opts.query ?? {});
    if (kind === 'lifi' && this.secrets.lifi) headers['x-lifi-api-key'] = this.secrets.lifi;
    if (kind === 'odos' && this.secrets.odos) headers['x-api-key'] = this.secrets.odos;
    if (kind === 'oneInch' && this.secrets.oneInch) headers.Authorization = `Bearer ${this.secrets.oneInch}`;
    if (kind === 'enso' && this.secrets.enso) headers.Authorization = `Bearer ${this.secrets.enso}`;
    if (kind === 'dodo' && this.secrets.dodo) params.set('apikey', this.secrets.dodo);
    if (kind === 'rango' && this.secrets.rango) params.set('apiKey', this.secrets.rango);
    if (!(kind === 'squid')) {
      const qs = params.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    if (kind === 'squid' && this.secrets.squid) headers['x-integrator-id'] = this.secrets.squid;
    return fetchJson(this.fetchImpl, url, { ...opts, headers });
  }

  /** Direct fetch with an already-signed header set (OKX local signing lives in the provider). */
  async raw(url: string, opts: RequestOptions = {}): Promise<any> {
    const params = new URLSearchParams(opts.query ?? {});
    const qs = params.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    return fetchJson(this.fetchImpl, url, opts);
  }
}

export interface ProviderContext {
  transport: SwapTransport;
  signal?: AbortSignal;
  /** Cap provider fan-out (OKX enumerates per-DEX quotes). */
  maxFanout?: number;
  now?: () => number;
}

export function withQuery(url: string, query: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  if (!qs) return url;
  return url + (url.includes('?') ? '&' : '?') + qs;
}

export function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('aborted'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

export { timeoutSignal };
