/**
 * Base Swap Bot (Profile → TOOLS). Legacy persisted per-wallet/per-amount
 * config in `nexus_bsb_pm` and repeatedly quoted/executed a swap on Base.
 * The core plans cycles; quoting/execution is injected.
 */
import type { SwapRequest } from '../swap/types.js';
import { toWei } from '../util/units.js';

export interface BsbConfig {
  enabled: boolean;
  chainId: number;
  fromToken: { address: string; symbol: string; decimals: number };
  toToken: { address: string; symbol: string; decimals: number };
  amount: string;
  intervalMs: number;
  slippagePct: number;
  walletKeyId: string;
  userAddress: string;
}

export interface BsbState {
  running: boolean;
  cycles: number;
  lastQuoteAt: number | null;
  lastTxHash: string | null;
  lastError: string | null;
}

export function initialBsbState(): BsbState {
  return { running: false, cycles: 0, lastQuoteAt: null, lastTxHash: null, lastError: null };
}

export function toSwapRequest(config: BsbConfig): SwapRequest {
  const amountWei = toWei(config.amount, config.fromToken.decimals);
  if (amountWei == null || amountWei <= 0n) throw new Error('Enter a valid Base Swap Bot amount');
  return {
    chainId: config.chainId,
    fromToken: { address: config.fromToken.address, symbol: config.fromToken.symbol, decimals: config.fromToken.decimals },
    toToken: { address: config.toToken.address, symbol: config.toToken.symbol, decimals: config.toToken.decimals },
    amountWei,
    userAddress: config.userAddress,
    slippagePct: config.slippagePct,
  };
}

export function bsbAfterCycle(state: BsbState, result: { quoteAt?: number; txHash?: string; error?: string }): BsbState {
  return {
    running: state.running,
    cycles: state.cycles + 1,
    lastQuoteAt: result.quoteAt ?? state.lastQuoteAt,
    lastTxHash: result.txHash ?? state.lastTxHash,
    lastError: result.error ?? null,
  };
}

/** Legacy `nexus_bsb_pm` shape: config is stored per wallet address. */
export interface BsbPmStore {
  [walletAddress: string]: { amount: string; intervalMs: number; slippagePct: number; fromSymbol?: string; toSymbol?: string };
}

export function readBsbPm(raw: string | null): BsbPmStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as BsbPmStore : {};
  } catch {
    return {};
  }
}
