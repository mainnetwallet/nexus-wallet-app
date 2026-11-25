import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  buildBatchNative,
  buildBatchToken,
  buildMultiKeyTransfers,
  buildNftTransfer,
  buildRevokeErc20,
  buildSelfTransfers,
  buildWalletToWallet,
  buildWithdrawals,
  checkBalances,
  deriveFromPhrases,
  formatAmount,
  parseRecipients,
  readErc20Allowance,
  shortAddress,
  type KeyRef,
  type TransferStep,
} from '@nexus/core';
import { ActionTile, Badge, Button, Card, Empty, Field, Header, Pill, Row, Screen, SectionTitle } from '../components/ui';
import { colors, font, spacing } from '../theme';
import { useWallet } from '../stores/wallet';
import { useApp } from '../stores/app';
import { executeTx, rpcFor } from '../utils/exec';
import type { RootStackParamList, TransferToolId } from '../navigation/types';
import { chainName } from './HomeScreen';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TOOLS: { id: TransferToolId; title: string; sub: string; glyph: string }[] = [
  { id: 'batchNative', title: 'Batch Native', sub: 'one → many', glyph: '⇉' },
  { id: 'batchToken', title: 'Batch Token', sub: 'ERC-20', glyph: '🪙' },
  { id: 'multiKey', title: 'Multi-Key', sub: 'many → one', glyph: '🔑' },
  { id: 'walletToWallet', title: 'Wallet → Wallet', sub: 'fixed', glyph: '⇄' },
  { id: 'self', title: 'Self Transfer', sub: 'to self', glyph: '↻' },
  { id: 'nft', title: 'NFT Transfer', sub: '721/1155', glyph: '🖼' },
  { id: 'approvals', title: 'Approvals', sub: 'revoke', glyph: '🛡' },
  { id: 'withdraw', title: 'Withdraw', sub: 'fixed/split/sweep', glyph: '⬇' },
  { id: 'balanceCheck', title: 'Balance Check', sub: 'addresses', glyph: '🔎' },
  { id: 'phraseTools', title: 'Phrase → Key', sub: 'derive', glyph: '🧩' },
];

export function TransferHubScreen() {
  const nav = useNavigation<Nav>();
  return (
    <Screen>
      <Header title="Transfer Hub" subtitle="9 legacy tools + phrase derivation" onBack={() => nav.goBack()} />
      <View style={styles.grid}>
        {TOOLS.map((t) => (
          <ActionTile key={t.id} title={t.title} sub={t.sub} glyph={t.glyph} onPress={() => nav.navigate('TransferTool', { tool: t.id })} />
        ))}
      </View>
      <Text style={styles.hint}>
        Batch-token and multi-key tools send one transaction per step. Legacy deployed helper
        contracts to save gas; the rebuilt version prioritises auditability. See PARITY_CHECKLIST.
      </Text>
    </Screen>
  );
}

function useToolState() {
  const keys = useWallet((s) => s.keys)();
  const chainId = useWallet((s) => s.chainId) ?? 8453;
  const customChains = useWallet((s) => s.customChains);
  const [chain, setChain] = useState(chainId);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const showToast = useApp((s) => s.showToast);
  const addLog = (line: string) => setLog((prev) => [...prev.slice(-40), line]);

  const run = async (steps: TransferStep[]) => {
    const byAddress = new Map(keys.map((k) => [k.address.toLowerCase(), k.privateKey]));
    setBusy(true);
    setResult('');
    try {
      let last = '';
      for (const s of steps) {
        const pk = byAddress.get(s.from.toLowerCase());
        if (!pk) throw new Error(`No key for ${s.from}`);
        addLog(`→ ${s.label ?? `${s.from.slice(0, 6)}… → ${s.to.slice(0, 6)}…`}`);
        last = await executeTx({
          chainId: s.chainId,
          privateKey: pk,
          to: s.to,
          data: s.data,
          value: s.value,
          customChains,
          onStatus: addLog,
        });
      }
      setResult(last);
      showToast(`${steps.length} transaction(s) submitted`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 220) : 'Failed';
      addLog(`✕ ${msg}`);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return { keys, chain, setChain, customChains, log, busy, result, run, showToast, addLog };
}

function ToolShell({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <Screen>
      <Header title={title} subtitle={subtitle} onBack={onBack} />
      {children}
    </Screen>
  );
}

export function TransferToolScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'TransferTool'>>();
  const tool = route.params?.tool ?? 'batchNative';
  const state = useToolState();
  const back = () => nav.goBack();

  const [recipients, setRecipients] = useState('');
  const [recipient, setRecipient] = useState('');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState('');
  const [decimals, setDecimals] = useState('18');
  const [contract, setContract] = useState('');
  const [standard, setStandard] = useState<'erc721' | 'erc1155'>('erc721');
  const [tokenId, setTokenId] = useState('1');
  const [spender, setSpender] = useState('');
  const [allowance, setAllowance] = useState('');
  const [addresses, setAddresses] = useState('');
  const [phrases, setPhrases] = useState('');
  const [derived, setDerived] = useState<{ address: string; path: string }[]>([]);
  const [balances, setBalances] = useState<{ address: string; native: string }[]>([]);
  const [mode, setMode] = useState<'fixed' | 'split' | 'sweep'>('fixed');

  const keyRefs: KeyRef[] = state.keys.map((k) => ({ address: k.address, keyId: k.address }));
  const tokenArg = token.trim() ? { address: token.trim(), decimals: Number(decimals) || 18 } : null;

  const body = () => {
    switch (tool) {
      case 'batchNative':
        return (
          <>
            <Field label="Recipients (address,amount per line)" value={recipients} onChangeText={setRecipients} multiline placeholder={'0xabc…, 0.01\n0xdef… 0.02'} />
            <Button
              label={state.busy ? 'Sending…' : 'Send batch'}
              loading={state.busy}
              onPress={() => {
                const parsed = parseRecipients(recipients, { requireAmount: true });
                state.addLog(`[parse] ${parsed.recipients.length} valid, ${parsed.invalid.length} invalid`);
                state.run(buildBatchNative({ chainId: state.chain, sender: state.keys[0]?.address ?? '', recipientsText: recipients }));
              }}
            />
          </>
        );
      case 'batchToken':
        return (
          <>
            <Field label="Token contract" value={token} onChangeText={setToken} autoCapitalize="none" />
            <Field label="Decimals" value={decimals} onChangeText={setDecimals} keyboardType="number-pad" />
            <Field label="Recipients (address,amount)" value={recipients} onChangeText={setRecipients} multiline />
            <Button
              label={state.busy ? 'Sending…' : 'Send batch'}
              loading={state.busy}
              onPress={() =>
                state.run(
                  buildBatchToken({
                    chainId: state.chain,
                    sender: state.keys[0]?.address ?? '',
                    recipientsText: recipients,
                    token: tokenArg ?? { address: '', decimals: 18 },
                  }),
                )
              }
            />
          </>
        );
      case 'multiKey':
        return (
          <>
            <Field label="Recipient" value={recipient} onChangeText={setRecipient} autoCapitalize="none" />
            <Field label="Amount per key" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <Field label="Token contract (blank = native)" value={token} onChangeText={setToken} autoCapitalize="none" />
            <Text style={styles.hint}>{keyRefs.length} key(s) selected</Text>
            <Button
              label={state.busy ? 'Sending…' : 'Send from all keys'}
              loading={state.busy}
              onPress={() =>
                state.run(
                  buildMultiKeyTransfers({
                    chainId: state.chain,
                    keys: keyRefs,
                    recipient,
                    amount,
                    token: tokenArg,
                  }),
                )
              }
            />
          </>
        );
      case 'walletToWallet':
      case 'self':
        return (
          <>
            {tool === 'walletToWallet' ? <Field label="Destination" value={destination} onChangeText={setDestination} autoCapitalize="none" /> : null}
            <Field label="Amount per key" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <Field label="Token contract (blank = native)" value={token} onChangeText={setToken} autoCapitalize="none" />
            <Button
              label={state.busy ? 'Sending…' : 'Send'}
              loading={state.busy}
              onPress={() =>
                state.run(
                  tool === 'self'
                    ? buildSelfTransfers({ chainId: state.chain, keys: keyRefs, amount, token: tokenArg })
                    : buildWalletToWallet({ chainId: state.chain, keys: keyRefs, destination, amount, token: tokenArg }),
                )
              }
            />
          </>
        );
      case 'nft':
        return (
          <>
            <View style={styles.pillRow}>
              <Pill label="ERC-721" active={standard === 'erc721'} onPress={() => setStandard('erc721')} />
              <Pill label="ERC-1155" active={standard === 'erc1155'} onPress={() => setStandard('erc1155')} />
            </View>
            <Field label="NFT contract" value={contract} onChangeText={setContract} autoCapitalize="none" />
            <Field label="Token id" value={tokenId} onChangeText={setTokenId} keyboardType="number-pad" />
            <Field label="Recipient" value={recipient} onChangeText={setRecipient} autoCapitalize="none" />
            <Button
              label={state.busy ? 'Sending…' : 'Transfer NFT'}
              loading={state.busy}
              onPress={() =>
                state.run([
                  buildNftTransfer({
                    chainId: state.chain,
                    contract,
                    standard,
                    tokenId,
                    from: state.keys[0]?.address ?? '',
                    to: recipient,
                    amount: '1',
                  }),
                ])
              }
            />
          </>
        );
      case 'approvals':
        return (
          <>
            <Field label="Token contract" value={token} onChangeText={setToken} autoCapitalize="none" />
            <Field label="Spender" value={spender} onChangeText={setSpender} autoCapitalize="none" />
            <Button
              label="Check allowance"
              kind="ghost"
              onPress={async () => {
                try {
                  const rpc = rpcFor(state.chain, state.customChains);
                  const raw = await readErc20Allowance(rpc, token, state.keys[0]?.address ?? '', spender);
                  setAllowance(raw.toString());
                } catch (err) {
                  state.addLog(`✕ ${err instanceof Error ? err.message : 'read failed'}`);
                }
              }}
            />
            <Row label="Allowance (raw)" value={allowance || '—'} mono />
            <Button
              label={state.busy ? 'Revoking…' : 'Revoke allowance'}
              kind="danger"
              loading={state.busy}
              onPress={() =>
                state.run([
                  buildRevokeErc20({ chainId: state.chain, owner: state.keys[0]?.address ?? '', token, spender }),
                ])
              }
            />
          </>
        );
      case 'withdraw':
        return (
          <>
            <View style={styles.pillRow}>
              {(['fixed', 'split', 'sweep'] as const).map((m) => (
                <Pill key={m} label={m} active={mode === m} onPress={() => setMode(m)} />
              ))}
            </View>
            <Field label="Destination" value={destination} onChangeText={setDestination} autoCapitalize="none" />
            {mode !== 'sweep' ? <Field label={mode === 'split' ? 'Total amount' : 'Amount per key'} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /> : null}
            <Field label="Token contract (blank = native)" value={token} onChangeText={setToken} autoCapitalize="none" />
            <Button
              label={state.busy ? 'Withdrawing…' : 'Withdraw'}
              loading={state.busy}
              onPress={async () => {
                if (mode !== 'sweep') {
                  await state.run(buildWithdrawals({ chainId: state.chain, keys: keyRefs, destination, mode, amount, token: tokenArg }));
                  return;
                }
                const rpc = rpcFor(state.chain, state.customChains);
                const balancesRaw: Record<string, bigint> = {};
                for (const k of keyRefs) {
                  try {
                    balancesRaw[k.address.toLowerCase()] = BigInt(await rpc.getBalance(k.address));
                  } catch {
                    balancesRaw[k.address.toLowerCase()] = 0n;
                  }
                }
                await state.run(
                  buildWithdrawals({
                    chainId: state.chain,
                    keys: keyRefs,
                    destination,
                    mode: 'sweep',
                    token: tokenArg,
                    balances: balancesRaw,
                    reserveWei: 30_000_000_000_000n,
                  }),
                );
              }}
            />
          </>
        );
      case 'balanceCheck':
        return (
          <>
            <Field label="Addresses (comma or newline)" value={addresses} onChangeText={setAddresses} multiline />
            <Field label="Token contracts (optional, comma)" value={token} onChangeText={setToken} />
            <Button
              label="Check balances"
              onPress={async () => {
                try {
                  const rpc = rpcFor(state.chain, state.customChains);
                  const addrs = addresses.split(/[\s,;]+/).filter(Boolean);
                  const tokensList = token.split(/[\s,;]+/).filter((x) => /^0x[0-9a-fA-F]{40}$/.test(x));
                  const res = await checkBalances(rpc, addrs, tokensList);
                  setBalances(
                    res.map((r) => ({
                      address: r.address,
                      native: r.error ? `error: ${r.error}` : `${formatAmount(Number(r.native ?? 0n) / 1e18, 6)} ${chainName(state.chain)}`,
                    })),
                  );
                } catch (err) {
                  state.addLog(`✕ ${err instanceof Error ? err.message : 'check failed'}`);
                }
              }}
            />
            {balances.map((b) => (
              <Row key={b.address} label={shortAddress(b.address)} value={b.native} mono />
            ))}
          </>
        );
      case 'phraseTools':
        return (
          <>
            <Field label="Seed phrases (one per line)" value={phrases} onChangeText={setPhrases} multiline autoCapitalize="none" />
            <Button
              label="Derive addresses"
              onPress={() => {
                try {
                  const list = deriveFromPhrases(phrases.split('\n').map((s) => s.trim()).filter(Boolean));
                  setDerived(list.map((d) => ({ address: d.address, path: d.path })));
                } catch (err) {
                  state.addLog(`✕ ${err instanceof Error ? err.message : 'derive failed'}`);
                }
              }}
            />
            <Text style={styles.hint}>Private keys are never rendered; import the phrase group from Profile to use them.</Text>
            {derived.map((d) => (
              <Row key={d.address + d.path} label={shortAddress(d.address)} value={d.path} mono />
            ))}
          </>
        );
      default:
        return <Empty text="Unknown tool." />;
    }
  };

  return (
    <ToolShell title={TOOLS.find((t) => t.id === tool)?.title ?? 'Tool'} subtitle={`${chainName(state.chain)} · ${state.keys.length} keys`} onBack={back}>
      <View style={styles.pillRow}>
        {[8453, 1, 42161, 56, 137].map((c) => (
          <Pill key={c} label={chainName(c)} active={c === state.chain} onPress={() => state.setChain(c)} />
        ))}
      </View>
      {body()}
      {state.result ? (
        <Card>
          <Text style={styles.success}>Submitted</Text>
          <Text style={styles.hash} selectable>{state.result}</Text>
        </Card>
      ) : null}
      {state.log.length ? (
        <>
          <SectionTitle>Log</SectionTitle>
          <Card>
            {state.log.map((l, i) => (
              <Text key={i} style={styles.hash}>{l}</Text>
            ))}
          </Card>
        </>
      ) : null}
      <Badge text="Keys stay in the Keystore vault" />
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md },
  hint: { color: colors.faint, fontSize: font.tiny, lineHeight: 17, marginBottom: spacing.sm },
  error: { color: colors.red, fontSize: font.small },
  success: { color: colors.green, fontWeight: '700' },
  hash: { color: colors.muted, fontSize: 11, fontFamily: font.mono, marginTop: 3 },
});
