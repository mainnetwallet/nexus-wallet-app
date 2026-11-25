/**
 * Coinbase Paymaster / ERC-4337 sponsorship helpers. The URL (which embeds an
 * API key in legacy) is user-supplied and stored Keystore-wrapped by the UI;
 * it is never bundled or logged.
 */
import { fetchJson, type FetchLike } from '../http.js';

export interface PaymasterStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove?(key: string): void;
}

export const PAYMASTER_URL_KEY = 'nexus_paymaster_url';
export const PAYMASTER_ENABLED_KEY = 'nexus_paymaster_enabled';
export const SWAP_PAYMASTER_ENABLED_KEY = 'nexus_swap_paymaster_enabled';

export interface PaymasterConfig {
  url: string;
  enabled: boolean;
  swapEnabled: boolean;
}

export function loadPaymasterConfig(storage: PaymasterStorage): PaymasterConfig {
  return {
    url: storage.read(PAYMASTER_URL_KEY) ?? '',
    enabled: storage.read(PAYMASTER_ENABLED_KEY) === '1',
    swapEnabled: storage.read(SWAP_PAYMASTER_ENABLED_KEY) === '1',
  };
}

export function savePaymasterConfig(storage: PaymasterStorage, config: PaymasterConfig): void {
  storage.write(PAYMASTER_URL_KEY, config.url.trim());
  storage.write(PAYMASTER_ENABLED_KEY, config.enabled ? '1' : '0');
  storage.write(SWAP_PAYMASTER_ENABLED_KEY, config.swapEnabled ? '1' : '0');
}

/** Accepts only https URLs; legacy allowed any string ending in /rpc. */
export function validatePaymasterUrl(url: string): string | null {
  const v = url.trim();
  if (!v) return 'Paymaster URL is required';
  if (!/^https:\/\//i.test(v)) return 'Paymaster URL must use https';
  try {
    const parsed = new URL(v);
    if (!parsed.hostname.includes('.')) return 'Paymaster URL host looks invalid';
    return null;
  } catch {
    return 'Paymaster URL is invalid';
  }
}

export interface UserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
}

export interface SponsorOptions {
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** ERC-7677 `pm_sponsorUserOperation` request. */
export async function sponsorUserOperation(
  paymasterUrl: string,
  userOp: UserOperation,
  entryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  opts: SponsorOptions = {},
): Promise<{ paymasterAndData?: string; callGasLimit?: string; verificationGasLimit?: string; [k: string]: unknown }> {
  const error = validatePaymasterUrl(paymasterUrl);
  if (error) throw new Error(error);
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  return fetchJson(fetchImpl, paymasterUrl, {
    method: 'POST',
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'pm_sponsorUserOperation',
      params: [userOp, entryPoint],
    },
    timeoutMs: opts.timeoutMs ?? 12_000,
    signal: opts.signal,
  }).then((json: any) => {
    if (json?.error) throw new Error(String(json.error.message ?? 'Paymaster rejected the operation').slice(0, 160));
    return json?.result ?? json;
  });
}

/** Legacy verification/execution defaults seen in the 7702 UserOp builder. */
export function defaultUserOpGas(): Pick<UserOperation, 'verificationGasLimit' | 'callGasLimit' | 'preVerificationGas'> {
  return {
    verificationGasLimit: '0x' + (200_000).toString(16),
    callGasLimit: '0x' + (300_000).toString(16),
    preVerificationGas: '0x' + (50_000).toString(16),
  };
}
