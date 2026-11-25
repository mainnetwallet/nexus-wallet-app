/**
 * Token list store — port of `loadSavedTokens` / `saveTokenList` / `addToken`
 * (index.html 28813–28975, 36588–36627).
 *
 * Per-wallet key: `nexus_custom_tokens_<group>` (group from
 * `nexus_hw_group_id_v2`, else `nexus_active_group`), falling back to
 * `nexus_custom_tokens`. Removed defaults are tracked in `<key>_removed_defaults`.
 *
 * Security change vs legacy: none of this stores secret key material. The
 * balance cache (see balances.ts) is keyed by wallet address, not private key.
 */
import { DEFAULT_TOKENS, REMOVED_TOKEN_IDS, tokenChainId, type TokenDef } from './defaults.js';
import type { PriceToken } from '../prices/service.js';

export interface Token {
  id: string;
  chainId: number;
  name: string;
  sub: string;
  icon: string;
  color: string;
  badge: string;
  contract: string;
  decimals: number;
  cgId?: string | null;
  cbPair: string;
  isDefault: boolean;
  isNative?: boolean;
  isCustomContract?: boolean;
  logoURI?: string | null;
}

export interface TokenStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove?(key: string): void;
}

export const TOKEN_KEY_GLOBAL = 'nexus_custom_tokens';

export function tokenStorageKey(groupId?: string | null): string {
  return groupId ? `${TOKEN_KEY_GLOBAL}_${groupId}` : TOKEN_KEY_GLOBAL;
}

function normalize(t: TokenDef | (Partial<Token> & { id: string; chainId?: number })): Token {
  const chainId = tokenChainId(t);
  return {
    ...t,
    chainId,
    name: t.name ?? t.sub ?? t.id,
    sub: t.sub ?? (t.name ?? t.id).toUpperCase(),
    icon: t.icon ?? (t.sub ?? '?').slice(0, 1),
    color: t.color ?? '#6366f1',
    badge: t.badge ?? t.color ?? '#6366f1',
    contract: t.contract ?? '',
    decimals: t.decimals ?? 18,
    cgId: t.cgId ?? null,
    cbPair: t.cbPair ?? `${(t.sub ?? '').toUpperCase()}-USD`,
    isDefault: t.isDefault ?? false,
  };
}

export class TokenStore {
  private readonly storage: TokenStorage;
  private readonly groupId: string | null;

  constructor(storage: TokenStorage, groupId?: string | null) {
    this.storage = storage;
    this.groupId = groupId ?? null;
  }

  get key(): string {
    return tokenStorageKey(this.groupId);
  }

  load(): Token[] {
    const storageKey = this.key;
    const raw = this.storage.read(storageKey);
    if (!raw) {
      const seeded = DEFAULT_TOKENS.map((t) => normalize(t));
      this.write(seeded);
      return seeded;
    }
    try {
      let saved = (JSON.parse(raw) as Token[]).filter((t) => !REMOVED_TOKEN_IDS.has(t.id));
      saved = saved.map((t) => {
        const def = DEFAULT_TOKENS.find((d) => d.id === t.id);
        if (def) return { ...t, name: def.name, isNative: def.isNative };
        return t;
      });

      const savedIds = new Set(saved.map((t) => t.id));
      const removedDefaults = this.removedDefaultIds();
      const missing = DEFAULT_TOKENS.filter((t) => !savedIds.has(t.id) && !removedDefaults.has(t.id));
      if (missing.length) {
        const merged = [...saved];
        for (const t of missing) {
          const idx = merged.findIndex((s) => tokenChainId(s) === tokenChainId(t));
          if (idx !== -1) merged.splice(idx, 0, normalize(t));
          else merged.push(normalize(t));
        }
        this.write(merged);
        return merged;
      }
      this.write(saved);
      return saved;
    } catch {
      return DEFAULT_TOKENS.map((t) => normalize(t));
    }
  }

  save(tokens: Token[]): void {
    this.write(tokens);
  }

  private write(tokens: Token[]): void {
    try {
      this.storage.write(this.key, JSON.stringify(tokens));
    } catch {
      /* quota — legacy swallows */
    }
  }

  private removedDefaultIds(): Set<string> {
    try {
      const raw = this.storage.read(`${this.key}_removed_defaults`);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  }

  /**
   * Legacy duplicate rule: same chain AND (same id, same cgId, or same contract).
   * Same token on another chain is allowed.
   */
  has(token: Pick<Token, 'id' | 'chainId' | 'cgId' | 'contract'>): boolean {
    const chainId = tokenChainId(token);
    return this.load().some((t) => {
      if (tokenChainId(t) !== chainId) return false;
      if (t.id === token.id) return true;
      if (t.cgId && token.cgId && t.cgId === token.cgId) return true;
      if (t.contract && token.contract && t.contract.toLowerCase() === token.contract.toLowerCase()) return true;
      return false;
    });
  }

  add(token: Partial<Token> & { id: string; chainId?: number }): { added: boolean; token?: Token; reason?: 'duplicate' } {
    if (this.has(token as Token)) return { added: false, reason: 'duplicate' };
    const tokens = this.load();
    const entry = normalize(token);
    tokens.push(entry);
    this.save(tokens);
    return { added: true, token: entry };
  }

  remove(id: string, chainId?: number): boolean {
    const tokens = this.load();
    const idx = tokens.findIndex((t) => t.id === id && (chainId === undefined || tokenChainId(t) === chainId));
    if (idx === -1) return false;
    const [removed] = tokens.splice(idx, 1);
    this.save(tokens);
    if (removed?.isDefault) this.addRemovedDefault(removed.id);
    return true;
  }

  /** Legacy `_removed_defaults` prevents re-injection after upgrade. */
  addRemovedDefault(id: string): void {
    const ids = this.removedDefaultIds();
    ids.add(id);
    try {
      this.storage.write(`${this.key}_removed_defaults`, JSON.stringify([...ids]));
    } catch {
      /* ignore */
    }
  }

  forChain(chainId: number | null): Token[] {
    const all = this.load();
    return chainId === null ? all : all.filter((t) => tokenChainId(t) === chainId);
  }

  priceTokens(chainId?: number | null): PriceToken[] {
    return this.forChain(chainId ?? null).map((t) => ({ cgId: t.cgId ?? null, address: t.contract || null }));
  }
}

/** Legacy `fetchTokenInfo` id shape for contract-added tokens. */
export function customTokenId(address: string): string {
  return `custom-${address.slice(2, 10).toLowerCase()}`;
}
