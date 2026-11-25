import { isNativeAddress, NATIVE_EEEE, NATIVE_ZERO } from '../util/address.js';
import { floatToWeiFloor, fromWei } from '../util/units.js';
import type { ProviderContext, TokenInfo } from '../swap/types.js';

export interface BridgeRequest {
  fromChainId: number;
  toChainId: number;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  amountWei: bigint;
  senderAddress: string;
  recipientAddress: string;
  slippagePct: number;
}

export interface BridgeQuoteRef {
  kind: 'lifi-bridge' | 'bungee' | 'rango' | 'rubic';
  payload: unknown;
}

export interface BridgeQuote {
  provider: BridgeProviderId;
  displayName: string;
  outputWei: string;
  gasUsd: number | null;
  protocolFeeUsd: number | null;
  durationSec: number;
  routerLogoURI?: string | null;
  priceOnly: boolean;
  quoteRef: BridgeQuoteRef;
  meta?: Record<string, unknown>;
}

export type BridgeProviderId = 'lifi' | 'rubic' | 'rango' | 'bungee';

export interface BridgeProvider {
  readonly id: BridgeProviderId;
  readonly label: string;
  supports(fromChainId: number, toChainId: number): boolean;
  quote(req: BridgeRequest, ctx: ProviderContext): Promise<BridgeQuote[] | null>;
}

export const RANGO_BRIDGE_CHAINS: Record<number, string> = {
  1: 'ETH', 56: 'BSC', 137: 'POLYGON', 43114: 'AVAX_CCHAIN', 42161: 'ARBITRUM', 10: 'OPTIMISM',
  8453: 'BASE', 250: 'FANTOM', 100: 'GNOSIS', 59144: 'LINEA', 534352: 'SCROLL', 324: 'ZKSYNC',
  5000: 'MANTLE', 81457: 'BLAST', 130: 'UNICHAIN',
};

export const RUBIC_CHAINS: Record<number, string> = {
  1: 'ETH', 56: 'BSC', 137: 'POLYGON', 43114: 'AVALANCHE', 42161: 'ARBITRUM', 10: 'OPTIMISM',
  8453: 'BASE', 250: 'FANTOM', 100: 'GNOSIS', 59144: 'LINEA', 534352: 'SCROLL', 324: 'ZK_SYNC',
  5000: 'MANTLE', 81457: 'BLAST',
};

function humanAmount(amountWei: bigint, decimals: number): string {
  const raw = fromWei(amountWei, decimals || 18);
  return raw.includes('.') ? raw.replace(/0+$/, '').replace(/\.$/, '') : raw;
}

function lifiNative(token: TokenInfo): string {
  return isNativeAddress(token.address) ? NATIVE_ZERO : token.address;
}

export const lifiBridgeProvider: BridgeProvider = {
  id: 'lifi',
  label: 'LI.FI',
  supports: () => true,
  async quote(req, ctx) {
    const body: Record<string, unknown> = {
      fromChainId: req.fromChainId,
      toChainId: req.toChainId,
      fromTokenAddress: lifiNative(req.fromToken),
      toTokenAddress: lifiNative(req.toToken),
      fromAmount: req.amountWei.toString(),
      options: { slippage: req.slippagePct / 100, integrator: 'NexusWallet', order: 'RECOMMENDED' },
      fromAddress: req.senderAddress,
      toAddress: req.recipientAddress || req.senderAddress,
    };
    const json = await ctx.transport.json('https://li.quest/v1/advanced/routes', {
      method: 'POST',
      body,
      secretKind: 'lifi',
      timeoutMs: 20_000,
      signal: ctx.signal,
    });
    const routes: any[] = json?.routes ?? [];
    return routes.map((rt) => {
      const steps: any[] = rt.steps ?? [];
      const last = steps[steps.length - 1];
      const outputWei = String(rt.estimate?.toAmount ?? last?.estimate?.toAmount ?? last?.action?.toAmount ?? '0');
      const gasCosts: any[] = steps.flatMap((s) => s.estimate?.gasCosts ?? []);
      const gasUsd = gasCosts.reduce((sum, c) => sum + parseFloat(c?.amountUSD || '0'), 0);
      const feeCosts = [
        ...(rt.estimate?.feeCosts ?? []),
        ...(steps.flatMap((s) => s.estimate?.feeCosts ?? [])),
      ];
      const feeUsd = feeCosts.reduce((sum, f) => sum + parseFloat(f?.amountUSD || '0'), 0);
      const durationSec = steps.reduce((sum, s) => sum + Number(s.estimate?.executionDuration ?? 0), 0);
      const display = last?.toolDetails?.name || last?.tool || 'LiFi';
      return {
        provider: 'lifi' as const,
        displayName: display,
        outputWei,
        gasUsd: gasUsd > 0 ? gasUsd : null,
        protocolFeeUsd: feeUsd > 0 ? parseFloat(feeUsd.toFixed(4)) : 0,
        durationSec,
        routerLogoURI: last?.toolDetails?.logoURI ?? null,
        priceOnly: true,
        quoteRef: { kind: 'lifi-bridge' as const, payload: rt },
        meta: { steps: steps.length, tool: display },
      };
    }).filter((r) => r.outputWei !== '0');
  },
};

const RUBIC_TYPE_MAP: Record<string, string> = {
  uniswap_v3: 'Uniswap V3', uniswap_v2: 'Uniswap V2', uniswap: 'Uniswap', pancake_swap: 'PancakeSwap',
  sushi_swap: 'SushiSwap', sushiswap: 'SushiSwap', curve: 'Curve', balancer: 'Balancer',
  one_inch: '1inch', '1inch': '1inch', odos: 'Odos', paraswap: 'ParaSwap', openocean: 'OpenOcean',
  dodo: 'DODO', kyber_swap: 'KyberSwap', kyberswap: 'KyberSwap', aerodrome: 'Aerodrome',
  velodrome: 'Velodrome', camelot: 'Camelot', baseswap: 'BaseSwap', alienbase: 'AlienBase',
  trader_joe: 'Trader Joe', quickswap: 'QuickSwap', biswap: 'BiSwap', spookyswap: 'SpookySwap',
  lifi: 'LiFi', lifi_bridge: 'LiFi', symbiosis: 'Symbiosis', squidrouter: 'Squid Router',
  squid: 'Squid', celer_bridge: 'Celer Bridge', celer: 'Celer', rango: 'Rango',
  dln: 'DLN (deBridge)', debridge: 'deBridge', de_bridge: 'deBridge', bridgers: 'Bridgers',
  changenow: 'ChangeNow', orbiter_bridge: 'Orbiter', orbiter: 'Orbiter', meson: 'Meson',
  owl_to_bridge: 'Owlto', owlto: 'Owlto', arbitrum: 'Arbitrum Bridge', arbitrum_bridge: 'Arbitrum Bridge',
  stargate_v2: 'Stargate', stargate: 'Stargate', archon_bridge: 'Archon Bridge',
  pulsechain_bridge: 'PulseChain Bridge', router: 'Router Protocol', nitro: 'Router Nitro',
  across: 'Across', across_bridge: 'Across', relay: 'Relay', allbridge: 'Allbridge', hop: 'Hop',
  hop_bridge: 'Hop', connext: 'Connext', synapse: 'Synapse', multichain: 'Multichain',
  wormhole: 'Wormhole', layerzero: 'LayerZero', socket: 'Socket', mayan: 'Mayan', hyphen: 'Hyphen',
  rhino: 'Rhino.fi', xdefi: 'XDeFi', jumper: 'Jumper', retro_bridge: 'Retro Bridge',
  retrobridge: 'Retro Bridge', simpleswap: 'SimpleSwap', simple_swap: 'SimpleSwap',
  changelly: 'Changelly', quickex: 'Quickex', near_intents: 'NEAR Intents',
  wanchain_bridge: 'Wanchain', wanchain: 'Wanchain', teleswap: 'TeleSwap', tele_swap: 'TeleSwap',
  coral: 'Coral (Squid)', optimism_bridge: 'Optimism Bridge', polygon_bridge: 'Polygon Bridge',
  ronin_bridge: 'Ronin Bridge', rubic: 'Rubic',
};

const _BL = (slug: string) => `https://icons.llamao.fi/icons/protocols/${slug}?w=48&h=48`;
const _GF = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

const RUBIC_LOGO_MAP: Record<string, string> = {
  lifi: _GF('li.fi'), lifi_bridge: _GF('li.fi'), symbiosis: _BL('symbiosis'), squidrouter: _BL('squid'),
  squid: _BL('squid'), celer_bridge: _BL('celer-network'), celer: _BL('celer-network'), rango: _BL('rango'),
  dln: _BL('debridge'), debridge: _BL('debridge'), de_bridge: _BL('debridge'), across: _BL('across'),
  across_bridge: _BL('across'), relay: _GF('relay.link'), stargate_v2: _GF('stargate.finance'),
  stargate: _GF('stargate.finance'), hop: _BL('hop-protocol'), hop_bridge: _BL('hop-protocol'),
  connext: _BL('connext'), synapse: _BL('synapse'), multichain: _BL('multichain'), wormhole: _BL('wormhole'),
  layerzero: _BL('layerzero'), meson: _BL('meson'), allbridge: _BL('allbridge'), socket: _BL('socket'),
  mayan: _BL('mayan-finance'), router: _BL('router-protocol'), nitro: _BL('router-protocol'),
  orbiter_bridge: _BL('orbiter-finance'), orbiter: _BL('orbiter-finance'), owl_to_bridge: _BL('owlto'),
  owlto: _BL('owlto'), rubic: _BL('rubic'), rhino: _BL('rhino-fi'), jumper: _BL('jumper-exchange'),
  arbitrum: _GF('bridge.arbitrum.io'), arbitrum_bridge: _GF('bridge.arbitrum.io'),
  optimism_bridge: _GF('app.optimism.io'), polygon_bridge: _GF('wallet.polygon.technology'),
  pulsechain_bridge: _GF('bridge.pulsechain.com'), archon_bridge: _GF('archon.network'),
  ronin_bridge: _GF('bridge.roninchain.com'), changenow: _GF('changenow.io'), changelly: _GF('changelly.com'),
  quickex: _GF('quickex.io'), simpleswap: _GF('simpleswap.io'), simple_swap: _GF('simpleswap.io'),
  bridgers: _GF('bridgers.xyz'), retro_bridge: _GF('retrobridge.io'), retrobridge: _GF('retrobridge.io'),
  teleswap: _GF('teleswap.xyz'), tele_swap: _GF('teleswap.xyz'), near_intents: _GF('near.org'),
  coral: _BL('squid'), wanchain_bridge: _GF('wanchain.org'), wanchain: _GF('wanchain.org'),
};

function rubicProviderName(rt: any): string {
  const pt = rt?.providerType;
  if (typeof pt === 'string') {
    const lower = pt.toLowerCase().trim();
    if (lower && lower !== 'rubic') {
      return RUBIC_TYPE_MAP[pt] ?? RUBIC_TYPE_MAP[lower] ?? pt.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }
  const rp = rt?.routing?.[0]?.provider;
  if (typeof rp === 'string' && rp.toLowerCase() !== 'rubic') {
    return RUBIC_TYPE_MAP[rp] ?? RUBIC_TYPE_MAP[rp.toLowerCase()] ?? rp.charAt(0).toUpperCase() + rp.slice(1).toLowerCase();
  }
  const candidates = [rt?.bridgeType, rt?.tradeType, rt?.bridge, rt?.protocol, rt?.provider, rt?.steps?.[0]?.bridgeType, rt?.steps?.[0]?.provider];
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const stripped = raw.includes('.') ? raw.split('.').pop()! : raw;
    const lower = stripped.toLowerCase().trim();
    if (!lower || lower === 'rubic' || lower === 'cross_chain' || lower === 'on_chain') continue;
    const mapped = RUBIC_TYPE_MAP[stripped] ?? RUBIC_TYPE_MAP[lower];
    if (mapped) return mapped;
    return stripped.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return 'Rubic';
}

export const rubicBridgeProvider: BridgeProvider = {
  id: 'rubic',
  label: 'Rubic',
  supports: (from, to) => !!RUBIC_CHAINS[from] && !!RUBIC_CHAINS[to],
  async quote(req, ctx) {
    const fromBC = RUBIC_CHAINS[req.fromChainId];
    const toBC = RUBIC_CHAINS[req.toChainId];
    if (!fromBC || !toBC) return null;
    const amt = humanAmount(req.amountWei, req.fromToken.decimals || 18);
    const body: Record<string, unknown> = {
      srcTokenAddress: isNativeAddress(req.fromToken.address) ? NATIVE_ZERO : req.fromToken.address,
      srcTokenBlockchain: fromBC,
      srcTokenAmount: amt,
      dstTokenAddress: isNativeAddress(req.toToken.address) ? NATIVE_ZERO : req.toToken.address,
      dstTokenBlockchain: toBC,
      referrer: 'NexusWallet',
      validations: { balance: false, allowance: false },
      enableChecks: false,
    };
    if (req.senderAddress) body.fromAddress = req.senderAddress;
    if (req.recipientAddress) body.receiver = req.recipientAddress;
    const json = await ctx.transport.json('https://api-v2.rubic.exchange/api/routes/quoteAll', {
      method: 'POST',
      body,
      timeoutMs: 20_000,
      signal: ctx.signal,
    });
    const list: any[] = json?.trades || json?.routes || json?.data || [];
    const out: BridgeQuote[] = [];
    for (const rt of list) {
      const est = rt?.estimate || rt;
      let outputWei = '0';
      if (est?.destinationWeiAmount) outputWei = String(est.destinationWeiAmount);
      else if (est?.destinationTokenAmount) outputWei = floatToWeiFloor(Number(est.destinationTokenAmount), req.toToken.decimals || 18);
      if (!outputWei || outputWei === '0') continue;
      const fees = rt?.fees || {};
      const gtf = fees.gasTokenFees || {};
      const gasRaw = parseFloat(gtf.gas?.totalUsdAmount ?? '-1');
      const gasUsd = gasRaw > 0 ? gasRaw : null;
      const protoRubic = parseFloat(gtf.protocol?.fixedUsdAmount ?? '0');
      const protoProvider = parseFloat(gtf.provider?.fixedUsdAmount ?? '0');
      const pctFee = (fees.percentFees?.percent && est?.destinationUsdAmount)
        ? (parseFloat(fees.percentFees.percent) / 100 * parseFloat(est.destinationUsdAmount))
        : 0;
      const durationSec = est?.durationInMinutes ? Math.round(est.durationInMinutes * 60) : (Number(rt?.estimatedTime) || 60);
      const display = rubicProviderName(rt);
      const key = String(rt?.providerType || '').toLowerCase();
      out.push({
        provider: 'rubic',
        displayName: display,
        outputWei,
        gasUsd,
        protocolFeeUsd: protoRubic + protoProvider + pctFee,
        durationSec,
        routerLogoURI: RUBIC_LOGO_MAP[key] || RUBIC_LOGO_MAP[String(rt?.routing?.[0]?.provider || '').toLowerCase()] || null,
        priceOnly: true,
        quoteRef: { kind: 'rubic', payload: { route: rt, quoteHumanAmt: amt } },
        meta: { routeId: rt?.id ?? null, fetchedAt: (ctx.now?.() ?? Date.now()) },
      });
    }
    out.sort((a, b) => (BigInt(a.outputWei) > BigInt(b.outputWei) ? -1 : 1));
    return out.length ? out : null;
  },
};

export const rangoBridgeProvider: BridgeProvider = {
  id: 'rango',
  label: 'Rango',
  supports: (from, to) => !!RANGO_BRIDGE_CHAINS[from] && !!RANGO_BRIDGE_CHAINS[to],
  async quote(req, ctx) {
    const fromBC = RANGO_BRIDGE_CHAINS[req.fromChainId];
    const toBC = RANGO_BRIDGE_CHAINS[req.toChainId];
    if (!fromBC || !toBC) return null;
    const body: Record<string, unknown> = {
      from: {
        blockchain: fromBC,
        symbol: req.fromToken.symbol,
        address: isNativeAddress(req.fromToken.address) ? null : req.fromToken.address,
      },
      to: {
        blockchain: toBC,
        symbol: req.toToken.symbol,
        address: isNativeAddress(req.toToken.address) ? null : req.toToken.address,
      },
      amount: humanAmount(req.amountWei, req.fromToken.decimals || 18),
      slippage: String(req.slippagePct),
      checkPrerequisites: false,
    };
    if (req.senderAddress) {
      const wallets: Record<string, string> = { [fromBC]: req.senderAddress };
      if (toBC !== fromBC) wallets[toBC] = req.recipientAddress || req.senderAddress;
      body.selectedWallets = wallets;
    }
    const json = await ctx.transport.json('https://api.rango.exchange/routing/bests?limit=20', {
      method: 'POST',
      body,
      secretKind: 'rango',
      timeoutMs: 20_000,
      signal: ctx.signal,
    });
    const list: any[] = json?.results ?? [];
    const out: BridgeQuote[] = [];
    for (const rt of list) {
      const outputWei = floatToWeiFloor(Number(rt?.outputAmount || '0'), req.toToken.decimals || 18);
      if (!outputWei || outputWei === '0') continue;
      const swaps: any[] = rt?.swaps ?? [];
      let durationSec = swaps.reduce((sum, s) => sum + Number(s.estimatedTimeInSeconds || 0), 0);
      if (!durationSec) durationSec = Number(rt?.estimatedTimeInSeconds) || 120;
      const fees: any[] = (rt.fee && rt.fee.length) ? rt.fee : swaps.flatMap((s) => s.fee ?? []);
      let gasUsd = 0;
      let protoFee = 0;
      for (const f of fees) {
        const usd = parseFloat(f.amount || '0') * parseFloat(f.token?.usdPrice || f.price || '0');
        if (f.expenseType === 'FROM_SOURCE_WALLET') gasUsd += usd;
        else protoFee += usd;
      }
      if (gasUsd === 0 && protoFee === 0 && rt.feeUsd) gasUsd = parseFloat(rt.feeUsd);
      const swapper = swaps[0]?.swapperId || 'Rango';
      const display = swapper.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      out.push({
        provider: 'rango',
        displayName: display,
        outputWei,
        gasUsd: gasUsd > 0 ? gasUsd : null,
        protocolFeeUsd: protoFee > 0 ? parseFloat(protoFee.toFixed(4)) : 0,
        durationSec,
        routerLogoURI: swaps[0]?.swapperLogo || null,
        priceOnly: true,
        quoteRef: { kind: 'rango', payload: rt },
        meta: { requestId: rt.requestId ?? null },
      });
    }
    return out.length ? out : null;
  },
};

export const bungeeBridgeProvider: BridgeProvider = {
  id: 'bungee',
  label: 'Bungee',
  supports: () => true,
  async quote(req, ctx) {
    const fromAddr = isNativeAddress(req.fromToken.address) ? NATIVE_EEEE : req.fromToken.address;
    const toAddr = isNativeAddress(req.toToken.address) ? NATIVE_EEEE : req.toToken.address;
    if (!fromAddr || !toAddr || !req.senderAddress) return null;
    const params = new URLSearchParams({
      userAddress: req.senderAddress,
      receiverAddress: req.recipientAddress || req.senderAddress,
      originChainId: String(req.fromChainId),
      destinationChainId: String(req.toChainId),
      inputToken: fromAddr,
      outputToken: toAddr,
      inputAmount: req.amountWei.toString(),
      slippage: req.slippagePct.toFixed(1),
      enableManual: 'true',
      enableAuto: 'true',
    });
    const json = await ctx.transport.json(`https://public-backend.bungee.exchange/api/v1/bungee/quote?${params}`, {
      timeoutMs: 12_000,
      signal: ctx.signal,
    });
    const raw: any[] = [
      ...(json?.result?.manualRoutes ?? []),
      ...(json?.result?.autoRoutes ?? []),
    ];
    const out: BridgeQuote[] = [];
    const seen = new Set<string>();
    for (const rt of raw) {
      if (!rt?.quoteId) continue;
      const outputWei = String(rt.output?.amount ?? '0');
      if (outputWei === '0') continue;
      const name = rt.routeDetails?.name || 'Socket';
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({
        provider: 'bungee',
        displayName: name,
        outputWei,
        gasUsd: parseFloat(rt.gasFee?.feeInUsd || '0') || null,
        protocolFeeUsd: parseFloat(rt.routeDetails?.routeFee?.feeInUsd || '0') || 0,
        durationSec: parseInt(rt.estimatedTime || '0', 10) || 60,
        routerLogoURI: rt.userTxs?.[0]?.protocol?.icon || rt.routeDetails?.logoURI
          || 'https://raw.githubusercontent.com/SocketDotTech/socket-tech-mono/main/apps/socket-landing/public/logo.png',
        priceOnly: true,
        quoteRef: { kind: 'bungee', payload: { quoteId: rt.quoteId } },
        meta: { receiver: req.recipientAddress || req.senderAddress, fetchedAt: (ctx.now?.() ?? Date.now()) },
      });
    }
    return out.length ? out : null;
  },
};

export const BRIDGE_PROVIDERS: BridgeProvider[] = [
  lifiBridgeProvider, rubicBridgeProvider, rangoBridgeProvider, bungeeBridgeProvider,
];
