/**
 * Recipient parsing shared by batch transfer, airdrop and NFT distribute.
 * Legacy accepted one recipient per line, optionally "address,amount" or
 * "address amount"; blank lines and `#` comments are ignored.
 */
import { assertAddress } from './types.js';

export interface ParsedRecipient {
  address: string;
  amount?: string;
}

export function parseRecipients(text: string, opts: { requireAmount?: boolean } = {}): {
  recipients: ParsedRecipient[];
  invalid: { line: number; value: string; reason: string }[];
} {
  const recipients: ParsedRecipient[] = [];
  const invalid: { line: number; value: string; reason: string }[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/[,\s]+/).filter(Boolean);
    const [address, amount, ...rest] = parts;
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      invalid.push({ line: i + 1, value: line.slice(0, 42), reason: 'invalid address' });
      return;
    }
    if (rest.length > 0) {
      invalid.push({ line: i + 1, value: line.slice(0, 42), reason: 'too many fields' });
      return;
    }
    if (opts.requireAmount && !amount) {
      invalid.push({ line: i + 1, value: line.slice(0, 42), reason: 'amount missing' });
      return;
    }
    if (amount !== undefined) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n < 0) {
        invalid.push({ line: i + 1, value: line.slice(0, 42), reason: 'invalid amount' });
        return;
      }
    }
    recipients.push({ address: assertAddress(address), amount });
  });
  return { recipients, invalid };
}

/** Legacy deduped identical addresses only in wallet→wallet collection. */
export function dedupeByAddress<T extends { address: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
