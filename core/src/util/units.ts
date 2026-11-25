import { formatUnits, parseUnits } from 'ethers';

export function toWei(amount: string, decimals: number): bigint | null {
  try {
    const trimmed = amount.trim();
    if (!trimmed || Number(trimmed) <= 0) return null;
    return parseUnits(trimmed, decimals);
  } catch {
    return null;
  }
}

export function fromWei(amountWei: string | bigint, decimals: number): string {
  try {
    return formatUnits(BigInt(amountWei), decimals);
  } catch {
    return '0';
  }
}

export function weiToNumber(amountWei: string | bigint, decimals: number): number {
  return Number(fromWei(amountWei, decimals));
}

/** Human amount with up to 6 significant decimals, trailing zeros stripped. */
export function formatAmount(amount: string | number, maxDecimals = 6): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '0';
  const fixed = n.toFixed(maxDecimals);
  const [int, frac] = fixed.split('.');
  if (!frac) return int ?? '0';
  const trimmed = frac.replace(/0+$/, '');
  return trimmed ? `${int}.${trimmed}` : (int ?? '0');
}

export function formatUsd(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (opts.compact && abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (opts.compact && abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (abs > 0 && abs < 0.0001) return '<$0.0001';
  if (abs < 0.01) return `$${value.toFixed(4)}`;
  if (abs < 1) return `$${value.toFixed(3)}`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function decimalToHex(value: string | bigint): string {
  const v = BigInt(value);
  return v === 0n ? '0x0' : `0x${v.toString(16)}`;
}

export function fmtGasUsd(usd: number | null): string {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return '—';
  return formatUsd(usd);
}

export function pow10(decimals: number): bigint {
  return 10n ** BigInt(Math.max(0, Math.min(255, Math.trunc(decimals))));
}

/** Legacy DODO math: floor(resAmount * 10^decimals) via float. */
export function floatToWeiFloor(amount: number, decimals: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  return BigInt(Math.floor(amount * 10 ** decimals)).toString();
}

export function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function applySlippageMin(amountWei: bigint, slippagePct: number): bigint {
  const bps = BigInt(Math.round(Math.max(0, slippagePct) * 100));
  return (amountWei * (10_000n - bps)) / 10_000n;
}
