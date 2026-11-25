import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getAllChains, getChainRpcs } from '@nexus/core';
import { Badge, Button, Card, Field, Header, Pill, Row, Screen, SectionTitle, Sheet } from '../components/ui';
import { colors, font, spacing } from '../theme';
import { useApp, type Currency } from '../stores/app';
import { useWallet } from '../stores/wallet';
import { prefs } from '../storage/prefs';
import { clearClipboard } from '../native/bridge';
import type { RootStackParamList } from '../navigation/types';
import { LockSetupScreen } from './LockGate';
import { MigrationScreen } from './MigrationScreen';
import { chainName } from './HomeScreen';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const { settings, updateSettings, lock, biometric } = useApp();
  const customChains = useWallet((s) => s.customChains);
  const load = useWallet((s) => s.load);
  const showToast = useApp((s) => s.showToast);
  const [proxy, setProxy] = useState(settings.proxyBaseUrl);

  return (
    <Screen>
      <Header title="Settings" subtitle="Security, networks and preferences" />

      <SectionTitle>Security</SectionTitle>
      <Card>
        <Row label="Change PIN" onPress={() => nav.navigate('LockSetup')} />
        <Row label="Lock now" onPress={lock} />
        <Row
          label="Biometric unlock"
          value={biometric ? 'on' : 'off'}
          onPress={() => {
            const next = !biometric;
            useApp.setState({ biometric: next });
            prefs.write('auth.biometric', next ? '1' : '0');
            showToast(next ? 'Biometric flag enabled (native prompt still asks for PIN)' : 'Biometric disabled', 'info');
          }}
        />
        <Row
          label="Clear clipboard"
          onPress={() => {
            void clearClipboard();
            showToast('Clipboard cleared', 'success');
          }}
        />
      </Card>
      <Text style={styles.note}>Key screens set FLAG_SECURE and block screenshots while open.</Text>

      <SectionTitle>Display</SectionTitle>
      <Card>
        <Row label="Theme" value={settings.theme} />
        <View style={styles.pillRow}>
          <Pill label="Dark" active={settings.theme === 'dark'} onPress={() => updateSettings({ theme: 'dark' })} />
          <Pill label="Light" active={settings.theme === 'light'} onPress={() => { updateSettings({ theme: 'light' }); showToast('Light theme stored; current build uses the dark palette', 'info'); }} />
        </View>
        <Row label="Haptics" value={settings.haptic ? 'on' : 'off'} onPress={() => updateSettings({ haptic: !settings.haptic })} />
        <Row label="Notifications" value={settings.notifications ? 'on' : 'off'} onPress={() => updateSettings({ notifications: !settings.notifications })} />
        <Row label="Console log" value={settings.consoleLog ? 'on' : 'off'} onPress={() => updateSettings({ consoleLog: !settings.consoleLog })} />
      </Card>

      <SectionTitle>Display currency</SectionTitle>
      <View style={styles.pillRow}>
        {(['USD', 'BDT', 'ETH', 'BTC'] as Currency[]).map((c) => (
          <Pill key={c} label={c} active={settings.currency === c} onPress={() => updateSettings({ currency: c })} />
        ))}
      </View>
      <Text style={styles.note}>USD is used for value formatting in this build; the preference is preserved for parity.</Text>

      <SectionTitle>Networks</SectionTitle>
      <Card>
        <Row label="RPC manager" value="custom endpoints" onPress={() => nav.navigate('RpcManager')} />
        <Row label="Custom chains" value={String(customChains.length)} />
      </Card>

      <SectionTitle>Proxy</SectionTitle>
      <Card>
        <Field label="Proxy base URL" value={proxy} onChangeText={setProxy} placeholder="https://your-proxy.example" autoCapitalize="none" />
        <Button
          label="Save proxy"
          kind="ghost"
          onPress={() => {
            updateSettings({ proxyBaseUrl: proxy.replace(/\/$/, '') });
            showToast(proxy ? 'Proxy saved' : 'Proxy disabled', 'success');
          }}
        />
      </Card>
      <Text style={styles.note}>Provider and exchange secrets live only in the proxy; none ship in this app.</Text>

      <SectionTitle>Exchange mode</SectionTitle>
      <Card>
        <Row label="Open exchange" onPress={() => nav.navigate('Exchange')} />
        <Row label="API keys" onPress={() => nav.navigate('ExchangeKeys')} />
      </Card>

      <SectionTitle>Maintenance</SectionTitle>
      <Card>
        <Row label="Legacy migration" onPress={() => nav.navigate('Migration')} />
        <Row label="Reload wallet data" onPress={() => { void load(); showToast('Reloaded', 'success'); }} />
      </Card>

      <Text style={styles.about}>Nexus Wallet · rebuild 1.214 · applicationId com.nexus.wallet</Text>
    </Screen>
  );
}

export function LockSetupRoute() {
  const nav = useNavigation<Nav>();
  return <LockSetupScreen onDone={() => nav.goBack()} />;
}

export function MigrationRoute() {
  const nav = useNavigation<Nav>();
  return <MigrationScreen onDone={() => nav.goBack()} />;
}

export function RpcManagerScreen() {
  const nav = useNavigation<Nav>();
  const customChains = useWallet((s) => s.customChains);
  const load = useWallet((s) => s.load);
  const showToast = useApp((s) => s.showToast);
  const [chainId, setChainId] = useState('8453');
  const [url, setUrl] = useState('');
  const [chainNameInput, setChainName] = useState('');
  const [chainRpcs, setChainRpcs] = useState('');
  const [sheet, setSheet] = useState<'rpc' | 'chain' | null>(null);

  const chains = getAllChains(customChains).filter((c) => c.chainId != null);

  const saveRpc = () => {
    const id = Number(chainId);
    if (!id || !/^https:\/\//i.test(url)) {
      showToast('RPC must be an https URL', 'error');
      return;
    }
    const all = prefs.json<Record<string, { defaultRpc?: string; rpcs?: string[] }>>('nexus_custom_rpcs_v1', {});
    const entry = all[String(id)] ?? {};
    entry.rpcs = [...new Set([...(entry.rpcs ?? []), url])];
    all[String(id)] = entry;
    prefs.setJson('nexus_custom_rpcs_v1', all);
    showToast('RPC added', 'success');
    setUrl('');
    setSheet(null);
  };

  const saveChain = () => {
    const id = Number(chainId);
    const rpcs = chainRpcs.split(/[\s,;]+/).filter((u) => /^https:\/\//i.test(u));
    if (!id || !chainNameInput.trim() || !rpcs.length) {
      showToast('Chain id, name and at least one https RPC are required', 'error');
      return;
    }
    const next = [...customChains, { id: `custom-${id}`, chainId: id, name: chainNameInput.trim(), nativeSym: 'ETH', rpcs }];
    prefs.setJson('chains.custom', next);
    void load();
    showToast('Custom chain added', 'success');
    setSheet(null);
  };

  return (
    <Screen>
      <Header title="RPC manager" onBack={() => nav.goBack()} right={<Badge text={`${customChains.length} custom`} />} />
      <View style={styles.rowGap}>
        <Button label="Add RPC" kind="ghost" onPress={() => setSheet('rpc')} style={{ flex: 1 }} />
        <Button label="Add chain" kind="ghost" onPress={() => setSheet('chain')} style={{ flex: 1 }} />
      </View>
      {chains.map((c) => (
        <Card key={`${c.id}-${c.chainId}`}>
          <Row label={c.name} value={c.chainId ? `chain ${c.chainId}` : ''} />
          {(getChainRpcs(c.chainId ?? 0, customChains).length ? getChainRpcs(c.chainId ?? 0, customChains) : c.rpcs).slice(0, 4).map((r, i) => (
            <Text key={i} style={styles.rpc} numberOfLines={1}>{r}</Text>
          ))}
        </Card>
      ))}

      <Sheet visible={sheet === 'rpc'} onClose={() => setSheet(null)} title="Add RPC">
        <Field label="Chain id" value={chainId} onChangeText={setChainId} keyboardType="number-pad" />
        <Field label="RPC URL (https)" value={url} onChangeText={setUrl} autoCapitalize="none" />
        <Button label="Save RPC" onPress={saveRpc} />
      </Sheet>
      <Sheet visible={sheet === 'chain'} onClose={() => setSheet(null)} title="Add custom chain">
        <Field label="Chain id" value={chainId} onChangeText={setChainId} keyboardType="number-pad" />
        <Field label="Name" value={chainNameInput} onChangeText={setChainName} />
        <Field label="RPC URLs (comma separated)" value={chainRpcs} onChangeText={setChainRpcs} autoCapitalize="none" multiline />
        <Button label="Save chain" onPress={saveChain} />
      </Sheet>
    </Screen>
  );
}

export function ConsoleLogScreen() {
  const nav = useNavigation<Nav>();
  const lines = useApp((s) => s.consoleLines);
  const clearConsole = useApp((s) => s.clearConsole);
  return (
    <Screen>
      <Header
        title="Console log"
        subtitle="Secrets are redacted"
        onBack={() => nav.goBack()}
        right={<Pressable onPress={clearConsole}><Text style={styles.link}>Clear</Text></Pressable>}
      />
      <Card>
        {lines.length === 0 ? <Text style={styles.note}>No entries yet.</Text> : null}
        {lines.map((l, i) => (
          <Text key={i} style={styles.rpc} selectable>{l}</Text>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.sm, marginBottom: spacing.sm },
  note: { color: colors.faint, fontSize: font.tiny, lineHeight: 17, marginBottom: spacing.md },
  about: { color: colors.faint, fontSize: 10, textAlign: 'center', marginTop: spacing.xl },
  rowGap: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  rpc: { color: colors.muted, fontSize: 11, fontFamily: font.mono, marginTop: 3 },
  link: { color: colors.primary, fontSize: font.small },
});
