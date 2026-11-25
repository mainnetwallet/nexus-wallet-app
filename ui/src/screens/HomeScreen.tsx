import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatAmount, formatUsd, shortAddress, type Token } from '@nexus/core';
import { Badge, Button, Empty, Row, Screen, Sheet } from '../components/ui';
import { colors, font, radius, spacing } from '../theme';
import { useWallet } from '../stores/wallet';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function chainName(id: number): string {
  const map: Record<number, string> = {
    1: 'Ethereum',
    8453: 'Base',
    42161: 'Arbitrum',
    10: 'Optimism',
    137: 'Polygon',
    56: 'BNB Chain',
    43114: 'Avalanche',
    59144: 'Linea',
    534352: 'Scroll',
    324: 'zkSync',
  };
  return map[id] ?? `Chain ${id}`;
}

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const {
    groups,
    activeGroupId,
    chainId,
    prices,
    balances,
    customChains,
    setActiveGroup,
    setChain,
    refreshPrices,
    refreshBalances,
    tokens,
    addresses,
  } = useWallet();
  const [search, setSearch] = useState('');
  const [picker, setPicker] = useState<'groups' | 'chains' | null>(null);
  const [selected, setSelected] = useState<Token | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const group = groups.find((g) => g.id === activeGroupId);
  const addressesList = addresses();
  const list = tokens();
  const chainTokens = list.filter((t) => chainId == null || t.chainId === chainId);

  useEffect(() => {
    if (group) {
      void refreshPrices();
      void refreshBalances();
    }
  }, [activeGroupId, group, refreshPrices, refreshBalances]);

  const balanceOf = (t: Token) =>
    addressesList.reduce((sum, a) => sum + (balances[`${t.id}:${t.chainId}:${a.toLowerCase()}`] ?? 0), 0);
  const priceOf = (t: Token) => (t.cgId ? prices[t.cgId]?.usd ?? 0 : 0);

  const total = useMemo(
    () => chainTokens.reduce((sum, t) => sum + balanceOf(t) * priceOf(t), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainTokens, balances, prices, addressesList],
  );

  const filtered = chainTokens.filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.sub.toLowerCase().includes(search.toLowerCase()),
  );

  const chainLabel =
    chainId == null ? 'All Networks' : customChains.find((c) => c.chainId === chainId)?.name ?? chainName(chainId);

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await Promise.all([refreshPrices(), refreshBalances()]);
            } finally {
              setRefreshing(false);
            }
          }}
        />
      }
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>NEXUS</Text>
          <Pressable onPress={() => setPicker('groups')}>
            <Text style={styles.groupName}>{group?.name ?? 'No wallet'} ▾</Text>
            <Text style={styles.addr}>
              {addressesList.length
                ? `${addressesList.length} wallet${addressesList.length > 1 ? 's' : ''} · ${shortAddress(addressesList[0]!)}`
                : 'Create or import a wallet'}
            </Text>
          </Pressable>
        </View>
        <Badge text={group?.source === 'created' ? 'GENERATED' : group ? 'IMPORTED' : 'EMPTY'} />
      </View>

      <Pressable onPress={() => setPicker('chains')} style={styles.chainPill}>
        <Text style={styles.chainText}>{chainLabel} ▾</Text>
      </Pressable>

      <Text style={styles.totalLabel}>TOTAL BALANCE</Text>
      <Text style={styles.total}>{formatUsd(total)}</Text>

      <View style={styles.actions}>
        <Button label="Send" onPress={() => nav.navigate('Send', { chainId: chainId ?? undefined })} style={styles.actionBtn} />
        <Button label="Receive" kind="ghost" onPress={() => nav.navigate('Receive')} style={styles.actionBtn} />
        <Button label="Swap" kind="ghost" onPress={() => nav.navigate('Swap' as never)} style={styles.actionBtn} />
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.section}>TOKENS</Text>
        <Pressable onPress={() => nav.navigate('TokenManager')}>
          <Text style={styles.link}>Manage</Text>
        </Pressable>
      </View>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search tokens"
        placeholderTextColor={colors.faint}
        style={styles.search}
      />

      <View style={{ height: spacing.sm }} />
      {!group ? (
        <Empty text="No wallet group yet. Import keys or create a wallet from the Profile tab." />
      ) : filtered.length === 0 ? (
        <Empty text="No tokens match this filter." />
      ) : (
        filtered.map((t) => {
          const bal = balanceOf(t);
          const price = priceOf(t);
          return (
            <Pressable key={`${t.id}-${t.chainId}`} onPress={() => setSelected(t)} style={styles.tokenRow}>
              <View style={[styles.tokenIcon, { backgroundColor: t.color + '33', borderColor: t.color }]}>
                <Text style={{ color: t.color, fontWeight: '800' }}>{t.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tokenName}>{t.name}</Text>
                <Text style={styles.tokenSub}>
                  {t.sub} · {chainName(t.chainId)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.tokenBal}>{bal ? formatAmount(bal, 4) : '0'}</Text>
                <Text style={styles.tokenUsd}>{price ? formatUsd(bal * price) : '—'}</Text>
              </View>
            </Pressable>
          );
        })
      )}

      <Sheet visible={picker === 'groups'} onClose={() => setPicker(null)} title="Wallets">
        {groups.map((g) => (
          <Row
            key={g.id}
            label={g.name}
            value={`${g.keys.length} keys`}
            onPress={() => {
              setPicker(null);
              void setActiveGroup(g.id);
            }}
          />
        ))}
        <Button
          label="Manage wallets"
          kind="ghost"
          onPress={() => {
            setPicker(null);
            nav.navigate('AddressList');
          }}
        />
      </Sheet>

      <Sheet visible={picker === 'chains'} onClose={() => setPicker(null)} title="Network">
        <Row label="All Networks" onPress={() => { setPicker(null); setChain(null); }} />
        {[...new Set(list.map((t) => t.chainId))].map((id) => (
          <Row
            key={id}
            label={chainName(id)}
            onPress={() => {
              setPicker(null);
              setChain(id);
            }}
          />
        ))}
      </Sheet>

      <Sheet visible={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name ?? ''}>
        {selected ? (
          <>
            <Row label="Balance" value={formatAmount(balanceOf(selected), 6)} />
            <Row label="Price" value={selected.cgId ? formatUsd(prices[selected.cgId]?.usd ?? 0) : '—'} />
            <Row label="Contract" value={selected.isNative ? 'Native asset' : shortAddress(selected.contract, 8, 6)} mono />
            <Button
              label="Send"
              onPress={() => {
                const t = selected;
                setSelected(null);
                nav.navigate('Send', { chainId: t.chainId });
              }}
            />
            <Button
              label="Chart"
              kind="ghost"
              onPress={() => {
                const t = selected;
                setSelected(null);
                nav.navigate('TokenChart', { symbol: t.sub, chainId: t.chainId });
              }}
            />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  brand: { color: colors.primary, fontSize: 11, letterSpacing: 4, fontWeight: '800' },
  groupName: { color: colors.text, fontSize: 19, fontWeight: '700', marginTop: 2 },
  addr: { color: colors.faint, fontSize: font.tiny, marginTop: 2, fontFamily: font.mono },
  chainPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: spacing.lg,
  },
  chainText: { color: colors.muted, fontSize: font.tiny },
  totalLabel: { color: colors.faint, fontSize: 10, letterSpacing: 1.4 },
  total: { color: colors.text, fontSize: 34, fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  actionBtn: { flex: 1, marginTop: 0 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg },
  section: { color: colors.faint, fontSize: 10, letterSpacing: 1.4 },
  link: { color: colors.primary, fontSize: font.small },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: font.small,
    marginTop: spacing.sm,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tokenIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tokenName: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  tokenSub: { color: colors.faint, fontSize: font.tiny, marginTop: 1 },
  tokenBal: { color: colors.text, fontSize: font.body },
  tokenUsd: { color: colors.faint, fontSize: font.tiny, marginTop: 1 },
});
