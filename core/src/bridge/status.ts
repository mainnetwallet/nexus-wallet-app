import type { SwapTransport } from '../swap/types.js';

export type BridgeState = 'pending' | 'success' | 'failed';

export interface BridgeStatusResult {
  state: BridgeState;
  destTxHash: string | null;
  raw?: unknown;
}

export interface BridgeStatusOptions {
  provider: string;
  txHash: string;
  transport: SwapTransport;
  requestId?: string | null;
  fromChainId?: number;
  toChainId?: number;
  signal?: AbortSignal;
}

function rangoDestHash(data: any): string | null {
  const direct = data?.bridgeData?.destTxHash || data?.bridgeExtra?.destTx || null;
  if (direct) return direct;
  const fromExplorer = (list: any[]): string | null => {
    if (!Array.isArray(list) || !list.length) return null;
    const de = list.find((e) => typeof e?.description === 'string' && /outbound|dest/i.test(e.description)) || list[list.length - 1];
    const cand = typeof de?.url === 'string' ? de.url.split('/').pop() : null;
    return cand && cand.startsWith('0x') && cand.length >= 42 ? cand : null;
  };
  const top = fromExplorer(data?.explorerUrl);
  if (top) return top;
  const steps: any[] = Array.isArray(data?.steps) ? data.steps : [];
  const last = steps[steps.length - 1];
  const stepHash = last?.outputTx || last?.destTxHash || last?.destinationTxHash || null;
  if (stepHash) return stepHash;
  return fromExplorer(last?.explorerUrl);
}

export async function checkBridgeStatus(opts: BridgeStatusOptions): Promise<BridgeStatusResult | null> {
  const provider = (opts.provider || '').toLowerCase();
  try {
    if (provider === 'lifi') {
      const params = new URLSearchParams({ txHash: opts.txHash });
      if (opts.fromChainId) params.set('fromChain', String(opts.fromChainId));
      if (opts.toChainId) params.set('toChain', String(opts.toChainId));
      const data = await opts.transport.json(`https://li.quest/v1/status?${params}`, {
        secretKind: 'lifi',
        timeoutMs: 8_000,
        signal: opts.signal,
      });
      const st = String(data?.status || '').toUpperCase();
      const sub = String(data?.substatus || '').toUpperCase();
      const recv = data?.receiving?.txHash || data?.toTxHash || data?.destinationTxHash || null;
      if (st === 'DONE' || sub === 'COMPLETED' || sub === 'PARTIAL') return { state: 'success', destTxHash: recv, raw: data };
      if (st === 'FAILED') return { state: 'failed', destTxHash: null, raw: data };
      return { state: 'pending', destTxHash: null, raw: data };
    }

    if (provider === 'rubic') {
      const data = await opts.transport.json(`https://api-v2.rubic.exchange/api/info/status?srcTxHash=${encodeURIComponent(opts.txHash)}`, {
        timeoutMs: 8_000,
        signal: opts.signal,
      });
      const st = String(data?.status || '').toUpperCase();
      if (st === 'SUCCESS') return { state: 'success', destTxHash: data?.destinationTxHash ?? null, raw: data };
      if (st === 'FAIL' || st === 'REVERT' || st === 'REVERTED') return { state: 'failed', destTxHash: null, raw: data };
      return { state: 'pending', destTxHash: null, raw: data };
    }

    if (provider === 'rango') {
      const params = new URLSearchParams({ txId: opts.txHash });
      if (opts.requestId) params.set('requestId', opts.requestId);
      const data = await opts.transport.json(`https://api.rango.exchange/basic/status?${params}`, {
        secretKind: 'rango',
        timeoutMs: 8_000,
        signal: opts.signal,
      });
      const st = String(data?.status || '').toUpperCase();
      if (st === 'SUCCESS') return { state: 'success', destTxHash: rangoDestHash(data), raw: data };
      if (st === 'FAILED') return { state: 'failed', destTxHash: null, raw: data };
      return { state: 'pending', destTxHash: null, raw: data };
    }
  } catch {
    return null;
  }
  return null;
}
