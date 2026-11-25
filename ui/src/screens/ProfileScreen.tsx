import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { shortAddress } from '@nexus/core';
import { Badge, Button, Card, Empty, Field, Header, Pill, Row, Screen, SectionTitle, Sheet } from '../components/ui';
import { colors, font, radius, spacing } from '../theme';
import { useWallet } from '../stores/wallet';
import { useApp } from '../stores/app';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const { groups, activeGroupId, keys, addresses, importKeys, importPhrases, createGroup, load } = useWallet();
  const showToast = useApp((s) => s.showToast);
  const [mode, setMode] = useState<'import' | 'mnemonic' | 'generate' | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [count, setCount] = useState('5');
  const [busy, setBusy] = useState(false);
  const [browser, setBrowser] = useState('');

  const group = groups.find((g) => g.id === activeGroupId);
  const keyList = keys();

  const submit = async () => {
    setBusy(true);
    try {
      const error =
        mode === 'import'
          ? await importKeys(name || `Wallet ${groups.length + 1}`, text)
          : mode === 'mnemonic'
            ? await importPhrases(name || `Wallet ${groups.length + 1}`, text.split('\n').map((s) => s.trim()).filter(Boolean))
            : await createGroup(name || `Wallet ${groups.length + 1}`, Number(count) || 1);
      if (error) {
        showToast(error, 'error');
        return;
      }
      showToast('Wallet added', 'success');
      setMode(null);
      setName('');
      setText('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Profile" subtitle="Wallets, tools and automation" />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.hero}>{group?.name ?? 'No wallet'}</Text>
            <Text style={styles.hint}>{addresses().length} address(es) · {keyList.length} key(s)</Text>
          </View>
          <Badge text={group?.source === 'created' ? 'GENERATED' : 'IMPORTED'} />
        </View>
        {keyList.slice(0, 3).map((k) => (
          <Text key={k.address} style={styles.addr}>{shortAddress(k.address, 10, 8)}</Text>
        ))}
        <View style={styles.rowGap}>
          <Button label="Import keys" kind="ghost" onPress={() => setMode('import')} style={{ flex: 1 }} />
          <Button label="Mnemonic" kind="ghost" onPress={() => setMode('mnemonic')} style={{ flex: 1 }} />
          <Button label="Generate" kind="ghost" onPress={() => setMode('generate')} style={{ flex: 1 }} />
        </View>
      </Card>

      <SectionTitle>Browser</SectionTitle>
      <View style={styles.searchRow}>
        <TextInput
          value={browser}
          onChangeText={setBrowser}
          placeholder="Search or enter a dApp URL"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          style={styles.search}
          onSubmitEditing={() => nav.navigate('Browser', { url: browser })}
        />
        <Button label="Go" onPress={() => nav.navigate('Browser', { url: browser })} style={{ marginTop: 0, paddingHorizontal: 18 }} />
      </View>

      <SectionTitle>Tools</SectionTitle>
      <Card>
        <Row label="Transfer Hub" value="9 tools" onPress={() => nav.navigate('TransferHub')} />
        <Row label="Transaction history" onPress={() => nav.navigate('History')} />
        <Row label="Address book" onPress={() => nav.navigate('AddressList')} />
        <Row label="Saved swap pairs" onPress={() => nav.navigate('PairManager')} />
        <Row label="Token chart" onPress={() => nav.navigate('TokenChart', {})} />
        <Row label="Console log" onPress={() => nav.navigate('ConsoleLog')} />
      </Card>

      <SectionTitle>Automation</SectionTitle>
      <Card>
        <Row label="SUP Transfer" value="auto-transfer loop" onPress={() => nav.navigate('SupTransfer')} />
        <Row label="Base Swap Bot" value="DCA bot" onPress={() => nav.navigate('BaseSwapBot')} />
        <Row label="Nansen & Jumper" value="smart-money data" onPress={() => nav.navigate('Nansen')} />
        <Row label="EIP-7702 delegation" onPress={() => nav.navigate('Delegation')} />
      </Card>

      <SectionTitle>Exchange</SectionTitle>
      <Card>
        <Row label="Open exchange mode" onPress={() => nav.navigate('Exchange')} />
        <Row label="API keys" onPress={() => nav.navigate('ExchangeKeys')} />
        <Row label="Futures" onPress={() => nav.navigate('Futures')} />
      </Card>

      <SectionTitle>Migrate</SectionTitle>
      <Card>
        <Row label="Migration status" value="Settings → Migration" onPress={() => nav.navigate('Migration')} />
      </Card>

      <Sheet visible={mode !== null} onClose={() => setMode(null)} title={mode === 'import' ? 'Import private keys' : mode === 'mnemonic' ? 'Import seed phrases' : 'Generate wallets'}>
        <Field label="Wallet name" value={name} onChangeText={setName} placeholder="Main" />
        {mode === 'mnemonic' ? (
          <Field label="Phrases (one per line)" value={text} onChangeText={setText} multiline autoCapitalize="none" />
        ) : mode === 'import' ? (
          <Field label="Private keys (one per line)" value={text} onChangeText={setText} multiline autoCapitalize="none" placeholder="0x…" />
        ) : (
          <Field label="Number of wallets" value={count} onChangeText={setCount} keyboardType="number-pad" />
        )}
        <Button label={busy ? 'Working…' : 'Confirm'} loading={busy} onPress={submit} />
        <Text style={styles.hint}>Keys are written to the Keystore vault. Clipboard is cleared after 30 s.</Text>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { color: colors.text, fontSize: 22, fontWeight: '700' },
  hint: { color: colors.faint, fontSize: font.tiny, lineHeight: 17 },
  addr: { color: colors.muted, fontFamily: font.mono, fontSize: 12, marginTop: 4 },
  rowGap: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  search: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: font.small,
  },
});
