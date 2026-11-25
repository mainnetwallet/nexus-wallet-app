/** Self transfer (card 4): each key sends an amount back to its own address. */
import { encodeCall, encodeAddress, encodeUint, ERC20 } from '../tokens/erc20.js';
import { toWei } from '../util/units.js';
import { assertAddress, type KeyRef, type TokenRef, type TransferStep } from './types.js';

export interface SelfTransferInput {
  chainId: number;
  keys: KeyRef[];
  amount: string;
  token?: TokenRef | null;
}

export function buildSelfTransfers(input: SelfTransferInput): TransferStep[] {
  if (!input.keys.length) throw new Error('Select at least one key');
  const decimals = input.token?.decimals ?? 18;
  const amountWei = toWei(input.amount, decimals);
  if (amountWei == null || amountWei <= 0n) throw new Error('Enter a valid amount');
  const token = input.token ? assertAddress(input.token.address, 'token') : null;
  return input.keys.map((k) => {
    const address = assertAddress(k.address, 'key address');
    if (token) {
      return {
        chainId: input.chainId,
        from: address,
        to: token,
        value: 0n,
        data: encodeCall(ERC20.transfer, [encodeAddress(address), encodeUint(amountWei)]),
        label: k.label ?? k.keyId,
      };
    }
    return { chainId: input.chainId, from: address, to: address, value: amountWei, data: '0x', label: k.label ?? k.keyId };
  });
}
