import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Wallet } from 'ethers';
import {
  Eip1193Provider,
  ProviderRpcError,
  type ChainInfo,
  type ProviderTxRequest,
  type WalletBackend,
} from '@nexus/core';
import { Badge, Button, Card, Field, Header, Pill, Row, Screen, SectionTitle, Sheet } from '../components/ui';
import { colors, font, spacing } from '../theme';
import { useWallet } from '../stores/wallet';
import { useApp } from '../stores/app';
import { executeTx, rpcFor } from '../utils/exec';
import { prefs } from '../storage/prefs';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WebViewAny = WebView as unknown as React.ComponentType<any>;

interface PendingRequest {
  title: string;
  detail: string;
  kind: 'connect' | 'sign' | 'tx' | 'chain';
  approve: () => Promise<void> | void;
  reject: () => void;
}

function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

const INJECTED = `(function () {
  if (window.ethereum && window.ethereum.isNexus) return;
  var seq = 0;
  var pending = new Map();
  var listeners = new Map();
  function emit(event, payload) {
    var set = listeners.get(event);
    if (set) set.forEach(function (cb) { try { cb(payload); } catch (e) {} });
  }
  window.__nexusRpcResponse = function (id, result, error) {
    var entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) {
      var err = new Error(error.message || 'Request rejected');
      err.code = error.code;
      err.data = error.data;
      entry.reject(err);
    } else {
      entry.resolve(result);
    }
  };
  var provider = {
    isNexus: true,
    isMetaMask: false,
    request: function (args) {
      var method = args && args.method;
      var params = (args && args.params) || [];
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        pending.set(id, { resolve: resolve, reject: reject });
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nexus-rpc', id: id, method: method, params: params }));
        } else {
          pending.delete(id);
          reject(new Error('Nexus bridge not available'));
        }
      });
    },
    on: function (event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return provider;
    },
    removeListener: function (event, cb) {
      var set = listeners.get(event);
      if (set) set.delete(cb);
      return provider;
    },
    enable: function () { return provider.request({ method: 'eth_requestAccounts' }); },
    send: function (methodOrPayload, params) {
      if (typeof methodOrPayload === 'string') return provider.request({ method: methodOrPayload, params: params });
      return provider.request(methodOrPayload);
    },
    sendAsync: function (payload, cb) {
      provider.request(payload).then(function (result) { cb(null, { id: payload.id, jsonrpc: '2.0', result: result }); }, cb);
    }
  };
  window.__nexusEmit = emit;
  Object.defineProperty(window, 'ethereum', { value: provider, configurable: false, writable: false });
  window.dispatchEvent(new Event('ethereum#initialized'));
})(); true;`;

export function BrowserScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Browser'>>();
  const initial = route.params?.url ?? '';
  const keys = useWallet((s) => s.keys)();
  const customChains = useWallet((s) => s.customChains);
  const setChain = useWallet((s) => s.setChain);
  const chainId = useWallet((s) => s.chainId) ?? 1;
  const log = useApp((s) => s.log);
  const showToast = useApp((s) => s.showToast);

  const [input, setInput] = useState(initial);
  const [url, setUrl] = useState(normalizeUrl(initial) ?? '');
  const [addressIndex, setAddressIndex] = useState(0);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [connected, setConnected] = useState(false);
  const webRef = useRef<any>(null);
  const originKey = useMemo(() => {
    const match = /^(https?):\/\/([^/?#]+)/i.exec(url);
    return match ? `${match[1]!.toLowerCase()}://${match[2]!.toLowerCase()}` : '';
  }, [url]);
  const wallet = keys[addressIndex];

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const provider = useMemo(() => {
    const backend: WalletBackend = {
      async getAccounts() {
        return wallet ? [wallet.address] : [];
      },
      async getChainId() {
        return chainId;
      },
      requestAccounts(origin) {
        return new Promise<string[]>((resolve, reject) => {
          if (!wallet) {
            reject(new ProviderRpcError(4100, 'No wallet is selected'));
            return;
          }
          if (connected) {
            resolve([wallet.address]);
            return;
          }
          setPending({
            kind: 'connect',
            title: 'Connect dApp?',
            detail: `${origin} wants to see ${wallet.address}.`,
            approve: () => {
              setConnected(true);
              setPending(null);
              resolve([wallet.address]);
            },
            reject: () => {
              setPending(null);
              reject(new ProviderRpcError(4001, 'User rejected the connection'));
            },
          });
        });
      },
      signMessage(origin, address, message) {
        return new Promise<string>((resolve, reject) => {
          const key = keys.find((k) => k.address.toLowerCase() === address.toLowerCase());
          if (!key) {
            reject(new ProviderRpcError(4100, 'Unknown account'));
            return;
          }
          setPending({
            kind: 'sign',
            title: 'Sign message',
            detail: `${origin}\n\n${message.slice(0, 600)}`,
            approve: async () => {
              try {
                const sig = await new Wallet(key.privateKey).signMessage(message);
                setPending(null);
                resolve(sig);
              } catch (err) {
                setPending(null);
                reject(err instanceof Error ? err : new Error('Signing failed'));
              }
            },
            reject: () => {
              setPending(null);
              reject(new ProviderRpcError(4001, 'User rejected the signature'));
            },
          });
        });
      },
      signTypedData(origin, address, data) {
        return new Promise<string>((resolve, reject) => {
          const key = keys.find((k) => k.address.toLowerCase() === address.toLowerCase());
          if (!key) {
            reject(new ProviderRpcError(4100, 'Unknown account'));
            return;
          }
          setPending({
            kind: 'sign',
            title: 'Sign typed data',
            detail: `${origin}\n\n${JSON.stringify(data).slice(0, 700)}`,
            approve: async () => {
              try {
                const typed = data as { domain?: any; types?: any; message?: any };
                const sig = await new Wallet(key.privateKey).signTypedData(typed.domain ?? {}, typed.types ?? {}, typed.message ?? {});
                setPending(null);
                resolve(sig);
              } catch (err) {
                setPending(null);
                reject(err instanceof Error ? err : new Error('Signing failed'));
              }
            },
            reject: () => {
              setPending(null);
              reject(new ProviderRpcError(4001, 'User rejected the signature'));
            },
          });
        });
      },
      signTransaction(origin, address, tx) {
        return new Promise<string>((resolve, reject) => {
          const key = keys.find((k) => k.address.toLowerCase() === address.toLowerCase());
          if (!key) {
            reject(new ProviderRpcError(4100, 'Unknown account'));
            return;
          }
          setPending({
            kind: 'tx',
            title: 'Sign transaction',
            detail: `${origin}\nto ${tx.to ?? '—'}\nvalue ${tx.value ?? '0'}`,
            approve: async () => {
              try {
                const signer = new Wallet(key.privateKey);
                const raw = await signer.signTransaction({
                  to: tx.to,
                  data: tx.data,
                  value: tx.value ? BigInt(tx.value) : 0n,
                  gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
                  chainId,
                } as any);
                setPending(null);
                resolve(raw);
              } catch (err) {
                setPending(null);
                reject(err instanceof Error ? err : new Error('Signing failed'));
              }
            },
            reject: () => {
              setPending(null);
              reject(new ProviderRpcError(4001, 'User rejected the transaction'));
            },
          });
        });
      },
      sendTransaction(origin, address, tx: ProviderTxRequest) {
        return new Promise<string>((resolve, reject) => {
          const key = keys.find((k) => k.address.toLowerCase() === address.toLowerCase());
          if (!key) {
            reject(new ProviderRpcError(4100, 'Unknown account'));
            return;
          }
          setPending({
            kind: 'tx',
            title: 'Send transaction',
            detail: `${origin}\nto ${tx.to ?? '—'}\nvalue ${tx.value ?? '0'}\ndata ${(tx.data ?? '0x').slice(0, 42)}`,
            approve: async () => {
              try {
                const hash = await executeTx({
                  chainId,
                  privateKey: key.privateKey,
                  to: tx.to ?? '',
                  data: tx.data,
                  value: tx.value ? BigInt(tx.value) : 0n,
                  gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
                  customChains,
                  onStatus: log,
                });
                setPending(null);
                resolve(hash);
              } catch (err) {
                setPending(null);
                reject(err instanceof Error ? err : new Error('Transaction failed'));
              }
            },
            reject: () => {
              setPending(null);
              reject(new ProviderRpcError(4001, 'User rejected the transaction'));
            },
          });
        });
      },
      async switchChain(origin, next) {
        setChain(next);
        log(`[dapp] ${origin} switched to chain ${next}`);
      },
      async addChain(_origin, chain: ChainInfo) {
        const custom = prefs.json<Record<string, unknown>[]>('chains.custom', []);
        if (!custom.some((c) => Number((c as { chainId?: number }).chainId) === Number(parseInt(chain.chainId, 16)))) {
          custom.push({
            chainId: Number(parseInt(chain.chainId, 16)),
            name: chain.chainName,
            nativeSym: chain.nativeCurrency.symbol,
            rpc: chain.rpcUrls[0],
            explorer: chain.blockExplorerUrls?.[0],
          } as Record<string, unknown>);
          prefs.setJson('chains.custom', custom);
        }
      },
      async watchAsset() {
        return false;
      },
      async rpcRequest(method, params) {
        const rpc = rpcFor(chainId, customChains);
        return rpc.request(method, params);
      },
    };
    return new Eip1193Provider(backend, { origin: originKey || 'nexus://wallet', connected: false });
  }, [wallet, keys, chainId, customChains, connected, originKey, log, setChain]);

  const onMessage = async (event: WebViewMessageEvent) => {
    let payload: { type?: string; id?: number; method?: string; params?: unknown[] };
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (payload.type !== 'nexus-rpc' || typeof payload.id !== 'number' || typeof payload.method !== 'string') return;
    const id = payload.id;
    try {
      const result = await provider.request({ method: payload.method, params: payload.params ?? [] });
      injectResult(id, result, null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      const code = err instanceof ProviderRpcError ? err.code : -32603;
      injectResult(id, null, { code, message });
    }
  };

  const injectResult = (id: number, result: unknown, error: { code: number; message: string } | null) => {
    const script = `window.__nexusRpcResponse(${id}, ${JSON.stringify(result ?? null)}, ${error ? JSON.stringify(error) : 'null'}); true;`;
    webRef.current?.injectJavaScript(script);
  };

  if (!url) {
    return (
      <Screen>
        <Header title="Browser" subtitle="dApps with an explicit-approval provider" onBack={() => nav.goBack()} />
        <Card>
          <Text style={styles.note}>
            Paste an https URL. Sites see only the selected account and must request a connection.
            Every signature and transaction opens a native confirmation first.
          </Text>
        </Card>
        <Field label="URL" value={input} onChangeText={setInput} autoCapitalize="none" placeholder="app.uniswap.org" />
        <Button
          label="Open"
          onPress={() => {
            const next = normalizeUrl(input);
            if (!next) {
              showToast('Enter a valid http(s) URL', 'error');
              return;
            }
            setUrl(next);
          }}
        />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.chrome, { paddingTop: 8 }]}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Text style={styles.chromeAction}>‹</Text>
        </Pressable>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => {
            const next = normalizeUrl(input);
            if (next) setUrl(next);
          }}
          autoCapitalize="none"
          style={styles.urlInput}
        />
        <Pressable onPress={() => webRef.current?.reload()} hitSlop={10}>
          <Text style={styles.chromeAction}>↻</Text>
        </Pressable>
      </View>
      <View style={styles.statusBar}>
        <Badge text={connected ? 'CONNECTED' : 'NOT CONNECTED'} color={connected ? colors.green : colors.muted} />
        <Text style={styles.origin} numberOfLines={1}>{originKey}</Text>
        <View style={styles.pillRow}>
          {keys.slice(0, 4).map((k, i) => (
            <Pill key={k.address} label={`#${i + 1}`} active={i === addressIndex} onPress={() => setAddressIndex(i)} />
          ))}
        </View>
      </View>
      <WebViewAny
        ref={webRef}
        source={{ uri: url }}
        injectedJavaScriptBeforeContentLoaded={INJECTED}
        injectedJavaScript={INJECTED}
        onMessage={onMessage}
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        thirdPartyCookiesEnabled={false}
        cacheEnabled={false}
        style={styles.web}
        onShouldStartLoadWithRequest={(req: { url: string }) => req.url.startsWith('https://') || req.url.startsWith('http://')}
        onError={() => showToast('Page failed to load', 'error')}
        onHttpError={() => showToast('Page returned an HTTP error', 'error')}
      />
      <Sheet visible={pending !== null} onClose={() => pending?.reject()} title={pending?.title ?? ''}>
        {pending ? (
          <>
            <Text style={styles.detail}>{pending.detail}</Text>
            <Row label="Chain" value={String(chainId)} />
            <Row label="Account" value={wallet ? `${wallet.address.slice(0, 10)}…${wallet.address.slice(-6)}` : '—'} mono />
            <View style={styles.rowGap}>
              <Button label="Reject" kind="danger" onPress={() => pending.reject()} style={{ flex: 1 }} />
              <Button label="Approve" kind="success" onPress={() => void pending.approve()} style={{ flex: 1 }} />
            </View>
            <Text style={styles.warn}>Only approve sites you trust. Signatures can move assets.</Text>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  chrome: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  chromeAction: { color: colors.text, fontSize: 24, paddingHorizontal: 4 },
  urlInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: font.small,
  },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  origin: { flex: 1, color: colors.muted, fontSize: font.tiny },
  pillRow: { flexDirection: 'row', gap: 4 },
  web: { flex: 1, backgroundColor: '#ffffff' },
  note: { color: colors.muted, fontSize: font.small, lineHeight: 19 },
  detail: { color: colors.text, fontSize: font.small, lineHeight: 19, marginBottom: spacing.md },
  rowGap: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  warn: { color: colors.amber, fontSize: font.tiny, marginTop: spacing.md },
});
