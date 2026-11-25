import { create } from 'zustand';
import { Wallet } from 'ethers';
import {
  PriceService,
  RpcClient,
  TokenStore,
  TxHistoryStore,
  createRandomGroup,
  encodeTransfer,
  fetchTokenBalance,
  findChain,
  getAllChains,
  getRpcListForChain,
  importWalletGroup,
  toWei,
  updateGroup,
  type CustomChainDef,
  type PriceMap,
  type Token,
  type TxHistoryEntry,
  type WalletGroup,
} from '@nexus/core';
import { makeEncryptedStore } from '../native/bridge';
import { prefs } from '../storage/prefs';
import { useApp } from './app';

const GROUPS_KEY = 'nexus2/groups';

export interface KeyRef {
  privateKey: string;
  address: string;
  groupId: string;
  groupName: string;
}

interface SendInput {
  chainId: number;
  privateKey: string;
  to: string;
  amount: string;
  decimals?: number;
  token?: { contract: string; decimals: number; symbol: string } | null;
}

export interface SendResult {
  ok: boolean;
  hash?: string;
  error?: string;
}

interface WalletState {
  groups: WalletGroup[];
  activeGroupId: string | null;
  chainId: number | null;
  prices: PriceMap;
  balances: Record<string, number>; // `${tokenId}:${chainId}:${address}`
  customChains: CustomChainDef[];
  loading: boolean;
  load(): Promise<void>;
  setActiveGroup(id: string): Promise<void>;
  setChain(id: number | null): void;
  importKeys(name: string, text: string): Promise<string | null>;
  importPhrases(name: string, phrases: string[]): Promise<string | null>;
  createGroup(name: string, count: number): Promise<string | null>;
  removeGroup(id: string): Promise<void>;
  renameGroup(id: string, name: string): Promise<void>;
  tokens(): Token[];
  saveTokens(tokens: Token[]): void;
  keys(): KeyRef[];
  addresses(): string[];
  refreshPrices(): Promise<void>;
  refreshBalances(): Promise<void>;
  send(input: SendInput): Promise<SendResult>;
  history(): TxHistoryEntry[];
  logHistory(entry: { type: string; timestamp?: number } & Record<string, unknown>): void;
}

function tokenKey(tokenId: string, chainId: number, address: string): string {
  return `${tokenId}:${chainId}:${address.toLowerCase()}`;
}

function addressesOf(group: WalletGroup | undefined): string[] {
  if (!group) return [];
  const out: string[] = [];
  for (const k of group.keys) {
    try {
      out.push(new Wallet(k).address);
    } catch {
      /* skip malformed keys, never crash the list */
    }
  }
  return out;
}

async function readGroups(): Promise<WalletGroup[]> {
  try {
    const raw = await makeEncryptedStore().get(GROUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WalletGroup[]) : [];
  } catch {
    return [];
  }
}

async function writeGroups(groups: WalletGroup[]): Promise<void> {
  await makeEncryptedStore().set(GROUPS_KEY, JSON.stringify(groups));
}

export const useWallet = create<WalletState>((set, get) => ({
  groups: [],
  activeGroupId: prefs.read('wallet.activeGroupId'),
  chainId: null,
  prices: {},
  balances: {},
  customChains: [],
  loading: false,

  async load() {
    set({ loading: true });
    const groups = await readGroups();
    const active = prefs.read('wallet.activeGroupId');
    const customChains = prefs.json<CustomChainDef[]>('chains.custom', []);
    set({
      groups,
      activeGroupId: active && groups.some((g) => g.id === active) ? active : groups[0]?.id ?? null,
      customChains,
      loading: false,
    });
  },

  async setActiveGroup(id) {
    prefs.write('wallet.activeGroupId', id);
    set({ activeGroupId: id, balances: {} });
    await get().refreshBalances();
  },

  setChain(id) {
    prefs.write('wallet.chain', id == null ? 'null' : String(id));
    set({ chainId: id, balances: {} });
    void get().refreshBalances();
  },

  async importKeys(name, text) {
    const result = importWalletGroup({
      name,
      groups: get().groups,
      selectedGroupIds: [get().activeGroupId ?? ''],
      privateKeysText: text,
    });
    if (!result.ok) return result.error;
    await writeGroups(result.groups);
    const nextActive = get().activeGroupId ?? result.group.id;
    prefs.write('wallet.activeGroupId', nextActive);
    set({ groups: result.groups, activeGroupId: nextActive });
    useApp.getState().log(`[wallet] imported group "${result.group.name}" (${result.group.keys.length} keys)`);
    return null;
  },

  async importPhrases(name, phrases) {
    const result = importWalletGroup({
      name,
      groups: get().groups,
      selectedGroupIds: [get().activeGroupId ?? ''],
      phrases,
    });
    if (!result.ok) return result.error;
    await writeGroups(result.groups);
    const nextActive = get().activeGroupId ?? result.group.id;
    prefs.write('wallet.activeGroupId', nextActive);
    set({ groups: result.groups, activeGroupId: nextActive });
    return null;
  },

  async createGroup(name, count) {
    const result = createRandomGroup({
      name,
      groups: get().groups,
      selectedGroupIds: [get().activeGroupId ?? ''],
      count,
    });
    if (!result.ok) return result.error;
    await writeGroups(result.groups);
    const nextActive = get().activeGroupId ?? result.group.id;
    prefs.write('wallet.activeGroupId', nextActive);
    set({ groups: result.groups, activeGroupId: nextActive });
    return null;
  },

  async removeGroup(id) {
    const groups = get().groups.filter((g) => g.id !== id);
    await writeGroups(groups);
    const active = get().activeGroupId === id ? groups[0]?.id ?? null : get().activeGroupId;
    if (active) prefs.write('wallet.activeGroupId', active);
    else prefs.remove('wallet.activeGroupId');
    set({ groups, activeGroupId: active });
  },

  async renameGroup(id, name) {
    const result = updateGroup(get().groups, id, { name });
    if (!result.ok) return;
    await writeGroups(result.groups);
    set({ groups: result.groups });
  },

  tokens() {
    const groupId = get().activeGroupId;
    return new TokenStore(prefs, groupId).load();
  },

  saveTokens(tokens) {
    new TokenStore(prefs, get().activeGroupId).save(tokens);
  },

  keys() {
    const { groups, activeGroupId } = get();
    const group = groups.find((g) => g.id === activeGroupId);
    if (!group) return [];
    return group.keys.flatMap((k) => {
      try {
        return [{ privateKey: k, address: new Wallet(k).address, groupId: group.id, groupName: group.name }];
      } catch {
        return [];
      }
    });
  },

  addresses() {
    return get().keys().map((k) => k.address);
  },

  async refreshPrices() {
    try {
      const tokens = get().tokens();
      const service = new PriceService({ fetchImpl: (url, init) => fetch(url, init), storage: prefs });
      const prices = await service.fetchAll(
        tokens.map((t) => ({ cgId: t.cgId, address: t.contract || null })),
      );
      set({ prices });
    } catch (err) {
      useApp.getState().log(`[prices] refresh failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  },

  async refreshBalances() {
    const { groups, activeGroupId, chainId, customChains } = get();
    const group = groups.find((g) => g.id === activeGroupId);
    if (!group) return;
    const addresses = addressesOf(group);
    if (!addresses.length) return;
    const tokens = get().tokens().filter((t) => (chainId == null ? true : t.chainId === chainId));
    const byChain = new Map<number, Token[]>();
    for (const t of tokens) {
      const list = byChain.get(t.chainId) ?? [];
      list.push(t);
      byChain.set(t.chainId, list);
    }
    const balances = { ...get().balances };
    await Promise.all(
      [...byChain.entries()].map(async ([id, chainTokens]) => {
        const rpc = new RpcClient({ chainId: id, urls: getRpcListForChain(id, prefs, customChains) });
        const native = chainTokens.find((t) => t.isNative);
        if (native) {
          const bal = await fetchTokenBalance(rpc, { isNative: true, decimals: native.decimals }, addresses);
          if (bal != null) for (const a of addresses) balances[tokenKey(native.id, id, a)] = bal;
        }
        await Promise.all(
          chainTokens
            .filter((t) => !t.isNative && t.contract && t.contract.length > 10)
            .map(async (t) => {
              const bal = await fetchTokenBalance(rpc, { contract: t.contract, decimals: t.decimals }, addresses);
              if (bal != null) for (const a of addresses) balances[tokenKey(t.id, id, a)] = bal;
            }),
        );
      }),
    );
    set({ balances });
  },

  async send(input) {
    const { chainId, privateKey, to, amount, decimals, token } = input;
    const wallet = new Wallet(privateKey);
    const rpc = new RpcClient({
      chainId,
      urls: getRpcListForChain(chainId, prefs, get().customChains),
    });
    const { sendTransactionWithFallback } = await import('@nexus/core');
    const signer = {
      address: wallet.address,
      async sendTransaction(tx: Record<string, unknown>) {
        const raw = await wallet.signTransaction(tx as Parameters<typeof wallet.signTransaction>[0]);
        const hash = await rpc.sendRawTransaction(raw);
        return { hash };
      },
    };
    let valueWei: bigint;
    let data: string | undefined;
    let dest = to;
    let tokenSymbol = findChain(chainId, get().customChains)?.nativeSym ?? 'ETH';
    try {
      if (token) {
        const wei = toWei(amount, token.decimals);
        if (wei == null) return { ok: false, error: 'Invalid amount' };
        valueWei = 0n;
        data = encodeTransfer(to, wei);
        dest = token.contract;
        tokenSymbol = token.symbol;
      } else {
        const wei = toWei(amount, decimals ?? 18);
        if (wei == null) return { ok: false, error: 'Invalid amount' };
        valueWei = wei;
      }
    } catch {
      return { ok: false, error: 'Invalid amount' };
    }
    try {
      const sent = await sendTransactionWithFallback(
        signer,
        rpc,
        { to: dest, data, value: valueWei, chainId },
        { onStatus: (e) => useApp.getState().log(`[send] ${e.message}`) },
      );
      get().logHistory({
        type: 'send',
        hash: sent.hash,
        chainId,
        wallet: wallet.address,
        fromAmt: amount,
        fromToken: tokenSymbol,
        failed: false,
      });
      return { ok: true, hash: sent.hash };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : 'Send failed' };
    }
  },

  history() {
    return new TxHistoryStore(prefs).load();
  },

  logHistory(entry) {
    new TxHistoryStore(prefs).add(entry as Parameters<TxHistoryStore['add']>[0]);
  },
}));

export function chainList(customChains: CustomChainDef[]) {
  return getAllChains(customChains);
}
