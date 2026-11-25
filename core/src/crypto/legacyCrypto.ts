/**
 * Legacy NexusCrypto v4 format (ported verbatim from index.html ~24203).
 *
 * Storage format: "ncx4:<b64(iv12)>.<b64(ciphertext)>"
 * Key: PBKDF2-SHA256(secret, "nexus-wallet-salt-v4", 200_000) -> AES-256-GCM
 * Legacy ncx3/nsx2 use an FNV-1a-derived XOR pad; ncx1 is unrecoverable.
 *
 * The legacy secret is localStorage `nexus_lock_master_secret`
 * ("nexus:master:<32 hex>:<32 hex>"), which is plaintext in the WebView store.
 * Migration must keep reading this exact format; new secrets use {@link KeystoreSecret}.
 */
import { gcm } from '@noble/ciphers/aes';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { encodeBase64, decodeBase64 } from 'ethers';

export const LEGACY_KDF = {
  kdf: 'PBKDF2-SHA256',
  iterations: 200_000,
  salt: 'nexus-wallet-salt-v4',
  keyLength: 32,
} as const;

export const NCX_PREFIX = 'ncx4:';
export const NCX_LEGACY_PREFIXES = ['ncx3:', 'nsx2:', 'ncx1:'] as const;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(u8: Uint8Array): string {
  return encodeBase64(u8);
}

function unb64(s: string): Uint8Array {
  return decodeBase64(s);
}

export function isNcx4(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(NCX_PREFIX);
}

export function isLegacyCiphertext(value: unknown): boolean {
  return typeof value === 'string' && NCX_LEGACY_PREFIXES.some((p) => value.startsWith(p));
}

/** Derives the legacy AES key from the master secret. Pure; does not cache. */
export async function deriveLegacyKey(secret: string): Promise<Uint8Array> {
  return pbkdf2Async(sha256, enc.encode(secret), enc.encode(LEGACY_KDF.salt), {
    c: LEGACY_KDF.iterations,
    dkLen: LEGACY_KDF.keyLength,
  });
}

const toHex = (u8: Uint8Array): string =>
  Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

export function generateLegacyMasterSecret(): string {
  return `nexus:master:${toHex(randomBytes(16))}:${toHex(randomBytes(16))}`;
}

/** AES-256-GCM encrypt -> ncx4:<iv>.<ct>. Mirrors legacy `encrypt()` semantics. */
export async function encryptNcx4(plain: string, secret: string): Promise<string> {
  if (!plain || typeof plain !== 'string') return plain;
  if (plain.startsWith(NCX_PREFIX)) return plain;
  const iv = randomBytes(12);
  const key = await deriveLegacyKey(secret);
  try {
    const ct = gcm(key, iv).encrypt(enc.encode(plain));
    return `${NCX_PREFIX}${b64(iv)}.${b64(ct)}`;
  } catch {
    // Legacy swallows encrypt errors and returns plaintext. Keep the same
    // observable behaviour so characterisation tests match.
    return plain;
  }
}

/** AES-256-GCM decrypt "ncx4:...". Returns null on any failure, like legacy. */
export async function decryptNcx4(stored: string, secret: string): Promise<string | null> {
  if (!stored || typeof stored !== 'string') return null;
  const parts = stored.slice(NCX_PREFIX.length).split('.');
  if (parts.length !== 2) return null;
  try {
    const iv = unb64(parts[0] as string);
    const ct = unb64(parts[1] as string);
    const key = await deriveLegacyKey(secret);
    return dec.decode(gcm(key, iv).decrypt(ct));
  } catch {
    return null;
  }
}

/** XOR pad from FNV-1a(secret), 64 bytes. Ported from `_xorDecodeWith`. */
export function xorPad(secret: string): Uint8Array {
  let h = 0x811c9dc5;
  for (let i = 0; i < secret.length; i++) {
    h ^= secret.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const pad = new Uint8Array(64);
  let v = h;
  for (let j = 0; j < 64; j++) {
    v ^= (v << 13) >>> 0;
    v ^= v >>> 7;
    v ^= (v << 17) >>> 0;
    v = v >>> 0;
    pad[j] = v & 0xff;
  }
  return pad;
}

/** Decodes ncx3/nsx2 base64 XOR payload. ncx1 is not recoverable (returns null). */
export function decryptLegacyXor(stored: string, secret: string): string | null {
  const prefix = stored.startsWith('ncx3:') || stored.startsWith('nsx2:') ? 5 : 0;
  try {
    const raw = unb64(stored.slice(prefix));
    const pad = xorPad(secret);
    const out = new Uint8Array(raw.length);
    for (let k = 0; k < raw.length; k++) out[k] = raw[k]! ^ pad[k % pad.length]!;
    return dec.decode(out);
  } catch {
    return null;
  }
}

/**
 * Full legacy read path: ncx4 -> AES-GCM, ncx3 -> XOR, nsx2/ncx1 -> null,
 * otherwise pass through as plaintext. Same order and semantics as `_migrateLegacy`.
 */
export async function decryptLegacyValue(stored: string, secret: string): Promise<string | null> {
  if (!stored || typeof stored !== 'string') return null;
  if (isNcx4(stored)) return decryptNcx4(stored, secret);
  if (stored.startsWith('ncx3:')) return decryptLegacyXor(stored, secret);
  if (stored.startsWith('nsx2:')) return null;
  if (stored.startsWith('ncx1:')) return null;
  return stored;
}

export interface LegacyWalletGroup {
  id: string;
  name: string;
  keys: string[];
  mnemonics?: string[];
  createdAt?: number;
  source?: string;
  _decryptFailed?: boolean;
}

export interface DecryptGroupsResult {
  groups: LegacyWalletGroup[];
  failed: boolean;
  partial: boolean;
}

/**
 * Ported from `NexusCrypto.decryptGroups`: per-key decrypt, keep what decrypts,
 * flag a group when every key failed (secret not set / wrong secret).
 */
export async function decryptLegacyGroups(
  groups: unknown,
  secret: string,
  options: { maxGroups?: number; maxKeysPerGroup?: number } = {},
): Promise<DecryptGroupsResult> {
  const maxGroups = options.maxGroups ?? 500;
  const maxKeys = options.maxKeysPerGroup ?? 10_000;
  if (!Array.isArray(groups)) return { groups: [], failed: false, partial: false };
  if (groups.length > maxGroups) throw new Error('TOO_MANY_GROUPS');

  const out: LegacyWalletGroup[] = [];
  let failed = false;
  let partial = false;
  for (const raw of groups) {
    const g = raw as LegacyWalletGroup;
    if (!g || !Array.isArray(g.keys)) {
      out.push(g);
      continue;
    }
    if (g.keys.length > maxKeys) throw new Error('TOO_MANY_KEYS');
    const plain: string[] = [];
    let anyFail = false;
    for (const k of g.keys) {
      const p = await decryptLegacyValue(String(k), secret);
      if (p) plain.push(p);
      else anyFail = true;
    }
    if (anyFail) partial = true;
    if (anyFail && plain.length === 0) failed = true;
    out.push({ ...g, keys: plain, _decryptFailed: anyFail && plain.length === 0 });
  }
  return { groups: out, failed, partial };
}

/** Re-encrypts plaintext keys as ncx4. Used only by migration fixtures/tests. */
export async function encryptLegacyGroups(
  groups: LegacyWalletGroup[],
  secret: string,
): Promise<LegacyWalletGroup[]> {
  const out: LegacyWalletGroup[] = [];
  for (const g of groups) {
    if (!g || !Array.isArray(g.keys)) {
      out.push(g);
      continue;
    }
    const keys: string[] = [];
    for (const k of g.keys) keys.push(await encryptNcx4(k, secret));
    out.push({ ...g, keys });
  }
  return out;
}
