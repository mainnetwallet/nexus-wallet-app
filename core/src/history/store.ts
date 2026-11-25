/**
 * Transaction history — port of `nexus_tx_history` and the bridge-modal
 * tombstone `brh_cleared_ts` (index.html 28217–28338, 50206–50410).
 *
 * Semantics that matter and are easy to get wrong:
 *  - Adding an entry trims bridge+swap entries to the newest 15; all other
 *    types are never trimmed.
 *  - `clearBridgeView()` does NOT touch `nexus_tx_history`; it stores a
 *    timestamp and both bridge and swap entries at or before it disappear
 *    from the bridge modal / inline recent list only.
 *  - `pendingRecv`/`failed` are mutated in place by the status checkers.
 */
export interface HistoryStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export type HistoryType = 'send' | 'receive' | 'swap' | 'bridge' | 'approve' | 'batch' | (string & {});

export interface TxHistoryEntry {
  id: string;
  timestamp: number;
  type: HistoryType;
  hash?: string | null;
  recvHash?: string | null;
  chainId?: number | null;
  fromChainId?: number | null;
  toChainId?: number | null;
  fromChain?: string;
  toChain?: string;
  pair?: string;
  wallet?: string;
  walletIndex?: number;
  block?: number | null;
  isDry?: boolean;
  fromAmt?: string | number;
  fromToken?: string;
  toAmt?: string | number;
  toToken?: string;
  pendingRecv?: boolean;
  failed?: boolean;
  provider?: string;
  amount?: string | number;
  symbol?: string;
  explorerBase?: string;
  [key: string]: unknown;
}

export interface TxHistoryInput {
  type: HistoryType;
  id?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export const TX_HISTORY_KEY = 'nexus_tx_history';
export const BRIDGE_CLEARED_KEY = 'brh_cleared_ts';
export const BRIDGE_HISTORY_LIMIT = 15;

export interface TxHistoryOptions {
  now?: () => number;
  random?: () => number;
  limit?: number;
}

function isBridgeSwap(t: TxHistoryEntry): boolean {
  return t.type === 'bridge' || t.type === 'swap';
}

export function historyEntryId(timestamp: number, random: () => number = Math.random): string {
  return `${timestamp}_${random().toString(36).slice(2, 7)}`;
}

export class TxHistoryStore {
  private readonly storage: HistoryStorage;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly limit: number;

  constructor(storage: HistoryStorage, opts: TxHistoryOptions = {}) {
    this.storage = storage;
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.limit = opts.limit ?? BRIDGE_HISTORY_LIMIT;
  }

  load(): TxHistoryEntry[] {
    const raw = this.storage.read(TX_HISTORY_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as TxHistoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  save(txs: TxHistoryEntry[]): void {
    try {
      this.storage.write(TX_HISTORY_KEY, JSON.stringify(txs));
    } catch {
      /* quota — legacy swallows */
    }
  }

  /** Legacy `saveTxToHistory`: unshift, trim, return saved entry. */
  add(tx: TxHistoryInput): TxHistoryEntry {
    const timestamp = tx.timestamp ?? this.now();
    const entry = {
      ...tx,
      timestamp,
      id: tx.id ?? historyEntryId(timestamp, this.random),
    } as TxHistoryEntry;
    const list = [entry, ...this.load()];
    this.save(trimBridgeSwap(list, this.limit));
    return entry;
  }

  clear(): void {
    try {
      this.storage.remove(TX_HISTORY_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Update pending/failed/recvHash in place; matches by id or hash like legacy. */
  patch(match: { id?: string; hash?: string }, patch: Partial<TxHistoryEntry>): boolean {
    const list = this.load();
    const idx = list.findIndex((t) => (match.id && t.id === match.id) || (match.hash && t.hash && t.hash === match.hash));
    if (idx === -1) return false;
    list[idx] = { ...list[idx]!, ...patch };
    this.save(list);
    return true;
  }

  /** `brh_cleared_ts` reader. */
  bridgeViewClearedAt(): number {
    try {
      const raw = this.storage.read(BRIDGE_CLEARED_KEY);
      return raw ? Number(raw) || 0 : 0;
    } catch {
      return 0;
    }
  }

  /** Legacy `brClearHistory` — hides entries in the bridge modal only. */
  clearBridgeView(at: number = this.now()): void {
    try {
      this.storage.write(BRIDGE_CLEARED_KEY, String(at));
    } catch {
      /* ignore */
    }
  }

  /** Bridge modal pool: bridge+swap, newest first, tombstone applied. */
  bridgeSwapPool(): TxHistoryEntry[] {
    const cleared = this.bridgeViewClearedAt();
    return this.load().filter((t) => {
      if (!isBridgeSwap(t)) return false;
      if (cleared > 0 && Number(t.timestamp || (t.ts as number) || 0) <= cleared) return false;
      return true;
    });
  }

  /** Legacy dropdown: filter by type then newest 15. */
  recent(type: 'all' | 'bridge' | 'swap' = 'all', limit = this.limit): TxHistoryEntry[] {
    const pool = this.bridgeSwapPool();
    const filtered = type === 'all' ? pool : pool.filter((t) => t.type === type);
    return filtered.slice(0, limit);
  }

  /** Legacy inline list: last 5 of the pool, reversed (oldest of those 5 first). */
  inlineRecent(limit = 5): TxHistoryEntry[] {
    return this.bridgeSwapPool().slice(-limit).reverse();
  }

  hasPending(): boolean {
    return this.load().some((t) => isBridgeSwap(t) && t.pendingRecv === true && !!t.hash);
  }
}

/**
 * Legacy merge loop: keep the first `limit` bridge/swap entries in list order,
 * keep every other entry, preserving overall order.
 */
export function trimBridgeSwap(txs: TxHistoryEntry[], limit = BRIDGE_HISTORY_LIMIT): TxHistoryEntry[] {
  const bridgeSwap = txs.filter(isBridgeSwap);
  const kept = new Set(bridgeSwap.slice(0, limit));
  return txs.filter((t) => !isBridgeSwap(t) || kept.has(t));
}
