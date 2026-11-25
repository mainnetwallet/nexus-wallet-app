# JS Bridge API

Legacy WebView exposes `NexusAndroid.*` (Java @JavascriptInterface) and an HTTP bridge
(`NexusBridge`, `window.nxFetch`). Method list from `docs/index/native-calls.json`,
plus calls visible in the source. The rebuild implements the same surface through
React Native NativeModules (`NexusNative`) and a typed `native` facade in
`ui/src/native`.

## 1. HTTP bridge

| Method | Signature (legacy) | Behavior | Rebuild |
|--------|--------------------|----------|---------|
| `NexusBridge.httpGet(url, headersJson, cbId)` | string,string,string | `HttpURLConnection`, JS callback `__nxBridgeResolve(cbId, ok, status, body)` | not needed in RN; `fetch` is native |
| `NexusBridge.httpPost(url, headersJson, body, cbId)` | string,string,string,string | POST with body; same callback | not needed |
| `window.nxFetch(url, opts)` | `{method,headers,body,ms}` | wraps bridge with timeout and JSON/ok helpers | `core/http.ts` + `native/http` fallback for cookies/UA |

Native bridge timeouts: 8–10 s for market APIs, 15 s default. Response object in JS
mirrors `{ok,status,json(),text()}`.

## 2. Clipboard

| Method | Purpose | Security change |
|--------|---------|-----------------|
| `copyToClipboard(text)` | copy address/key | auto-clear after 60 s for sensitive content; flag value in UI |
| `getClipboardText()` | paste into inputs | requires explicit user action + confirmation sheet |

## 3. App lock / biometrics

| Method | Purpose |
|--------|---------|
| `isBiometricAvailable()` → boolean | show/hide biometric button |
| `showBiometricPrompt(title, subtitle)` → success/fail | gate master secret / unlock |
| `setOrientation(mode)` | `portrait` / `landscape` / `auto` for chart fullscreen |
| `exitApp()` | back-at-root behavior |

Rebuild: Kotlin `BiometricModule` + `LockModule`; PIN verification stays in `core/security/pin.ts`.

## 4. Notifications and foreground service

| Method | Purpose |
|--------|---------|
| `isNotificationPermissionGranted()` | settings state |
| `requestNotificationPermission()` | Android 13+ POST_NOTIFICATIONS |
| `showNotification(title, body)` | normal tx notification |
| `showNotificationWithUrl(title, body, url)` | tap opens explorer; 1–5 normal, 6+ silent |
| `showSilentNotification(title, body)` | background bot updates |
| `NexusForegroundService.start/stop` | keeps bot alive; dataSync FGS |

Rebuild: `NotificationModule` + `NexusForegroundService` ported, channel `nexus_tx`
(low importance except tx success).

## 5. Browser

| Method | Purpose |
|--------|---------|
| `openInAppBrowser(url)` | open `InAppBrowserActivity` with URL |
| `openSystemBrowser(url)` | `ACTION_VIEW` |
| `openBrowserTabSwitcher()` | show tabs UI |
| `isBrowserOpen()` | restore state |
| `getPersistedBrowserWallet()` | selected dApp account |
| `getSelectedBrowserChainId()` | selected dApp chain |
| `injectChainError(chainId)` | show unsupported-chain error in page |
| `web3SetSelectedWallet(addr)` | dApp account switch |
| `web3SwitchChain(chainId)` | dApp chain switch |
| `web3UpdateAccount(addr)` | notify page of account change |
| `web3Resolve(id, resultJson)` | resolve EIP-1193 request |
| `web3Reject(id, code, message)` | reject request |
| `web3OpenWalletDrawer()` | account picker from page |
| `showTxModal(json)` / `dismissTxModal()` | dApp tx confirmation sheet |
| `showDappTxSuccess(hash, chainId)` | success modal with explorer |

Rebuild: `DappBridgeModule` handles `window.nexusNative.request(...)` messages; the
protocol constants live in `core/src/dapp/provider.ts`. WebView debugging is disabled
in release; navigation allowlist is http(s) only; `onShouldStartLoadWithRequest`
blocks `intent://`, `file://`, `javascript:` and unknown schemes.

## 6. Toast / UI

| Method | Purpose |
|--------|---------|
| `showToast(message, icon)` | native toast fallback |
| `showTxModal` / `dismissTxModal` | see above |

RN renders toasts in JS (`ToastHost`), no native call required; kept for parity of
bot/background flows.

## 7. Message envelope (new)

All new bridge calls use one typed envelope:

```json
{ "id": "uuid", "method": "wallet.unlock", "params": { "...": "..." } }
```

Responses: `{ "id": "...", "ok": true, "result": { ... } }` or
`{ "id": "...", "ok": false, "error": { "code": "LOCKED", "message": "..." } }`.
Errors never include secrets; `core/security/redact.ts` is applied to every log line.
