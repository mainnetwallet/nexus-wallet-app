# Phase 6 — dApp browser

Status: implementation complete; WebView runtime QA pending.

## Objective
Reproduce the in-app dApp browser and the EIP-1193 provider with a hardened WebView.

## Work performed
- `core/src/browser/eip1193.ts`: request router with explicit origin connections, per-origin
  permissions, chain validation, transaction/signature validation, and EIP-1193 errors
  (`4001`, `4100`, `4200`, `4900`, `4901`, `-32603`).
- `ui/src/screens/BrowserScreen.tsx`: URL normalization (http/https only), injected
  self-contained `window.ethereum` shim (`request`, events, `__nexusRpcResponse`),
  message bridge to RN, address/chain pills, approval sheet for connect/sign/typed data/
  sign-tx/send-tx with origin, chain and warning; chain switch/add; RPC passthrough;
  `wallet_watchAsset` refused; back handling.
- WebView lockdown: no file/content access, no universal file URL access, mixed content
  `never`, no multiple windows, third-party cookies and cache disabled, navigation limited to
  http/https.
- Release builds force `WebView.setWebContentsDebuggingEnabled(false)` via
  `BuildConfig.DEBUG`.

## Evidence
- Provider unit tests (T) cover origin gating and error codes.
- Browser screen typechecks/compiles (`S+B`).
- Manual checklist §H (not executed — no device, G18).

## Exit criteria
- [x] EIP-1193 injection and approval flow implemented
- [x] No `addJavascriptInterface`, no remote code loading, no file access
- [ ] Device test against a live dApp (M-H) — blocked (G18)

## Next phase
Exchange mode.
