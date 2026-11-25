import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  SwapEngine,
  SwapTransport,
  buildSwapTransaction,
  formatAmount,
  providerLabel,
  toWei,
  type EnrichedQuote,
  type SwapRequest,
  type Token,
} from '@nexus/core';
import { Badge, Button, Card, Empty, Field, Header, Pill, Row, Screen, SectionTitle, Sheet } from '../components/ui';
import { colors, font, spacing } from '../theme';
import { useWallet } from '../stores/wallet';
import { useApp } from '../stores/app';
import { executeTx, ensureAllowance, rpcFor } from '../utils/exec';
import { chainName } from './HomeScreen';

export function tokenInfo(t: Token) {
  return {
    address: t.isNative ? '' : t.contract,
    symbol: t.sub,
    name: t.name,
    decimals: t.decimals,
    priceUSD: t.cgId ? useWallet.getState().prices[t.cgId]?.usd ?? null : null,
  };
}

export function SwapScreen() {
  const { tokens, keys, chainId, prices, customChains, logHistory, refreshBalances } = useWallet();
  const settings = useApp((s) => s.settings);
  const showToast = useApp((s) => s.showToast);
  const log = useApp((s) => s.log);

  const allTokens = tokens();
  const chains = [...new Set(allTokens.map((t) => t.chainId))];
  const [chain, setChain] = useState(chainId ?? chains[0] ?? 8453);
  const chainTokens = allTokens.filter((t) => t.chainId === chain);
  const [from, setFrom] = useState<Token | null>(chainTokens.find((t) => t.isNative) ?? chainTokens[0] ?? null);
  const [to, setTo] = useState<Token | null>(chainTokens.find((t) => !t.isNative) ?? null);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [walletIndex, setWalletIndex] = useState(0);
  const [quoteSet, setQuoteSet] = useState<{ quotes: EnrichedQuote[]; errors: { provider: string; message: string }[] } | null>(null);
  const [selected, setSelected] = useState<EnrichedQuote | null>(null);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');
  const [error, setError] = useState('');

  const keyList = keys();
  const wallet = keyList[walletIndex];
  const balance = from
    ? useWallet.getState().balances[`${from.id}:${from.chainId}:${wallet?.address.toLowerCase() ?? ''}`] ?? 0
    : 0;

  const transport = useMemo(
    () => new SwapTransport({ proxyBaseUrl: settings.proxyBaseUrl || undefined }),
    [settings.proxyBaseUrl],
  );

  const request = (): SwapRequest | null => {
    if (!from || !to || !wallet) return null;
    const amountWei = toWei(amount, from.decimals);
    if (!amountWei) return null;
    const fromPrice = from.cgId ? prices[from.cgId]?.usd ?? 0 : 0;
    return {
      chainId: chain,
      fromToken: tokenInfo(from),
      toToken: tokenInfo(to),
      amountWei,
      userAddress: wallet.address,
      slippagePct: Number(slippage) || 0.5,
      fromUsdValue: fromPrice ? Number(amount) * fromPrice : undefined,
    };
  };

  const getQuotes = async () => {
    setError('');
    setHash('');
    const req = request();
    if (!req) {
      setError('Pick a wallet, tokens and an amount');
      return;
    }
    setBusy(true);
    try {
      const engine = new SwapEngine({ transport, gasPriceGwei: 1 });
      const set = await engine.quote(req);
      setQuoteSet({ quotes: set.quotes.slice(0, 6), errors: set.errors });
      setSelected(set.best);
      if (!set.quotes.length) setError('No route found from the reachable providers.');
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 200) : 'Quote failed');
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    const req = request();
    if (!req || !selected || !wallet) return;
    setBusy(true);
    setError('');
    try {
      let tx = { to: selected.to, data: selected.data, value: BigInt(selected.value || '0'), gasLimit: selected.gasLimit, allowanceTarget: null as string | null };
      if (selected.priceOnly) {
        const built = await buildSwapTransaction(selected, req, { transport });
        tx = { ...built, value: BigInt(built.value || '0') };
      }
      if (!req.fromToken.address) {
        // native input: value must cover the swap amount
        tx.value = req.amountWei;
      } else {
        await ensureAllowance({
          chainId: chain,
          privateKey: wallet.privateKey,
          token: req.fromToken.address,
          spender: tx.allowanceTarget || tx.to,
          amountWei: req.amountWei,
          customChains,
          onStatus: log,
        });
      }
      log(`[swap] sending via ${selected.providerLabel}…`);
      const sentHash = await executeTx({
        chainId: chain,
        privateKey: wallet.privateKey,
        to: tx.to,
        data: tx.data,
        value: tx.value,
        gasLimit: BigInt(tx.gasLimit),
        customChains,
        onStatus: log,
      });
      setHash(sentHash);
      logHistory({ type: 'swap', hash: sentHash, chainId: chain, provider: selected.provider, fromAmt: amount, fromToken: from?.sub, toToken: to?.sub });
      showToast('Swap submitted', 'success');
      void refreshBalances();
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 200) : 'Swap failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Swap" subtitle="Aggregated routes, exact legacy providers" />
      <SectionTitle>Network</SectionTitle>
      <View style={styles.pillRow}>
        {chains.map((c) => (
          <Pill
            key={c}
            label={chainName(c)}
            active={c === chain}
            onPress={() => {
              setChain(c);
              const ct = allTokens.filter((t) => t.chainId === c);
              setFrom(ct.find((t) => t.isNative) ?? ct[0] ?? null);
              setTo(ct.find((t) => !t.isNative) ?? null);
              setQuoteSet(null);
            }}
          />
        ))}
      </View>

      <Card>
        <Row label="From token" value={`${from?.sub ?? 'Select'} ▾`} onPress={() => setPicker('from')} />
        <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.0" />
        <Text style={styles.hint}>Balance ≈ {formatAmount(balance, 6)}</Text>
        <Row label="To token" value={`${to?.sub ?? 'Select'} ▾`} onPress={() => setPicker('to')} />
        <Field label="Slippage %" value={slippage} onChangeText={setSlippage} keyboardType="decimal-pad" />
        <Row label="Wallet" value={wallet ? `${wallet.address.slice(0, 8)}…` : 'none'} mono />
        {keys.length > 1 ? (
          <View style={styles.pillRow}>
            {keyList.map((k, i) => (
              <Pill key={k.address} label={`#${i + 1}`} active={i === walletIndex} onPress={() => setWalletIndex(i)} />
            ))}
          </View>
        ) : null}
      </Card>

      <Button label={busy ? 'Working…' : 'Get quotes'} loading={busy} onPress={getQuotes} />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {quoteSet ? (
        <>
          <SectionTitle>Routes</SectionTitle>
          {quoteSet.quotes.length === 0 ? <Empty text="No quotes." /> : null}
          {quoteSet.quotes.map((q, i) => (
            <Pressable key={`${q.provider}-${i}`} onPress={() => setSelected(q)}>
              <Card style={selected === q ? { borderColor: colors.primary } : undefined}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.route}>{q.providerLabel || providerLabel(q.provider)}</Text>
                  <Badge text={q.priceOnly ? 'ESTIMATE' : 'READY'} />
                </View>
                <Row label="Receive" value={formatAmount(Number(q.outputAmount), 6)} mono />
                {q.gasUsd != null ? <Row label="Gas" value={`$${q.gasUsd.toFixed(2)}`} /> : null}
                {q.priceImpactPct ? <Row label="Price impact" value={`${q.priceImpactPct.toFixed(2)}%`} /> : null}
              </Card>
            </Pressable>
          ))}
          <Button label={busy ? 'Submitting…' : 'Swap now'} loading={busy} disabled={!selected} onPress={execute} />
          {hash ? (
            <Card>
              <Text style={styles.success}>Submitted</Text>
              <Text style={styles.hash} selectable>{hash}</Text>
            </Card>
          ) : null}
          {quoteSet.errors.length ? (
            <Text style={styles.hint}>
              {quoteSet.errors.length} provider(s) failed: {quoteSet.errors.slice(0, 3).map((e) => e.provider).join(', ')}
            </Text>
          ) : null}
        </>
      ) : null}

      <Sheet visible={picker !== null} onClose={() => setPicker(null)} title={picker === 'from' ? 'From token' : 'To token'}>
        {chainTokens.map((t) => (
          <Row
            key={t.id}
            label={t.name}
            value={t.sub}
            onPress={() => {
              if (picker === 'from') setFrom(t);
              else setTo(t);
              setPicker(null);
              setQuoteSet(null);
            }}
          />
        ))}
      </Sheet>
      <Text style={styles.hint}>
        Provider keys stay in the proxy. Set a proxy base URL in Settings to unlock OKX/1inch/CMC-gated routes.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md, marginTop: spacing.sm },
  hint: { color: colors.faint, fontSize: font.tiny, lineHeight: 17 },
  error: { color: colors.red, fontSize: font.small, marginTop: spacing.sm },
  route: { color: colors.text, fontWeight: '700' },
  success: { color: colors.green, fontWeight: '700' },
  hash: { color: colors.muted, fontSize: 12, fontFamily: font.mono, marginTop: 4 },
});
