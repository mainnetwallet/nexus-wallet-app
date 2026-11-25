/**
 * Price symbol maps ported verbatim from the legacy app:
 * `CG_TO_BINANCE` (index.html ~21719), `_CG_TO_SYMBOL` (~22048) and the
 * stablecoin set used by `_batchFetchBinance` (~21813).
 */

export const CG_TO_BINANCE: Record<string, string> = {
  ethereum: 'ETHUSDT',
  bitcoin: 'BTCUSDT',
  binancecoin: 'BNBUSDT',
  solana: 'SOLUSDT',
  'avalanche-2': 'AVAXUSDT',
  'matic-network': 'MATICUSDT',
  polkadot: 'DOTUSDT',
  cardano: 'ADAUSDT',
  ripple: 'XRPUSDT',
  near: 'NEARUSDT',
  cosmos: 'ATOMUSDT',
  aptos: 'APTUSDT',
  sui: 'SUIUSDT',
  'injective-protocol': 'INJUSDT',
  celestia: 'TIAUSDT',
  litecoin: 'LTCUSDT',

  arbitrum: 'ARBUSDT',
  optimism: 'OPUSDT',

  weth: 'ETHUSDT',
  'coinbase-wrapped-staked-eth': 'ETHUSDT',

  'wrapped-bitcoin': 'WBTCUSDT',
  'coinbase-wrapped-btc': 'BTCUSDT',

  tether: 'USDTUSDT',
  'usd-coin': 'USDCUSDT',
  'bridged-usd-coin-base': 'USDCUSDT',
  dai: 'DAIUSDT',
  frax: 'FRAXUSDT',
  'true-usd': 'TUSDUSDT',
  'euro-coin': 'EURUSDT',

  chainlink: 'LINKUSDT',
  uniswap: 'UNIUSDT',
  aave: 'AAVEUSDT',
  'pancakeswap-token': 'CAKEUSDT',
  'curve-dao-token': 'CRVUSDT',
  maker: 'MKRUSDT',
  'compound-governance-token': 'COMPUSDT',
  'synthetix-network-token': 'SNXUSDT',
  'yearn-finance': 'YFIUSDT',
  'lido-dao': 'LDOUSDT',
  'rocket-pool': 'RPLUSDT',
  'the-graph': 'GRTUSDT',
  dydx: 'DYDXUSDT',
  gmx: 'GMXUSDT',
  pendle: 'PENDLEUSDT',

  dogecoin: 'DOGEUSDT',
  'shiba-inu': 'SHIBUSDT',

  'render-token': 'RENDERUSDT',
  'fetch-ai': 'FETUSDT',
  'worldcoin-wld': 'WLDUSDT',
};

/** CoinGecko ids that always resolve to $1 (legacy `stableIds`). */
export const STABLE_IDS: ReadonlySet<string> = new Set([
  'tether',
  'usd-coin',
  'bridged-usd-coin-base',
  'dai',
  'frax',
  'true-usd',
  'binance-usd',
  'usdd',
]);

/** Pairs the legacy app always requested, regardless of saved tokens. */
export const CORE_BINANCE_SYMBOLS: readonly string[] = [
  'ETHUSDT', 'BTCUSDT', 'BNBUSDT', 'SOLUSDT', 'AVAXUSDT', 'MATICUSDT',
  'ARBUSDT', 'OPUSDT', 'DOTUSDT', 'ADAUSDT', 'XRPUSDT', 'DOGEUSDT',
  'SHIBUSDT', 'ATOMUSDT', 'LTCUSDT', 'NEARUSDT', 'INJUSDT', 'APTUSDT',
  'SUIUSDT', 'TIAUSDT', 'LINKUSDT', 'UNIUSDT', 'AAVEUSDT', 'CAKEUSDT',
  'EURUSDT', 'USDCUSDT', 'WBTCUSDT', 'DAIUSDT', 'LDOUSDT', 'GRTUSDT',
  'CRVUSDT', 'MKRUSDT', 'DYDXUSDT', 'GMXUSDT', 'PENDLEUSDT', 'RENDERUSDT',
  'FETUSDT', 'WLDUSDT',
];

export const CG_TO_SYMBOL: Record<string, string> = {
  bitcoin: 'BTC', ethereum: 'ETH', binancecoin: 'BNB', solana: 'SOL',
  'matic-network': 'MATIC', polygon: 'POL', 'avalanche-2': 'AVAX', chainlink: 'LINK',
  uniswap: 'UNI', aave: 'AAVE', 'the-sandbox': 'SAND', decentraland: 'MANA',
  'axie-infinity': 'AXS', 'the-graph': 'GRT', 'compound-governance-token': 'COMP',
  maker: 'MKR', 'curve-dao-token': 'CRV', 'yearn-finance': 'YFI', sushi: 'SUSHI',
  'wrapped-bitcoin': 'WBTC', litecoin: 'LTC', ripple: 'XRP', cardano: 'ADA',
  dogecoin: 'DOGE', 'shiba-inu': 'SHIB', polkadot: 'DOT', cosmos: 'ATOM',
  near: 'NEAR', arbitrum: 'ARB', optimism: 'OP', aptos: 'APT', sui: 'SUI',
  'injective-protocol': 'INJ', 'sei-network': 'SEI', celestia: 'TIA', starknet: 'STRK',
  fantom: 'FTM', harmony: 'ONE', algorand: 'ALGO', tezos: 'XTZ', stellar: 'XLM',
  monero: 'XMR', eos: 'EOS', iota: 'IOTA', neo: 'NEO', dash: 'DASH', zcash: 'ZEC',
  'ethereum-classic': 'ETC', vechain: 'VET', tron: 'TRX', filecoin: 'FIL',
  'internet-computer': 'ICP', 'hedera-hashgraph': 'HBAR', flow: 'FLOW',
  'theta-token': 'THETA', gala: 'GALA', 'immutable-x': 'IMX', blur: 'BLUR',
  pepe: 'PEPE', floki: 'FLOKI', bonk: 'BONK', wif: 'WIF', brett: 'BRETT',
  dydx: 'DYDX', gmx: 'GMX', pendle: 'PENDLE', eigenlayer: 'EIGEN',
  base: 'BASE', linea: 'LINEA', scroll: 'SCR', zksync: 'ZK',
  'lido-dao': 'LDO', 'rocket-pool': 'RPL', 'frax-share': 'FXS',
  'fetch-ai': 'FET', singularitynet: 'AGIX', 'ocean-protocol': 'OCEAN',
  'render-token': 'RENDER', 'worldcoin-wld': 'WLD', apecoin: 'APE',
  sandbox: 'SAND', stepn: 'GMT',
  'usd-coin': 'USDC', tether: 'USDT', dai: 'DAI', 'binance-usd': 'BUSD',
};

/** Mirrors `_cgIdToSymbol`: mapped symbol, or single-segment ids uppercased. */
export function cgIdToSymbol(cgId: string | null | undefined): string | null {
  if (!cgId) return null;
  const mapped = CG_TO_SYMBOL[cgId.toLowerCase()];
  if (mapped) return mapped;
  const seg = cgId.split('-');
  return seg.length === 1 ? cgId.toUpperCase() : null;
}
