/**
 * Futures support for the exchanges that expose USDT-M/linear contracts.
 * Legacy had a separate `FUT` module with per-exchange endpoints; this keeps
 * the same three majors and marks the rest unsupported rather than guessing.
 */
import type { ExchangeId } from './config.js';
import { ExchangeAdapter } from './adapter.js';
import type { ExchangeCredentials } from './config.js';

export interface FuturesConfig {
  id: ExchangeId;
  name: string;
  marketsPath: string;
  positionsPath: string;
  orderPath: string;
  cancelPath: string;
  category?: string;
}

export const FUTURES_CONFIGS: FuturesConfig[] = [
  { id: 'binance', name: 'Binance USDT-M', marketsPath: '/fapi/v1/ticker/24hr', positionsPath: '/fapi/v2/positionRisk', orderPath: '/fapi/v1/order', cancelPath: '/fapi/v1/order' },
  { id: 'bybit', name: 'Bybit Linear', marketsPath: '/v5/market/tickers', positionsPath: '/v5/position/list', orderPath: '/v5/order/create', cancelPath: '/v5/order/cancel', category: 'linear' },
  { id: 'bitget', name: 'Bitget USDT-M', marketsPath: '/api/v2/mix/market/tickers', positionsPath: '/api/v2/mix/position/all-position', orderPath: '/api/v2/mix/order/place-order', cancelPath: '/api/v2/mix/order/cancel-order', category: 'USDT-FUTURES' },
  { id: 'kucoin', name: 'KuCoin Futures', marketsPath: '/api/v1/contracts/active', positionsPath: '/api/v1/positions', orderPath: '/api/v1/orders', cancelPath: '/api/v1/orders', category: 'futures' },
  { id: 'mexc', name: 'MEXC Futures', marketsPath: '/api/v1/contract/ticker', positionsPath: '/api/v1/private/position/open_positions', orderPath: '/api/v1/private/order/submit', cancelPath: '/api/v1/private/order/cancel', category: 'futures' },
];

export function futuresConfigFor(id: ExchangeId): FuturesConfig | null {
  return FUTURES_CONFIGS.find((c) => c.id === id) ?? null;
}

export interface FuturesOrder {
  symbol: string;
  side: 'buy' | 'sell' | 'long' | 'short';
  type: 'market' | 'limit';
  quantity: string;
  price?: string;
  leverage?: number;
  reduceOnly?: boolean;
}

/** Builds the exchange-specific body for a futures order. */
export function futuresOrderBody(id: ExchangeId, order: FuturesOrder): Record<string, unknown> {
  switch (id) {
    case 'binance':
      return {
        symbol: order.symbol.toUpperCase(),
        side: order.side === 'buy' || order.side === 'long' ? 'BUY' : 'SELL',
        type: order.type.toUpperCase(),
        quantity: order.quantity,
        ...(order.type === 'limit' ? { price: order.price, timeInForce: 'GTC' } : {}),
        ...(order.reduceOnly ? { reduceOnly: 'true' } : {}),
      };
    case 'bybit':
      return {
        category: 'linear',
        symbol: order.symbol.toUpperCase(),
        side: order.side === 'buy' || order.side === 'long' ? 'Buy' : 'Sell',
        orderType: order.type === 'limit' ? 'Limit' : 'Market',
        qty: order.quantity,
        ...(order.type === 'limit' ? { price: order.price } : {}),
        ...(order.reduceOnly ? { reduceOnly: true } : {}),
      };
    case 'bitget':
      return {
        symbol: order.symbol.toUpperCase(),
        productType: 'USDT-FUTURES',
        marginMode: 'crossed',
        marginCoin: 'USDT',
        side: order.side === 'buy' || order.side === 'long' ? 'buy' : 'sell',
        orderType: order.type === 'limit' ? 'limit' : 'market',
        size: order.quantity,
        ...(order.type === 'limit' ? { price: order.price } : {}),
        ...(order.reduceOnly ? { reduceOnly: 'YES' } : {}),
      };
    default:
      return {
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        qty: order.quantity,
        ...(order.price ? { price: order.price } : {}),
      };
  }
}

export async function fetchFuturesMarkets(
  id: ExchangeId,
  creds: ExchangeCredentials | null,
  opts: ConstructorParameters<typeof ExchangeAdapter>[2] = {},
): Promise<any> {
  const cfg = futuresConfigFor(id);
  if (!cfg) throw new Error(`Futures are not supported for ${id}`);
  const adapter = new ExchangeAdapter(id, creds, opts);
  const params: Record<string, string> = cfg.id === 'bybit'
    ? { category: 'linear' }
    : cfg.id === 'bitget' ? { productType: 'USDT-FUTURES' } : {};
  return adapter.publicJson(cfg.marketsPath, params);
}

/** Signed futures request; path swaps in the futures endpoint. */
export async function futuresRequest(
  id: ExchangeId,
  creds: ExchangeCredentials,
  kind: 'positions' | 'order' | 'cancel',
  payload: Record<string, unknown> | Record<string, string | number> = {},
  opts: ConstructorParameters<typeof ExchangeAdapter>[2] = {},
): Promise<any> {
  const cfg = futuresConfigFor(id);
  if (!cfg) throw new Error(`Futures are not supported for ${id}`);
  const adapter = new ExchangeAdapter(id, creds, opts);
  const path = kind === 'positions' ? cfg.positionsPath : kind === 'order' ? cfg.orderPath : cfg.cancelPath;
  const method = kind === 'positions' ? 'GET' : kind === 'cancel' ? 'DELETE' : 'POST';
  return adapter.signed({ method, path, params: method === 'GET' ? payload as Record<string, string | number> : {}, body: method === 'GET' ? undefined : payload });
}

export function leverageKey(id: ExchangeId): string {
  return `fut_lev_${id}`;
}

export function futuresPairKey(id: ExchangeId): string {
  return `nexus_fut_pair_${id}`;
}
