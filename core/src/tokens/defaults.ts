/**
 * Default token list — verbatim port of `DEFAULT_TOKENS` (index.html 28825–28913).
 * Ids, contracts, decimals and cgIds must not drift; migration and balance
 * caches key off `id` + `chainId`.
 */
export interface TokenDef {
  id: string;
  chainId: number;
  name: string;
  sub: string;
  icon: string;
  color: string;
  badge: string;
  contract: string;
  decimals: number;
  cgId: string;
  cbPair: string;
  isDefault: true;
  isNative?: boolean;
  logoURI?: string;
}

export const DEFAULT_TOKENS: TokenDef[] = [
  // Base (8453)
  { id: 'base-eth-native', chainId: 8453, name: 'Ether', sub: 'ETH', icon: 'Ξ', color: '#0052ff', badge: '#0052ff', contract: '', decimals: 18, cgId: 'ethereum', cbPair: 'ETH-USD', isDefault: true, isNative: true },
  { id: 'weth', chainId: 8453, name: 'Wrapped Ether', sub: 'WETH', icon: 'Ξ', color: '#6366f1', badge: '#6366f1', contract: '0x4200000000000000000000000000000000000006', decimals: 18, cgId: 'weth', cbPair: 'ETH-USD', isDefault: true },
  { id: 'usdc', chainId: 8453, name: 'USD Coin', sub: 'USDC', icon: '$', color: '#10b981', badge: '#10b981', contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, cgId: 'usd-coin', cbPair: 'USDC-USD', isDefault: true },
  { id: 'usdbc', chainId: 8453, name: 'USD Base Coin', sub: 'USDbC', icon: '$', color: '#3772ff', badge: '#3772ff', contract: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6, cgId: 'bridged-usd-coin-base', cbPair: 'USDC-USD', isDefault: true },
  { id: 'cbeth', chainId: 8453, name: 'Coinbase Wrapped ETH', sub: 'cbETH', icon: 'cb', color: '#0052ff', badge: '#0052ff', contract: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18, cgId: 'coinbase-wrapped-staked-eth', cbPair: 'ETH-USD', isDefault: true },
  { id: 'cbbtc', chainId: 8453, name: 'Coinbase Wrapped BTC', sub: 'cbBTC', icon: '₿', color: '#f7931a', badge: '#f7931a', contract: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, cgId: 'coinbase-wrapped-btc', cbPair: 'BTC-USD', isDefault: true },
  { id: 'euro-coin', chainId: 8453, name: 'EURC', sub: 'EURC', icon: '€', color: '#22d3ee', badge: '#22d3ee', contract: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', decimals: 6, cgId: 'euro-coin', cbPair: 'EURC-USD', isDefault: true },

  // Ethereum (1)
  { id: 'eth1-native', chainId: 1, name: 'Ether', sub: 'ETH', icon: 'Ξ', color: '#627eea', badge: '#627eea', contract: '', decimals: 18, cgId: 'ethereum', cbPair: 'ETH-USD', isDefault: true, isNative: true },
  { id: 'eth1-usdc', chainId: 1, name: 'USD Coin', sub: 'USDC', icon: '$', color: '#10b981', badge: '#10b981', contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, cgId: 'usd-coin', cbPair: 'USDC-USD', isDefault: true },
  { id: 'eth1-usdt', chainId: 1, name: 'Tether USD', sub: 'USDT', icon: '₮', color: '#26a17b', badge: '#26a17b', contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, cgId: 'tether', cbPair: 'USDT-USD', isDefault: true },
  { id: 'eth1-wbtc', chainId: 1, name: 'Wrapped Bitcoin', sub: 'WBTC', icon: '₿', color: '#f7931a', badge: '#f7931a', contract: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, cgId: 'wrapped-bitcoin', cbPair: 'BTC-USD', isDefault: true },
  { id: 'eth1-link', chainId: 1, name: 'Chainlink', sub: 'LINK', icon: '⬡', color: '#2a5ada', badge: '#2a5ada', contract: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, cgId: 'chainlink', cbPair: 'LINK-USD', isDefault: true },
  { id: 'eth1-uni', chainId: 1, name: 'Uniswap', sub: 'UNI', icon: '🦄', color: '#ff007a', badge: '#ff007a', contract: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18, cgId: 'uniswap', cbPair: 'UNI-USD', isDefault: true },
  { id: 'eth1-aave', chainId: 1, name: 'Aave', sub: 'AAVE', icon: 'A', color: '#b6509e', badge: '#b6509e', contract: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', decimals: 18, cgId: 'aave', cbPair: 'AAVE-USD', isDefault: true },

  // Arbitrum (42161)
  { id: 'arb-native', chainId: 42161, name: 'Ether', sub: 'ETH', icon: 'Ξ', color: '#28a0f0', badge: '#28a0f0', contract: '', decimals: 18, cgId: 'ethereum', cbPair: 'ETH-USD', isDefault: true, isNative: true },
  { id: 'arb-usdc', chainId: 42161, name: 'USD Coin', sub: 'USDC', icon: '$', color: '#10b981', badge: '#10b981', contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, cgId: 'usd-coin', cbPair: 'USDC-USD', isDefault: true },
  { id: 'arb-usdt', chainId: 42161, name: 'Tether USD', sub: 'USDT', icon: '₮', color: '#26a17b', badge: '#26a17b', contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, cgId: 'tether', cbPair: 'USDT-USD', isDefault: true },
  { id: 'arb-arb', chainId: 42161, name: 'Arbitrum', sub: 'ARB', icon: '🔵', color: '#28a0f0', badge: '#28a0f0', contract: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, cgId: 'arbitrum', cbPair: 'ARB-USD', isDefault: true },
  { id: 'arb-wbtc', chainId: 42161, name: 'Wrapped Bitcoin', sub: 'WBTC', icon: '₿', color: '#f7931a', badge: '#f7931a', contract: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8, cgId: 'wrapped-bitcoin', cbPair: 'BTC-USD', isDefault: true },

  // Optimism (10)
  { id: 'op-native', chainId: 10, name: 'Ether', sub: 'ETH', icon: 'Ξ', color: '#ff0420', badge: '#ff0420', contract: '', decimals: 18, cgId: 'ethereum', cbPair: 'ETH-USD', isDefault: true, isNative: true },
  { id: 'op-usdc', chainId: 10, name: 'USD Coin', sub: 'USDC', icon: '$', color: '#10b981', badge: '#10b981', contract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6, cgId: 'usd-coin', cbPair: 'USDC-USD', isDefault: true },
  { id: 'op-usdt', chainId: 10, name: 'Tether USD', sub: 'USDT', icon: '₮', color: '#26a17b', badge: '#26a17b', contract: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6, cgId: 'tether', cbPair: 'USDT-USD', isDefault: true },
  { id: 'op-op', chainId: 10, name: 'Optimism', sub: 'OP', icon: '🔴', color: '#ff0420', badge: '#ff0420', contract: '0x4200000000000000000000000000000000000042', decimals: 18, cgId: 'optimism', cbPair: 'OP-USD', isDefault: true },
  { id: 'op-wbtc', chainId: 10, name: 'Wrapped Bitcoin', sub: 'WBTC', icon: '₿', color: '#f7931a', badge: '#f7931a', contract: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8, cgId: 'wrapped-bitcoin', cbPair: 'BTC-USD', isDefault: true },

  // Polygon (137)
  { id: 'matic-native', chainId: 137, name: 'POL', sub: 'POL', icon: '⬡', color: '#8247e5', badge: '#8247e5', contract: '', decimals: 18, cgId: 'matic-network', cbPair: 'MATIC-USD', isDefault: true, isNative: true },
  { id: 'matic-usdc', chainId: 137, name: 'USD Coin', sub: 'USDC', icon: '$', color: '#10b981', badge: '#10b981', contract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, cgId: 'usd-coin', cbPair: 'USDC-USD', isDefault: true },
  { id: 'matic-usdt', chainId: 137, name: 'Tether USD', sub: 'USDT', icon: '₮', color: '#26a17b', badge: '#26a17b', contract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, cgId: 'tether', cbPair: 'USDT-USD', isDefault: true },
  { id: 'matic-wbtc', chainId: 137, name: 'Wrapped Bitcoin', sub: 'WBTC', icon: '₿', color: '#f7931a', badge: '#f7931a', contract: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8, cgId: 'wrapped-bitcoin', cbPair: 'BTC-USD', isDefault: true },
  { id: 'matic-weth', chainId: 137, name: 'Wrapped Ether', sub: 'WETH', icon: 'Ξ', color: '#6366f1', badge: '#6366f1', contract: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, cgId: 'weth', cbPair: 'ETH-USD', isDefault: true },

  // BSC (56)
  { id: 'bsc-native', chainId: 56, name: 'BNB', sub: 'BNB', icon: '💛', color: '#f3ba2f', badge: '#f3ba2f', contract: '', decimals: 18, cgId: 'binancecoin', cbPair: 'BNB-USD', isDefault: true, isNative: true },
  { id: 'bsc-usdt', chainId: 56, name: 'Tether USD', sub: 'USDT', icon: '₮', color: '#26a17b', badge: '#26a17b', contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, cgId: 'tether', cbPair: 'USDT-USD', isDefault: true },
  { id: 'bsc-usdc', chainId: 56, name: 'USD Coin', sub: 'USDC', icon: '$', color: '#10b981', badge: '#10b981', contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, cgId: 'usd-coin', cbPair: 'USDC-USD', isDefault: true },
  { id: 'bsc-btcb', chainId: 56, name: 'Bitcoin BEP20', sub: 'BTCB', icon: '₿', color: '#f7931a', badge: '#f7931a', contract: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18, cgId: 'bitcoin', cbPair: 'BTC-USD', isDefault: true },
  { id: 'bsc-cake', chainId: 56, name: 'PancakeSwap', sub: 'CAKE', icon: '🥞', color: '#1fc7d4', badge: '#1fc7d4', contract: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18, cgId: 'pancakeswap-token', cbPair: 'CAKE-USD', isDefault: true },

  // Avalanche (43114)
  { id: 'avax-native', chainId: 43114, name: 'Avalanche', sub: 'AVAX', icon: '🔺', color: '#e84142', badge: '#e84142', contract: '', decimals: 18, cgId: 'avalanche-2', cbPair: 'AVAX-USD', isDefault: true, isNative: true },
  { id: 'avax-usdc', chainId: 43114, name: 'USD Coin', sub: 'USDC', icon: '$', color: '#10b981', badge: '#10b981', contract: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6, cgId: 'usd-coin', cbPair: 'USDC-USD', isDefault: true },
  { id: 'avax-usdt', chainId: 43114, name: 'Tether USD', sub: 'USDT', icon: '₮', color: '#26a17b', badge: '#26a17b', contract: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6, cgId: 'tether', cbPair: 'USDT-USD', isDefault: true },
  { id: 'avax-weth', chainId: 43114, name: 'Wrapped Ether', sub: 'WETH.e', icon: 'Ξ', color: '#6366f1', badge: '#6366f1', contract: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', decimals: 18, cgId: 'weth', cbPair: 'ETH-USD', isDefault: true },

  // Linea (59144)
  { id: 'linea-native', chainId: 59144, name: 'Ether', sub: 'ETH', icon: 'Ξ', color: '#61dfff', badge: '#61dfff', contract: '', decimals: 18, cgId: 'ethereum', cbPair: 'ETH-USD', isDefault: true, isNative: true },
  { id: 'linea-usdc', chainId: 59144, name: 'USD Coin', sub: 'USDC', icon: '$', color: '#10b981', badge: '#10b981', contract: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', decimals: 6, cgId: 'usd-coin', cbPair: 'USDC-USD', isDefault: true },
  { id: 'linea-usdt', chainId: 59144, name: 'Tether USD', sub: 'USDT', icon: '₮', color: '#26a17b', badge: '#26a17b', contract: '0xA219439258ca9da29E9Cc4cE5596924745e12B93', decimals: 6, cgId: 'tether', cbPair: 'USDT-USD', isDefault: true },
  { id: 'linea-wbtc', chainId: 59144, name: 'Wrapped Bitcoin', sub: 'WBTC', icon: '₿', color: '#f7931a', badge: '#f7931a', contract: '0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4', decimals: 8, cgId: 'wrapped-bitcoin', cbPair: 'BTC-USD', isDefault: true },

  // Scroll (534352)
  { id: 'scroll-native', chainId: 534352, name: 'Ether', sub: 'ETH', icon: 'Ξ', color: '#efc042', badge: '#efc042', contract: '', decimals: 18, cgId: 'ethereum', cbPair: 'ETH-USD', isDefault: true, isNative: true },
  { id: 'scroll-usdc', chainId: 534352, name: 'USD Coin', sub: 'USDC', icon: '$', color: '#10b981', badge: '#10b981', contract: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4', decimals: 6, cgId: 'usd-coin', cbPair: 'USDC-USD', isDefault: true },
  { id: 'scroll-usdt', chainId: 534352, name: 'Tether USD', sub: 'USDT', icon: '₮', color: '#26a17b', badge: '#26a17b', contract: '0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df', decimals: 6, cgId: 'tether', cbPair: 'USDT-USD', isDefault: true },

  // zkSync Era (324)
  { id: 'zk-native', chainId: 324, name: 'Ether', sub: 'ETH', icon: 'Ξ', color: '#8c8dfc', badge: '#8c8dfc', contract: '', decimals: 18, cgId: 'ethereum', cbPair: 'ETH-USD', isDefault: true, isNative: true },
  { id: 'zk-usdc', chainId: 324, name: 'USD Coin', sub: 'USDC', icon: '$', color: '#10b981', badge: '#10b981', contract: '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4', decimals: 6, cgId: 'usd-coin', cbPair: 'USDC-USD', isDefault: true },
  { id: 'zk-usdt', chainId: 324, name: 'Tether USD', sub: 'USDT', icon: '₮', color: '#26a17b', badge: '#26a17b', contract: '0x493257fD37EFE977EA85526099D2ea0F3CAC31A5', decimals: 6, cgId: 'tether', cbPair: 'USDT-USD', isDefault: true },
];

/** Ids purged on load by the legacy app. */
export const REMOVED_TOKEN_IDS: ReadonlySet<string> = new Set([
  'eth1-eth', 'arb-eth', 'op-eth', 'matic-matic',
  'bsc-bnb', 'avax-avax', 'linea-eth', 'scroll-eth', 'zk-eth',
]);

export function tokenChainId(t: { chainId?: number }): number {
  return t.chainId || 8453;
}
