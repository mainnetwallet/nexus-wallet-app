import { isNativeAddress, NATIVE_EEEE, NATIVE_ZERO } from '../util/address.js';
import { decimalToHex, floatToWeiFloor } from '../util/units.js';
import type { BridgeQuote, BridgeRequest } from './providers.js';
import { RANGO_BRIDGE_CHAINS, RUBIC_CHAINS } from './providers.js';
import type { SwapTransport } from '../swap/types.js';

export interface BuiltBridgeTx {
  to: string;
  data: string;
  value: string;
  gasLimit: number;
  allowanceTarget: string | null;
  /** Provider request id used for status polling (Rango). */
  requestId?: string | null;
}

export interface BuildBridgeOptions {
  transport: SwapTransport;
  signal?: AbortSignal;
  now?: () => number;
}

function hexValue(raw: unknown, fallback: bigint = 0n): string {
  if (raw == null) return fallback === 0n ? '0x0' : decimalToHex(fallback);
  const s = String(raw).trim();
  if (!s || s === '0' || s === '0x0') return fallback === 0n ? '0x0' : decimalToHex(fallback);
  if (s.startsWith('0x')) return s;
  try {
    return decimalToHex(BigInt(s));
  } catch {
    return '0x0';
  }
}

function requireTx(to: unknown, data: unknown, label: string): { to: string; data: string } {
  if (!to || !data || data === '0x') throw new Error(`${label} TX build returned no calldata`);
  return { to: String(to), data: String(data) };
}

export async function buildBridgeTransaction(
  quote: BridgeQuote,
  req: BridgeRequest,
  opts: BuildBridgeOptions,
): Promise<BuiltBridgeTx> {
  const { transport } = opts;
  const ref = quote.quoteRef;

  switch (ref.kind) {
    case 'lifi-bridge': {
      const route = ref.payload as any;
      const step = route?.steps?.[0];
      if (!step) throw new Error('LiFi route has no steps');
      const injected = {
        ...step,
        action: {
          ...step.action,
          fromAddress: req.senderAddress,
          toAddress: req.recipientAddress || req.senderAddress,
        },
      };
      const json = await transport.json('https://li.quest/v1/advanced/stepTransaction', {
        method: 'POST',
        body: injected,
        secretKind: 'lifi',
        timeoutMs: 20_000,
        signal: opts.signal,
      });
      const tx = json?.transactionRequest ?? json?.steps?.[0]?.transactionRequest;
      const { to, data } = requireTx(tx?.to, tx?.data, 'LiFi');
      return {
        to,
        data,
        value: hexValue(tx?.value),
        gasLimit: Number(tx?.gasLimit) || 300000,
        allowanceTarget: tx?.approvalAddress ?? json?.estimate?.approvalAddress ?? to,
      };
    }

    case 'bungee': {
      const quoteId = String((ref.payload as any)?.quoteId ?? '');
      if (!quoteId) throw new Error('Bungee quote id missing');
      const json = await transport.json(`https://public-backend.bungee.exchange/api/v1/bungee/build-tx?quoteId=${encodeURIComponent(quoteId)}`, {
        timeoutMs: 15_000,
        signal: opts.signal,
      });
      const txData = json?.result?.txData;
      const { to, data } = requireTx(txData?.to, txData?.data, 'Bungee');
      return {
        to,
        data,
        value: hexValue(txData?.value, isNativeAddress(req.fromToken.address) ? req.amountWei : 0n),
        gasLimit: Number(txData?.gasLimit) || 300000,
        allowanceTarget: json?.result?.approvalData?.spenderAddress ?? json?.result?.approvalData?.allowanceTarget ?? to,
      };
    }

    case 'rango': {
      const route = ref.payload as any;
      const fromBC = RANGO_BRIDGE_CHAINS[req.fromChainId];
      const toBC = RANGO_BRIDGE_CHAINS[req.toChainId];
      if (!fromBC || !toBC) throw new Error('Rango: unsupported chain');
      const requestId = route?.requestId ?? quote.meta?.requestId;
      if (!requestId) throw new Error('Rango route has no requestId');
      const selectedWallets: Record<string, string> = { [fromBC]: req.senderAddress };
      selectedWallets[toBC] = req.recipientAddress || req.senderAddress;
      await transport.json('https://api.rango.exchange/routing/confirm', {
        method: 'POST',
        body: { requestId, selectedWallets, destination: req.recipientAddress || undefined },
        secretKind: 'rango',
        timeoutMs: 15_000,
        signal: opts.signal,
      });
      const created = await transport.json('https://api.rango.exchange/tx/create', {
        method: 'POST',
        body: {
          requestId,
          step: 1,
          userSettings: { slippage: String(req.slippagePct), infiniteApprove: false },
          validations: { balance: false, fee: false },
        },
        secretKind: 'rango',
        timeoutMs: 15_000,
        signal: opts.signal,
      });
      const tx = created?.transaction;
      if (!tx?.to) throw new Error('Rango did not return transaction data');
      return {
        to: tx.to,
        data: tx.data || '0x',
        value: hexValue(tx.value, isNativeAddress(req.fromToken.address) ? req.amountWei : 0n),
        gasLimit: Number(tx.gasLimit || tx.gas) || 300000,
        allowanceTarget: tx.approvalData?.approvalAddress ?? tx.approvalAddress ?? tx.to,
        requestId: String(requestId),
      };
    }

    case 'rubic': {
      const payload = ref.payload as any;
      const route = payload?.route;
      const fromBC = RUBIC_CHAINS[req.fromChainId];
      const toBC = RUBIC_CHAINS[req.toChainId];
      if (!fromBC || !toBC) throw new Error('Rubic: unsupported chain');
      const human = payload?.quoteHumanAmt ?? (Number(req.amountWei) / 10 ** (req.fromToken.decimals || 18)).toString();
      const json = await transport.json('https://api-v2.rubic.exchange/api/routes/swap', {
        method: 'POST',
        timeoutMs: 20_000,
        signal: opts.signal,
        body: {
          srcTokenAddress: isNativeAddress(req.fromToken.address) ? NATIVE_ZERO : req.fromToken.address,
          srcTokenBlockchain: fromBC,
          srcTokenAmount: human,
          dstTokenAddress: isNativeAddress(req.toToken.address) ? NATIVE_ZERO : req.toToken.address,
          dstTokenBlockchain: toBC,
          fromAddress: req.senderAddress,
          receiver: req.recipientAddress || req.senderAddress,
          referrer: 'NexusWallet',
          id: route?.id,
        },
      });
      const tx = json?.transaction;
      const { to, data } = requireTx(tx?.to, tx?.data, 'Rubic');
      const gasLimit = json?.fees?.gasTokenFees?.gas?.gasLimit;
      return {
        to,
        data,
        value: hexValue(tx?.value, isNativeAddress(req.fromToken.address) ? req.amountWei : 0n),
        gasLimit: Number(gasLimit) || 300000,
        allowanceTarget: tx?.approvalAddress ?? to,
      };
    }

    default:
      throw new Error('Unsupported bridge quote');
  }
}

export { NATIVE_EEEE, floatToWeiFloor };
