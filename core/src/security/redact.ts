/**
 * Secret redaction. The legacy Console Log panel stored raw console output,
 * which could include private keys, phrases and API credentials. The rebuild
 * keeps the panel but every entry passes through {@link redact}.
 */
const PRIVATE_KEY_0X = /\b0x[0-9a-fA-F]{64}\b/g;
const HEX_64 = /\b[0-9a-fA-F]{64}\b/g;
const API_KEYISH = /\b(?:sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi;
const MNEMONIC = /(?:\b[a-z]{3,8}\b[ \t]+){11,23}\b[a-z]{3,8}\b/gi;
const ASSIGNED_SECRET =
  /((?:api[_-]?key|secret|passphrase|password|private[_-]?key|mnemonic|token)\s*[:=]\s*["']?)([^"'\s,}]{6,})/gi;

export function maskMiddle(value: string, keep = 3): string {
  if (!value) return '';
  if (value.length <= keep) return '…';
  return `${value.slice(0, keep)}…`;
}

export function maskPrivateKey(key: string): string {
  const k = key.trim();
  return k.length > 10 ? `${k.slice(0, 8)}••••••••${k.slice(-6)}` : maskMiddle(k);
}

export function redact(input: string): string {
  return input
    .replace(PRIVATE_KEY_0X, '0x[REDACTED_KEY]')
    .replace(HEX_64, '[REDACTED_HEX64]')
    .replace(API_KEYISH, '[REDACTED_API_KEY]')
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(MNEMONIC, '[REDACTED_MNEMONIC]')
    .replace(ASSIGNED_SECRET, (_m, prefix: string) => `${prefix}[REDACTED]`);
}

export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map(redactDeep) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|passphrase|mnemonic|private|apikey|api_key/i.test(k)) out[k] = '[REDACTED]';
      else out[k] = redactDeep(v);
    }
    return out as T;
  }
  return value;
}

export interface ConsoleEntry {
  t: number;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  msg: string;
}

/**
 * Ported console capture (index.html lines 6–41): 500-entry ring buffer,
 * enabled only by `nexus_console_log_enabled === 'on'`.
 */
export class ConsoleBuffer {
  readonly max = 500;
  enabled = false;
  entries: ConsoleEntry[] = [];

  push(level: ConsoleEntry['level'], args: unknown[]): void {
    if (!this.enabled) return;
    const msg = redact(args.map(stringify).join(' '));
    this.entries.push({ t: Date.now(), level, msg });
    if (this.entries.length > this.max) this.entries.shift();
  }

  clear(): void {
    this.entries = [];
  }
}

function stringify(a: unknown): string {
  if (a instanceof Error) return `${a.message}${a.stack ? `\n${a.stack}` : ''}`;
  if (typeof a === 'object' && a !== null) {
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  }
  return String(a);
}
