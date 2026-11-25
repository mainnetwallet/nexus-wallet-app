import { isNativeAddress, NATIVE_ZERO } from '../util/address.js';
import { decimalToHex } from '../util/units.js';
import { okxGet } from './providers/aggregators3.js';
import { OKX_CHAINS } from './providers/aggregators3.js';
import { RANGO_CHAIN, RANGO_NATIVE } from './providers/aggregators2.js';
import type { ProviderQuote, SwapRequest, SwapTransport } from './types.js';

export interface BuiltSwapTx {
  to: string;
  data: string;
  value: string;
  gasLimit: number;
  allowanceTarget: string | null;
}

export interface BuildSwapOptions {
  transport: SwapTransport;
  now?: () => number;
  signal?: AbortSignal;
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

export async function buildSwapTransaction(
  quote: ProviderQuote,
  req: SwapRequest,
  opts: BuildSwapOptions,
): Promise<BuiltSwapTx> {
  const { transport } = opts;
  const ref = quote.quoteRef;

  if (!ref) {
    const { to, data } = requireTx(quote.to, quote.data, quote.displayName);
    return {
      to,
      data,
      value: quote.value || '0x0',
      gasLimit: quote.gasLimit,
      allowanceTarget: quote.to,
    };
  }

  switch (ref.kind) {
    case 'lifi-step': {
      const step = JSON.parse(JSON.stringify(ref.payload));
      if (step.action) {
        step.action.fromAddress = req.userAddress;
        step.action.toAddress = req.userAddress;
        if (!step.action.fromAmount) step.action.fromAmount = req.amountWei.toString();
      }
      const json = await transport.json('https://li.quest/v1/advanced/stepTransaction', {
        method: 'POST',
        body: step,
        secretKind: 'lifi',
        timeoutMs: 12_000,
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
        timeoutMs: 10_000,
        signal: opts.signal,
      });
      const txData = json?.result?.txData;
      const { to, data } = requireTx(txData?.to, txData?.data, 'Bungee');
      const nativeValue = isNativeAddress(req.fromToken.address) ? req.amountWei : 0n;
      return {
        to,
        data,
        value: hexValue(txData?.value, nativeValue),
        gasLimit: 300000,
        allowanceTarget: json?.result?.approvalData?.spenderAddress ?? to,
      };
    }

    case 'rango': {
      const blockchain = RANGO_CHAIN[req.chainId];
      if (!blockchain) throw new Error('Rango: unsupported chain');
      const nativeSym = RANGO_NATIVE[req.chainId] || 'ETH';
      const fromSym = isNativeAddress(req.fromToken.address) ? nativeSym : req.fromToken.symbol;
      const toSym = isNativeAddress(req.toToken.address) ? nativeSym : req.toToken.symbol;
      const fromIsNative = isNativeAddress(req.fromToken.address);
      const toIsNative = isNativeAddress(req.toToken.address);
      const from = encodeURIComponent(fromIsNative ? `${blockchain}.${fromSym}` : `${blockchain}--${req.fromToken.address}`);
      const to = encodeURIComponent(toIsNative ? `${blockchain}.${toSym}` : `${blockchain}--${req.toToken.address}`);
      const params = new URLSearchParams({
        from,
        to,
        amount: req.amountWei.toString(),
        slippage: String(parseFloat(String(req.slippagePct))),
        fromAddress: req.userAddress,
        toAddress: req.userAddress,
        disableEstimate: 'true',
      });
      const json = await transport.json(`https://api.rango.exchange/basic/swap?${params}`, {
        secretKind: 'rango',
        timeoutMs: 12_000,
        signal: opts.signal,
      });
      if (json?.resultType !== 'OK' || !json?.tx?.txData) throw new Error(`Rango returned ${json?.resultType ?? 'no tx'}`);
      const { data } = requireTx(json.tx.txTo, json.tx.txData, 'Rango');
      return {
        to: json.tx.txTo,
        data,
        value: hexValue(json.tx.value),
        gasLimit: Number(json.tx.gasLimit) || 300000,
        allowanceTarget: json.tx?.approvalData?.approvalAddress ?? json.approvalData?.approvalAddress ?? json.tx.txTo,
      };
    }

    case 'velora-price': {
      const priceRoute = ref.payload as any;
      const body = {
        srcToken: priceRoute.srcToken,
        srcDecimals: priceRoute.srcDecimals ?? req.fromToken.decimals,
        destToken: priceRoute.destToken,
        destDecimals: priceRoute.destDecimals ?? req.toToken.decimals,
        srcAmount: req.amountWei.toString(),
        slippage: Math.round(req.slippagePct * 100),
        priceRoute,
        userAddress: req.userAddress,
        partner: 'nexus-wallet',
        deadline: Math.floor((opts.now?.() ?? Date.now()) / 1000) + 1800,
      };
      const json = await transport.json(`https://api.velora.xyz/transactions/${req.chainId}?ignoreGasEstimate=true`, {
        method: 'POST',
        body,
        timeoutMs: 12_000,
        signal: opts.signal,
      });
      const { to, data } = requireTx(json?.to, json?.data, 'Velora');
      return {
        to,
        data,
        value: hexValue(json?.value),
        gasLimit: Number(priceRoute.gasCost) || 300000,
        allowanceTarget: to,
      };
    }

    case 'okx-dex': {
      const ci = OKX_CHAINS[req.chainId];
      if (!ci) throw new Error('OKX DEX: unsupported chain');
      const payload = ref.payload as any;
      const fromAddr = isNativeAddress(req.fromToken.address)
        ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        : req.fromToken.address;
      const toAddr = isNativeAddress(req.toToken.address)
        ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        : req.toToken.address;
      const okxCtx = { transport, signal: opts.signal, now: opts.now };

      let approveAddr: string | null = null;
      if (isNativeAddress(req.fromToken.address) === false) {
        try {
          const approve = await okxGet(
            okxCtx,
            `/api/v6/dex/aggregator/approve-transaction?chainIndex=${ci}&tokenContractAddress=${fromAddr}&approveAmount=${req.amountWei.toString()}`,
          );
          approveAddr = approve?.data?.[0]?.dexContractAddress ?? null;
        } catch {
          approveAddr = null;
        }
      }

      const query = new URLSearchParams({
        chainIndex: ci,
        amount: req.amountWei.toString(),
        fromTokenAddress: fromAddr,
        toTokenAddress: toAddr,
        slippagePercent: String(req.slippagePct),
        userWalletAddress: req.userAddress,
        swapMode: 'exactIn',
      });
      if (payload?.dexId) query.set('dexIds', String(payload.dexId));
      const json = await okxGet(okxCtx, `/api/v6/dex/aggregator/swap?${query.toString()}`);
      const tx = json?.data?.[0]?.tx;
      if (!tx?.to || tx.to.toLowerCase() === NATIVE_ZERO || !tx?.data) {
        throw new Error(`OKX swap error: ${json?.msg ?? json?.code ?? 'no tx'}`);
      }
      return {
        to: tx.to,
        data: tx.data,
        value: hexValue(tx.value),
        gasLimit: tx.gas ? Number(tx.gas) : 350000,
        allowanceTarget: approveAddr ?? tx.to,
      };
    }

    default:
      throw new Error(`Execution builder missing for ${ref.kind}`);
  }
}
