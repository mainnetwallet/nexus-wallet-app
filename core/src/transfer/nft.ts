/**
 * NFT transfer (card 5): ERC-721 and ERC-1155.
 * Distribute = one sender → many recipients; collect = many senders → one
 * recipient (legacy `nftTransferUI`).
 */
import { encodeAddress, encodeCall, encodeUint } from '../tokens/erc20.js';
import { assertAddress, type KeyRef, type TransferStep } from './types.js';

export const ERC721 = {
  transferFrom: '0x23b872dd',
  safeTransferFrom: '0x42842e0e',
} as const;

export const ERC1155 = {
  safeTransferFrom: '0xf242432a',
} as const;

export type NftStandard = 'erc721' | 'erc1155';

function amountWord(amount: bigint): string {
  return encodeUint(amount);
}

export interface NftTransferInput {
  chainId: number;
  contract: string;
  standard: NftStandard;
  tokenId: string;
  from: string;
  to: string;
  amount?: string;
  safe?: boolean;
}

export function buildNftTransfer(input: NftTransferInput): TransferStep {
  const contract = assertAddress(input.contract, 'contract');
  const from = assertAddress(input.from, 'sender');
  const to = assertAddress(input.to, 'recipient');
  let tokenId: bigint;
  try {
    tokenId = BigInt(input.tokenId);
  } catch {
    throw new Error('Token id must be an integer');
  }
  if (tokenId < 0n) throw new Error('Token id must be positive');
  const data = input.standard === 'erc721'
    ? encodeCall(input.safe === false ? ERC721.transferFrom : ERC721.safeTransferFrom, [
        encodeAddress(from),
        encodeAddress(to),
        encodeUint(tokenId),
      ])
    : encodeCall(ERC1155.safeTransferFrom, [
        encodeAddress(from),
        encodeAddress(to),
        encodeUint(tokenId),
        amountWord(BigInt(input.amount ?? '1')),
        // dynamic `bytes data` offset + length 0 (legacy passed '0x')
        encodeUint(160),
        encodeUint(0),
      ]);
  return { chainId: input.chainId, from, to: contract, value: 0n, data };
}

export interface NftDistributeInput {
  chainId: number;
  contract: string;
  standard: NftStandard;
  tokenId: string;
  sender: string;
  recipients: string[];
  amountEach?: string;
}

export function buildNftDistribute(input: NftDistributeInput): TransferStep[] {
  if (!input.recipients.length) throw new Error('Add at least one recipient');
  return input.recipients.map((to) => buildNftTransfer({
    chainId: input.chainId,
    contract: input.contract,
    standard: input.standard,
    tokenId: input.tokenId,
    from: input.sender,
    to,
    amount: input.amountEach,
  }));
}

export interface NftCollectInput {
  chainId: number;
  contract: string;
  standard: NftStandard;
  tokenId: string;
  keys: KeyRef[];
  recipient: string;
  amountEach?: string;
}

export function buildNftCollect(input: NftCollectInput): TransferStep[] {
  const recipient = assertAddress(input.recipient, 'recipient');
  if (!input.keys.length) throw new Error('Select at least one key');
  return input.keys.map((k) => buildNftTransfer({
    chainId: input.chainId,
    contract: input.contract,
    standard: input.standard,
    tokenId: input.tokenId,
    from: k.address,
    to: recipient,
    amount: input.amountEach,
  }));
}
