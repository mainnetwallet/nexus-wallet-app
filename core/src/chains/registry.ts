/**
 * Chain registry — ported from `BUILTIN_CHAINS` (index.html ~29019), `PRESET_CHAINS`
 * (~45139) and `BR_CHAIN_RPC` (~45194, 120 chains). The legacy app merges, in order:
 *   1. user RPCs from `nexus_custom_rpcs_v1[chainId]` (defaultRpc first, then rpcs[])
 *   2. `getChainRpcs(chainId)` — built-in or custom chain RPC arrays
 *   3. a hardcoded RPC_MAP fallback
 *   4. `BR_CHAIN_RPC[chainId]`
 * That exact order is preserved by {@link getRpcListForChain}.
 */
import { BR_CHAIN_RPC_DATA } from './brChainRpc.js';

export interface ChainDef {
  id: string;
  chainId: number | null;
  emoji: string;
  name: string;
  nativeSym: string;
  color: string;
  builtIn: boolean;
  logoURI: string | null;
  rpcs: string[];
}

export const BUILTIN_CHAINS: ChainDef[] = [
  { id: 'all', chainId: null, emoji: '🌐', name: 'All Networks', nativeSym: '', color: '#6366f1', builtIn: true, logoURI: null, rpcs: [] },
  { id: 'base', chainId: 8453, emoji: '🔵', name: 'Base', nativeSym: 'ETH', color: '#0052ff', builtIn: true, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png', rpcs: ['https://mainnet.base.org', 'https://base.meowrpc.com'] },
  { id: 'eth', chainId: 1, emoji: '⬡', name: 'Ethereum', nativeSym: 'ETH', color: '#627eea', builtIn: true, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png', rpcs: ['https://rpc.ankr.com/eth', 'https://cloudflare-eth.com'] },
  { id: 'arb', chainId: 42161, emoji: '🔵', name: 'Arbitrum One', nativeSym: 'ETH', color: '#28a0f0', builtIn: true, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png', rpcs: ['https://rpc.ankr.com/arbitrum', 'https://arb1.arbitrum.io/rpc'] },
  { id: 'op', chainId: 10, emoji: '🔴', name: 'Optimism', nativeSym: 'ETH', color: '#ff0420', builtIn: true, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png', rpcs: ['https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism'] },
  { id: 'matic', chainId: 137, emoji: '⬡', name: 'Polygon', nativeSym: 'POL', color: '#8247e5', builtIn: true, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png', rpcs: ['https://rpc.ankr.com/polygon', 'https://polygon.meowrpc.com'] },
  { id: 'bsc', chainId: 56, emoji: '💛', name: 'BNB Chain', nativeSym: 'BNB', color: '#f3ba2f', builtIn: true, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png', rpcs: ['https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.defibit.io', 'https://bsc-dataseed2.defibit.io', 'https://rpc.ankr.com/bsc'] },
  { id: 'avax', chainId: 43114, emoji: '🔺', name: 'Avalanche C', nativeSym: 'AVAX', color: '#e84142', builtIn: true, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png', rpcs: ['https://api.avax.network/ext/bc/C/rpc', 'https://rpc.ankr.com/avalanche'] },
  { id: 'linea', chainId: 59144, emoji: '◻️', name: 'Linea', nativeSym: 'ETH', color: '#61dfff', builtIn: true, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/linea/info/logo.png', rpcs: ['https://rpc.linea.build'] },
  { id: 'scroll', chainId: 534352, emoji: '📜', name: 'Scroll', nativeSym: 'ETH', color: '#efc042', builtIn: true, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/scroll/info/logo.png', rpcs: ['https://rpc.scroll.io', 'https://rpc.ankr.com/scroll'] },
  { id: 'zksync', chainId: 324, emoji: '⚡', name: 'zkSync Era', nativeSym: 'ETH', color: '#8c8dfc', builtIn: true, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/zksync/info/logo.png', rpcs: ['https://mainnet.era.zksync.io', 'https://rpc.ankr.com/zksync_era', 'https://zksync.meowrpc.com'] },
];

export const PRESET_CHAINS = [
  { id: 8453, name: 'Base', emoji: '🔵', nativeSym: 'ETH', color: '#0052ff' },
  { id: 1, name: 'Ethereum', emoji: '⬡', nativeSym: 'ETH', color: '#627eea' },
  { id: 42161, name: 'Arbitrum One', emoji: '🔵', nativeSym: 'ETH', color: '#28a0f0' },
  { id: 10, name: 'Optimism', emoji: '🔴', nativeSym: 'ETH', color: '#ff0420' },
  { id: 137, name: 'Polygon', emoji: '⬡', nativeSym: 'POL', color: '#8247e5' },
  { id: 56, name: 'BNB Chain', emoji: '💛', nativeSym: 'BNB', color: '#f3ba2f' },
  { id: 43114, name: 'Avalanche C', emoji: '🔺', nativeSym: 'AVAX', color: '#e84142' },
  { id: 59144, name: 'Linea', emoji: '◻️', nativeSym: 'ETH', color: '#61dfff' },
  { id: 534352, name: 'Scroll', emoji: '📜', nativeSym: 'ETH', color: '#efc042' },
  { id: 324, name: 'zkSync Era', emoji: '⚡', nativeSym: 'ETH', color: '#8c8dfc' },
] as const;

export const BR_CHAIN_RPC: Record<string, string[]> = BR_CHAIN_RPC_DATA;

/** Legacy RPC_MAP fallback (`_getRpcListForChain`, step 2). */
export const RPC_MAP: Record<number, string[]> = {
  1: ['https://rpc.ankr.com/eth', 'https://cloudflare-eth.com'],
  56: ['https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.defibit.io', 'https://rpc.ankr.com/bsc'],
  137: ['https://rpc.ankr.com/polygon', 'https://polygon.meowrpc.com'],
  42161: ['https://rpc.ankr.com/arbitrum', 'https://arb1.arbitrum.io/rpc'],
  10: ['https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism'],
  8453: ['https://mainnet.base.org', 'https://base.meowrpc.com'],
  43114: ['https://api.avax.network/ext/bc/C/rpc', 'https://rpc.ankr.com/avalanche'],
  250: ['https://rpc.ftm.tools', 'https://rpc.ankr.com/fantom'],
  42220: ['https://forno.celo.org', 'https://rpc.ankr.com/celo'],
  100: ['https://rpc.gnosischain.com', 'https://rpc.ankr.com/gnosis'],
  59144: ['https://rpc.linea.build'],
  534352: ['https://rpc.scroll.io', 'https://rpc.ankr.com/scroll'],
  5000: ['https://rpc.mantle.xyz'],
  1101: ['https://zkevm-rpc.com'],
  81457: ['https://rpc.blast.io'],
  324: ['https://mainnet.era.zksync.io', 'https://rpc.ankr.com/zksync_era'],
  34443: ['https://mainnet.mode.network'],
};

export interface CustomChainDef extends Partial<ChainDef> {
  chainId: number;
  name: string;
  rpc?: string | string[];
  rpcs?: string[];
}

export interface CustomRpcEntry {
  defaultRpc?: string;
  rpcs?: string[];
}

export interface RpcStorage {
  read(key: string): string | null;
}

/** `nexus_custom_rpcs_v1` shape: { [chainId]: { defaultRpc, rpcs[] } } */
export function readCustomRpcs(store: RpcStorage): Record<string, CustomRpcEntry> {
  try {
    const raw = store.read('nexus_custom_rpcs_v1');
    return raw ? (JSON.parse(raw) as Record<string, CustomRpcEntry>) : {};
  } catch {
    return {};
  }
}

export function readCustomChains(store: RpcStorage, groupId?: string | null): CustomChainDef[] {
  const keys = groupId ? [`nexus_custom_chains_${groupId}`, 'nexus_custom_chains'] : ['nexus_custom_chains'];
  for (const key of keys) {
    try {
      const raw = store.read(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as CustomChainDef[];
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function getAllChains(customChains: CustomChainDef[] = []): ChainDef[] {
  return [...BUILTIN_CHAINS, ...customChains.map(toChainDef)];
}

function toChainDef(c: CustomChainDef): ChainDef {
  const rpcList = Array.isArray(c.rpcs)
    ? c.rpcs
    : Array.isArray(c.rpc)
      ? c.rpc
      : c.rpc
        ? [c.rpc]
        : [];
  return {
    id: c.id ?? `custom-${c.chainId}`,
    chainId: c.chainId,
    emoji: c.emoji ?? '🔗',
    name: c.name,
    nativeSym: c.nativeSym ?? 'ETH',
    color: c.color ?? '#6366f1',
    builtIn: false,
    logoURI: c.logoURI ?? null,
    rpcs: rpcList.filter(Boolean) as string[],
  };
}

export function getChainRpcs(chainId: number, customChains: CustomChainDef[] = []): string[] {
  const chain = getAllChains(customChains).find((c) => c.chainId === chainId);
  if (!chain) return [];
  if (!chain.builtIn) {
    const r = chain.rpcs;
    return (Array.isArray(r) ? r : r ? [r] : []).filter(Boolean) as string[];
  }
  return chain.rpcs ?? [];
}

/**
 * Exact merge order from legacy `_getRpcListForChain` (~36447).
 * Only http(s) URLs are returned.
 */
export function getRpcListForChain(
  chainId: number,
  store: RpcStorage,
  customChains: CustomChainDef[] = [],
): string[] {
  const rpcs: string[] = [];
  const push = (r: unknown) => {
    if (typeof r === 'string' && r && !rpcs.includes(r)) rpcs.push(r);
  };

  const custom = readCustomRpcs(store)[String(chainId)];
  if (custom) {
    push(custom.defaultRpc);
    for (const r of custom.rpcs ?? []) push(r);
  }
  for (const r of getChainRpcs(chainId, customChains)) push(r);
  for (const r of RPC_MAP[chainId] ?? []) push(r);
  for (const r of BR_CHAIN_RPC[String(chainId)] ?? []) push(r);

  return rpcs.filter((r) => r.startsWith('http'));
}

export function findChain(chainId: number | null, customChains: CustomChainDef[] = []): ChainDef | undefined {
  return getAllChains(customChains).find((c) => c.chainId === chainId);
}
