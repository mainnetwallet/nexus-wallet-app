/**
 * Approval manager (card 6). Legacy listed allowances found in local history
 * and offered revoke. Without an indexer we can verify a known allowance and
 * build revoke calls; listing historic approvals needs logs and is marked
 * PARTIAL in PARITY_CHECKLIST.
 */
import { encodeAddress, encodeCall, encodeUint, ERC20 } from '../tokens/erc20.js';
import type { RpcClient } from '../rpc/client.js';
import { decodeUint } from '../tokens/erc20.js';
import { assertAddress, type TransferStep } from './types.js';

export const ERC721_APPROVAL = {
  setApprovalForAll: '0xa22cb465',
} as const;

export async function readErc20Allowance(
  rpc: RpcClient,
  token: string,
  owner: string,
  spender: string,
): Promise<bigint> {
  const result = await rpc.call({
    to: assertAddress(token, 'token'),
    data: encodeCall(ERC20.allowance, [encodeAddress(owner), encodeAddress(spender)]),
  });
  return decodeUint(result);
}

export function buildRevokeErc20(input: {
  chainId: number;
  owner: string;
  token: string;
  spender: string;
}): TransferStep {
  return {
    chainId: input.chainId,
    from: assertAddress(input.owner, 'owner'),
    to: assertAddress(input.token, 'token'),
    value: 0n,
    data: encodeCall(ERC20.approve, [encodeAddress(input.spender), encodeUint(0)]),
  };
}

export function buildRevokeErc721(input: {
  chainId: number;
  owner: string;
  contract: string;
  operator: string;
}): TransferStep {
  return {
    chainId: input.chainId,
    from: assertAddress(input.owner, 'owner'),
    to: assertAddress(input.contract, 'contract'),
    value: 0n,
    data: encodeCall(ERC721_APPROVAL.setApprovalForAll, [encodeAddress(input.operator), encodeUint(0)]),
  };
}

export interface ApprovalRecord {
  token: string;
  spender: string;
  allowance: string;
  standard: 'erc20' | 'erc721';
  unlimited: boolean;
}

/** Marks `2^256-1` and values above 2^255 as unlimited, like legacy UI. */
export function classifyAllowance(raw: bigint): { unlimited: boolean; label: string } {
  const unlimited = raw >= 2n ** 255n;
  return { unlimited, label: unlimited ? 'Unlimited' : raw.toString() };
}
