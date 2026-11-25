/**
 * Key parsing / derivation, ported from index.html ~26620 (`_stripKeyFormat`,
 * `isValidPrivateKey`, `normalizeKey`, `maskKey`, `getRealAddress`) and the
 * mnemonic importer (~25041: base path default m/44'/60'/0'/0, indices 0..999).
 */
import { HDNodeWallet, Wallet, getAddress } from 'ethers';

export function stripKeyFormat(key: string): string {
  return key.trim().replace(/^[\s"'`[(\]]+|[\s"'`,;)\]`]+$/g, '').trim();
}

export function isValidPrivateKey(raw: string): boolean {
  const key = stripKeyFormat(raw);
  if (!key) return false;
  if (key.startsWith('#')) return false;
  if (key.toLowerCase() === 'key') return false;
  if (key.toLowerCase().includes('placeholder')) return false;
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) return true;
  if (key.startsWith('0x') && key.length === 66 && /^0x[0-9a-fA-F]+$/i.test(key)) return true;
  return false;
}

export function normalizeKey(raw: string): string {
  const key = stripKeyFormat(raw);
  if (key.length === 64 && /^[0-9a-fA-F]+$/i.test(key)) return `0x${key.toLowerCase()}`;
  if ((key.startsWith('0x') || key.startsWith('0X')) && key.length === 66) {
    return `0x${key.slice(2).toLowerCase()}`;
  }
  return key.toLowerCase();
}

/** Legacy masked display: 0x123456 + 40 dots + last 6. */
export function maskKey(key: string): string {
  const k = normalizeKey(key);
  return `${k.slice(0, 8)}${'•'.repeat(40)}${k.slice(-6)}`;
}

export function shortAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function addressFromKey(key: string): string | null {
  try {
    return new Wallet(normalizeKey(key)).address;
  } catch {
    return null;
  }
}

export function checksumAddress(address: string): string | null {
  try {
    return getAddress(address);
  } catch {
    return null;
  }
}

export interface DerivedWallet {
  privateKey: string;
  address: string;
  phraseIndex: number;
  derivationIndex: number;
  path: string;
}

export interface DeriveOptions {
  basePath?: string;
  fromIndex?: number;
  toIndex?: number;
  maxIndex?: number;
}

/**
 * Ported from `_wgOnMnemInputAsync`: for each valid phrase, derive
 * `${basePath}/${idx}` for idx in [from, to], dedupe private keys.
 * Defaults: basePath m/44'/60'/0'/0, from 0, to 0, cap 999.
 */
export function deriveFromPhrases(
  phrases: string[],
  options: DeriveOptions = {},
): DerivedWallet[] {
  const basePath = options.basePath ?? "m/44'/60'/0'/0";
  const from = clamp(options.fromIndex ?? 0, 0, options.maxIndex ?? 999);
  const to = clamp(options.toIndex ?? from, from, options.maxIndex ?? 999);
  const out: DerivedWallet[] = [];
  const seen = new Set<string>();
  for (let p = 0; p < phrases.length; p++) {
    const phrase = phrases[p]!.trim();
    for (let i = from; i <= to; i++) {
      const path = `${basePath}/${i}`;
      try {
        const hd = HDNodeWallet.fromPhrase(phrase, undefined, path);
        const pk = hd.privateKey.toLowerCase();
        if (seen.has(pk)) continue;
        seen.add(pk);
        out.push({ privateKey: pk, address: hd.address, phraseIndex: p, derivationIndex: i, path });
      } catch {
        /* legacy silently skips invalid derivations */
      }
    }
  }
  return out;
}

export function isMnemonicPhrase(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (![12, 15, 18, 24].includes(words.length)) return false;
  try {
    HDNodeWallet.fromPhrase(words.join(' '));
    return true;
  } catch {
    return false;
  }
}

export function splitKeyInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
