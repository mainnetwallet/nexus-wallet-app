import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, spacing } from '../theme';
import { useApp } from '../stores/app';
import { biometricUnlock, rewrapVault } from '../native/bridge';
import { Button } from '../components/ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

function Dots({ count, total = 6 }: { count: number; total?: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i < count && styles.dotOn]} />
      ))}
    </View>
  );
}

export function Keypad({
  value,
  onChange,
  onComplete,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (pin: string) => void;
}) {
  const press = (k: string) => {
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === '' || value.length >= 6) return;
    const next = value + k;
    onChange(next);
    if (next.length === 6) onComplete?.(next);
  };
  return (
    <View style={styles.pad}>
      {KEYS.map((k, i) => (
        <Pressable
          key={i}
          onPress={() => press(k)}
          disabled={k === ''}
          style={({ pressed }) => [styles.key, pressed && k !== '' && { backgroundColor: colors.raised }]}
        >
          <Text style={styles.keyText}>{k}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PinScreen({
  title,
  subtitle,
  buttonLabel,
  onSubmit,
  footer,
}: {
  title: string;
  subtitle: string;
  buttonLabel: string;
  onSubmit: (pin: string) => Promise<void> | void;
  footer?: React.ReactNode;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.logo}>NEXUS</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Dots count={pin.length} />
      <Keypad value={pin} onChange={setPin} />
      <View style={styles.footer}>
        <Button
          label={buttonLabel}
          disabled={pin.length !== 6}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onSubmit(pin);
            } finally {
              setBusy(false);
              setPin('');
            }
          }}
        />
        {footer}
      </View>
    </View>
  );
}

export function LockGate() {
  const { hasPin, unlock, createPin, biometric, showToast } = useApp();
  const [waitMs, setWaitMs] = useState(0);
  const [confirmPin, setConfirmPin] = useState<string | null>(null);

  useEffect(() => {
    if (waitMs <= 0) return;
    const t = setInterval(() => setWaitMs((ms) => Math.max(0, ms - 1000)), 1000);
    return () => clearInterval(t);
  }, [waitMs]);

  const waitLabel = useMemo(() => {
    if (waitMs <= 0) return '';
    const s = Math.ceil(waitMs / 1000);
    return `Too many attempts — retry in ${s}s`;
  }, [waitMs]);

  if (!hasPin) {
    if (confirmPin) {
      return (
        <PinScreen
          title="Confirm PIN"
          subtitle="Re-enter the 6-digit PIN"
          buttonLabel="Create wallet"
          onSubmit={async (pin) => {
            if (pin !== confirmPin) {
              showToast('PINs do not match', 'error');
              setConfirmPin(null);
              return;
            }
            const ok = await createPin(pin);
            showToast(ok ? 'Wallet ready' : 'Invalid PIN', ok ? 'success' : 'error');
          }}
          footer={<Text style={styles.note}>The PIN unlocks keys stored by Android Keystore. It cannot be recovered.</Text>}
        />
      );
    }
    return (
      <PinScreen
        title="Create a PIN"
        subtitle="Protects your keys on this device"
        buttonLabel="Continue"
        onSubmit={(pin) => setConfirmPin(pin)}
        footer={<Text style={styles.note}>6 digits. Used to derive the vault KEK.</Text>}
      />
    );
  }

  return (
    <PinScreen
      title="Welcome back"
      subtitle={waitLabel || 'Enter your PIN to unlock'}
      buttonLabel="Unlock"
      onSubmit={async (pin) => {
        const result = await unlock(pin);
        if (!result.ok) {
          if (result.waitMs > 0) setWaitMs(result.waitMs);
          showToast('Wrong PIN', 'error');
        }
      }}
      footer={
        biometric ? (
          <Button
            label="Use biometrics"
            kind="ghost"
            onPress={async () => {
              const ok = await biometricUnlock('Unlock Nexus Wallet');
              showToast(ok ? 'Biometric accepted — enter PIN to decrypt keys' : 'Biometric failed', ok ? 'info' : 'error');
            }}
          />
        ) : null
      }
    />
  );
}

export function LockSetupScreen({ onDone }: { onDone: () => void }) {
  const { createPin, showToast, hasPin } = useApp();
  const [stage, setStage] = useState<'new' | 'confirm'>('new');
  const [first, setFirst] = useState('');
  return (
    <PinScreen
      title={stage === 'new' ? 'Set a new PIN' : 'Confirm new PIN'}
      subtitle="6 digits, stored as a PBKDF2 hash"
      buttonLabel={stage === 'new' ? 'Continue' : 'Save PIN'}
      onSubmit={async (pin) => {
        if (stage === 'new') {
          setFirst(pin);
          setStage('confirm');
          return;
        }
        if (pin !== first) {
          showToast('PINs do not match', 'error');
          setStage('new');
          setFirst('');
          return;
        }
        if (hasPin) {
          const rewrapped = await rewrapVault(pin);
          if (!rewrapped) {
            showToast('Could not re-encrypt the vault; PIN unchanged', 'error');
            setStage('new');
            setFirst('');
            return;
          }
        }
        await createPin(pin);
        showToast('PIN updated', 'success');
        onDone();
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', paddingHorizontal: spacing.xl },
  logo: { color: colors.primary, fontWeight: '800', letterSpacing: 6, fontSize: 14, marginBottom: spacing.xl },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: font.small, marginTop: spacing.sm, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: spacing.md, marginVertical: spacing.xxl },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 288, justifyContent: 'center' },
  key: { width: 88, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, margin: 4 },
  keyText: { color: colors.text, fontSize: 24, fontWeight: '500' },
  footer: { width: '100%', marginTop: spacing.xl },
  note: { color: colors.faint, fontSize: font.tiny, textAlign: 'center', marginTop: spacing.lg, lineHeight: 16 },
});
