import type { FetchLike } from '../http.js';
import { timeoutSignal } from '../http.js';
import { getRpcListForChain, type CustomChainDef, type RpcStorage } from '../chains/registry.js';

export class RpcError extends Error {
  readonly code: number | null;
  readonly data?: unknown;
  constructor(message: string, code: number | null = null, data?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

export interface RpcClientOptions {
  chainId: number;
  urls: string[];
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Max RPC endpoints tried per call (default 6). */
  maxAttempts?: number;
}

export interface RpcCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Skip failover for deterministic errors; network failures always rotate. */
  noRetry?: boolean;
}

export function hexQuantity(value: bigint | number | string): string {
  const v = BigInt(value);
  return `0x${v.toString(16)}`;
}

function normalizeTxForRpc(tx: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tx)) {
    if (v === undefined || v === null) continue;
    if (k === 'type' || k === 'chainId' || k === 'nonce' || k === 'gas' || k === 'gasLimit' || k === 'value' || k === 'gasPrice' || k === 'maxFeePerGas' || k === 'maxPriorityFeePerGas') {
      out[k === 'gasLimit' ? 'gas' : k] = typeof v === 'string' && v.startsWith('0x') ? v : hexQuantity(v as bigint | number | string);
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

export class RpcClient {
  readonly chainId: number;
  readonly urls: string[];
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private healthIndex = 0;
  private idCounter = 1;

  constructor(opts: RpcClientOptions) {
    this.chainId = opts.chainId;
    this.urls = opts.urls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? 8_000;
    this.maxAttempts = opts.maxAttempts ?? 6;
  }

  static fromChain(
    chainId: number,
    store?: RpcStorage,
    customChains?: CustomChainDef[],
    fetchImpl?: FetchLike,
  ): RpcClient {
    const urls = store ? getRpcListForChain(chainId, store, customChains) : [];
    return new RpcClient({ chainId, urls, fetchImpl });
  }

  async request<T = unknown>(method: string, params: unknown[] = [], opts: RpcCallOptions = {}): Promise<T> {
    if (!this.urls.length) throw new RpcError(`No RPC endpoints configured for chain ${this.chainId}`);
    const attempts = Math.min(this.maxAttempts, this.urls.length);
    let lastError: Error | null = null;
    for (let i = 0; i < attempts; i++) {
      if (opts.signal?.aborted) throw opts.signal.reason ?? new Error('aborted');
      const index = (this.healthIndex + i) % this.urls.length;
      const url = this.urls[index]!;
      const t = timeoutSignal(opts.timeoutMs ?? this.timeoutMs, opts.signal);
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: this.idCounter++, method, params }),
          signal: t.signal,
        });
        if (!res.ok) {
          lastError = new RpcError(`RPC HTTP ${res.status} ${url}`, res.status);
          continue;
        }
        const json = await res.json() as any;
        if (json && typeof json === 'object' && 'error' in json && json.error) {
          const err = json.error as { code?: number; message?: string; data?: unknown };
          throw new RpcError(err.message || 'RPC error', err.code ?? null, err.data);
        }
        this.healthIndex = index;
        return json.result as T;
      } catch (err) {
        if (err instanceof RpcError && err.code !== null) throw err;
        if (opts.signal?.aborted) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
      } finally {
        t.cancel();
      }
    }
    throw lastError ?? new RpcError('All RPC endpoints failed');
  }

  getBalance(address: string, block: string = 'latest'): Promise<string> {
    return this.request<string>('eth_getBalance', [address, block]);
  }

  getTransactionCount(address: string, block: string = 'latest'): Promise<string> {
    return this.request<string>('eth_getTransactionCount', [address, block]);
  }

  getCode(address: string, block: string = 'latest'): Promise<string> {
    return this.request<string>('eth_getCode', [address, block]);
  }

  gasPrice(): Promise<string> {
    return this.request<string>('eth_gasPrice', []);
  }

  maxPriorityFeePerGas(): Promise<string> {
    return this.request<string>('eth_maxPriorityFeePerGas', []);
  }

  getBlock(tag: string = 'latest'): Promise<any> {
    return this.request<any>('eth_getBlockByNumber', [tag, false]);
  }

  estimateGas(tx: Record<string, unknown>, opts: RpcCallOptions = {}): Promise<string> {
    return this.request<string>('eth_estimateGas', [normalizeTxForRpc(tx)], opts);
  }

  call(tx: Record<string, unknown>, block: string = 'latest'): Promise<string> {
    return this.request<string>('eth_call', [normalizeTxForRpc(tx), block]);
  }

  sendRawTransaction(signedTx: string): Promise<string> {
    return this.request<string>('eth_sendRawTransaction', [signedTx], { noRetry: true });
  }

  getTransaction(txHash: string): Promise<any> {
    return this.request<any>('eth_getTransactionByHash', [txHash]);
  }

  getTransactionReceipt(txHash: string): Promise<any> {
    return this.request<any>('eth_getTransactionReceipt', [txHash]);
  }

  chainIdHex(): Promise<string> {
    return this.request<string>('eth_chainId', []);
  }
}
