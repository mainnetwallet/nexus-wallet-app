/**
 * Withdraw manager (card 7): withdraw native/token balances from many keys to
 * one destination. Fixed amount or equal split of a total; sweep uses balances
 * minus a gas reserve.
 */
import { encodeCall, encodeAddress, encodeUint, ERC20 } from '../tokens/erc20.js';
import { toWei } from '../util/units.js';
import { assertAddress, type KeyRef, type TokenRef, type TransferStep } from './types.js';

export interface WithdrawInput {
  chainId: number;
  keys: KeyRef[];
  destination: string;
  mode: 'fixed' | 'split' | 'sweep';
  amount?: string;
  token?: TokenRef | null;
  balances?: Record<string, bigint>;
  reserveWei?: bigint;
}

export function buildWithdrawals(input: WithdrawInput): TransferStep[] {
  const destination = assertAddress(input.destination, 'destination');
  if (!input.keys.length) throw new Error('Select at least one key');
  const decimals = input.token?.decimals ?? 18;
  const token = input.token ? assertAddress(input.token.address, 'token') : null;
  let fixed: bigint | null = null;
  let split: bigint | null = null;
  if (input.mode === 'fixed') {
    fixed = toWei(input.amount ?? '', decimals);
    if (fixed == null || fixed <= 0n) throw new Error('Enter a valid amount');
  } else if (input.mode === 'split') {
    const total = toWei(input.amount ?? '', decimals);
    if (total == null || total <= 0n) throw new Error('Enter a valid total');
    split = total / BigInt(input.keys.length);
    if (split <= 0n) throw new Error('Total too small to split');
  }

  const steps: TransferStep[] = [];
  for (const k of input.keys) {
    const from = assertAddress(k.address, 'key address');
    let amount: bigint | null = fixed ?? split;
    if (input.mode === 'sweep') {
      const bal = input.balances?.[from.toLowerCase()] ?? 0n;
      amount = bal - (token ? 0n : (input.reserveWei ?? 0n));
    }
    if (amount == null || amount <= 0n) continue;
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
  if (!steps.length) throw new Error('Nothing to withdraw');
  return steps;
}

export function splitRemainder(total: bigint, count: number): { perKey: bigint; remainder: bigint } {
  if (count <= 0) return { perKey: 0n, remainder: total };
  const perKey = total / BigInt(count);
  return { perKey, remainder: total - perKey * BigInt(count) };
}

/** Utility used by the UI to display the split preview with token decimals. */
export function formatWithdrawSplit(total: string, count: number, decimals: number): string {
  const raw = toWei(total, decimals);
  if (raw == null) return '0';
  const { perKey } = splitRemainder(raw, count);
  const divisor = 10n ** BigInt(decimals);
  return `${perKey / divisor}.${(perKey % divisor).toString().padStart(decimals, '0').slice(0, 6)}`;
}
