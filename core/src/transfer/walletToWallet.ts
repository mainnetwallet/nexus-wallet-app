/**
 * Wallet → wallet (card 3): many keys, one destination, optional sweep.
 * Legacy allowed a fixed amount per key or "send all"; sweep requires the
 * caller to subtract gas, which the UI computes from the gas estimate.
 */
import { encodeCall, encodeAddress, encodeUint, ERC20 } from '../tokens/erc20.js';
import { toWei } from '../util/units.js';
import { assertAddress, type KeyRef, type TokenRef, type TransferStep } from './types.js';

export interface WalletToWalletInput {
  chainId: number;
  keys: KeyRef[];
  destination: string;
  amount: string;
  token?: TokenRef | null;
  /** When set, each step sends `balance - reserve` instead of `amount`. */
  sweep?: { balances: Record<string, bigint>; reserveWei?: bigint };
}

export function buildWalletToWallet(input: WalletToWalletInput): TransferStep[] {
  const destination = assertAddress(input.destination, 'destination');
  if (!input.keys.length) throw new Error('Select at least one wallet');
  const decimals = input.token?.decimals ?? 18;
  const fixed = input.sweep ? null : toWei(input.amount, decimals);
  if (!input.sweep && (fixed == null || fixed <= 0n)) throw new Error('Enter a valid amount');
  const token = input.token ? assertAddress(input.token.address, 'token') : null;
  const reserve = input.sweep?.reserveWei ?? 0n;

  const steps: TransferStep[] = [];
  for (const k of input.keys) {
    const from = assertAddress(k.address, 'key address');
    const amount = input.sweep
      ? (input.sweep.balances[from.toLowerCase()] ?? 0n) - reserve
      : fixed!;
    if (amount <= 0n) continue;
    if (token) {
      steps.push({
        chainId: input.chainId,
        from,
        to: token,
        value: 0n,
        data: encodeCall(ERC20.transfer, [encodeAddress(destination), encodeUint(amount)]),
        label: k.label ?? k.keyId,
      });
    } else {
      steps.push({ chainId: input.chainId, from, to: destination, value: amount, data: '0x', label: k.label ?? k.keyId });
    }
  }
  if (!steps.length) throw new Error('Nothing to send (balances below reserve)');
  return steps;
}
