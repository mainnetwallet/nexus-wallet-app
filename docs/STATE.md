# State

Snapshot of the build. Updated after Phase 8 runtime QA and the second packaging pass.

- Date: 2026-11-25
- Phase: 8 (migration, hardening, packaging) — complete; runtime QA complete
- Core tests: **11 suites / 118 tests passing**
- Proxy tests: **15 tests passing**
- Typecheck: clean (`core` and `ui`, strict)
- Lint: clean (`core`, zero warnings)
- Debug APK: built; the archived copy embeds the Hermes bundle
  (`assembleDebug -PbundleInDebug=true`) and passed the full QA suite with Metro stopped,
  so it runs standalone after install
- Release APK: built (Hermes bytecode, R8), signed with the debug key only for QA,
  exercised on the same emulator without Metro; shipped artifact remains unsigned
- APK identity: `com.nexus.wallet`, versionCode 10213, versionName 1.214-rebuild,
  minSdk 24, targetSdk 34, label "Nexus Wallet"
- Legacy untouched: yes (`legacy/` read-only reference; no git repo present)
- Final ZIP: rebuilt after runtime fixes and the standalone-APK rebuild; the archive's own
  size/SHA-256 are reported with the delivered file (see `FINAL_REPORT.md` for contents)

## Completed

| Area | Artifacts |
|------|-----------|
| Legacy audit | 8 chunk reports (1–98,580), JSON indexes (DOM ids, functions, globals, hosts, storage keys, endpoints, CSS vars, sections, native calls) |
| Docs | FEATURE_INVENTORY, UI_SCREEN_MAP + 8 reference renders + 13 device screenshots, STORAGE_SCHEMA, NETWORK_ENDPOINTS, JS_BRIDGE_API, PROVIDER_API, PARITY_CHECKLIST, PORT_MAP, SECRETS_TO_ROTATE, MIGRATION_PLAN, BRIEF_CORRECTIONS, READ_LOG, DECISIONS, KNOWN_GAPS, STATE, MANUAL_QA, SECURITY_CHANGES, FINAL_REPORT |
| Core crypto | NexusCrypto v4 (AES-GCM, PBKDF2 200k), ncx3/nsx2 XOR, legacy group decrypt/encrypt, PIN hash 600k + limiter |
| Core wallet | key parsing/derivation, groups CRUD, multi-key flattening, migration verification, chain registry |
| Core RPC/gas | failover client, EIP-1559/legacy gas with legacy float quirks, buffered estimate, retry |
| Core prices | Binance/CoinGecko/CMC/DexScreener, stable pinning, TTLs, persisted cache |
| Core tokens | 53 defaults, per-group store, removal memory, duplicate rules, ERC-20 codec, address-keyed balances |
| Core history | entries, 15-cap bridge/swap trimming, tombstones, patch by id/hash |
| Core swap | 16 providers, quote normalization, execution, proxy transport, OKX signing |
| Core bridge | 4 providers, route normalization, status polling, execution |
| Core security | PIN hashing/limiting, redaction |
| Core storage | `nexus2/*` schema types |
| Core transfer | 9 tools + phrase derivation: batch native/token, multi-key, wallet→wallet, self, NFT, approvals, withdraw split, balance check |
| Core automation | SUP loop, BSB, Nansen client, EIP-7702 exact port, paymaster |
| Core exchanges | 15 adapters, all signing schemes, futures (5 venues), Keystore key store, legacy key migration |
| Core browser | EIP-1193 provider with origin gating, tx/chain validation, error codes |
| Core migration | legacy reader → decrypt → address verify → staged write → read-back → optional legacy delete, rollback blob |
| UI | theme, navigation (wallet + exchange tabs), lock/setup, home, send/receive, history, token manager/chart, address book, pairs, profile, settings/RPC/console, swap, bridge, transfer hub, automation, browser, exchange/futures/deposit/withdraw, migration |
| Android | RN 0.81 app, Kotlin vault/legacy reader/device security/app control/FGS/PIN KDF, manifest identity, deep link, portrait |
| Proxy | `/v1/forward`, host allowlists, header stripping, key injection, OKX HMAC, caps/timeouts, `.env.example`, 15 tests |
| Delivery | CI workflow, README, `.gitignore`, packaging script, SHA256SUMS, debug APK, verified ZIP, FINAL_REPORT |
| Runtime QA | `tools/smoke.mjs`, `tools/qa-wallet.mjs`, `tools/qa-nav.mjs`; evidence in `docs/screenshots/runtime-*` and `docs/PHASE_REPORTS/runtime-*` |

## Runtime fixes found on the emulator

1. **Fresh install skipped PIN creation** — `bootstrap` set `locked=false` when no PIN
   existed, so `LockGate` never rendered and an empty Home appeared. Gate now renders on
   `locked || !hasPin` (`ui/src/App.tsx`).
2. **Debug builds could not load JS** — no debug manifest override existed, so the
   locked-down network config blocked Metro. Added a debug-only manifest/security config
   allowing cleartext to `localhost`/`10.0.2.2`/`127.0.0.1`; release config unchanged.
3. **PIN PBKDF2 never finished on Hermes** — the pure-JS 600k-iteration derivation pegged
   the CPU for minutes. Added `NexusPin` + `Pbkdf2.kt` (HMAC-SHA256 PBKDF2, API 16+,
   output-identical) and switched `ui/src/native/pin.ts` to it. The vault KEK now uses the
   same helper, which also removes a hidden API-26 requirement from `NexusSecureStore`.
4. **Legacy WebView cleanup ran on the JavaBridge thread** — `removeJavascriptInterface`
   and `destroy` were dropped by WebView's thread check, leaking the view/interface.
   Teardown is now posted to the main looper (`NexusLegacyStore.kt`).
5. **Zustand v5 render loop** — selectors returning fresh arrays (`s.keys()`, `s.tokens()`,
   `s.addresses()`) put Send/Automation/Transfer Hub/Exchange/Browser into
   "Maximum update depth exceeded" at 100% CPU. Selectors now return stable functions that
   are invoked during render.
6. **Pre-existing lint failures** — unused EIP-1193 codes/imports, a control-character
   regex and an unused divisor now fixed; `npm run lint` is clean.

## Runtime evidence

- Emulator: Pixel 5 AVD, Android 14 (API 34, google_apis x86_64), 1080×2340, headless.
- Debug build (Metro) and QA-signed release build (Hermes bundle, no Metro): both booted,
  created a PIN, unlocked, generated 5 wallets, persisted them across process restart,
  rejected a wrong PIN, opened Send/Receive/Swap/Bridge/Profile/Settings/Exchange.
- Bundled debug APK re-verified with Metro stopped: setup → unlock → 5 wallets → restart →
  nav → market load all pass; this is the copy in the delivery archive.
- Exchange markets rendered live Binance prices; Home showed the generated wallet and
  Base token list.
- FLAG_SECURE verified: `screencap` returns empty while the lock, Send and setup screens
  are focused, then works after unlock. Loss of lock-screen PNG is intentional.
- Logcat after the fixes: no FATAL/ANR, no "Maximum update depth exceeded".

## Verification limits

- QA used an emulator, not a physical handset; biometrics, push, FGS lifecycle and real
  device Keystore StrongBox are untested.
- No provider/exchange keys were available; live quote/order acceptance is unverified.
- New Architecture is disabled; compileSdk is 35 while targetSdk stays 34.
- Release APK is unsigned; CI has not run on GitHub from this offline workspace.
- See `KNOWN_GAPS.md` G1–G25 for the full list.

## Next

1. Repeat `MANUAL_QA.md` on a physical device with throwaway wallets (A–K).
2. Verify live quotes/orders with user-supplied keys and a deployed proxy.
3. Add release signing in CI/operator environment; re-enable New Architecture when the
   RN/screens/NDK combination is upgraded.
