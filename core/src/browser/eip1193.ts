/**
 * EIP-1193 provider for the dApp browser. The legacy page injected a provider
 * that exposed every group key; the rebuild requires an explicit origin
 * connection, exposes only the selected account, and routes every signature
 * through the native confirmation modal.
 */
export interface ProviderTxRequest {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
}

export interface ChainInfo {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}

export interface WalletBackend {
  getAccounts(): Promise<string[]>;
  getChainId(): Promise<number>;
  requestAccounts(origin: string): Promise<string[]>;
  signMessage(origin: string, address: string, message: string): Promise<string>;
  signTypedData(origin: string, address: string, data: unknown): Promise<string>;
  signTransaction(origin: string, address: string, tx: ProviderTxRequest): Promise<string>;
  sendTransaction(origin: string, address: string, tx: ProviderTxRequest): Promise<string>;
  switchChain(origin: string, chainId: number): Promise<void>;
  addChain(origin: string, chain: ChainInfo): Promise<void>;
  watchAsset?(origin: string, asset: { address: string; symbol?: string; decimals?: number }): Promise<boolean>;
  rpcRequest(method: string, params: unknown[]): Promise<unknown>;
}

export type ProviderEvent = 'accountsChanged' | 'chainChanged' | 'connect' | 'disconnect';
type Listener = (...args: unknown[]) => void;

export class ProviderRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ProviderRpcError';
    this.code = code;
    this.data = data;
  }
}

const UNSUPPORTED = 4200;
const DISCONNECTED = 4900;
const USER_REJECTED = 4001;
const INVALID_PARAMS = -32602;

export interface ProviderOptions {
  origin: string;
  /** Read-only methods allowed without an origin connection. */
  readOnlyMethods?: string[];
  /** Methods the browser may call; everything else is rejected. */
  allowedMethods?: string[];
  connected?: boolean;
}

const DEFAULT_ALLOWED = [
  'eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'net_version',
  'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_watchAsset',
  'personal_sign', 'eth_sign', 'eth_signTypedData_v4', 'eth_sendTransaction',
  'eth_signTransaction', 'eth_blockNumber', 'eth_getBalance', 'eth_call',
  'eth_estimateGas', 'eth_gasPrice', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getCode', 'eth_getLogs',
];

const READ_ONLY = [
  'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_getBalance', 'eth_call',
  'eth_estimateGas', 'eth_gasPrice', 'eth_getTransactionByHash', 'eth_getTransactionReceipt',
  'eth_getCode', 'eth_getLogs',
];

export class Eip1193Provider {
  readonly origin: string;
  private backend: WalletBackend;
  private connected: boolean;
  private readonly allowed: Set<string>;
  private readonly readOnly: Set<string>;
  private listeners = new Map<ProviderEvent, Set<Listener>>();

  constructor(backend: WalletBackend, opts: ProviderOptions) {
    this.backend = backend;
    this.origin = opts.origin;
    this.connected = opts.connected ?? false;
    this.allowed = new Set(opts.allowedMethods ?? DEFAULT_ALLOWED);
    this.readOnly = new Set(opts.readOnlyMethods ?? READ_ONLY);
  }

  isConnected(): boolean {
    return this.connected;
  }

  on(event: ProviderEvent, listener: Listener): void {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
  }

  removeListener(event: ProviderEvent, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: ProviderEvent, ...args: unknown[]): void {
    for (const l of this.listeners.get(event) ?? []) l(...args);
  }

  disconnect(): void {
    this.connected = false;
    this.emit('disconnect', new ProviderRpcError(DISCONNECTED, 'Disconnected'));
  }

  async request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown> {
    const method = args?.method;
    if (typeof method !== 'string') throw new ProviderRpcError(INVALID_PARAMS, 'Invalid request');
    if (!this.allowed.has(method)) throw new ProviderRpcError(UNSUPPORTED, `Method ${method} is not supported`);
    const params = Array.isArray(args.params) ? args.params : [];
    const connectionless = method === 'eth_requestAccounts' || method === 'eth_accounts' || this.readOnly.has(method);
    const needsConnection = !connectionless;
    if (needsConnection && !this.connected) throw new ProviderRpcError(DISCONNECTED, 'Origin is not connected');

    try {
      switch (method) {
        case 'eth_requestAccounts': {
          const accounts = await this.backend.requestAccounts(this.origin);
          if (!accounts.length) throw new ProviderRpcError(USER_REJECTED, 'User rejected the connection');
          this.connected = true;
          this.emit('connect', { chainId: await this.chainIdHex() });
          this.emit('accountsChanged', accounts);
          return accounts;
        }
        case 'eth_accounts':
          return this.connected ? await this.backend.getAccounts() : [];
        case 'eth_chainId':
          return await this.chainIdHex();
        case 'net_version':
          return String(await this.backend.getChainId());
        case 'wallet_switchEthereumChain': {
          const chainId = parseChainId((params[0] as { chainId?: string } | undefined)?.chainId);
          await this.backend.switchChain(this.origin, chainId);
          const hex = `0x${chainId.toString(16)}`;
          this.emit('chainChanged', hex);
          return null;
        }
        case 'wallet_addEthereumChain': {
          const chain = params[0] as ChainInfo | undefined;
          if (!chain || !chain.chainId) throw new ProviderRpcError(INVALID_PARAMS, 'Missing chain params');
          validateChain(chain);
          await this.backend.addChain(this.origin, chain);
          return null;
        }
        case 'wallet_watchAsset': {
          if (!this.backend.watchAsset) throw new ProviderRpcError(UNSUPPORTED, 'watchAsset is not supported');
          const p = params[0] as { options?: { address: string; symbol?: string; decimals?: number } } | undefined;
          if (!p?.options?.address) throw new ProviderRpcError(INVALID_PARAMS, 'Missing asset');
          return await this.backend.watchAsset(this.origin, p.options);
        }
        case 'personal_sign': {
          const [message, address] = params as [string, string];
          return await this.backend.signMessage(this.origin, requireAddress(address), normalizeMessage(message));
        }
        case 'eth_sign': {
          const [address, message] = params as [string, string];
          return this.backend.signMessage(this.origin, requireAddress(address), normalizeMessage(message));
        }
        case 'eth_signTypedData_v4': {
          const [address, data] = params as [string, unknown];
          return await this.backend.signTypedData(this.origin, requireAddress(address), normalizeTypedData(data));
        }
        case 'eth_sendTransaction': {
          const tx = validateTx(params[0] as ProviderTxRequest | undefined);
          const from = requireAddress(tx.from ?? '');
          return await this.backend.sendTransaction(this.origin, from, tx);
        }
        case 'eth_signTransaction': {
          const tx = validateTx(params[0] as ProviderTxRequest | undefined);
          const from = requireAddress(tx.from ?? '');
          return await this.backend.signTransaction(this.origin, from, tx);
        }
        default:
          return await this.backend.rpcRequest(method, params);
      }
    } catch (err) {
      if (err instanceof ProviderRpcError) throw err;
      if (err instanceof Error && /reject/i.test(err.message)) throw new ProviderRpcError(USER_REJECTED, err.message);
      throw new ProviderRpcError(-32603, err instanceof Error ? err.message.slice(0, 160) : 'Internal error');
    }
  }

  private async chainIdHex(): Promise<string> {
    return `0x${(await this.backend.getChainId()).toString(16)}`;
  }
}

export function parseChainId(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = value.startsWith('0x') ? parseInt(value, 16) : parseInt(value, 10);
    if (Number.isInteger(n) && n > 0) return n;
  }
  throw new ProviderRpcError(INVALID_PARAMS, 'Invalid chain id');
}

export function validateChain(chain: ChainInfo): void {
  if (!Array.isArray(chain.rpcUrls) || !chain.rpcUrls.every((u) => /^https:\/\//i.test(u))) {
    throw new ProviderRpcError(INVALID_PARAMS, 'RPC URLs must use https');
  }
  if (!chain.nativeCurrency || typeof chain.nativeCurrency.symbol !== 'string') {
    throw new ProviderRpcError(INVALID_PARAMS, 'Invalid native currency');
  }
  parseChainId(chain.chainId);
}

export function validateTx(tx: ProviderTxRequest | undefined): ProviderTxRequest {
  if (!tx || typeof tx !== 'object') throw new ProviderRpcError(INVALID_PARAMS, 'Missing transaction');
  if (tx.to && !/^0x[0-9a-fA-F]{40}$/.test(tx.to)) throw new ProviderRpcError(INVALID_PARAMS, 'Invalid recipient');
  if (tx.data && !/^0x[0-9a-fA-F]*$/.test(tx.data)) throw new ProviderRpcError(INVALID_PARAMS, 'Invalid calldata');
  const value = tx.value ? BigInt(tx.value) : 0n;
  if (value < 0n) throw new ProviderRpcError(INVALID_PARAMS, 'Negative value');
  return tx;
}

function requireAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? '')) throw new ProviderRpcError(INVALID_PARAMS, 'Invalid address');
  return address;
}

function normalizeMessage(message: string): string {
  if (typeof message !== 'string') throw new ProviderRpcError(INVALID_PARAMS, 'Invalid message');
  if (/^0x[0-9a-fA-F]*$/.test(message) && message.length % 2 === 0) {
    try {
      return new TextDecoder().decode(Uint8Array.from(message.slice(2).match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? []));
    } catch {
      return message;
    }
  }
  return message;
}

function normalizeTypedData(data: unknown): unknown {
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { throw new ProviderRpcError(INVALID_PARAMS, 'Invalid typed data JSON'); }
  }
  if (!data || typeof data !== 'object') throw new ProviderRpcError(INVALID_PARAMS, 'Invalid typed data');
  return data;
}

/** Injected script sends `{id, method, params}` via ReactNativeWebView.postMessage. */
export interface InjectedMessage {
  id: number;
  method: string;
  params?: unknown[];
}

export function parseInjectedMessage(raw: string): InjectedMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'number' && typeof parsed.method === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}
