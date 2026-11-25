import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { migrateLegacy, type MigrationResult } from '@nexus/core';
import { Button, Card, Row, Screen, SectionTitle } from '../components/ui';
import { colors, font, spacing } from '../theme';
import { makeEncryptedStore, makeLegacyReader } from '../native/bridge';
import { prefs } from '../storage/prefs';
import { useApp } from '../stores/app';
import { useWallet } from '../stores/wallet';

export function MigrationScreen({ onDone, onSkip }: { onDone: () => void; onSkip?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const showToast = useApp((s) => s.showToast);
  const setMigrationNeeded = useApp((s) => s.setMigrationNeeded);

  const run = async () => {
    setBusy(true);
    try {
      const outcome = await migrateLegacy(makeLegacyReader(), makeEncryptedStore(), {
        commitLegacy: true,
      });
      setResult(outcome);
      if (outcome.status === 'verified' || outcome.status === 'none') {
        prefs.write('migration.verified', '1');
        setMigrationNeeded(false);
        await useWallet.getState().load();
        showToast(outcome.status === 'verified' ? 'Legacy data migrated' : 'No legacy data found', 'success');
      } else {
        showToast(outcome.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const counts = result && result.status === 'verified' ? result.counts : null;

  return (
    <Screen>
      <Text style={styles.title}>Import legacy wallet</Text>
      <Text style={styles.body}>
        Legacy Nexus data was found on this device. Migration decrypts keys, verifies every
        derived address, and writes an encrypted copy before the old data is removed.
      </Text>

      <Card>
        <Row label="Source" value="Legacy WebView storage" />
        <Row label="Destination" value="Keystore vault (nexus2)" />
        <Row label="Deletes legacy data" value="Only after read-back verification" />
      </Card>

      {counts ? (
        <>
          <SectionTitle>Result</SectionTitle>
          <Card>
            <Row label="Groups" value={String(counts.groups)} />
            <Row label="Keys" value={String(counts.keys)} />
            <Row label="Mnemonics" value={String(counts.mnemonics)} />
            <Row label="Exchange keys" value={String(counts.exchangeKeys)} />
            <Row label="Settings copied" value={String(counts.settings)} />
            {counts.unrecoverableKeys > 0 ? (
              <Row
                label="Unrecoverable old-format keys"
                value={String(counts.unrecoverableKeys)}
                valueColor={colors.amber}
              />
            ) : null}
          </Card>
          {counts.unrecoverableKeys > 0 ? (
            <Text style={styles.warn}>
              {counts.unrecoverableKeys} key(s) used an unsupported old format (ncx1). They were
              reported, not silently dropped — re-import them from your backup.
            </Text>
          ) : null}
        </>
      ) : null}

      {result?.status === 'failed' ? <Text style={styles.error}>{result.message}</Text> : null}

      {result?.status === 'verified' || result?.status === 'none' ? (
        <Button label="Continue to wallet" onPress={onDone} />
      ) : (
        <>
          <Button label={busy ? 'Migrating…' : 'Migrate now'} loading={busy} onPress={run} />
          {onSkip ? <Button label="Not now" kind="ghost" onPress={onSkip} /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: spacing.sm },
  body: { color: colors.muted, fontSize: font.small, lineHeight: 20, marginBottom: spacing.lg },
  warn: { color: colors.amber, fontSize: font.small, lineHeight: 18, marginBottom: spacing.md },
  error: { color: colors.red, fontSize: font.small, lineHeight: 18, marginBottom: spacing.md },
});
