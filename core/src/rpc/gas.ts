import type { RpcClient } from './client.js';

export const GAS_BUFFER_MULTIPLIER = 1.12;
export const EIP1559_MAX_FEE_BOOST = 1.20;
export const EIP1559_PRIORITY_RATIO = 0.10;
export const LEGACY_BOOST_MULTIPLIER = 1.10;
export const MIN_PRIORITY_WEI = 1n;
export const MAX_RETRIES = 1;

export type GasMode = 'auto' | 'eip1559' | 'legacy';

export interface Eip1559Fees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasPrice: bigint;
}

export interface LegacyFees {
  gasPrice: bigint;
}

export interface SendStatusEvent {
  message: string;
  level: 'pending' | 'success' | 'error';
}

export interface TxSigner {
  address: string;
  sendTransaction(tx: Record<string, unknown>): Promise<{ hash: string }>;
}

export interface SendTxBase {
  to: string;
  data?: string;
  value?: bigint | string;
  chainId?: number;
  nonce?: number;
  gasLimit?: bigint;
}

export interface SendOptions {
  gasMode?: GasMode;
  gasLimitHint?: bigint;
  onStatus?: (event: SendStatusEvent) => void;
  signal?: AbortSignal;
}

export function ceilMultiply(value: bigint, factor: number): bigint {
  return BigInt(Math.ceil(Number(value) * factor));
}

async function fetchLiveGasPrice(rpc: RpcClient): Promise<bigint> {
  try {
    const hex = await rpc.gasPrice();
    const gp = BigInt(hex);
    if (gp > 0n) return gp;
  } catch {
    /* fall through */
  }
  const block = await rpc.getBlock('latest').catch(() => null);
  if (block?.baseFeePerGas) return BigInt(block.baseFeePerGas);
  throw new Error('RPC_GAS_FAIL: Could not fetch gas price from network. Check your RPC connection.');
}

export async function detectEip1559(rpc: RpcClient): Promise<boolean> {
  try {
    const block = await rpc.getBlock('latest');
    return block?.baseFeePerGas != null;
  } catch {
    return false;
  }
}

export async function buildEip1559Fees(rpc: RpcClient): Promise<Eip1559Fees> {
  const [block, priorityHex] = await Promise.all([
    rpc.getBlock('latest').catch(() => null),
    rpc.maxPriorityFeePerGas().catch(() => null),
  ]);

  let baseFee: bigint;
  let priorityFee: bigint;
  if (block?.baseFeePerGas && BigInt(block.baseFeePerGas) > 0n) {
    baseFee = BigInt(block.baseFeePerGas);
    const pf = priorityHex ? BigInt(priorityHex) : 0n;
    priorityFee = pf > 0n ? pf : 1_000_000n;
  } else {
    const gp = await fetchLiveGasPrice(rpc);
    baseFee = gp;
    priorityFee = BigInt(Math.floor(Number(gp) * EIP1559_PRIORITY_RATIO));
    if (priorityFee < MIN_PRIORITY_WEI) priorityFee = MIN_PRIORITY_WEI;
  }

  const effective = baseFee + priorityFee;
  const maxFeePerGas = BigInt(Math.ceil(Number(effective) * EIP1559_MAX_FEE_BOOST));
  let maxPriorityFeePerGas = priorityFee;
  if (maxPriorityFeePerGas < MIN_PRIORITY_WEI) maxPriorityFeePerGas = MIN_PRIORITY_WEI;
  if (maxPriorityFeePerGas > maxFeePerGas) maxPriorityFeePerGas = maxFeePerGas;
  return { maxFeePerGas, maxPriorityFeePerGas, gasPrice: effective };
}

export async function buildLegacyFees(rpc: RpcClient, boost = false): Promise<LegacyFees> {
  let gasPrice = await fetchLiveGasPrice(rpc);
  if (boost) gasPrice = BigInt(Math.ceil(Number(gasPrice) * LEGACY_BOOST_MULTIPLIER));
  return { gasPrice };
}

export async function estimateGasWithBuffer(
  rpc: RpcClient,
  tx: Record<string, unknown>,
  hint?: bigint,
  signal?: AbortSignal,
): Promise<bigint> {
  try {
    const est = await rpc.estimateGas(tx, { signal });
    return BigInt(Math.ceil(Number(BigInt(est)) * GAS_BUFFER_MULTIPLIER));
  } catch {
    const fallback = hint ?? (tx.gasLimit != null ? BigInt(tx.gasLimit as string) : 250_000n);
    return BigInt(Math.ceil(Number(fallback) * GAS_BUFFER_MULTIPLIER));
  }
}

export async function sendTransactionWithFallback(
  signer: TxSigner,
  rpc: RpcClient,
  txBase: SendTxBase,
  opts: SendOptions = {},
): Promise<{ hash: string }> {
  const status = (message: string, level: SendStatusEvent['level'] = 'pending') => opts.onStatus?.({ message, level });
  let tx: Record<string, unknown> = {
    to: txBase.to,
    data: txBase.data,
    value: txBase.value,
    ...(txBase.nonce !== undefined ? { nonce: txBase.nonce } : {}),
    ...(txBase.chainId !== undefined ? { chainId: txBase.chainId } : { chainId: rpc.chainId }),
  };
  const isEip1559 = await detectEip1559(rpc);
  const gasMode = opts.gasMode ?? 'auto';
  let attempt = 0;

  if (gasMode !== 'legacy' && (isEip1559 || gasMode === 'eip1559')) {
    try {
      status('⛽ Calculating gas…');
      const fees = await buildEip1559Fees(rpc);
      const gasLimit = await estimateGasWithBuffer(rpc, { ...tx, from: signer.address }, opts.gasLimitHint, opts.signal);
      status('⚡ Sending via EIP-1559…');
      const sent = await signer.sendTransaction({
        ...tx,
        type: 2,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        gasLimit,
      });
      status(`⏳ Transaction Submitted: ${sent.hash.slice(0, 18)}…`);
      return sent;
    } catch (err) {
      attempt++;
      if (attempt > MAX_RETRIES) throw err;
      const reason = (err instanceof Error ? err.message : String(err)).slice(0, 80);
      status(`⚠️ EIP-1559 failed (${reason}) — switching to Legacy…`);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  if (attempt > 0) {
    try {
      const freshNonce = await rpc.getTransactionCount(signer.address);
      tx = { ...tx, nonce: Number(BigInt(freshNonce)) };
    } catch {
      /* keep original nonce */
    }
  }

  status(attempt > 0 ? '🔄 EIP-1559 failed, switching to Legacy…' : '⛽ Calculating gas…');
  const fees = await buildLegacyFees(rpc, attempt > 0);
  const gasLimit = await estimateGasWithBuffer(rpc, { ...tx, from: signer.address }, opts.gasLimitHint, opts.signal);
  const sent = await signer.sendTransaction({ ...tx, type: 0, gasPrice: fees.gasPrice, gasLimit });
  status(`⏳ Transaction Submitted: ${sent.hash.slice(0, 18)}…`);
  return sent;
}

export function effectiveGasPriceGwei(fees: Eip1559Fees): number {
  return Number(fees.gasPrice) / 1e9;
}
