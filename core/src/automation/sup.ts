/**
 * SUP transfer (Profile → TOOLS). Legacy `nexus_sup_pks` kept a list of keys and
 * ran scheduled transfers. The core keeps only key ids; the UI resolves keys
 * through secure storage at execution time.
 */
import type { TransferStep } from '../transfer/types.js';
import { buildMultiKeyTransfers } from '../transfer/multikey.js';

export interface SupConfig {
  chainId: number;
  keys: { address: string; keyId: string }[];
  recipient: string;
  amount: string;
  intervalMs: number;
  token?: { address: string; decimals: number; symbol?: string } | null;
}

export interface SupState {
  running: boolean;
  cycles: number;
  lastRunAt: number | null;
  lastError: string | null;
  pendingSteps: number;
}

export function initialSupState(): SupState {
  return { running: false, cycles: 0, lastRunAt: null, lastError: null, pendingSteps: 0 };
}

export function startSup(state: SupState): SupState {
  if (state.running) return state;
  return { ...state, running: true, lastError: null };
}

export function stopSup(state: SupState): SupState {
  return { ...state, running: false };
}

/** One cycle: build steps and hand them to the executor. */
export function buildSupCycle(
  config: SupConfig,
  executor: (step: TransferStep) => Promise<unknown>,
): Promise<{ built: number; failed: number }> {
  const steps = buildMultiKeyTransfers({
    chainId: config.chainId,
    keys: config.keys.map((k) => ({ address: k.address, keyId: k.keyId })),
    recipient: config.recipient,
    amount: config.amount,
    token: config.token ?? null,
  });
  return (async () => {
    let built = 0;
    let failed = 0;
    for (const step of steps) {
      try {
        await executor(step);
        built++;
      } catch {
        failed++;
      }
    }
    return { built, failed };
  })();
}

export function afterSupCycle(state: SupState, result: { built: number; failed: number }, now = Date.now()): SupState {
  return {
    ...state,
    cycles: state.cycles + 1,
    lastRunAt: now,
    lastError: result.failed > 0 ? `${result.failed} transfer(s) failed` : null,
  };
}

/** Interval guard: legacy clamp between 5 s and 24 h. */
export function clampSupInterval(ms: number): number {
  return Math.max(5_000, Math.min(24 * 60 * 60 * 1000, Math.trunc(ms)));
}
