import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { createBottomTabNavigator, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, font } from '../theme';
import { useApp } from '../stores/app';
import type { MainTabParamList, RootStackParamList } from './types';
import { HomeScreen } from '../screens/HomeScreen';
import { SwapScreen } from '../screens/SwapScreen';
import { BridgeScreen } from '../screens/BridgeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import {
  ConsoleLogScreen,
  LockSetupRoute,
  MigrationRoute,
  RpcManagerScreen,
  SettingsScreen,
} from '../screens/SettingsScreen';
import {
  AddressListScreen,
  HistoryScreen,
  PairManagerScreen,
  ReceiveScreen,
  SendScreen,
  TokenChartScreen,
  TokenManagerScreen,
} from '../screens/WalletScreens';
import { TransferHubScreen, TransferToolScreen } from '../screens/TransferHubScreen';
import {
  BaseSwapBotScreen,
  DelegationScreen,
  NansenScreen,
  SupTransferScreen,
} from '../screens/AutomationScreens';
import { BrowserScreen } from '../screens/BrowserScreen';
import {
  DepositScreen,
  ExchangeKeysScreen,
  ExchangeScreen,
  ExchangeWithdrawScreen,
  FuturesScreen,
} from '../screens/ExchangeScreens';

type ExchangeTabParamList = {
  Markets: undefined;
  Futures: undefined;
  Orders: undefined;
  Portfolio: undefined;
  Settings: undefined;
};

const WalletTab = createBottomTabNavigator<MainTabParamList>();
const ExchangeTab = createBottomTabNavigator<ExchangeTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 58,
    paddingBottom: 6,
  },
  tabLabel: { fontSize: font.tiny, fontWeight: '600' },
  glyph: { color: colors.faint, fontSize: 18, lineHeight: 22 },
  glyphOn: { color: colors.primary },
});

function TabGlyph({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={[styles.glyph, focused && styles.glyphOn]}>{glyph}</Text>;
}

const tabScreenOptions: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarStyle: styles.tabBar,
  tabBarActiveTintColor: colors.text,
  tabBarInactiveTintColor: colors.faint,
  tabBarLabelStyle: styles.tabLabel,
  tabBarItemStyle: { paddingTop: 4 },
};

function WalletTabs() {
  return (
    <WalletTab.Navigator screenOptions={tabScreenOptions}>
      <WalletTab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: ({ focused }) => <TabGlyph glyph="⌂" focused={focused} /> }} />
      <WalletTab.Screen name="Swap" component={SwapScreen} options={{ tabBarIcon: ({ focused }) => <TabGlyph glyph="⇄" focused={focused} /> }} />
      <WalletTab.Screen name="Bridge" component={BridgeScreen} options={{ tabBarIcon: ({ focused }) => <TabGlyph glyph="⇋" focused={focused} /> }} />
      <WalletTab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: ({ focused }) => <TabGlyph glyph="◉" focused={focused} /> }} />
      <WalletTab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: ({ focused }) => <TabGlyph glyph="⚙︎" focused={focused} /> }} />
    </WalletTab.Navigator>
  );
}

function MarketsTab() {
  return <ExchangeScreen initialTab="markets" />;
}
function OrdersTab() {
  return <ExchangeScreen initialTab="orders" />;
}
function PortfolioTab() {
  return <ExchangeScreen initialTab="portfolio" />;
}

function ExchangeTabs() {
  return (
    <ExchangeTab.Navigator screenOptions={tabScreenOptions}>
      <ExchangeTab.Screen name="Markets" component={MarketsTab} options={{ tabBarIcon: ({ focused }) => <TabGlyph glyph="▤" focused={focused} /> }} />
      <ExchangeTab.Screen name="Futures" component={FuturesScreen} options={{ tabBarIcon: ({ focused }) => <TabGlyph glyph="↗" focused={focused} /> }} />
      <ExchangeTab.Screen name="Orders" component={OrdersTab} options={{ tabBarIcon: ({ focused }) => <TabGlyph glyph="≣" focused={focused} /> }} />
      <ExchangeTab.Screen name="Portfolio" component={PortfolioTab} options={{ tabBarIcon: ({ focused }) => <TabGlyph glyph="◫" focused={focused} /> }} />
      <ExchangeTab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: ({ focused }) => <TabGlyph glyph="⚙︎" focused={focused} /> }} />
    </ExchangeTab.Navigator>
  );
}

export function RootNavigator() {
  const mode = useApp((s) => s.settings.displayMode);
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Tabs" component={mode === 'exchange' ? ExchangeTabs : WalletTabs} />
      <Stack.Screen name="Send" component={SendScreen} />
      <Stack.Screen name="Receive" component={ReceiveScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="TokenManager" component={TokenManagerScreen} />
      <Stack.Screen name="TokenChart" component={TokenChartScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="TransferHub" component={TransferHubScreen} />
      <Stack.Screen name="TransferTool" component={TransferToolScreen} />
      <Stack.Screen name="SupTransfer" component={SupTransferScreen} />
      <Stack.Screen name="BaseSwapBot" component={BaseSwapBotScreen} />
      <Stack.Screen name="Nansen" component={NansenScreen} />
      <Stack.Screen name="Delegation" component={DelegationScreen} />
      <Stack.Screen name="Browser" component={BrowserScreen} />
      <Stack.Screen name="Exchange" component={ExchangeScreen} />
      <Stack.Screen name="Futures" component={FuturesScreen} />
      <Stack.Screen name="ExchangeKeys" component={ExchangeKeysScreen} />
      <Stack.Screen name="Deposit" component={DepositScreen} />
      <Stack.Screen name="ExchangeWithdraw" component={ExchangeWithdrawScreen} />
      <Stack.Screen name="RpcManager" component={RpcManagerScreen} />
      <Stack.Screen name="ConsoleLog" component={ConsoleLogScreen} />
      <Stack.Screen name="AddressList" component={AddressListScreen} />
      <Stack.Screen name="LockSetup" component={LockSetupRoute} />
      <Stack.Screen name="PairManager" component={PairManagerScreen} />
      <Stack.Screen name="Migration" component={MigrationRoute} />
    </Stack.Navigator>
  );
}
