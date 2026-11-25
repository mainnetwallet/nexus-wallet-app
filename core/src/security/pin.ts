/**
 * PIN / pattern verification.
 * Legacy (must stay readable for migration):
 *   PIN:  sha256(salt + ':' + pin) as lowercase hex; if no salt, sha256(pin).
 *   Pattern: sha256(indices.join('-')), e.g. "0-1-4-7".
 * New (security hardening, section 11):
 *   PBKDF2-SHA256, 600k iterations, 16-byte per-install salt,
 *   "nexus:pin:v2:<saltHex>:<hashHex>", constant-time compare, attempt backoff.
 */
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';

export const PIN_LENGTH = 6;
export const NEW_KDF = { iterations: 600_000, keyLength: 32, saltBytes: 16 } as const;

const enc = new TextEncoder();
const hex = (u8: Uint8Array) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

export function sha256Hex(input: string): string {
  return hex(sha256(enc.encode(input)));
}

export function generateSalt(): string {
  return hex(randomBytes(16));
}

/** Constant-time string comparison (length leak is acceptable for fixed-size hashes). */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function legacyPinHash(pin: string, salt?: string | null): string {
  return salt ? sha256Hex(`${salt}:${pin}`) : sha256Hex(pin);
}

export function legacyVerifyPin(pin: string, storedHash: string, salt?: string | null): boolean {
  if (!storedHash) return false;
  return constantTimeEqual(legacyPinHash(pin, salt), storedHash);
}

export function legacyPatternHash(path: number[]): string {
  return sha256Hex(path.join('-'));
}

export function legacyVerifyPattern(path: number[], storedHash: string): boolean {
  if (!storedHash) return false;
  return constantTimeEqual(legacyPatternHash(path), storedHash);
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function createPinHash(pin: string): Promise<string> {
  if (!isValidPin(pin)) throw new Error('PIN must be 6 digits');
  const salt = randomBytes(NEW_KDF.saltBytes);
  const key = await pbkdf2Async(sha256, enc.encode(pin), salt, {
    c: NEW_KDF.iterations,
    dkLen: NEW_KDF.keyLength,
  });
  return `nexus:pin:v2:${hex(salt)}:${hex(key)}`;
}

export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 5 || parts[0] !== 'nexus' || parts[1] !== 'pin' || parts[2] !== 'v2') {
    return false;
  }
  const salt = Uint8Array.from(parts[3]!.match(/../g) ?? [], (h) => parseInt(h, 16));
  const expected = parts[4]!;
  const key = await pbkdf2Async(sha256, enc.encode(pin), salt, {
    c: NEW_KDF.iterations,
    dkLen: NEW_KDF.keyLength,
  });
  return constantTimeEqual(hex(key), expected);
}

/**
 * Attempt limiter with exponential backoff. Legacy had none; this is an allowed
 * hardening deviation. State must be persisted by the caller so it survives restart.
 */
export class AttemptLimiter {
  private failures = 0;
  private lockedUntil = 0;

  constructor(
    private readonly maxFailures = 5,
    private readonly baseDelayMs = 15_000,
    private readonly maxDelayMs = 15 * 60_000,
  ) {}

  remainingMs(now = Date.now()): number {
    return Math.max(0, this.lockedUntil - now);
  }

  isLocked(now = Date.now()): boolean {
    return this.remainingMs(now) > 0;
  }

  recordFailure(now = Date.now()): number {
    this.failures += 1;
    if (this.failures >= this.maxFailures) {
      const over = this.failures - this.maxFailures;
      const delay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** over);
      this.lockedUntil = now + delay;
    }
    return this.remainingMs(now);
  }

  recordSuccess(): void {
    this.failures = 0;
    this.lockedUntil = 0;
  }

  export(): { failures: number; lockedUntil: number } {
    return { failures: this.failures, lockedUntil: this.lockedUntil };
  }

  static restore(state: { failures: number; lockedUntil: number } | null): AttemptLimiter {
    const l = new AttemptLimiter();
    if (state) {
      l.failures = state.failures;
      l.lockedUntil = state.lockedUntil;
    }
    return l;
  }
}
