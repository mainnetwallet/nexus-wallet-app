import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, NavigationContainer, type LinkingOptions, type Theme } from '@react-navigation/native';
import { colors } from './theme';
import { useApp } from './stores/app';
import { useWallet } from './stores/wallet';
import { Loading, ToastHost } from './components/ui';
import { LockGate } from './screens/LockGate';
import { MigrationScreen } from './screens/MigrationScreen';
import { RootNavigator } from './navigation/RootNavigator';
import type { RootStackParamList } from './navigation/types';

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.red,
  },
};

const linking = {
  prefixes: ['nexus://wallet', 'https://wallet.nexus'],
  config: {
    screens: {
      Tabs: {
        screens: {
          Home: '',
          Swap: 'swap',
          Bridge: 'bridge',
          Profile: 'profile',
          Settings: 'settings',
        },
      },
      Send: 'send',
      Receive: 'receive',
      History: 'history',
      TokenManager: 'tokens',
      TokenChart: 'chart',
      TransferHub: 'transfer',
      SupTransfer: 'sup',
      BaseSwapBot: 'bsb',
      Nansen: 'nansen',
      Delegation: 'delegation',
      Browser: 'browser',
      Exchange: 'exchange',
      Futures: 'futures',
      ExchangeKeys: 'exchange/keys',
      Deposit: 'exchange/deposit',
      ExchangeWithdraw: 'exchange/withdraw',
      RpcManager: 'rpc',
      ConsoleLog: 'console',
      AddressList: 'addresses',
      LockSetup: 'lock/setup',
      PairManager: 'pairs',
      Migration: 'migration',
    },
  },
} as unknown as LinkingOptions<RootStackParamList>;

export default function App() {
  const ready = useApp((s) => s.ready);
  const locked = useApp((s) => s.locked);
  const hasPin = useApp((s) => s.hasPin);
  const migrationNeeded = useApp((s) => s.migrationNeeded);
  const setMigrationNeeded = useApp((s) => s.setMigrationNeeded);
  const bootstrap = useApp((s) => s.bootstrap);
  const load = useWallet((s) => s.load);
  const refreshPrices = useWallet((s) => s.refreshPrices);
  const refreshBalances = useWallet((s) => s.refreshBalances);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (locked || !hasPin) return;
    void load().then(() => {
      void refreshPrices();
      void refreshBalances();
    });
  }, [locked, hasPin, load, refreshPrices, refreshBalances]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      {!ready ? (
        <Loading label="Starting Nexus Wallet…" />
      ) : locked || !hasPin ? (
        <LockGate />
      ) : migrationNeeded && hasPin ? (
        <MigrationScreen
          onDone={() => setMigrationNeeded(false)}
          onSkip={() => setMigrationNeeded(false)}
        />
      ) : (
        <NavigationContainer theme={navTheme} linking={linking}>
          <RootNavigator />
        </NavigationContainer>
      )}
      <ToastHost />
    </SafeAreaProvider>
  );
}
