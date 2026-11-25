import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import {
  EXCHANGES,
  ExchangeAdapter,
  FUTURES_CONFIGS,
  futuresOrderBody,
  hasPassphraseRequirement,
  isExchangeCredentials,
  maskApiKey,
  type ExchangeCredentials,
  type ExchangeId,
  type MarketRow,
} from '@nexus/core';
import { Badge, Button, Card, Empty, Field, Header, Pill, Row, Screen, SectionTitle, Sheet } from '../components/ui';
import { colors, font, spacing } from '../theme';
import { useWallet } from '../stores/wallet';
import { useApp } from '../stores/app';
import { makeEncryptedStore, copySecret } from '../native/bridge';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const VAULT_PREFIX = 'nexus2/exchange/';

async function readCreds(id: ExchangeId): Promise<ExchangeCredentials | null> {
  try {
    const raw = await makeEncryptedStore().get(`${VAULT_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isExchangeCredentials(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCreds(id: ExchangeId, creds: ExchangeCredentials | null): Promise<void> {
  const store = makeEncryptedStore();
  if (!creds) {
    await store.delete(`${VAULT_PREFIX}${id}`);
    return;
  }
  await store.set(`${VAULT_PREFIX}${id}`, JSON.stringify(creds));
}

function adapterFor(id: ExchangeId, creds: ExchangeCredentials | null): ExchangeAdapter {
  return new ExchangeAdapter(id, creds, { fetchImpl: (url, init) => fetch(url, init) });
}

function exchangeName(id: ExchangeId): string {
  return EXCHANGES.find((e) => e.id === id)?.name ?? id;
}

type ExchangeTab = 'markets' | 'trade' | 'orders' | 'portfolio';

export function ExchangeScreen({ initialTab = 'markets' }: { initialTab?: ExchangeTab }) {
  const nav = useNavigation<Nav>();
  const [tab, setTab] = useState<ExchangeTab>(initialTab);
  const [exchange, setExchange] = useState<ExchangeId>('binance');
  const [creds, setCreds] = useState<ExchangeCredentials | null>(null);
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState('');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const showToast = useApp((s) => s.showToast);

  useEffect(() => {
    void readCreds(exchange).then(setCreds);
  }, [exchange]);

  const loadMarkets = async (id: ExchangeId = exchange) => {
    setBusy(true);
    setError('');
    try {
      const rows = await adapterFor(id, null).markets();
      setMarkets(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 180) : 'Markets failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (tab === 'markets') void loadMarkets();
  }, [tab, exchange]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return (q ? markets.filter((m) => m.symbol.toUpperCase().includes(q)) : markets).slice(0, 80);
  }, [markets, search]);

  const placeOrder = async () => {
    if (!creds) {
      showToast('Configure API keys first', 'error');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = spotOrderBody(exchange, {
        symbol,
        side,
        type: orderType,
        quantity,
        price: orderType === 'limit' ? price : undefined,
      });
      const result = await adapterFor(exchange, creds).placeOrder(body);
      showToast('Order submitted', 'success');
      setRaw(JSON.stringify(result, null, 2).slice(0, 4000));
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 200) : 'Order failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadSigned = async (kind: 'orders' | 'portfolio') => {
    if (!creds) {
      setError('API keys are not configured for this exchange');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const adapter = adapterFor(exchange, creds);
      const data = kind === 'orders' ? await adapter.openOrders() : await adapter.balances();
      setRaw(JSON.stringify(data, null, 2).slice(0, 6000));
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 200) : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Exchange" subtitle="15 CEX adapters · keys stay on device" onBack={() => nav.goBack()} />
      <View style={styles.tabs}>
        {(['markets', 'trade', 'orders', 'portfolio'] as ExchangeTab[]).map((t) => (
          <Pill key={t} label={t.toUpperCase()} active={tab === t} onPress={() => { setTab(t); setRaw(''); }} />
        ))}
      </View>
      <SectionTitle>Exchange</SectionTitle>
      <View style={styles.pillRow}>
        {EXCHANGES.map((e) => (
          <Pill key={e.id} label={e.name} active={exchange === e.id} onPress={() => setExchange(e.id)} />
        ))}
      </View>
      <Row label="API keys" value={creds ? maskApiKey(creds.apiKey) : 'not configured'} onPress={() => nav.navigate('ExchangeKeys')} />
      {creds && hasPassphraseRequirement(exchange) && !creds.passphrase ? (
        <Text style={styles.warn}>This exchange requires a passphrase; requests will fail until it is saved.</Text>
      ) : null}

      {tab === 'markets' ? (
        <>
          <Field label="Search markets" value={search} onChangeText={setSearch} autoCapitalize="characters" placeholder="BTC" />
          {busy ? <Text style={styles.note}>Loading markets…</Text> : null}
          {filtered.map((m) => (
            <Card key={m.symbol} onPress={() => { setSymbol(m.symbol); setTab('trade'); }}>
              <View style={styles.marketRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.symbol}>{m.base}/{m.quote}</Text>
                  <Text style={styles.note}>{m.symbol} · vol {m.volume ? m.volume.toFixed(0) : '—'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.price}>{m.price ? m.price.toFixed(m.price < 1 ? 6 : 2) : '—'}</Text>
                  <Text style={[styles.change, { color: m.change >= 0 ? colors.green : colors.red }]}>
                    {m.change >= 0 ? '+' : ''}{m.change.toFixed(2)}%
                  </Text>
                </View>
              </View>
            </Card>
          ))}
          {!busy && !filtered.length && !error ? <Empty text="No markets returned for this exchange." /> : null}
        </>
      ) : null}

      {tab === 'trade' ? (
        <>
          <Field label="Symbol" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" />
          <View style={styles.pillRow}>
            <Pill label="BUY" active={side === 'buy'} onPress={() => setSide('buy')} />
            <Pill label="SELL" active={side === 'sell'} onPress={() => setSide('sell')} />
            <Pill label="MARKET" active={orderType === 'market'} onPress={() => setOrderType('market')} />
            <Pill label="LIMIT" active={orderType === 'limit'} onPress={() => setOrderType('limit')} />
          </View>
          <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          {orderType === 'limit' ? <Field label="Limit price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" /> : null}
          <Button label="Place order" onPress={() => void placeOrder()} loading={busy} disabled={!creds || !quantity} />
          <Text style={styles.note}>
            Spot order bodies are provided for Binance, MEXC, BingX, Bybit, KuCoin, Bitget and Gate.io.
            Other exchanges reject orders here rather than guessing a payload.
          </Text>
          {raw ? <Card><Text style={styles.mono} selectable>{raw}</Text></Card> : null}
        </>
      ) : null}

      {tab === 'orders' || tab === 'portfolio' ? (
        <>
          <Button label={tab === 'orders' ? 'Load open orders' : 'Load balances'} onPress={() => void loadSigned(tab)} loading={busy} />
          {raw ? (
            <Card>
              <Text style={styles.mono} selectable>{raw}</Text>
            </Card>
          ) : (
            <Empty text={tab === 'orders' ? 'Open orders appear here after a signed request.' : 'Portfolio balances appear here after a signed request.'} />
          )}
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.rowGap}>
        <Button label="API keys" kind="ghost" onPress={() => nav.navigate('ExchangeKeys')} style={{ flex: 1 }} />
        <Button label="Deposit" kind="ghost" onPress={() => nav.navigate('Deposit')} style={{ flex: 1 }} />
        <Button label="Withdraw" kind="ghost" onPress={() => nav.navigate('ExchangeWithdraw')} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

/** Spot order payloads ported from the legacy exchange ticket. */
function spotOrderBody(
  id: ExchangeId,
  order: { symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; quantity: string; price?: string },
): Record<string, unknown> {
  const symbol = order.symbol.toUpperCase();
  switch (id) {
    case 'binance':
    case 'mexc':
    case 'bingx':
      return {
        symbol,
        side: order.side.toUpperCase(),
        type: order.type.toUpperCase(),
        quantity: order.quantity,
        ...(order.type === 'limit' ? { price: order.price, timeInForce: 'GTC' } : {}),
      };
    case 'bybit':
      return {
        category: 'spot',
        symbol,
        side: order.side === 'buy' ? 'Buy' : 'Sell',
        orderType: order.type === 'limit' ? 'Limit' : 'Market',
        qty: order.quantity,
        ...(order.type === 'limit' ? { price: order.price } : {}),
      };
    case 'kucoin': {
      const dash = symbol.includes('-') ? symbol : symbol.replace(/(USDT|USDC|BTC|ETH)$/, '-$1');
      return {
        clientOid: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        side: order.side,
        symbol: dash,
        type: order.type === 'limit' ? 'limit' : 'market',
        size: order.quantity,
        ...(order.type === 'limit' ? { price: order.price } : {}),
      };
    }
    case 'bitget':
      return {
        symbol,
        side: order.side,
        orderType: order.type === 'limit' ? 'limit' : 'market',
        size: order.quantity,
        ...(order.type === 'limit' ? { price: order.price, force: 'gtc' } : {}),
      };
    case 'gateio':
      return {
        currency_pair: symbol.includes('_') ? symbol : symbol.replace(/(USDT|USDC|BTC|ETH)$/, '_$1'),
        side: order.side,
        type: order.type === 'limit' ? 'limit' : 'market',
        amount: order.quantity,
        ...(order.type === 'limit' ? { price: order.price, time_in_force: 'gtc' } : {}),
      };
    default:
      throw new Error(`Spot orders are not implemented for ${exchangeName(id)}`);
  }
}

interface DepositInfo {
  address: string;
  memo?: string;
  chain?: string;
}

async function fetchDepositAddress(id: ExchangeId, coin: string, network: string): Promise<DepositInfo> {
  const creds = await readCreds(id);
  if (!creds) throw new Error('Configure API keys for this exchange first');
  const adapter = adapterFor(id, creds);
  const upper = coin.toUpperCase();
  const net = network.toUpperCase();
  switch (id) {
    case 'binance': {
      const json = await adapter.signed({ method: 'GET', path: '/sapi/v1/capital/deposit/address', params: { coin: upper, network: net } });
      if (!json?.address) throw new Error('No deposit address returned');
      return { address: String(json.address), memo: json.tag ? String(json.tag) : undefined, chain: net };
    }
    case 'mexc': {
      const json = await adapter.signed({ method: 'GET', path: '/api/v3/capital/deposit/address', params: { coin: upper, network: net } });
      if (!json?.address) throw new Error('No deposit address returned');
      return { address: String(json.address), memo: json.memo ? String(json.memo) : undefined, chain: net };
    }
    case 'bybit': {
      const json = await adapter.signed({ method: 'GET', path: '/v5/asset/deposit/query-address', params: { coin: upper, chainType: net } });
      const row = json?.result?.chains?.[0];
      if (!row?.address) throw new Error('No deposit address returned');
      return { address: String(row.address), memo: row.tag ? String(row.tag) : undefined, chain: String(row.chainType ?? net) };
    }
    case 'kucoin': {
      const json = await adapter.signed({ method: 'GET', path: '/api/v3/deposit-addresses', params: { currency: upper, chain: net.toLowerCase() } });
      const row = json?.data?.[0];
      if (!row?.address) throw new Error('No deposit address returned');
      return { address: String(row.address), memo: row.memo ? String(row.memo) : undefined, chain: String(row.chain ?? net) };
    }
    case 'gateio': {
      const json = await adapter.signed({ method: 'GET', path: '/api/v4/wallet/deposit_address', params: { currency: upper } });
      if (!json?.address) throw new Error('No deposit address returned');
      return { address: String(json.address), memo: json.memo ? String(json.memo) : undefined, chain: json.chain ? String(json.chain) : net };
    }
    case 'bitget': {
      const json = await adapter.signed({ method: 'GET', path: '/api/v2/spot/wallet/deposit-address', params: { coin: upper, chain: net } });
      if (!json?.data?.address) throw new Error('No deposit address returned');
      return { address: String(json.data.address), memo: json.data.tag ? String(json.data.tag) : undefined, chain: net };
    }
    case 'htx': {
      const json = await adapter.signed({ method: 'GET', path: '/v2/account/deposit/address', params: { currency: upper.toLowerCase() } });
      const row = json?.data?.[0];
      if (!row?.address) throw new Error('No deposit address returned');
      return { address: String(row.address), memo: row.addressTag ? String(row.addressTag) : undefined, chain: row.chain ? String(row.chain) : net };
    }
    default:
      throw new Error(`Deposit lookup is not ported for ${exchangeName(id)} — copy an address from the exchange site`);
  }
}

export function DepositScreen() {
  const nav = useNavigation<Nav>();
  const [exchange, setExchange] = useState<ExchangeId>('binance');
  const [coin, setCoin] = useState('USDT');
  const [network, setNetwork] = useState('TRX');
  const [info, setInfo] = useState<DepositInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const showToast = useApp((s) => s.showToast);

  const load = async () => {
    setBusy(true);
    setError('');
    setInfo(null);
    try {
      setInfo(await fetchDepositAddress(exchange, coin, network));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit lookup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Deposit" subtitle="Exchange deposit address" onBack={() => nav.goBack()} />
      <SectionTitle>Exchange</SectionTitle>
      <View style={styles.pillRow}>
        {EXCHANGES.map((e) => (
          <Pill key={e.id} label={e.name} active={exchange === e.id} onPress={() => setExchange(e.id)} />
        ))}
      </View>
      <Field label="Coin" value={coin} onChangeText={setCoin} autoCapitalize="characters" />
      <Field label="Network code" value={network} onChangeText={setNetwork} autoCapitalize="characters" hint="Exchange-specific, e.g. TRX, ERC20, BSC" />
      <Button label="Fetch deposit address" onPress={() => void load()} loading={busy} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? (
        <Card>
          <View style={{ alignItems: 'center', padding: spacing.md }}>
            <QRCode value={`${info.address}${info.memo ? `?memo=${info.memo}` : ''}`} size={180} backgroundColor="#ffffff" color="#000000" />
          </View>
          <Text style={styles.addr} selectable>{info.address}</Text>
          {info.memo ? <Row label="Memo/Tag" value={info.memo} mono /> : null}
          <Row label="Network" value={info.chain ?? network} />
          <Button
            label="Copy address"
            kind="ghost"
            onPress={async () => {
              await copySecret(info.address);
              showToast('Copied — clipboard clears in 30 s', 'success');
            }}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

async function submitWithdraw(id: ExchangeId, coin: string, address: string, amount: string, network: string): Promise<string> {
  const creds = await readCreds(id);
  if (!creds) throw new Error('Configure API keys for this exchange first');
  const adapter = adapterFor(id, creds);
  const sym = coin.toUpperCase();
  const net = network.toUpperCase();
  switch (id) {
    case 'binance': {
      const json = await adapter.signed({
        method: 'POST',
        path: '/sapi/v1/capital/withdraw/apply',
        params: { coin: sym, address, amount, network: net, walletType: 0 },
      });
      if (!json?.id) throw new Error(json?.msg ?? 'Withdrawal rejected');
      return String(json.id);
    }
    case 'mexc': {
      const json = await adapter.signed({
        method: 'POST',
        path: '/api/v3/capital/withdraw/apply',
        params: { coin: sym, address, amount, network: net },
      });
      if (!json?.id) throw new Error(json?.msg ?? 'Withdrawal rejected');
      return String(json.id);
    }
    case 'bybit': {
      const json = await adapter.signed({
        method: 'POST',
        path: '/v5/asset/withdraw/create',
        body: { coin: sym, chain: net, address, amount: String(amount), accountType: 'FUND' },
      });
      if (!json?.result?.id) throw new Error(json?.retMsg ?? 'Withdrawal rejected');
      return String(json.result.id);
    }
    case 'kucoin': {
      const json = await adapter.signed({
        method: 'POST',
        path: '/api/v3/withdrawals',
        body: { currency: sym, address, amount: String(amount), chain: net.toLowerCase(), withdrawType: 'ADDRESS' },
      });
      if (!json?.data?.withdrawalId) throw new Error(json?.msg ?? 'Withdrawal rejected');
      return String(json.data.withdrawalId);
    }
    case 'gateio': {
      const json = await adapter.signed({
        method: 'POST',
        path: '/api/v4/withdrawals',
        body: { currency: sym, address, amount: String(amount), chain: net },
      });
      if (!json?.id) throw new Error(json?.message ?? 'Withdrawal rejected');
      return String(json.id);
    }
    case 'bitget': {
      const json = await adapter.signed({
        method: 'POST',
        path: '/api/v2/spot/wallet/withdrawal',
        body: { coin: sym, address, size: String(amount), chain: net, transferType: 'on_chain' },
      });
      if (!json?.data?.orderId) throw new Error(json?.msg ?? 'Withdrawal rejected');
      return String(json.data.orderId);
    }
    case 'htx': {
      const json = await adapter.signed({
        method: 'POST',
        path: '/v1/dw/withdraw/api/create',
        body: { address, amount: String(amount), currency: sym.toLowerCase(), chain: net.toLowerCase() },
      });
      if (!json?.data) throw new Error(json?.['err-msg'] ?? 'Withdrawal rejected');
      return String(json.data);
    }
    default:
      throw new Error(`Withdrawals are not ported for ${exchangeName(id)} — use the exchange website`);
  }
}

export function ExchangeWithdrawScreen() {
  const nav = useNavigation<Nav>();
  const addresses = useWallet((s) => s.addresses)();
  const [exchange, setExchange] = useState<ExchangeId>('binance');
  const [coin, setCoin] = useState('USDT');
  const [network, setNetwork] = useState('TRX');
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState(addresses[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const showToast = useApp((s) => s.showToast);

  const submit = async () => {
    setBusy(true);
    setError('');
    setId('');
    try {
      const result = await submitWithdraw(exchange, coin, address.trim(), amount, network);
      setId(result);
      showToast('Withdrawal submitted', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 200) : 'Withdrawal failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Exchange Withdraw" subtitle="Signed withdrawal request" onBack={() => nav.goBack()} />
      <Card>
        <Text style={styles.note}>
          Sends a signed withdrawal from the exchange to the address below. Double-check the
          network code — a wrong chain can lose funds. Withdrawal fees are set by the exchange.
        </Text>
      </Card>
      <SectionTitle>Exchange</SectionTitle>
      <View style={styles.pillRow}>
        {EXCHANGES.map((e) => (
          <Pill key={e.id} label={e.name} active={exchange === e.id} onPress={() => setExchange(e.id)} />
        ))}
      </View>
      <Field label="Coin" value={coin} onChangeText={setCoin} autoCapitalize="characters" />
      <Field label="Network code" value={network} onChangeText={setNetwork} autoCapitalize="characters" />
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Field label="Destination address" value={address} onChangeText={setAddress} autoCapitalize="none" />
      {addresses.length > 1 ? (
        <View style={styles.pillRow}>
          {addresses.slice(0, 5).map((a, i) => (
            <Pill key={a} label={`#${i + 1}`} active={a === address} onPress={() => setAddress(a)} />
          ))}
        </View>
      ) : null}
      {id ? <Badge text={`ID ${id}`} color={colors.green} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Submit withdrawal" onPress={() => void submit()} loading={busy} disabled={!amount || !address} />
    </Screen>
  );
}

export function ExchangeKeysScreen() {
  const nav = useNavigation<Nav>();
  const showToast = useApp((s) => s.showToast);
  const [configured, setConfigured] = useState<ExchangeId[]>([]);
  const [editing, setEditing] = useState<ExchangeId | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const out: ExchangeId[] = [];
    for (const e of EXCHANGES) {
      if (await readCreds(e.id)) out.push(e.id);
    }
    setConfigured(out);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const open = async (id: ExchangeId) => {
    setEditing(id);
    setApiKey('');
    setSecret('');
    setPassphrase('');
    const existing = await readCreds(id);
    if (existing) {
      setApiKey(existing.apiKey);
      setSecret(existing.secret);
      setPassphrase(existing.passphrase ?? '');
    }
  };

  const save = async () => {
    if (!editing) return;
    if (apiKey.trim().length < 4 || secret.trim().length < 4) {
      showToast('API key and secret are required', 'error');
      return;
    }
    setBusy(true);
    try {
      await writeCreds(editing, {
        apiKey: apiKey.trim(),
        secret: secret.trim(),
        ...(passphrase.trim() ? { passphrase: passphrase.trim() } : {}),
      });
      showToast('Keys stored in the Keystore vault', 'success');
      setEditing(null);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: ExchangeId) => {
    Alert.alert('Remove API keys?', `${exchangeName(id)} credentials will be deleted from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await writeCreds(id, null);
          await refresh();
          showToast('Keys removed', 'success');
        },
      },
    ]);
  };

  return (
    <Screen>
      <Header title="Exchange API keys" subtitle="Encrypted by Android Keystore" onBack={() => nav.goBack()} />
      <Card>
        <Text style={styles.note}>
          Keys are encrypted with the vault KEK and never leave the device. Billing-sensitive keys
          (OKX, 1inch, CMC, Alchemy) and signing keys are not bundled. LBank signing is disabled
          because its MD5/HMAC scheme could not be verified against the legacy code.
        </Text>
      </Card>
      {EXCHANGES.map((e) => {
        const ok = configured.includes(e.id);
        return (
          <Row
            key={e.id}
            label={e.name}
            value={ok ? 'configured' : '—'}
            onPress={() => void open(e.id)}
          />
        );
      })}
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing ? `${exchangeName(editing)} keys` : ''}>
        {editing ? (
          <>
            <Field label="API key" value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} />
            <Field label="Secret" value={secret} onChangeText={setSecret} autoCapitalize="none" autoCorrect={false} secureTextEntry />
            {hasPassphraseRequirement(editing) ? (
              <Field label="Passphrase" value={passphrase} onChangeText={setPassphrase} autoCapitalize="none" secureTextEntry />
            ) : null}
            <Button label="Save to vault" onPress={() => void save()} loading={busy} />
            {configured.includes(editing) ? (
              <Button label="Remove keys" kind="danger" onPress={() => void remove(editing)} style={{ marginTop: spacing.sm }} />
            ) : null}
            <Text style={styles.warn}>
              Use trade-only keys with withdrawals disabled where the exchange allows it. Avoid
              keys that can move funds if the device is compromised.
            </Text>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function futuresMarketRows(id: ExchangeId, raw: any): { symbol: string; price: number; change: number }[] {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const rows: any[] =
    id === 'bybit'
      ? raw?.result?.list ?? []
      : id === 'bitget'
        ? raw?.data ?? []
        : id === 'kucoin'
          ? raw?.data ?? []
          : id === 'mexc'
            ? raw?.data ?? []
            : Array.isArray(raw) ? raw : [];
  return rows.slice(0, 60).map((r) => ({
    symbol: String(r.symbol ?? r.contract ?? ''),
    price: num(r.lastPrice ?? r.lastPr ?? r.markPrice ?? r.price),
    change: num(r.priceChangePercent ?? r.price24hPcnt ?? r.changeRate) * (id === 'bybit' ? 100 : 1),
  })).filter((r) => r.symbol);
}

export function FuturesScreen() {
  const nav = useNavigation<Nav>();
  const [id, setId] = useState<ExchangeId>('binance');
  const [markets, setMarkets] = useState<{ symbol: string; price: number; change: number }[]>([]);
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [quantity, setQuantity] = useState('');
  const [lev, setLev] = useState('5');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState('');
  const showToast = useApp((s) => s.showToast);
  const config = FUTURES_CONFIGS.find((c) => c.id === id) ?? FUTURES_CONFIGS[0]!;

  const load = async (target: ExchangeId = id) => {
    const cfg = FUTURES_CONFIGS.find((c) => c.id === target);
    if (!cfg) {
      setError('Futures are not supported for this exchange');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const adapter = adapterFor(target, null);
      const json = await adapter.publicJson(cfg.marketsPath, cfg.category ? { category: cfg.category } : {});
      setMarkets(futuresMarketRows(target, json));
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 180) : 'Futures markets failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const place = async () => {
    const creds = await readCreds(id);
    if (!creds) {
      showToast('Configure API keys first', 'error');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = futuresOrderBody(id, { symbol, side, type: 'market', quantity, leverage: Number(lev) || undefined });
      if (config.category) (body as Record<string, unknown>).category = config.category;
      const result = await adapterFor(id, creds).signed({ method: 'POST', path: config.orderPath, body });
      setRaw(JSON.stringify(result, null, 2).slice(0, 4000));
      showToast('Futures order submitted', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 200) : 'Order failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const positions = async () => {
    const creds = await readCreds(id);
    if (!creds) {
      showToast('Configure API keys first', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await adapterFor(id, creds).signed({
        method: 'GET',
        path: config.positionsPath,
        params: config.category ? { category: config.category } : {},
      });
      setRaw(JSON.stringify(result, null, 2).slice(0, 6000));
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 200) : 'Positions failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Futures" subtitle="USDT-M markets on five exchanges" onBack={() => nav.goBack()} />
      <View style={styles.pillRow}>
        {FUTURES_CONFIGS.map((c) => (
          <Pill key={c.id} label={c.name} active={c.id === id} onPress={() => setId(c.id)} />
        ))}
      </View>
      {busy ? <Text style={styles.note}>Loading…</Text> : null}
      {markets.slice(0, 12).map((m) => (
        <Row key={m.symbol} label={m.symbol} value={`${m.price ? m.price.toFixed(4) : '—'}  ${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}%`} onPress={() => setSymbol(m.symbol)} mono />
      ))}
      <Field label="Symbol" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" />
      <View style={styles.pillRow}>
        <Pill label="LONG" active={side === 'long'} onPress={() => setSide('long')} />
        <Pill label="SHORT" active={side === 'short'} onPress={() => setSide('short')} />
      </View>
      <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
      <Field label="Leverage (reference only)" value={lev} onChangeText={setLev} keyboardType="number-pad" hint="Leverage is set on the exchange; this build does not change margin settings." />
      <View style={styles.rowGap}>
        <Button label="Place market order" onPress={() => void place()} loading={busy} style={{ flex: 1 }} disabled={!symbol || !quantity} />
        <Button label="Positions" kind="ghost" onPress={() => void positions()} loading={busy} style={{ flex: 1 }} />
      </View>
      {raw ? <Card><Text style={styles.mono} selectable>{raw}</Text></Card> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  marketRow: { flexDirection: 'row', alignItems: 'center' },
  symbol: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  price: { color: colors.text, fontFamily: font.mono, fontSize: font.small },
  change: { fontSize: font.tiny, fontFamily: font.mono },
  note: { color: colors.muted, fontSize: font.small, lineHeight: 19, marginBottom: spacing.sm },
  warn: { color: colors.amber, fontSize: font.tiny, marginTop: spacing.sm, lineHeight: 16 },
  error: { color: colors.red, fontSize: font.small, marginTop: spacing.sm },
  addr: { color: colors.text, fontFamily: font.mono, fontSize: font.small, textAlign: 'center', marginVertical: spacing.md },
  rowGap: { flexDirection: 'row', gap: spacing.sm },
  mono: { color: colors.text, fontFamily: font.mono, fontSize: font.tiny },
});
