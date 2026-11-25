# Decisions

Autonomous decisions taken where the brief was silent or the legacy behaviour needed a
target implementation choice. Each entry: decision, rationale, consequence.

## D1 — Bare React Native + TypeScript (no Expo)

Native modules are required: Android Keystore, biometric prompt, foreground service,
FLAG_SECURE, and a hardened WebView. Expo managed workflow adds friction for these.
Bare RN with a single `android/` project keeps the legacy applicationId and manifest.

## D2 — UI-agnostic `core/` package, thin RN layer

All business logic (crypto, gas, prices, tokens, history, swap/bridge engines, exchange
adapters, automation, migration) lives in `core/` with injectable `fetch`/storage. This
makes the 98k-line legacy behaviour unit-testable without an emulator and keeps secrets
out of UI code. RN imports only typed services.

## D3 — Preserve legacy storage keys; new writes under `nexus2/*`

Migration reads exact legacy keys and shapes. New data is namespaced so a half-finished
migration can never corrupt legacy state, and rollback is a key-copy, not a schema rewrite.

## D4 — Address-keyed balance cache (security deviation)

Legacy `nexus_bal_cache_<last8-of-private-key>` leaks key fragments through storage names.
Rebuild keys by wallet address; the loader rejects legacy payloads unless `legacyWalletKey`
is explicitly provided for one-time import. Behaviour (no TTL, per-token entries) preserved.

## D5 — Provider keys only in `proxy/`

Signing/billing keys (OKX secret+passphrase, 1inch, CMC, Alchemy, Coinbase paymaster) must
not ship in the client. `core` calls a proxy contract (`POST /v1/forward`) for providers that
need server keys; OKX request signing also happens in the proxy. Direct mode remains for
keyless providers. `proxy/.env.example` holds placeholders only.

## D6 — Exact gas arithmetic, including float quirks

Legacy `estimateGasWithBuffer` computes `BigInt(Math.ceil(Number(est) * 1.12))`, which yields
`112001n` for 100000 (binary float). Tests assert the legacy result, not the "clean" value.
EIP-1559 max fee boost 1.20, priority ratio 0.10, legacy 1.10, min priority 1 wei, one retry,
400 ms pause — all preserved.

## D7 — Price engine order and TTLs preserved

Binance batch → CoinGecko → CMC (only when key present) → DexScreener; stablecoins pinned at
$1; 15 s memory TTL, 5 min persisted cache `nexus_price_cache_v1`; CoinGecko 429 backoff 120 s.
No new price sources.

## D8 — History trimming and tombstone semantics preserved

Bridge+swap combined cap 15; other types untrimmed; `brh_cleared_ts` hides entries in bridge
views only (profile history untouched); pending/failed patched by id or hash. Reproduced in
`core/src/history/store.ts` with tests.

## D9 — Tokens per group, default re-injection with removal memory

`nexus_custom_tokens_<groupId>`, `<key>_removed_defaults`, duplicate rule = same chain AND
(id | cgId | contract). Same token on another chain is intentionally addable. 53 defaults
ported across 10 chains.

## D10 — Exchange credentials in Keystore storage, not plaintext

Legacy wrote `nexus_exc_keys_v1` as plaintext despite an AES comment. Rebuild encrypts each
exchange credential set with the Keystore-wrapped key; the UI shows only masked key prefixes.
This is a Section 11 security hardening, not a feature change.

## D11 — dApp browser hardening

RN WebView with: no file access, no mixed content, no JS injection from remote code, a
strict allowlist for `window.ethereum` injection, per-origin chain permissions, and
`setWebContentsDebuggingEnabled(false)` in release. `InAppBrowserActivity` equivalent is the
same WebView screen with a visible origin bar. External links open in the system browser.

## D12 — Charts: bundled lightweight-charts inside an isolated local WebView

The legacy uses lightweight-charts with 11 chart types and drawing tools. Reimplementing
drawing tools in RN SVG would drift. The chart screen loads a **local bundled** HTML asset
(no network, CSP locked, no wallet access) and passes only OHLCV data. The fullscreen chart
is the only screen that unlocks orientation.

## D13 — Version identity

`applicationId com.nexus.wallet`, `versionCode 10213` (10000 + legacy 213, above both 213 and
the brief's 270), `versionName 1.214-rebuild`, minSdk 24, targetSdk 34, portrait app-wide.

## D14 — No new product features

Only Section 11 security hardening is added. Everything else maps to a legacy screen or
behaviour; anything that cannot be reproduced is listed in `KNOWN_GAPS.md` rather than
invented.

## D15 — English-only UI

Legacy is English (with Bengali developer comments). No translation layer is invented; the
i18n hook exists in the theme/strings module for future work but ships one locale.

## D16 — CI builds debug APK only

The workspace has no release keystore and no Android SDK guarantee. CI type-checks, tests,
lints, and (when SDK is available) assembles a debug APK. Release signing is an operator
step documented in `README`; no keystore is committed.

## D17 — Screenshots via headless browser against the legacy file

`docs/screenshots/` is populated by loading `legacy/.../index.html` in Chromium at 412×915,
hiding the lock overlay programmatically, and capturing each screen. No wallet data is
entered. This keeps evidence reproducible without an Android emulator. Actual captures landed
at 831×785 (the tool surface); all eight tab screens including exchange are present, while
wallet-state overlays are not captured (G12).

## D18 — Proxy contract and allowlists

The client posts `{provider,url,method,headers,body,query}` to `/v1/forward`. The proxy owns
the provider→host allowlist (exact host or subdomain), strips client credential headers
(`authorization`, `x-api-key`, `x-lifi-api-key`, `x-integrator-id`, `apikey`, `ok-access-*`),
injects only its own env keys, signs OKX HMAC-SHA256 over `timestamp+METHOD+path+query`, and
returns `{status,body}`. `lifi`, `rango` and `dodo` are allowed to forward keyless; `odos`,
`oneInch`, `enso`, `squid`, `nansen` and `okx` fail with 503 when unconfigured. Redirects are
not followed, and errors never echo upstream details that could contain secrets.

## D19 — New Architecture disabled

`newArchEnabled=false` because `react-native-screens` 4.11 failed to build its C++ under the
available NDK with `-Werror` treating a deprecated `Shared` alias as fatal. The legacy app
has no Fabric requirements; keeping the old architecture makes the debug APK reproducible.
Revisit when the RN/screens/NDK triple is upgraded together.

## D20 — compileSdk 35, targetSdk 34

React Native 0.81 requires compileSdk 35. The brief's targetSdk 34, minSdk 24 and all
application identity fields are untouched; aapt confirms `targetSdkVersion:'34'`.

## D21 — Exchange trading coverage is explicit

All 15 adapters implement reads (markets, orders, portfolio) and request signing. Spot order
placement and withdrawal bodies are implemented for the 7 exchanges whose legacy code paths
were clear (Binance, MEXC, Bybit, KuCoin, Gate.io, Bitget, HTX). The remaining exchanges throw
`not supported on this exchange yet` instead of guessing payload shapes. Futures bodies exist
for 5 exchanges. This trades breadth for not sending malformed signed orders.

## D22 — Runtime QA moved from "impossible" to an emulator pass

Initially no device was available and all interactive rows were marked PARTIAL. An Android 34
x86_64 emulator was installed later; the debug build (Metro) and a QA-signed release build
(Hermes bundle, no Metro) were both exercised. Rows with runtime evidence are upgraded in
`PARITY_CHECKLIST.md` (`M` key) and the evidence is archived under `docs/screenshots/runtime-*`
and `docs/PHASE_REPORTS/runtime-*`. Physical-device-only behaviour (biometrics, FGS lifecycle,
StrongBox) stays PARTIAL.

## D23 — Chart scope: native candles/line

The token chart renders candles or a line from Binance klines in `react-native-svg`, with
fullscreen orientation. The legacy 11 chart types, indicators and drawing tools are not
reproduced; shipping a bundled lightweight-charts WebView was rejected because it adds a
second executable surface for no functional gain in this pass. Recorded as G8.


## D24 — PIN PBKDF2 runs in native Kotlin

The 600k-iteration PBKDF2-SHA256 in `@noble/hashes` never completed on Hermes (minutes of
100% CPU on the emulator). `NexusPin` + `Pbkdf2.kt` now derive the PIN hash on a background
thread with the same parameters and wire format (`nexus:pin:v2:<salt>:<hash>`). The helper is
a hand-rolled HMAC-SHA256 PBKDF2 rather than `SecretKeyFactory("PBKDF2WithHmacSHA256")` so it
also works on API 24–25; the vault KEK uses the same helper for the same reason.

## D25 — Debug-only cleartext for Metro

The locked-down network config blocked the Metro dev server, so debug builds could not load
JS at all. `app/src/debug/` now overlays a security config that permits cleartext only to
`localhost`, `127.0.0.1` and `10.0.2.2`. Release keeps `usesCleartextTraffic="false"` and the
original config.

## D26 — Zustand selectors must return stable references

Zustand v5's `useSyncExternalStore` integration re-renders forever when a selector returns a
new array each call. Screens that need `keys()`, `tokens()`, `addresses()` select the stable
method (`useWallet((s) => s.keys)`) and invoke it during render. This was found by the Send
screen render loop in logcat and applies to every screen listed in `STATE.md`.

## D27 — Standalone debug APK for delivery

A plain `assembleDebug` APK contains no JS bundle and shows "Unable to load script" without
Metro, which made it unusable as the archived artifact. `app/build.gradle` now accepts
`-PbundleInDebug=true`, which clears `debuggableVariants` so the React Gradle plugin embeds
the Hermes bundle; the variant stays debuggable (WebView debugging follows
`BuildConfig.DEBUG`), and developers without the flag keep the Metro workflow. The archived
APK was built this way and QA'd with Metro stopped.
