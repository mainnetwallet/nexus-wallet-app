/**
 * Transfer Hub primitives. Legacy built these transactions in-page with ethers
 * (`batchTransferUI`, `multiKeyNativeUI`, `walletToWalletUI`, `selfTransferUI`,
 * `nftTransferUI`, `approvalManagerUI`, `withdrawUI`, `balanceCheckUI`).
 * The core builds unsigned steps; the UI signs/broadcasts with the selected key.
 */
export interface TransferStep {
  chainId: number;
  from: string;
  to: string;
  /** Native value in wei. Token transfers use 0. */
  value: bigint;
  /** Calldata; '0x' for native transfers. */
  data: string;
  label?: string;
}

export interface KeyRef {
  address: string;
  /** Opaque id used by the UI to look up the encrypted key; never a raw key. */
  keyId: string;
  label?: string;
}

export interface TokenRef {
  address: string;
  decimals: number;
  symbol?: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isEvmAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

export function assertAddress(value: string, label = 'address'): string {
  const v = value.trim();
  if (!isEvmAddress(v)) throw new Error(`Invalid ${label}: ${v.slice(0, 10)}…`);
  return v;
}

export function zeroStep(chainId: number, from: string, to: string): TransferStep {
  return { chainId, from, to, value: 0n, data: '0x' };
}
