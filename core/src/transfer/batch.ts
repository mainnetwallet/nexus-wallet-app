/**
 * Batch transfer (Transfer Hub card 1). Native mode sends value directly;
 * token mode calls `transfer(to, amount)` on the token contract from the
 * selected sender. Legacy also supported a deployed batch contract; the core
 * emits one step per recipient so the UI can batch or send sequentially.
 */
import { encodeCall, encodeAddress, encodeUint, ERC20 } from '../tokens/erc20.js';
import { toWei } from '../util/units.js';
import { parseRecipients } from './parse.js';
import { assertAddress, type TokenRef, type TransferStep } from './types.js';

export interface BatchNativeInput {
  chainId: number;
  sender: string;
  recipientsText: string;
}

export interface BatchTokenInput extends BatchNativeInput {
  token: TokenRef;
}

export function buildBatchNative(input: BatchNativeInput): TransferStep[] {
  const sender = assertAddress(input.sender, 'sender');
  const { recipients, invalid } = parseRecipients(input.recipientsText, { requireAmount: true });
  if (invalid.length) throw new Error(`Invalid recipient line ${invalid[0]!.line}: ${invalid[0]!.reason}`);
  if (!recipients.length) throw new Error('No recipients');
  return recipients.map((r) => {
    const value = toWei(r.amount ?? '0', 18);
    if (value == null || value <= 0n) throw new Error(`Invalid amount for ${r.address.slice(0, 10)}…`);
    return { chainId: input.chainId, from: sender, to: r.address, value, data: '0x' };
  });
}

export function buildBatchToken(input: BatchTokenInput): TransferStep[] {
  const sender = assertAddress(input.sender, 'sender');
  const token = assertAddress(input.token.address, 'token');
  const { recipients, invalid } = parseRecipients(input.recipientsText, { requireAmount: true });
  if (invalid.length) throw new Error(`Invalid recipient line ${invalid[0]!.line}: ${invalid[0]!.reason}`);
  if (!recipients.length) throw new Error('No recipients');
  return recipients.map((r) => {
    const amount = toWei(r.amount ?? '0', input.token.decimals);
    if (amount == null || amount <= 0n) throw new Error(`Invalid amount for ${r.address.slice(0, 10)}…`);
    const data = encodeCall(ERC20.transfer, [encodeAddress(r.address), encodeUint(amount)]);
    return { chainId: input.chainId, from: sender, to: token, value: 0n, data };
  });
}

export function batchTotals(steps: TransferStep[], decimals = 18): { raw: bigint; formatted: string } {
  const raw = steps.reduce((acc, s) => acc + s.value, 0n);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = (raw % divisor).toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
  return { raw, formatted: frac ? `${whole}.${frac}` : whole.toString() };
}
