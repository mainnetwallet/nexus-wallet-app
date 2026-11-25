import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import {
  RpcClient,
  TokenStore,
  TxHistoryStore,
  formatAmount,
  formatUsd,
  getRpcListForChain,
  readTokenMeta,
  shortAddress,
  type Token,
} from '@nexus/core';
import { Badge, Button, Card, Empty, Field, Header, Pill, Row, Screen, SectionTitle, Sheet } from '../components/ui';
import { colors, font, spacing } from '../theme';
import { useWallet } from '../stores/wallet';
import { useApp } from '../stores/app';
import { copySecret, setSecureFlag, setOrientation } from '../native/bridge';
import { prefs } from '../storage/prefs';
import type { RootStackParamList } from '../navigation/types';
import { chainName } from './HomeScreen';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SendScreen() {
  const nav = useNavigation<Nav>();
  const keys = useWallet((s) => s.keys)();
  const groups = useWallet((s) => s.groups);
  const chainId = useWallet((s) => s.chainId);
  const send = useWallet((s) => s.send);
  const tokens = useWallet((s) => s.tokens)();
  const customChains = useWallet((s) => s.customChains);
  const showToast = useApp((s) => s.showToast);

  const [fromIndex, setFromIndex] = useState(0);
  const [chain, setChain] = useState(chainId ?? 8453);
  const [token, setToken] = useState<Token | null>(tokens.find((t) => t.chainId === chain && t.isNative) ?? tokens[0] ?? null);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [tokenSheet, setTokenSheet] = useState(false);

  useEffect(() => {
    void setSecureFlag(true);
    return () => {
      void setSecureFlag(false);
    };
  }, []);

  const chains = useMemo(
    () => [...new Set(tokens.map((t) => t.chainId))],
    [tokens],
  );
  const chainTokens = tokens.filter((t) => t.chainId === chain);
  const from = keys[fromIndex];

  const doSend = async () => {
    setErr('');
    if (!from) return setErr('No wallet available');
    if (!/^0x[0-9a-fA-F]{40}$/.test(to.trim())) return setErr('Recipient must be a 0x address');
    if (!token) return setErr('Select a token');
    setBusy(true);
    try {
      const res = await send({
        chainId: chain,
        privateKey: from.privateKey,
        to: to.trim(),
        amount,
        token: token.isNative ? null : { contract: token.contract, decimals: token.decimals, symbol: token.sub },
      });
      if (!res.ok) setErr(res.error ?? 'Send failed');
      else {
        setResult(res.hash ?? null);
        showToast('Transaction submitted', 'success');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Send" subtitle={groups.find((g) => g.id === from?.groupId)?.name} onBack={() => nav.goBack()} />
      <SectionTitle>From</SectionTitle>
      {keys.map((k, i) => (
        <Row
          key={k.privateKey.slice(-12) + i}
          label={k.address === from?.address ? `● ${shortAddress(k.address)}` : shortAddress(k.address)}
          value={`wallet ${i + 1}`}
          mono
          onPress={() => setFromIndex(i)}
        />
      ))}
      {!keys.length ? <Empty text="Add a wallet first." /> : null}

      <SectionTitle>Network & token</SectionTitle>
      <View style={styles.pillRow}>
        {chains.map((c) => (
          <Pill
            key={c}
            label={chainName(c)}
            active={c === chain}
            onPress={() => {
              setChain(c);
              setToken(tokens.find((t) => t.chainId === c && t.isNative) ?? null);
            }}
          />
        ))}
      </View>
      <Row label="Token" value={`${token?.sub ?? 'Select'} ▾`} onPress={() => setTokenSheet(true)} />
      <Row label="Available" value={formatAmount(balanceOf(token, from?.address), 6)} mono />

      <SectionTitle>Recipient</SectionTitle>
      <Field label="Address" value={to} onChangeText={setTo} placeholder="0x…" autoCapitalize="none" autoCorrect={false} />
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.0" />
      {token && !token.isNative ? <Text style={styles.hint}>ERC-20 transfer on {chainName(chain)}</Text> : null}
      {err ? <Text style={styles.error}>{err}</Text> : null}
      <Button label={busy ? 'Sending…' : 'Send'} loading={busy} onPress={doSend} />
      {result ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.success}>Submitted</Text>
          <Text style={styles.hash} selectable>
            {result}
          </Text>
        </Card>
      ) : null}

      <Sheet visible={tokenSheet} onClose={() => setTokenSheet(false)} title="Select token">
        {chainTokens.map((t) => (
          <Row
            key={t.id}
            label={t.name}
            value={t.sub}
            onPress={() => {
              setToken(t);
              setTokenSheet(false);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

function balanceOf(token: Token | null, address?: string): number {
  if (!token || !address) return 0;
  return useWallet.getState().balances[`${token.id}:${token.chainId}:${address.toLowerCase()}`] ?? 0;
}

export function ReceiveScreen() {
  const nav = useNavigation<Nav>();
  const keys = useWallet((s) => s.keys)();
  const showToast = useApp((s) => s.showToast);
  const [index, setIndex] = useState(0);
  const current = keys[index];
  return (
    <Screen>
      <Header title="Receive" onBack={() => nav.goBack()} />
      {!current ? (
        <Empty text="No wallet available." />
      ) : (
        <>
          <View style={styles.qrWrap}>
            <QRCode value={current.address} size={208} backgroundColor="#ffffff" color="#050508" />
          </View>
          <Text style={styles.qrAddr} selectable>
            {current.address}
          </Text>
          <Button
            label="Copy address"
            onPress={async () => {
              await copySecret(current.address);
              showToast('Address copied (cleared in 30 s)', 'success');
            }}
          />
          <SectionTitle>Wallets</SectionTitle>
          {keys.map((k, i) => (
            <Row key={k.address} label={shortAddress(k.address)} value={i === index ? 'selected' : ''} mono onPress={() => setIndex(i)} />
          ))}
          <Text style={styles.hint}>
            Only send assets on the matching network. Addresses are EVM-compatible across the supported chains.
          </Text>
        </>
      )}
    </Screen>
  );
}

export function HistoryScreen() {
  const nav = useNavigation<Nav>();
  const [filter, setFilter] = useState<string>('all');
  const [items, setItems] = useState(() => new TxHistoryStore(prefs).load());
  const filtered = items.filter((t) => filter === 'all' || t.type === filter);
  const types = ['all', 'send', 'receive', 'swap', 'bridge', 'approve', 'batch'];
  return (
    <Screen>
      <Header
        title="History"
        onBack={() => nav.goBack()}
        right={
          <Pressable
            onPress={() => {
              Alert.alert('Clear history?', 'This removes local transaction history.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: () => {
                    new TxHistoryStore(prefs).clear();
                    setItems([]);
                  },
                },
              ]);
            }}
          >
            <Text style={styles.link}>Clear</Text>
          </Pressable>
        }
      />
      <View style={styles.pillRow}>
        {types.map((t) => (
          <Pill key={t} label={t} active={filter === t} onPress={() => setFilter(t)} />
        ))}
      </View>
      {filtered.length === 0 ? (
        <Empty text="No transactions yet." />
      ) : (
        filtered.map((t) => (
          <Card key={t.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.txType}>{String(t.type).toUpperCase()}</Text>
              <Badge text={t.failed ? 'FAILED' : t.pendingRecv ? 'PENDING' : 'SENT'} color={t.failed ? colors.red : colors.green} />
            </View>
            <Text style={styles.hash} selectable numberOfLines={2}>
              {t.hash ?? t.id}
            </Text>
            <Text style={styles.hint}>
              {new Date(t.timestamp).toLocaleString()} {t.chainId ? `· ${chainName(Number(t.chainId))}` : ''}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

export function TokenManagerScreen() {
  const nav = useNavigation<Nav>();
  const { tokens, saveTokens, customChains, activeGroupId } = useWallet();
  const showToast = useApp((s) => s.showToast);
  const [contract, setContract] = useState('');
  const [chain, setChain] = useState(8453);
  const [symbol, setSymbol] = useState('');
  const [busy, setBusy] = useState(false);
  const list = tokens();

  const add = async () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(contract.trim())) {
      showToast('Enter a valid contract address', 'error');
      return;
    }
    setBusy(true);
    try {
      const rpc = new RpcClient({ chainId: chain, urls: getRpcListForChain(chain, prefs, customChains) });
      const meta = await readTokenMeta(rpc, contract.trim());
      const store = new TokenStore(prefs, activeGroupId);
      const res = store.add({
        id: `custom_${contract.trim().toLowerCase()}`,
        chainId: chain,
        name: meta?.name || symbol || 'Custom token',
        sub: meta?.symbol || symbol || 'TOKEN',
        contract: contract.trim(),
        decimals: meta?.decimals ?? 18,
        isCustomContract: true,
        cgId: null,
      });
      if (!res.added) {
        showToast('Token already in the list', 'error');
      } else {
        saveTokens(store.load());
        showToast('Token added', 'success');
        setContract('');
        setSymbol('');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message.slice(0, 120) : 'Could not read token', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Token manager" onBack={() => nav.goBack()} />
      <SectionTitle>Active tokens ({list.length})</SectionTitle>
      {list.map((t) => (
        <View key={`${t.id}-${t.chainId}`} style={styles.tokenRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.tokenName}>
              {t.name} <Text style={styles.hint}>{t.sub}</Text>
            </Text>
            <Text style={styles.hint}>{chainName(t.chainId)} · {t.isNative ? 'native' : shortAddress(t.contract)}</Text>
          </View>
          {!t.isNative ? (
            <Pressable
              onPress={() => {
                const store = new TokenStore(prefs, activeGroupId);
                store.remove(t.id, t.chainId);
                if (t.isDefault) store.addRemovedDefault(t.id);
                saveTokens(store.load());
              }}
            >
              <Text style={{ color: colors.red }}>Remove</Text>
            </Pressable>
          ) : (
            <Badge text="NATIVE" />
          )}
        </View>
      ))}

      <SectionTitle>Add by contract</SectionTitle>
      <View style={styles.pillRow}>
        {[8453, 1, 42161, 56, 137].map((c) => (
          <Pill key={c} label={chainName(c)} active={c === chain} onPress={() => setChain(c)} />
        ))}
      </View>
      <Field label="Contract address" value={contract} onChangeText={setContract} placeholder="0x…" autoCapitalize="none" />
      <Field label="Symbol (fallback)" value={symbol} onChangeText={setSymbol} placeholder="TOKEN" autoCapitalize="characters" />
      <Button label={busy ? 'Reading contract…' : 'Add token'} loading={busy} onPress={add} />
    </Screen>
  );
}

export function TokenChartScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'TokenChart'>>();
  const [type, setType] = useState<'candles' | 'line'>('candles');
  const [timeframe, setTimeframe] = useState('1h');
  const [candles, setCandles] = useState<{ o: number; h: number; l: number; c: number }[]>([]);
  const [err, setErr] = useState('');

  const tokens = useWallet((s) => s.tokens)();
  const fallback = tokens.find((t) => t.chainId === (route.params?.chainId ?? 8453) && t.isNative) ?? tokens[0];
  const symbol = route.params?.symbol ?? fallback?.sub ?? 'ETH';

  useEffect(() => {
    void setOrientation(false);
    return () => {
      void setOrientation(true);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}USDT&interval=${timeframe}&limit=120`)
      .then((r) => r.json())
      .then((rows: unknown) => {
        if (!alive || !Array.isArray(rows)) return;
        setCandles(
          rows.map((row) => {
            const r = row as (string | number)[];
            return { o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]) };
          }),
        );
        setErr('');
      })
      .catch(() => alive && setErr(`${symbol}USDT is not available on Binance spot`));
    return () => {
      alive = false;
    };
  }, [symbol, timeframe]);

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const max = Math.max(...highs, 1);
  const min = Math.min(...lows, 0);
  const span = Math.max(max - min, 1e-9);
  const closes = candles.map((c) => c.c);

  return (
    <Screen>
      <Header title={`${symbol} chart`} subtitle="Binance spot · landscape enabled" onBack={() => nav.goBack()} />
      <View style={styles.pillRow}>
        {['1m', '5m', '15m', '1h', '4h', '1d', '1w'].map((tf) => (
          <Pill key={tf} label={tf} active={tf === timeframe} onPress={() => setTimeframe(tf)} />
        ))}
      </View>
      <View style={styles.pillRow}>
        <Pill label="Candles" active={type === 'candles'} onPress={() => setType('candles')} />
        <Pill label="Line" active={type === 'line'} onPress={() => setType('line')} />
      </View>
      {err ? <Text style={styles.error}>{err}</Text> : null}
      <View style={styles.chart}>
        {candles.length === 0 ? (
          <Text style={styles.hint}>Loading chart…</Text>
        ) : type === 'line' ? (
          closes.map((c, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                alignSelf: 'flex-end',
                height: `${Math.max(2, ((c - min) / span) * 100)}%`,
                backgroundColor: colors.primary,
                marginHorizontal: 0.5,
              }}
            />
          ))
        ) : (
          candles.map((c, i) => {
            const top = ((max - Math.max(c.o, c.c)) / span) * 100;
            const height = Math.max(1.5, (Math.abs(c.c - c.o) / span) * 100);
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                <View
                  style={{
                    position: 'absolute',
                    top: `${((max - c.h) / span) * 100}%`,
                    height: `${Math.max(2, ((c.h - c.l) / span) * 100)}%`,
                    width: 1,
                    backgroundColor: c.c >= c.o ? colors.green : colors.red,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: `${top}%`,
                    height: `${height}%`,
                    width: '64%',
                    backgroundColor: c.c >= c.o ? colors.green : colors.red,
                  }}
                />
              </View>
            );
          })
        )}
      </View>
      <Text style={styles.hint}>
        Native chart: candles/line over Binance klines. Legacy 11 chart types + drawing tools are
        tracked in PARITY_CHECKLIST as PARTIAL (no drawing persistence on native).
      </Text>
    </Screen>
  );
}

export function AddressListScreen() {
  const nav = useNavigation<Nav>();
  const keys = useWallet((s) => s.keys)();
  const groups = useWallet((s) => s.groups);
  const removeGroup = useWallet((s) => s.removeGroup);
  const showToast = useApp((s) => s.showToast);
  return (
    <Screen>
      <Header title="Wallets" onBack={() => nav.goBack()} />
      {groups.map((g) => (
        <Card key={g.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.tokenName}>{g.name}</Text>
            <Pressable
              onPress={() =>
                Alert.alert('Remove wallet group?', `${g.name} — this deletes ${g.keys.length} key(s) from this device.`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                      await removeGroup(g.id);
                      showToast('Wallet removed', 'success');
                    },
                  },
                ])
              }
            >
              <Text style={{ color: colors.red }}>Remove</Text>
            </Pressable>
          </View>
          {g.keys.map((k, i) => {
            const addr = keys.find((x) => x.privateKey === k)?.address ?? shortAddress(k, 8, 6);
            return <Text key={i} style={styles.hash}>{addr}</Text>;
          })}
        </Card>
      ))}
      {!groups.length ? <Empty text="No wallets yet." /> : null}
      <Text style={styles.hint}>Import or generate wallets from Profile → Wallet tools.</Text>
    </Screen>
  );
}

export function PairManagerScreen() {
  const nav = useNavigation<Nav>();
  const [pairs, setPairs] = useState<{ from: string; to: string }[]>(() => prefs.json('swap.pairs', []));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const save = (next: { from: string; to: string }[]) => {
    prefs.setJson('swap.pairs', next);
    setPairs(next);
  };
  return (
    <Screen>
      <Header title="Saved pairs" onBack={() => nav.goBack()} />
      {pairs.map((p, i) => (
        <Row
          key={i}
          label={`${p.from} → ${p.to}`}
          onPress={() => save(pairs.filter((_, idx) => idx !== i))}
          value="delete"
        />
      ))}
      <Field label="From symbol" value={from} onChangeText={setFrom} placeholder="ETH" autoCapitalize="characters" />
      <Field label="To symbol" value={to} onChangeText={setTo} placeholder="USDC" autoCapitalize="characters" />
      <Button label="Save pair" onPress={() => from && to && save([...pairs, { from, to }])} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md, marginTop: spacing.sm },
  hint: { color: colors.faint, fontSize: font.tiny, lineHeight: 17 },
  error: { color: colors.red, fontSize: font.small, marginBottom: spacing.sm },
  success: { color: colors.green, fontWeight: '700', marginBottom: spacing.xs },
  hash: { color: colors.muted, fontSize: 12, fontFamily: font.mono, marginTop: 4 },
  link: { color: colors.primary, fontSize: font.small },
  qrWrap: { alignSelf: 'center', backgroundColor: '#fff', padding: spacing.lg, borderRadius: 12, marginVertical: spacing.xl },
  qrAddr: { color: colors.text, textAlign: 'center', fontFamily: font.mono, fontSize: 12, marginBottom: spacing.md },
  tokenRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tokenName: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  txType: { color: colors.text, fontWeight: '700', letterSpacing: 0.6 },
  chart: { height: 260, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm, overflow: 'hidden' },
});
