/**
 * Multi-key native / token transfer (card 2). Each selected key sends the same
 * amount to the configured recipient; steps are returned in selection order so
 * the UI can show per-key progress (legacy `multiKeyNativeUI` log console).
 */
import { encodeCall, encodeAddress, encodeUint, ERC20 } from '../tokens/erc20.js';
import { toWei } from '../util/units.js';
import { assertAddress, type KeyRef, type TokenRef, type TransferStep } from './types.js';

export interface MultiKeyInput {
  chainId: number;
  keys: KeyRef[];
  recipient: string;
  amount: string;
  token?: TokenRef | null;
}

export function buildMultiKeyTransfers(input: MultiKeyInput): TransferStep[] {
  const recipient = assertAddress(input.recipient, 'recipient');
  if (!input.keys.length) throw new Error('Select at least one key');
  const decimals = input.token?.decimals ?? 18;
  const amountWei = toWei(input.amount, decimals);
  if (amountWei == null || amountWei <= 0n) throw new Error('Enter a valid amount');
  const token = input.token ? assertAddress(input.token.address, 'token') : null;
  return input.keys.map((k) => {
    const from = assertAddress(k.address, 'key address');
    if (token) {
      return {
        chainId: input.chainId,
        from,
        to: token,
        value: 0n,
        data: encodeCall(ERC20.transfer, [encodeAddress(recipient), encodeUint(amountWei)]),
        label: k.label ?? k.keyId,
      };
    }
    return {
      chainId: input.chainId,
      from,
      to: recipient,
      value: amountWei,
      data: '0x',
      label: k.label ?? k.keyId,
    };
  });
}

export interface MultiKeySummary {
  count: number;
  perKey: bigint;
  total: bigint;
  insufficient: string[];
}

export function summarizeMultiKey(steps: TransferStep[], balances: Record<string, bigint>): MultiKeySummary {
  const perKey = steps.length ? steps[0]!.value : 0n;
  const total = perKey * BigInt(steps.length);
  const insufficient = steps
    .filter((s) => (balances[s.from.toLowerCase()] ?? 0n) < s.value)
    .map((s) => s.from);
  return { count: steps.length, perKey, total, insufficient };
}
