import { describe, expect, it } from '@jest/globals';
import { RpcClient, RpcError } from '../src/rpc/client.js';
import {
  buildEip1559Fees, buildLegacyFees, detectEip1559, estimateGasWithBuffer,
  sendTransactionWithFallback, EIP1559_MAX_FEE_BOOST, LEGACY_BOOST_MULTIPLIER,
} from '../src/rpc/gas.js';

interface Call { url: string; body: any }

function rpcFetch(handler: (method: string, params: any[], call: Call) => { http?: number; result?: unknown; error?: unknown } | 'network') {
  const calls: Call[] = [];
  const impl = async (url: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body));
    const call = { url, body };
    calls.push(call);
    const out = handler(body.method, body.params, call);
    if (out === 'network') throw new Error('network down');
    const http = out.http ?? 200;
    const payload = out.error !== undefined
      ? { jsonrpc: '2.0', id: body.id, error: out.error }
      : { jsonrpc: '2.0', id: body.id, result: out.result };
    return { ok: http >= 200 && http < 300, status: http, json: async () => payload, text: async () => JSON.stringify(payload) } as unknown as Response;
  };
  return { impl, calls };
}

const URL_A = 'https://a.example/rpc';
const URL_B = 'https://b.example/rpc';

describe('RpcClient failover', () => {
  it('rotates to the next endpoint after an HTTP failure', async () => {
    const { impl, calls } = rpcFetch((method, _p, call) => {
      if (call.url === URL_A) return { http: 500, error: { code: -1, message: 'down' } };
      return { result: '0x10' };
    });
    const rpc = new RpcClient({ chainId: 8453, urls: [URL_A, URL_B], fetchImpl: impl });
    const balance = await rpc.getBalance('0xabc');
    expect(balance).toBe('0x10');
    expect(calls.map((c) => c.url)).toEqual([URL_A, URL_B]);
  });

  it('does not rotate on a deterministic JSON-RPC error', async () => {
    const { impl, calls } = rpcFetch(() => ({ error: { code: 3, message: 'execution reverted' } }));
    const rpc = new RpcClient({ chainId: 8453, urls: [URL_A, URL_B], fetchImpl: impl });
    await expect(rpc.call({ to: '0x1', data: '0x' })).rejects.toBeInstanceOf(RpcError);
    expect(calls).toHaveLength(1);
  });

  it('throws when no endpoints are configured', async () => {
    const rpc = new RpcClient({ chainId: 1, urls: [] });
    await expect(rpc.gasPrice()).rejects.toThrow(/No RPC endpoints/);
  });

  it('hex-encodes estimateGas transaction fields', async () => {
    const { impl, calls } = rpcFetch(() => ({ result: '0x5208' }));
    const rpc = new RpcClient({ chainId: 8453, urls: [URL_A], fetchImpl: impl });
    await rpc.estimateGas({ to: '0xabc', value: 1000n, gasLimit: 21000, data: '0x' });
    expect(calls[0]!.body.params[0]).toEqual({ to: '0xabc', value: '0x3e8', gas: '0x5208', data: '0x' });
  });
});

describe('NexusGas v3 math', () => {
  it('builds EIP-1559 fees from base fee and priority with 20% headroom', async () => {
    const base = 10_000_000_000n;
    const priority = 1_500_000_000n;
    const { impl } = rpcFetch((method) => {
      if (method === 'eth_getBlockByNumber') return { result: { baseFeePerGas: `0x${base.toString(16)}` } };
      if (method === 'eth_maxPriorityFeePerGas') return { result: `0x${priority.toString(16)}` };
      return { result: '0x0' };
    });
    const rpc = new RpcClient({ chainId: 8453, urls: [URL_A], fetchImpl: impl });
    const fees = await buildEip1559Fees(rpc);
    const effective = base + priority;
    expect(fees.gasPrice).toBe(effective);
    expect(fees.maxFeePerGas).toBe(BigInt(Math.ceil(Number(effective) * EIP1559_MAX_FEE_BOOST)));
    expect(fees.maxPriorityFeePerGas).toBe(priority);
    expect(await detectEip1559(rpc)).toBe(true);
  });

  it('falls back to eth_gasPrice with a 10% priority when base fee is missing', async () => {
    const { impl } = rpcFetch((method) => {
      if (method === 'eth_getBlockByNumber') return { result: { number: '0x1' } };
      if (method === 'eth_maxPriorityFeePerGas') return { error: { code: -32601, message: 'unsupported' } };
      if (method === 'eth_gasPrice') return { result: '0x2540be400' }; // 10 gwei
      return { result: '0x0' };
    });
    const rpc = new RpcClient({ chainId: 56, urls: [URL_A], fetchImpl: impl });
    const fees = await buildEip1559Fees(rpc);
    expect(fees.gasPrice).toBe(11_000_000_000n);
    expect(await detectEip1559(rpc)).toBe(false);
  });

  it('boosts legacy gas price by 10% only on retry', async () => {
    const { impl } = rpcFetch(() => ({ result: '0x3b9aca00' })); // 1 gwei
    const rpc = new RpcClient({ chainId: 1, urls: [URL_A], fetchImpl: impl });
    expect((await buildLegacyFees(rpc)).gasPrice).toBe(1_000_000_000n);
    expect((await buildLegacyFees(rpc, true)).gasPrice).toBe(BigInt(Math.ceil(1_000_000_000 * LEGACY_BOOST_MULTIPLIER)));
  });

  it('buffers estimateGas by 12% and falls back to the hint', async () => {
    const ok = rpcFetch(() => ({ result: '0x186a0' })); // 100000
    const rpcOk = new RpcClient({ chainId: 1, urls: [URL_A], fetchImpl: ok.impl });
    // Legacy does BigInt(Math.ceil(Number(est) * 1.12)); float rounding yields +1 wei.
    expect(await estimateGasWithBuffer(rpcOk, { to: '0x1' })).toBe(112_001n);

    const bad = rpcFetch(() => ({ error: { code: 3, message: 'revert' } }));
    const rpcBad = new RpcClient({ chainId: 1, urls: [URL_A], fetchImpl: bad.impl });
    expect(await estimateGasWithBuffer(rpcBad, { to: '0x1' }, 200_000n)).toBe(224_001n);
  });
});

describe('sendTransactionWithFallback', () => {
  it('retries once with legacy fees, refreshed nonce and boosted gas', async () => {
    let nonceReads = 0;
    const { impl } = rpcFetch((method) => {
      if (method === 'eth_getBlockByNumber') return { result: { baseFeePerGas: '0x3b9aca00' } };
      if (method === 'eth_maxPriorityFeePerGas') return { result: '0x3b9aca00' };
      if (method === 'eth_estimateGas') return { result: '0x186a0' };
      if (method === 'eth_getTransactionCount') { nonceReads++; return { result: '0x5' }; }
      if (method === 'eth_gasPrice') return { result: '0x77359400' }; // 2 gwei
      return { result: '0x0' };
    });
    const rpc = new RpcClient({ chainId: 8453, urls: [URL_A], fetchImpl: impl });
    const sent: any[] = [];
    const statuses: string[] = [];
    const signer = {
      address: '0x1111111111111111111111111111111111111111',
      sendTransaction: async (tx: any) => {
        sent.push(tx);
        if (sent.length === 1) throw new Error('eip1559 not supported');
        return { hash: '0xdeadbeefdeadbeefdeadbeef' };
      },
    };
    const result = await sendTransactionWithFallback(signer, rpc, { to: '0x2222222222222222222222222222222222222222', value: 0n }, {
      onStatus: (e) => statuses.push(e.message),
      gasLimitHint: 100000n,
    });
    expect(result.hash).toContain('0xdeadbeef');
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ type: 2 });
    expect(sent[1]).toMatchObject({ type: 0, nonce: 5, gasPrice: BigInt(Math.ceil(2_000_000_000 * LEGACY_BOOST_MULTIPLIER)) });
    expect(nonceReads).toBe(1);
    expect(statuses.some((s) => s.includes('switching to Legacy'))).toBe(true);
  });

  it('uses legacy directly when gas mode is forced', async () => {
    const { impl } = rpcFetch((method) => {
      if (method === 'eth_gasPrice') return { result: '0x3b9aca00' };
      if (method === 'eth_estimateGas') return { result: '0x5208' };
      if (method === 'eth_getBlockByNumber') return { result: { baseFeePerGas: '0x1' } };
      return { result: '0x0' };
    });
    const rpc = new RpcClient({ chainId: 1, urls: [URL_A], fetchImpl: impl });
    const sent: any[] = [];
    await sendTransactionWithFallback(
      { address: '0x1', sendTransaction: async (tx: any) => { sent.push(tx); return { hash: '0xh' }; } },
      rpc,
      { to: '0x2' },
      { gasMode: 'legacy' },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe(0);
    expect(sent[0].gasPrice).toBe(1_000_000_000n);
  });
});
