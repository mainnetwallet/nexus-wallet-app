import { Wallet } from 'ethers';
import {
  RpcClient,
  encodeApprove,
  getRpcListForChain,
  readAllowance,
  sendTransactionWithFallback,
  type CustomChainDef,
} from '@nexus/core';
import { prefs } from '../storage/prefs';

export function rpcFor(chainId: number, customChains: CustomChainDef[] = []): RpcClient {
  return new RpcClient({ chainId, urls: getRpcListForChain(chainId, prefs, customChains) });
}

export function signerFor(privateKey: string, rpc: RpcClient) {
  const wallet = new Wallet(privateKey);
  return {
    address: wallet.address,
    async sendTransaction(tx: Record<string, unknown>) {
      const raw = await wallet.signTransaction(tx as Parameters<typeof wallet.signTransaction>[0]);
      const hash = await rpc.sendRawTransaction(raw);
      return { hash };
    },
  };
}

export async function executeTx(opts: {
  chainId: number;
  privateKey: string;
  to: string;
  data?: string;
  value?: bigint;
  gasLimit?: bigint;
  customChains?: CustomChainDef[];
  onStatus?: (message: string) => void;
}): Promise<string> {
  const rpc = rpcFor(opts.chainId, opts.customChains);
  const signer = signerFor(opts.privateKey, rpc);
  const sent = await sendTransactionWithFallback(
    signer,
    rpc,
    { to: opts.to, data: opts.data, value: opts.value ?? 0n, chainId: opts.chainId },
    {
      gasLimitHint: opts.gasLimit,
      onStatus: (e) => opts.onStatus?.(e.message),
    },
  );
  return sent.hash;
}

/** Approves `spender` when the current allowance is below `amountWei`. */
export async function ensureAllowance(opts: {
  chainId: number;
  privateKey: string;
  token: string;
  spender: string;
  amountWei: bigint;
  customChains?: CustomChainDef[];
  onStatus?: (message: string) => void;
}): Promise<string | null> {
  if (!opts.token || opts.token.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return null;
  const rpc = rpcFor(opts.chainId, opts.customChains);
  const owner = new Wallet(opts.privateKey).address;
  let allowance = 0n;
  try {
    allowance = await readAllowance(rpc, opts.token, owner, opts.spender);
  } catch {
    allowance = 0n;
  }
  if (allowance >= opts.amountWei) return null;
  opts.onStatus?.('Approving token…');
  return executeTx({
    chainId: opts.chainId,
    privateKey: opts.privateKey,
    to: opts.token,
    data: encodeApprove(opts.spender, opts.amountWei),
    customChains: opts.customChains,
    onStatus: opts.onStatus,
  });
}
