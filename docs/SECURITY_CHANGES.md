# Security Changes

Only the Section 11 hardening allowed by the brief is added. Each item states the legacy
behaviour, the rebuild change, and where it lives.

## 1. Secrets hygiene

| Item | Legacy | Rebuild | Status |
|------|--------|---------|--------|
| Provider keys in client | CMC, 1inch, Rango, LiFi, Odos and paymaster URLs embedded | No provider secret strings in `core/` or `ui/`; secret-bearing calls use `POST /v1/forward` when a proxy is configured | DONE (`proxy/`) |
| Exchange keys | Plaintext `nexus_exc_keys_v1` | Keystore-wrapped vault entries under `nexus2/exchange/<id>`; UI shows `maskApiKey` | DONE (`ExchangeScreens.tsx`, `NexusSecureStore.kt`) |
| Docs/chat | — | Masked to first 3 chars + `…` | DONE (`SECRETS_TO_ROTATE.md`) |
| `.env` | — | `.env.example` placeholders only; `.gitignore` blocks `.env*`, packaging excludes them | DONE |
| GitHub token | — | No token value is written to any file, log, doc or ZIP; CI uses `permissions: contents: read` and no explicit token | DONE |

## 2. Key storage

- `NexusSecureStore.kt`: AES-256-GCM entry encryption with a 12-byte random IV; KEK =
  HMAC-SHA256(Android Keystore HMAC key, PBKDF2-HMAC-SHA256(PIN, per-install salt, 200k)).
  Entries cannot be decrypted off-device without the Keystore key.
- PIN verifier is separate: PBKDF2-SHA256, 600k iterations, `nexus:pin:v2:<salt>:<hash>`,
  constant-time compare (`core/src/security/pin.ts`). The derivation runs natively
  (`NexusPin.kt` + `Pbkdf2.kt`, off the JS thread) because the pure-JS version never finished
  on Hermes; output format is unchanged.
- Changing the PIN calls `rewrapVault(pin)` (native `rewrap`) over every vault entry before
  the PIN hash is replaced; a failed re-wrap aborts the change (no lockout of data).
- StrongBox is reported via `isStrongBoxAvailable()`; the key generator uses the standard
  AndroidKeyStore provider for compatibility with minSdk 24.
- Legacy master secret and `_plain_backup` are deleted only after verified migration; a
  rollback blob is retained.

## 3. App lock

- PIN never stored; attempt limiter with exponential backoff persisted across relaunch
  (`AttemptLimiter`, core tests).
- Biometrics (`BiometricPrompt`, `androidx.biometric` 1.1.0) is a convenience gate that still
  requires the wallet to be unlocked with the PIN-derived vault key; PIN fallback always
  available.
- Lock re-engages through `LockGate`; key screens re-apply the secure flag on mount.

## 4. Screen and clipboard

- `FLAG_SECURE` set via `NexusDeviceSecurity.setSecureFlag` on send/secret screens; cleared on
  unmount. Verified on the emulator: `screencap` returns empty while the lock/setup/Send
  screens are focused and works after unlock.
- `MainActivity` starts secure before JS runs, so the lock screen cannot be captured even if
  JS never loads.
- `copySecret` writes the clipboard and schedules `clearClipboard` after **30 s** while the JS
  runtime is alive. This is not a native timer: killing the app before 30 s leaves the last
  copy in the clipboard (G25).
- Legacy clipboard-read prompts are removed; paste into secret fields is explicit.

## 5. Logging

- Console capture passes lines through `redact()`: private keys, mnemonic-length word
  sequences, `apiKey|secret|passphrase|token` values, long base64/hex strings
  (`core/src/security/redact.ts`, tests).
- The proxy logs only `provider`, method and status; never headers, bodies or URLs with keys.
- WebView debugging is explicitly `BuildConfig.DEBUG` in `MainApplication.kt`, so release
  builds cannot attach `chrome://inspect`. Release builds enable minify + resource shrinking.

## 6. dApp browser

Verified in `ui/src/screens/BrowserScreen.tsx`:

- WebView props: `allowFileAccess=false`, `allowUniversalAccessFromFileURLs=false`,
  `mixedContentMode="never"`, `javaScriptCanOpenWindowsAutomatically=false`,
  `setSupportMultipleWindows=false`, `thirdPartyCookiesEnabled=false`, `cacheEnabled=false`.
- Navigation allowlist: only `http`/`https`; everything else is refused by
  `onShouldStartLoadWithRequest`.
- Injected provider is a self-contained EIP-1193 shim (`window.ethereum`) with a strict
  message schema; no remote script loading and no `addJavascriptInterface`.
- Origins connect explicitly; every signature/transaction shows a sheet with origin, chain,
  account and a warning, and reject returns EIP-1193 `4001`.
- Chain switching/adding is validated against the registry; `wallet_watchAsset` is refused.

## 7. Network

- Android manifest sets `usesCleartextTraffic=false` via network security config.
- Proxy enforces per-provider host allowlists (exact host or subdomain), rejects `http:`,
  URL-embedded credentials, non-443 ports, oversized bodies/responses, and does not follow
  redirects (`redirect: 'manual'`). Client credential headers are stripped and replaced
  server-side.
- Upstream timeout defaults to 20 s; body cap 256 KiB; response cap 8 MiB.
- Legacy third-party relays are not reused; the operator deploys the proxy.

## 8. Migration-specific

- The hidden legacy WebView blocks network loads and is torn down on the main looper after
  every read; a runtime bug had leaked the JS interface because teardown ran on the JavaBridge
  thread (`NexusLegacyStore.kt`).
- Legacy data is read-only until verified; staged writes, read-back verification, address
  derivation verification, rollback blob, and only-then deletion.
- Partial decrypts are reported with masked counts; `ncx1` is reported as unsupported rather
  than dropped silently.
- PIN change during an unlocked session re-wraps every vault entry before switching hashes.

## 9. Verification

- Automated: redaction, PIN limiting, crypto round-trip, migration orchestrator (including
  wrong PIN and rollback), provider signing, OKX HMAC (proxy tests).
- Packaging: `.env`, keystores (except the standard debug key), `node_modules`, `legacy/` and
  `.git` are rejected by `tools/package.mjs`; the final archive is checked with `unzip -t`.
- Emulator runtime: fresh-install PIN gate, native PBKDF2, vault write/read across restart,
  wrong-PIN rejection, FLAG_SECURE blocking, deep link; logcat free of fatal/JS loops.
- Manual: `MANUAL_QA.md` §B, §H, §J, §K on a physical device (G18).

## 10. Known hardening limits

- Proxy ships without TLS termination or client auth; bind to localhost or front it with TLS
  and authentication before exposing it (G22).
- Clipboard clearing depends on the JS runtime (G25).
- New Architecture is disabled (G13); this is a build-compatibility trade-off, not a security
  regression.
- Debug builds only add a cleartext exception for Metro on `localhost`/`10.0.2.2`/`127.0.0.1`;
  release keeps cleartext disabled and the locked-down domain list.
