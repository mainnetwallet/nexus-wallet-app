import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  NansenClient,
  SwapEngine,
  SwapTransport,
  afterSupCycle,
  bsbAfterCycle,
  buildDelegationTransaction,
  buildSupCycle,
  buildSwapTransaction,
  clampSupInterval,
  delegationFees,
  delegatedTarget,
  initialBsbState,
  initialSupState,
  isDelegatedCode,
  providerLabel,
  toSwapRequest,
  type BsbConfig,
  type BsbState,
  type EnrichedQuote,
  type SupConfig,
  type SupState,
  type Token,
} from '@nexus/core';
import { Badge, Button, Card, Empty, Field, Header, Pill, Row, Screen, SectionTitle } from '../components/ui';
import { colors, font, spacing } from '../theme';
import { useWallet } from '../stores/wallet';
import { useApp } from '../stores/app';
import { executeTx, ensureAllowance, rpcFor } from '../utils/exec';
import type { RootStackParamList } from '../navigation/types';
import { chainName } from './HomeScreen';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function useAutomation() {
  const keys = useWallet((s) => s.keys)();
  const chainId = useWallet((s) => s.chainId) ?? 8453;
  const customChains = useWallet((s) => s.customChains);
  const showToast = useApp((s) => s.showToast);
  const log = useApp((s) => s.log);
  return { keys, chainId, customChains, showToast, log };
}

export function SupTransferScreen() {
  const nav = useNavigation<Nav>();
  const { keys, chainId, customChains, showToast, log } = useAutomation();
  const [chain, setChain] = useState(chainId);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [intervalSec, setIntervalSec] = useState('60');
  const [state, setState] = useState<SupState>(initialSupState());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setState((s) => ({ ...s, running: false }));
  };

  useEffect(() => stop, []);

  const config = (): SupConfig => ({
    chainId: chain,
    keys: keys.map((k) => ({ address: k.address, keyId: k.address })),
    recipient: recipient.trim(),
    amount,
    intervalMs: clampSupInterval((Number(intervalSec) || 60) * 1000),
  });

  const runOnce = async () => {
    if (!keys.length) throw new Error('No keys in the active wallet');
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient.trim())) throw new Error('Enter a valid recipient address');
    const cfg = config();
    const result = await buildSupCycle(cfg, async (step) => {
      const key = keys.find((k) => k.address.toLowerCase() === step.from.toLowerCase());
      if (!key) throw new Error(`No key for ${step.from}`);
      return executeTx({
        chainId: step.chainId,
        privateKey: key.privateKey,
        to: step.to,
        data: step.data,
        value: step.value,
        customChains,
        onStatus: log,
      });
    });
    setState((s) => afterSupCycle(s, result));
    log(`[sup] cycle ${state.cycles + 1}: ${result.built} sent, ${result.failed} failed`);
    showToast(`SUP cycle: ${result.built} sent, ${result.failed} failed`, result.failed ? 'error' : 'success');
  };

  const start = async () => {
    setState((s) => ({ ...s, running: true }));
    const first = await runOnce().catch((err) => {
      showToast(err instanceof Error ? err.message : 'SUP failed', 'error');
      stop();
    });
    void first;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      void runOnce().catch((err) => {
        log(`[sup] ${err instanceof Error ? err.message : 'failed'}`);
      });
    }, config().intervalMs);
  };

  return (
    <Screen>
      <Header title="SUP Transfer" subtitle="Scheduled multi-key transfers" onBack={() => nav.goBack()} />
      <Card>
        <Text style={styles.note}>
          Distributes the same amount from every key in the active wallet to one recipient.
          Runs only while this screen is open (legacy also ran only in a live WebView).
        </Text>
      </Card>
      <SectionTitle>Network</SectionTitle>
      <View style={styles.pillRow}>
        {[8453, 1, 42161, 137].map((c) => (
          <Pill key={c} label={chainName(c)} active={c === chain} onPress={() => setChain(c)} />
        ))}
      </View>
      <Field label="Recipient" value={recipient} onChangeText={setRecipient} autoCapitalize="none" placeholder="0x…" />
      <Field label="Amount per key" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.001" />
      <Field label="Interval (seconds, 5 – 86400)" value={intervalSec} onChangeText={setIntervalSec} keyboardType="number-pad" />
      <Row label="Keys" value={String(keys.length)} />
      <Row label="Cycles run" value={String(state.cycles)} />
      {state.lastError ? <Text style={styles.error}>{state.lastError}</Text> : null}
      <View style={styles.rowGap}>
        <Button label={state.running ? 'Stop' : 'Start'} kind={state.running ? 'danger' : 'primary'} onPress={state.running ? stop : () => void start()} style={{ flex: 1 }} />
        <Button label="Run once" kind="ghost" onPress={() => void runOnce().catch((e) => showToast(e instanceof Error ? e.message : 'Failed', 'error'))} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

export function BaseSwapBotScreen() {
  const nav = useNavigation<Nav>();
  const { keys, customChains, showToast, log } = useAutomation();
  const tokens = useWallet((s) => s.tokens)();
  const settings = useApp((s) => s.settings);
  const [index, setIndex] = useState(0);
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('1');
  const [intervalSec, setIntervalSec] = useState('120');
  const [state, setState] = useState<BsbState>(initialBsbState());
  const [quote, setQuote] = useState<EnrichedQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const baseTokens = tokens.filter((t) => t.chainId === 8453);
  const wallet = keys[index];
  const from = fromToken ?? baseTokens.find((t) => t.isNative) ?? baseTokens[0] ?? null;
  const to = toToken ?? baseTokens.find((t) => !t.isNative && t.id !== from?.id) ?? null;
  const transport = useMemo(() => new SwapTransport({ proxyBaseUrl: settings.proxyBaseUrl || undefined }), [settings.proxyBaseUrl]);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setState((s) => ({ ...s, running: false }));
  };
  useEffect(() => stop, []);

  const config = (): BsbConfig | null => {
    if (!from || !to || !wallet) return null;
    return {
      enabled: true,
      chainId: 8453,
      fromToken: { address: from.isNative ? '0x0000000000000000000000000000000000000000' : from.contract, symbol: from.sub, decimals: from.decimals },
      toToken: { address: to.isNative ? '0x0000000000000000000000000000000000000000' : to.contract, symbol: to.sub, decimals: to.decimals },
      amount,
      intervalMs: Math.max(30_000, (Number(intervalSec) || 120) * 1000),
      slippagePct: Number(slippage) || 1,
      walletKeyId: wallet.address,
      userAddress: wallet.address,
    };
  };

  const cycle = async () => {
    const cfg = config();
    if (!cfg || !wallet) throw new Error('Pick tokens, a wallet and an amount');
    const req = toSwapRequest(cfg);
    const engine = new SwapEngine({ transport, gasPriceGwei: 1 });
    const set = await engine.quote(req);
    if (!set.best) throw new Error('No Base route found');
    const best = set.best;
    setQuote(best);
    let tx = { to: best.to, data: best.data, value: BigInt(best.value || '0'), gasLimit: best.gasLimit, allowanceTarget: null as string | null };
    if (best.priceOnly) {
      const built = await buildSwapTransaction(best, req, { transport });
      tx = { ...built, value: BigInt(built.value || '0') };
    }
    if (!req.fromToken.address || /^0x0{40}$/i.test(req.fromToken.address)) {
      tx.value = req.amountWei;
    } else {
      await ensureAllowance({
        chainId: 8453,
        privateKey: wallet.privateKey,
        token: req.fromToken.address,
        spender: tx.allowanceTarget || tx.to,
        amountWei: req.amountWei,
        customChains,
        onStatus: log,
      });
    }
    const hash = await executeTx({
      chainId: 8453,
      privateKey: wallet.privateKey,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      gasLimit: BigInt(tx.gasLimit),
      customChains,
      onStatus: log,
    });
    setState((s) => bsbAfterCycle(s, { quoteAt: Date.now(), txHash: hash }));
    log(`[bsb] ${providerLabel(best.provider)} ${hash.slice(0, 12)}…`);
    showToast('Base Swap Bot submitted a swap', 'success');
  };

  const start = () => {
    setState((s) => ({ ...s, running: true }));
    void cycle().catch((err) => {
      setState((s) => bsbAfterCycle(s, { error: err instanceof Error ? err.message : 'failed' }));
      stop();
    });
    timer.current = setInterval(() => {
      void cycle().catch((err) => {
        setState((s) => bsbAfterCycle(s, { error: err instanceof Error ? err.message : 'failed' }));
      });
    }, config()?.intervalMs ?? 120_000);
  };

  return (
    <Screen>
      <Header title="Base Swap Bot" subtitle="Repeating swaps on Base" onBack={() => nav.goBack()} />
      <SectionTitle>Wallet</SectionTitle>
      <View style={styles.pillRow}>
        {keys.slice(0, 6).map((k, i) => (
          <Pill key={k.address} label={`#${i + 1}`} active={i === index} onPress={() => setIndex(i)} />
        ))}
      </View>
      <SectionTitle>Pair (Base)</SectionTitle>
      <View style={styles.pillRow}>
        {baseTokens.slice(0, 8).map((t) => (
          <Pill key={`f-${t.id}`} label={`${t.sub}▸`} active={from?.id === t.id} onPress={() => setFromToken(t)} />
        ))}
      </View>
      <View style={styles.pillRow}>
        {baseTokens.slice(0, 8).map((t) => (
          <Pill key={`t-${t.id}`} label={t.sub} active={to?.id === t.id} onPress={() => setToToken(t)} />
        ))}
      </View>
      <Field label={`Amount (${from?.sub ?? '—'})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Field label="Slippage %" value={slippage} onChangeText={setSlippage} keyboardType="decimal-pad" />
      <Field label="Interval (seconds, min 30)" value={intervalSec} onChangeText={setIntervalSec} keyboardType="number-pad" />
      <Row label="Cycles" value={String(state.cycles)} />
      <Row label="Best source" value={quote ? providerLabel(quote.provider) : '—'} />
      <Row label="Last tx" value={state.lastTxHash ? `${state.lastTxHash.slice(0, 14)}…` : '—'} mono />
      {state.lastError ? <Text style={styles.error}>{state.lastError}</Text> : null}
      <View style={styles.rowGap}>
        <Button label={state.running ? 'Stop' : 'Start'} kind={state.running ? 'danger' : 'primary'} onPress={state.running ? stop : start} style={{ flex: 1 }} disabled={!from || !to || !wallet} />
        <Button
          label="Quote"
          kind="ghost"
          loading={busy}
          onPress={async () => {
            const cfg = config();
            if (!cfg) return;
            setBusy(true);
            try {
              const set = await new SwapEngine({ transport, gasPriceGwei: 1 }).quote(toSwapRequest(cfg));
              setQuote(set.best);
              if (!set.best) showToast('No route found', 'error');
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Quote failed', 'error');
            } finally {
              setBusy(false);
            }
          }}
          style={{ flex: 1 }}
        />
      </View>
    </Screen>
  );
}

export function NansenScreen() {
  const nav = useNavigation<Nav>();
  const settings = useApp((s) => s.settings);
  const showToast = useApp((s) => s.showToast);
  const keys = useWallet((s) => s.keys)();
  const [chain, setChain] = useState('ethereum');
  const [address, setAddress] = useState(keys[0]?.address ?? '');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (kind: 'holdings' | 'pnl' | 'flow') => {
    if (!settings.proxyBaseUrl) {
      showToast('Set the key proxy URL in Settings — Nansen keys never ship in the app', 'error');
      return;
    }
    setBusy(true);
    setResult('');
    try {
      const client = new NansenClient({ proxyBaseUrl: settings.proxyBaseUrl });
      const data =
        kind === 'holdings'
          ? await client.smartMoneyHoldings(chain, address)
          : kind === 'pnl'
            ? await client.walletPnl(chain, address)
            : await client.tokenFlow(chain, address);
      setResult(JSON.stringify(data, null, 2).slice(0, 8000));
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Nansen & Jumper" subtitle="On-chain analytics via the key proxy" onBack={() => nav.goBack()} />
      <Card>
        <Text style={styles.note}>
          Requests go through {settings.proxyBaseUrl || 'the proxy (not configured)'}. The Nansen API key stays on
          the proxy; this build never stores or ships a premium key.
        </Text>
      </Card>
      <Field label="Chain" value={chain} onChangeText={setChain} autoCapitalize="none" placeholder="ethereum" />
      <Field label="Address" value={address} onChangeText={setAddress} autoCapitalize="none" placeholder="0x…" />
      <View style={styles.rowGap}>
        <Button label="Holdings" onPress={() => void run('holdings')} loading={busy} style={{ flex: 1 }} />
        <Button label="PnL" kind="ghost" onPress={() => void run('pnl')} loading={busy} style={{ flex: 1 }} />
        <Button label="Flow" kind="ghost" onPress={() => void run('flow')} loading={busy} style={{ flex: 1 }} />
      </View>
      {result ? (
        <Card>
          <Text style={[styles.mono, { fontSize: font.tiny }]} selectable>
            {result}
          </Text>
        </Card>
      ) : (
        <Empty text="Run a query to see raw Nansen JSON." />
      )}
    </Screen>
  );
}

export function DelegationScreen() {
  const nav = useNavigation<Nav>();
  const { keys, customChains, showToast, log } = useAutomation();
  const [chainText, setChainText] = useState('8453');
  const [target, setTarget] = useState('');
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');
  const [status, setStatus] = useState('');
  const wallet = keys[index];
  const chain = Number(chainText) || 8453;

  const delegate = async () => {
    if (!wallet) {
      showToast('No key available', 'error');
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(target.trim())) {
      showToast('Enter the delegation contract address', 'error');
      return;
    }
    setBusy(true);
    setHash('');
    setStatus('');
    try {
      const rpc = rpcFor(chain, customChains);
      const [nonceHex, code, block] = await Promise.all([
        rpc.getTransactionCount(wallet.address),
        rpc.getCode(wallet.address),
        rpc.getBlock('latest'),
      ]);
      const baseFee = block?.baseFeePerGas ? BigInt(block.baseFeePerGas) : null;
      const gasPrice = baseFee ? null : BigInt(await rpc.gasPrice());
      const fees = delegationFees(chain, { baseFee, gasPrice });
      const alreadyInitialized = isDelegatedCode(code) && delegatedTarget(code)?.toLowerCase() === target.trim().toLowerCase();
      setStatus(`nonce ${BigInt(nonceHex).toString()} · ${alreadyInitialized ? 'initialized' : 'initialize()'}`);
      const tx = buildDelegationTransaction({
        privateKey: wallet.privateKey,
        chainId: chain,
        nonce: BigInt(nonceHex),
        delegationAddress: target.trim(),
        ownerAddress: wallet.address,
        fees,
        alreadyInitialized,
      });
      const sent = await rpc.sendRawTransaction(tx.rawTransaction);
      setHash(sent);
      log(`[7702] delegated ${wallet.address.slice(0, 8)}… → ${target.slice(0, 8)}…`);
      showToast('Delegation submitted', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 220) : 'Delegation failed';
      setStatus(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="EIP-7702 Delegation" subtitle="Type-0x04 authorization, exact legacy encoding" onBack={() => nav.goBack()} />
      <Card>
        <Text style={styles.note}>
          Signs an authorization tuple and sends a hand-encoded type-0x04 transaction with a
          350,000 gas limit. The delegation target is the contract you paste — no default is set.
        </Text>
      </Card>
      <SectionTitle>Signer</SectionTitle>
      <View style={styles.pillRow}>
        {keys.slice(0, 6).map((k, i) => (
          <Pill key={k.address} label={`#${i + 1}`} active={i === index} onPress={() => setIndex(i)} />
        ))}
      </View>
      <Field label="Chain ID" value={chainText} onChangeText={setChainText} keyboardType="number-pad" hint={chainName(chain)} />
      <Field label="Delegation contract" value={target} onChangeText={setTarget} autoCapitalize="none" placeholder="0x…" />
      {status ? <Text style={styles.status}>{status}</Text> : null}
      {hash ? <Badge text={`TX ${hash.slice(0, 14)}…`} color={colors.green} /> : null}
      <Button label="Sign & send delegation" onPress={() => void delegate()} loading={busy} disabled={!wallet} style={{ marginTop: spacing.md }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { color: colors.muted, fontSize: font.small, lineHeight: 19 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  rowGap: { flexDirection: 'row', gap: spacing.sm },
  error: { color: colors.red, fontSize: font.small, marginTop: spacing.sm },
  status: { color: colors.muted, fontSize: font.small, marginBottom: spacing.sm },
  mono: { color: colors.text, fontFamily: font.mono },
});
