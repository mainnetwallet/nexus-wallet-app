# Known Gaps

Honest list of what is not reproduced, restricted, or not runtime-verified. Final status is
repeated in `FINAL_REPORT.md` and `PARITY_CHECKLIST.md`.

## Cannot reproduce / not applicable

| # | Item | Why | User-visible impact |
|---|------|-----|---------------------|
| G1 | Service-worker bootstrap and `eval` of `localStorage['__nexus_sw_code__']` | RN has no service worker; eval of stored JS is a security hole | None (internal boot mechanism) |
| G2 | `ncx1:` encrypted keys | Legacy format is unrecoverable (no key derivation retained) | Affected users must re-import; migration reports the count |
| G3 | Legacy third-party relays | Must not be reused; operator deploys their own proxy | Provider calls with secrets require a configured proxy in production |
| G4 | Exact Chromium rendering of legacy CSS | RN-native components, not a pixel-identical WebView | Visual parity is functional, not pixel-perfect |
| G5 | GitHub commit `1466278` provenance | Reference ZIP has no `.git` | Audit cites file/line instead of commit |

## Functional gaps

| # | Item | Status / impact |
|---|------|-----------------|
| G6 | Exchange trading coverage | Spot order placement and withdraw bodies are implemented for 7 exchanges (Binance, MEXC, Bybit, KuCoin, Gate.io, Bitget, HTX). The other 8 adapters support markets/orders/portfolio reads and throw an explicit "not supported" error for trading. Futures order bodies exist for 5 exchanges but live placement was not exercised (G21). |
| G7 | Exchange WebSocket order books | REST polling only; no streaming market data. |
| G8 | Charts | Native SVG candles/line only (2 of the legacy 11 chart types). Drawing tools and per-coin drawing persistence are not ported. Tapping a price opens the chart with the selected symbol. |
| G9 | Nansen/Jumper premium endpoints | Public endpoints only; a premium key must be supplied through the proxy and is never bundled. |
| G10 | Biometric unlock | Native `BiometricPrompt` is wired, but unlock still requires the PIN-derived vault key; biometrics convenience-unlock is not a separate KEK. Runtime behavior unverified on this machine. |
| G11 | Push notifications | Local notifications + foreground service only; legacy had no FCM either. |
| G12 | Screenshot coverage | Eight reference renders plus 13 emulator captures (`runtime-01`…`runtime-11`, `runtime-13`, `runtime-14`). The lock, setup and Send screens are FLAG_SECURE by design and cannot be captured; UI dumps are stored under `docs/PHASE_REPORTS/runtime-*-ui.xml` instead. Token manager, history, confirm sheets and chart were still not captured. |
| G13 | New Architecture | `newArchEnabled=false`. React Native 0.81 new-arch builds failed on a `react-native-screens` C++ `-Werror` incompatibility with the available NDK; disabling it keeps the debug APK build reproducible. |
| G14 | compileSdk 35 | Legacy used 34. RN 0.81 requires compileSdk 35; `targetSdkVersion` remains 34 as required. |
| G15 | Display currency | Preference pills (USD/BDT/ETH/BTC) persist, but all value formatting in this build is USD. |
| G16 | Light theme | The pill stores `light`, but the shipped palette is dark-only (`#050508` / `#6366f1`). |
| G17 | Release signing | Release config is unsigned with minify/shrink enabled. Operators must add their own `signingConfigs`; no keystore is committed. |
| G18 | Physical-device QA | Runtime QA ran on an Android 34 emulator (debug + QA-signed release). Biometrics, foreground-service lifecycle, StrongBox-backed Keystore and real-device performance remain untested; rows needing them stay PARTIAL and map to `MANUAL_QA.md`. |
| G19 | Migration fixtures | Migration is proven with synthetic legacy vaults in Jest (including wrong-PIN and rollback paths), not with a real legacy app installation. |
| G20 | Automation continuity | SUP/BSB timers run while the app/service is alive (foreground service supported); they do not resume automatically after a cold reboot. |
| G21 | Live exchange/provider verification | No exchange or provider keys were available. Signing is unit-tested against fixture requests; live order/quote acceptance is unverified. |
| G22 | Proxy deployment hardening | The proxy binds to `127.0.0.1` by default, has per-provider host allowlists, request/response size caps and timeouts, but ships no TLS termination or client authentication. Put it behind TLS + auth if exposed beyond localhost. |
| G23 | CI execution | `.github/workflows/ci.yml` is written but has not run on GitHub from this offline workspace. |
| G24 | Chart fullscreen orientation | The chart calls `setOrientation(false)` on mount and restores portrait on unmount; behavior on a physical device is unverified. |
| G25 | Clipboard auto-clear | `copySecret` clears after 30 s from a JS timer; if the app is killed first, the last copied value stays in the clipboard. |

## Verification limits

- Runtime QA used an emulator, not a physical handset. PIN setup/unlock, the Keystore
  vault, FLAG_SECURE, wallet generation and principal screens were exercised; biometrics,
  clipboard timing, WebView dApp signing, funded transactions and migration were not.
- Live provider quotes cannot be verified without keys/network; unit tests use recorded
  shapes and mocked transports.
- Legacy data fixtures are synthetic (random keys generated in tests); no real user data was
  read or stored.

## Deliberate non-goals

- No new product features beyond the Section 11 security hardening.
- No analytics, crash reporting, telemetry, or remote config.
- No bundled provider keys, exchange secrets, mnemonics or `.env` files.
