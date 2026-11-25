/**
 * Exchange definitions ported from legacy `EXCHANGES` (index.html 85911–86170).
 * The legacy app defines 15 adapters (the brief's "16" is corrected in
 * BRIEF_CORRECTIONS.md). Endpoints are public market/account paths; keys are
 * user-supplied and stored encrypted by the UI.
 */
export type ExchangeId =
  | 'binance' | 'kucoin' | 'mexc' | 'bybit' | 'bitmart' | 'bitget'
  | 'kraken' | 'gateio' | 'coinbase' | 'bingx' | 'htx' | 'phemex'
  | 'digifinex' | 'lbank' | 'bitfinex';

export type SignScheme =
  | 'binance' | 'kucoin' | 'mexc' | 'bybit' | 'bitmart' | 'bitget'
  | 'kraken' | 'gateio' | 'coinbase' | 'bingx' | 'htx' | 'phemex'
  | 'digifinex' | 'lbank' | 'bitfinex';

export interface ExchangeEndpoints {
  ticker: string;
  balance: string;
  order: string;
  openOrders: string;
  allOrders: string;
  cancelOrder: string;
}

export interface ExchangeConfig {
  id: ExchangeId;
  name: string;
  color: string;
  baseUrl: string;
  hasPassphrase: boolean;
  supportsConvert: boolean;
  defaultPair?: string;
  endpoints: ExchangeEndpoints;
  sign: SignScheme;
}

export interface ExchangeCredentials {
  apiKey: string;
  secret: string;
  passphrase?: string;
}

export const EXCHANGES: ExchangeConfig[] = [
  {
    id: 'binance', name: 'Binance', color: '#F0B90B', baseUrl: 'https://api.binance.com',
    hasPassphrase: false, supportsConvert: true, sign: 'binance',
    endpoints: {
      ticker: '/api/v3/ticker/24hr', balance: '/api/v3/account', order: '/api/v3/order',
      openOrders: '/api/v3/openOrders', allOrders: '/api/v3/allOrders', cancelOrder: '/api/v3/order',
    },
  },
  {
    id: 'kucoin', name: 'KuCoin', color: '#00B897', baseUrl: 'https://api.kucoin.com',
    hasPassphrase: true, supportsConvert: true, sign: 'kucoin',
    endpoints: {
      ticker: '/api/v1/market/allTickers', balance: '/api/v1/accounts', order: '/api/v1/orders',
      openOrders: '/api/v1/orders?status=active', allOrders: '/api/v1/orders?status=done', cancelOrder: '/api/v1/orders/',
    },
  },
  {
    id: 'mexc', name: 'MEXC', color: '#2354E6', baseUrl: 'https://api.mexc.com',
    hasPassphrase: false, supportsConvert: false, sign: 'mexc',
    endpoints: {
      ticker: '/api/v3/ticker/24hr', balance: '/api/v3/account', order: '/api/v3/order',
      openOrders: '/api/v3/openOrders', allOrders: '/api/v3/allOrders', cancelOrder: '/api/v3/order',
    },
  },
  {
    id: 'bybit', name: 'Bybit', color: '#F7A600', baseUrl: 'https://api.bybit.com',
    hasPassphrase: false, supportsConvert: true, sign: 'bybit',
    endpoints: {
      ticker: '/v5/market/tickers', balance: '/v5/account/wallet-balance', order: '/v5/order/create',
      openOrders: '/v5/order/realtime', allOrders: '/v5/order/history', cancelOrder: '/v5/order/cancel',
    },
  },
  {
    id: 'bitmart', name: 'BitMart', color: '#00B07A', baseUrl: 'https://api-cloud.bitmart.com',
    hasPassphrase: true, supportsConvert: false, sign: 'bitmart',
    endpoints: {
      ticker: '/spot/quotation/v3/tickers', balance: '/account/v1/wallet', order: '/spot/v2/submit_order',
      openOrders: '/spot/v4/query/open-orders', allOrders: '/spot/v4/query/history-orders', cancelOrder: '/spot/v3/cancel_order',
    },
  },
  {
    id: 'bitget', name: 'Bitget', color: '#00F0FF', baseUrl: 'https://api.bitget.com',
    hasPassphrase: true, supportsConvert: true, sign: 'bitget',
    endpoints: {
      ticker: '/api/v2/spot/market/tickers', balance: '/api/v2/spot/account/assets', order: '/api/v2/spot/trade/place-order',
      openOrders: '/api/v2/spot/trade/unfilled-orders', allOrders: '/api/v2/spot/trade/history-orders', cancelOrder: '/api/v2/spot/trade/cancel-order',
    },
  },
  {
    id: 'kraken', name: 'Kraken', color: '#5741D9', baseUrl: 'https://api.kraken.com',
    hasPassphrase: false, supportsConvert: false, sign: 'kraken',
    endpoints: {
      ticker: '/0/public/Ticker', balance: '/0/private/Balance', order: '/0/private/AddOrder',
      openOrders: '/0/private/OpenOrders', allOrders: '/0/private/ClosedOrders', cancelOrder: '/0/private/CancelOrder',
    },
  },
  {
    id: 'gateio', name: 'Gate.io', color: '#16C784', baseUrl: 'https://api.gateio.ws',
    hasPassphrase: false, supportsConvert: true, sign: 'gateio',
    endpoints: {
      ticker: '/api/v4/spot/tickers', balance: '/api/v4/spot/accounts', order: '/api/v4/spot/orders',
      openOrders: '/api/v4/spot/orders', allOrders: '/api/v4/spot/orders', cancelOrder: '/api/v4/spot/orders',
    },
  },
  {
    id: 'coinbase', name: 'Coinbase', color: '#0052FF', baseUrl: 'https://api.exchange.coinbase.com',
    hasPassphrase: true, supportsConvert: false, defaultPair: 'BTCUSDC', sign: 'coinbase',
    endpoints: {
      ticker: '/products', balance: '/accounts', order: '/orders',
      openOrders: '/orders', allOrders: '/orders', cancelOrder: '/orders',
    },
  },
  {
    id: 'bingx', name: 'BingX', color: '#0052FF', baseUrl: 'https://open-api.bingx.com',
    hasPassphrase: false, supportsConvert: false, sign: 'bingx',
    endpoints: {
      ticker: '/openApi/spot/v1/ticker/24hr', balance: '/openApi/spot/v1/account/balance', order: '/openApi/spot/v1/trade/order',
      openOrders: '/openApi/spot/v1/trade/openOrders', allOrders: '/openApi/spot/v1/trade/historyOrders', cancelOrder: '/openApi/spot/v1/trade/cancel',
    },
  },
  {
    id: 'htx', name: 'HTX', color: '#1E2329', baseUrl: 'https://api.huobi.pro',
    hasPassphrase: false, supportsConvert: false, sign: 'htx',
    endpoints: {
      ticker: '/market/tickers', balance: '/v1/account/accounts', order: '/v1/order/orders/place',
      openOrders: '/v1/order/openOrders', allOrders: '/v1/order/orders', cancelOrder: '/v1/order/orders',
    },
  },
  {
    id: 'phemex', name: 'Phemex', color: '#39DBA3', baseUrl: 'https://api.phemex.com',
    hasPassphrase: false, supportsConvert: false, sign: 'phemex',
    endpoints: {
      ticker: '/md/spot/ticker/24hr/all', balance: '/spot/wallets', order: '/spot/orders',
      openOrders: '/spot/orders/active', allOrders: '/exchange/order/v2/orderList', cancelOrder: '/spot/orders',
    },
  },
  {
    id: 'digifinex', name: 'DigiFinex', color: '#2762FF', baseUrl: 'https://openapi.digifinex.com',
    hasPassphrase: false, supportsConvert: false, sign: 'digifinex',
    endpoints: {
      ticker: '/v3/ticker', balance: '/v3/spot/assets', order: '/v3/spot/order/new',
      openOrders: '/v3/spot/order/current', allOrders: '/v3/spot/order/history', cancelOrder: '/v3/spot/order/cancel',
    },
  },
  {
    id: 'lbank', name: 'LBank', color: '#F7B500', baseUrl: 'https://api.lbkex.com',
    hasPassphrase: false, supportsConvert: false, sign: 'lbank',
    endpoints: {
      ticker: '/v2/ticker/24hr.do', balance: '/v2/supplement/user_info.do', order: '/v2/supplement/create_order.do',
      openOrders: '/v2/supplement/orders_info_no_deal.do', allOrders: '/v2/supplement/orders_info_history.do', cancelOrder: '/v2/supplement/cancel_order.do',
    },
  },
  {
    id: 'bitfinex', name: 'Bitfinex', color: '#16B157', baseUrl: 'https://api.bitfinex.com',
    hasPassphrase: false, supportsConvert: false, sign: 'bitfinex',
    endpoints: {
      ticker: '/v2/tickers', balance: '/v2/auth/r/wallets', order: '/v2/auth/w/order/submit',
      openOrders: '/v2/auth/r/orders', allOrders: '/v2/auth/r/orders/hist', cancelOrder: '/v2/auth/w/order/cancel',
    },
  },
];

export function getExchange(id: ExchangeId): ExchangeConfig {
  const found = EXCHANGES.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown exchange: ${id}`);
  return found;
}

/** Legacy symbol helpers (BTCUSDT → BTC-USDT etc.). */
export function splitSymbol(symbol: string): { base: string; quote: string } {
  const m = symbol.match(/^(.*?)(USDT|USDC|USD|BTC|ETH)$/);
  if (!m) return { base: symbol, quote: '' };
  return { base: m[1] ?? symbol, quote: m[2] ?? '' };
}

export function toKucoinSymbol(symbol: string): string {
  const { base, quote } = splitSymbol(symbol);
  return `${base}-${quote}`;
}

export function toDashSymbol(symbol: string): string {
  const { base, quote } = splitSymbol(symbol);
  return `${base}-${quote}`;
}

export function toUnderscoreSymbol(symbol: string): string {
  const { base, quote } = splitSymbol(symbol);
  return `${base}_${quote}`;
}

export function toKrakenPair(symbol: string): string {
  const { base, quote } = splitSymbol(symbol);
  return `${base === 'BTC' ? 'XBT' : base}${quote}`;
}

export function toBitfinexSymbol(symbol: string): string {
  const { base, quote } = splitSymbol(symbol);
  return `t${base}${quote === 'USDT' ? 'UST' : quote}`;
}
