import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BridgeEngine,
  SwapTransport,
  buildBridgeTransaction,
  formatAmount,
  fromWei,
  toWei,
  type BridgeQuote,
  type BridgeRequest,
  type Token,
  type TokenInfo,
} from '@nexus/core';
import { Badge, Button, Card, Empty, Field, Header, Pill, Row, Screen, SectionTitle } from '../components/ui';
import { colors, font, spacing } from '../theme';
import { useWallet } from '../stores/wallet';
import { useApp } from '../stores/app';
import { executeTx, ensureAllowance } from '../utils/exec';
import { chainName } from './HomeScreen';

export function BridgeScreen() {
  const { tokens, keys, chainId, customChains, logHistory } = useWallet();
  const settings = useApp((s) => s.settings);
  const showToast = useApp((s) => s.showToast);
  const log = useApp((s) => s.log);

  const all = tokens();
  const chains = [...new Set(all.map((t) => t.chainId))];
  const [fromChain, setFromChain] = useState(chainId ?? 8453);
  const [toChain, setToChain] = useState(fromChain === 8453 ? 1 : 8453);
  const fromTokens = all.filter((t) => t.chainId === fromChain);
  const [fromToken, setFromToken] = useState<Token | null>(fromTokens.find((t) => t.isNative) ?? null);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [walletIndex, setWalletIndex] = useState(0);
  const [quotes, setQuotes] = useState<BridgeQuote[]>([]);
  const [selected, setSelected] = useState<BridgeQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hash, setHash] = useState('');

  const keyList = keys();
  const wallet = keyList[walletIndex];
  const transport = useMemo(
    () => new SwapTransport({ proxyBaseUrl: settings.proxyBaseUrl || undefined }),
    [settings.proxyBaseUrl],
  );
  const toChainToken = all.find((t) => t.chainId === toChain && t.isNative);
  const toToken: TokenInfo = {
    address: '',
    symbol: toChainToken?.sub ?? (toChain === 1 ? 'ETH' : 'ETH'),
    decimals: 18,
  };

  const request = (): BridgeRequest | null => {
    if (!fromToken || !wallet) return null;
    const amountWei = toWei(amount, fromToken.decimals);
    if (!amountWei) return null;
    return {
      fromChainId: fromChain,
      toChainId: toChain,
      fromToken: {
        address: fromToken.isNative ? '' : fromToken.contract,
        symbol: fromToken.sub,
        name: fromToken.name,
        decimals: fromToken.decimals,
      },
      toToken,
      amountWei,
      senderAddress: wallet.address,
      recipientAddress: wallet.address,
      slippagePct: Number(slippage) || 0.5,
    };
  };

  const quote = async () => {
    const req = request();
    if (!req) {
      setError('Pick a wallet, token and amount');
      return;
    }
    setBusy(true);
    setError('');
    setHash('');
    try {
      const engine = new BridgeEngine({ transport });
      const set = await engine.quote(req);
      setQuotes(set.quotes.slice(0, 5));
      setSelected(set.best);
      if (!set.quotes.length) setError('No bridge route found.');
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
      const built = await buildBridgeTransaction(selected, req, { transport });
      if (req.fromToken.address) {
        await ensureAllowance({
          chainId: fromChain,
          privateKey: wallet.privateKey,
          token: req.fromToken.address,
          spender: built.allowanceTarget || built.to,
          amountWei: req.amountWei,
          customChains,
          onStatus: log,
        });
      }
      const sent = await executeTx({
        chainId: fromChain,
        privateKey: wallet.privateKey,
        to: built.to,
        data: built.data,
        value: BigInt(built.value || '0'),
        gasLimit: BigInt(built.gasLimit),
        customChains,
        onStatus: log,
      });
      setHash(sent);
      logHistory({
        type: 'bridge',
        hash: sent,
        fromChainId: fromChain,
        toChainId: toChain,
        provider: selected.provider,
        fromAmt: amount,
        fromToken: fromToken?.sub,
        toToken: toToken.symbol,
      });
      showToast('Bridge submitted', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 220) : 'Bridge failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Bridge" subtitle="LiFi · Rango · Rubic · Bungee" />
      <SectionTitle>Route</SectionTitle>
      <Card>
        <Row label="From" value={`${chainName(fromChain)} ▾`} onPress={() => setFromChain(fromChain === 8453 ? 1 : 8453)} />
        <Row label="To" value={`${chainName(toChain)} ▾`} onPress={() => setToChain(toChain === 1 ? 42161 : 1)} />
        <Row label="Token" value={`${fromToken?.sub ?? 'Select'} (native)`} />
        <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.0" />
        <Field label="Slippage %" value={slippage} onChangeText={setSlippage} keyboardType="decimal-pad" />
        <Row label="Wallet" value={wallet?.address.slice(0, 10) ?? 'none'} mono />
        {keyList.length > 1 ? (
          <View style={styles.pillRow}>
            {keyList.map((k, i) => (
              <Pill key={k.address} label={`#${i + 1}`} active={i === walletIndex} onPress={() => setWalletIndex(i)} />
            ))}
          </View>
        ) : null}
      </Card>
      <Button label={busy ? 'Working…' : 'Find routes'} loading={busy} onPress={quote} />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {quotes.length ? (
        <>
          <SectionTitle>Routes</SectionTitle>
          {quotes.map((q, i) => (
            <Pressable key={`${q.provider}-${i}`} onPress={() => setSelected(q)}>
              <Card style={selected === q ? { borderColor: colors.primary } : undefined}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.route}>{q.displayName}</Text>
                  <Badge text={`${Math.round(q.durationSec / 60) || 1} min`} color={colors.cyan} />
                </View>
                <Row label="Receive" value={formatAmount(Number(fromWei(q.outputWei, toToken.decimals)), 6)} mono />
                {q.gasUsd != null ? <Row label="Gas" value={`$${q.gasUsd.toFixed(2)}`} /> : null}
                {q.protocolFeeUsd ? <Row label="Fee" value={`$${q.protocolFeeUsd.toFixed(2)}`} /> : null}
              </Card>
            </Pressable>
          ))}
          <Button label={busy ? 'Submitting…' : 'Bridge now'} loading={busy} disabled={!selected} onPress={execute} />
          {hash ? (
            <Card>
              <Text style={styles.success}>Submitted</Text>
              <Text style={styles.hash} selectable>{hash}</Text>
            </Card>
          ) : null}
        </>
      ) : null}
      <Text style={styles.hint}>Destination tracking uses the provider explorer; bridge history is capped at 15 like the legacy app.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.sm },
  hint: { color: colors.faint, fontSize: font.tiny, lineHeight: 17 },
  error: { color: colors.red, fontSize: font.small, marginTop: spacing.sm },
  route: { color: colors.text, fontWeight: '700' },
  success: { color: colors.green, fontWeight: '700' },
  hash: { color: colors.muted, fontSize: 12, fontFamily: font.mono, marginTop: 4 },
});
