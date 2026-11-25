# Parity Checklist

Status definitions: **DONE** = implemented with evidence; **PARTIAL** = implemented with a
documented limitation or missing runtime verification; **NOT DONE** = not implemented;
**CANNOT-REPRODUCE** = impossible/unsafe, explained.

Evidence keys:

- `T` — automated test in `core/test` (11 suites / 118 tests) or `proxy/test` (15 tests).
- `B` — compiled into the debug APK; identity checked with `aapt dump badging`
  (`com.nexus.wallet`, versionCode 10213, versionName 1.214-rebuild, minSdk 24, targetSdk 34).
- `S` — source file(s) exist and pass strict TypeScript typecheck (`ui` and `core`).
- `M` — runtime QA on the Android 34 emulator (debug with Metro, and a QA-signed release
  build without Metro); evidence under `docs/screenshots/runtime-*` and
  `docs/PHASE_REPORTS/runtime-*`. Remaining physical-device checks stay PARTIAL.
- `G` — limitation recorded in `KNOWN_GAPS.md`.

## 1. Audit and documentation

| Item | Status | Evidence |
|------|--------|----------|
| Full legacy read 1–98,580 with no gaps | DONE | `READ_LOG.md`, 8 chunk reports |
| Feature inventory | DONE | `FEATURE_INVENTORY.md` |
| Screen map | DONE | `UI_SCREEN_MAP.md` (45 legacy screens mapped) |
| Storage schema | DONE | `STORAGE_SCHEMA.md`, `docs/index/storage-keys.json` |
| Network endpoints | DONE | `NETWORK_ENDPOINTS.md`, `docs/index/hosts.json` |
| JS bridge API | DONE | `JS_BRIDGE_API.md`, `docs/index/native-calls.json` |
| Provider contracts | DONE | `PROVIDER_API.md` |
| Secrets inventory (masked) | DONE | `SECRETS_TO_ROTATE.md` |
| Migration plan | DONE | `MIGRATION_PLAN.md` |
| Brief corrections | DONE | `BRIEF_CORRECTIONS.md` |
| Decisions / gaps / state | DONE | `DECISIONS.md`, `KNOWN_GAPS.md`, `STATE.md` |
| Screenshots | DONE | 8 reference renders (`00-lock`…`07-exchange`) + 13 emulator captures (`runtime-01`…`runtime-11`, `runtime-13`, `runtime-14`); Send is FLAG_SECURE and recorded as a UI dump instead (G12) |
| Phase reports 0–8 | DONE | `PHASE_REPORTS/00-audit.md` … `08-delivery.md` |

## 2. Core services (UI-agnostic)

| Item | Status | Evidence |
|------|--------|----------|
| NexusCrypto v4 + ncx3/nsx2 decrypt + group decrypt | DONE | `core/src/crypto/legacyCrypto.ts` (T) |
| Key parsing/derivation, address derivation | DONE | `core/src/wallet/keys.ts` (T) |
| Groups CRUD, multi-key selection, migration verification | DONE | `core/src/wallet/groups.ts` (T) |
| RPC failover client | DONE | `core/src/rpc/client.ts` (T) |
| EIP-1559/legacy gas incl. legacy float quirks | DONE | `core/src/rpc/gas.ts` (T) |
| Price engine (Binance/CG/CMC/DexScreener, TTLs, cache) | DONE | `core/src/prices/*` (T) |
| Tokens: 53 defaults, per-group store, duplicate/removal rules | DONE | `core/src/tokens/*` (T) |
| ERC-20 codec, metadata, balance reads | DONE | `core/src/tokens/erc20.ts` (T) |
| Address-keyed balance cache | DONE | `core/src/tokens/balances.ts` (T) |
| History store, 15-cap for bridge/swap, tombstones | DONE | `core/src/history/*` (T) |
| Swap: 16 providers, quote normalization, execution | DONE | `core/src/swap/*` (T) |
| Bridge: 4 providers, routes, status polling, execution | DONE | `core/src/bridge/*` (T) |
| PIN hashing (PBKDF2 600k), attempt limiter, redaction | DONE | `core/src/security/*` (T) |
| `nexus2/*` storage schema types | DONE | `core/src/storage/schema.ts` (S) |
| Chain registry + custom chains | DONE | `core/src/chains/registry.ts`; UI store persists custom chains (S) |
| ERC-4337 paymaster helpers | DONE | `core/src/automation/paymaster.ts` (T); URL is user/operator supplied |
| EIP-1193 provider, origin gating, error codes | DONE | `core/src/browser/eip1193.ts` (T) |
| Transfer tools (batch native/token, multi-key, W2W, self, NFT, approvals, withdraw, balance check) | DONE | `core/src/transfer/*` (T) |
| Automation: SUP loop, BSB, Nansen client, EIP-7702 | DONE | `core/src/automation/*` (T) |
| Exchange adapters (15 CEX), signing, futures, key store | DONE | `core/src/exchanges/*` (T) |
| Migration orchestrator (decrypt → verify → stage → read-back → delete/rollback) | DONE | `core/src/migration/orchestrator.ts` (T) |
| Chart data adapter | PARTIAL | Candles/line fetched inline in `WalletScreens.tsx`; 11 legacy chart types and drawing tools not ported (G8) |
| Settings/integrators core config module | PARTIAL | `core/src/config/` unused; settings live in the UI store (S) |
| Core suite green | DONE | 11 suites / 118 tests, typecheck clean, ESLint clean |

## 3. React Native app

| Item | Status | Evidence |
|------|--------|----------|
| RN 0.81 scaffold (package.json, Metro, TS strict) | DONE | `ui/` (S); `tsc --noEmit` clean |
| Android project, applicationId/version identity, manifest | DONE | `B` + aapt: `com.nexus.wallet`, 10213, 1.214-rebuild, minSdk 24, targetSdk 34 |
| Kotlin Keystore vault (HMAC + PBKDF2 KEK + AES-GCM) | DONE | `M`: generated 5 wallets, encrypted store written, survived force-stop, decrypted after PIN unlock (runtime-07/11, wallet QA) |
| Biometrics, clipboard auto-clear, FLAG_SECURE | PARTIAL | FLAG_SECURE verified by `M` (screencap blocked on lock/Send/setup, works after unlock); biometrics and clipboard not exercised (M-B items 3–5) |
| Theme, bottom tabs, navigation stack, toasts | DONE | `ui/src/navigation/RootNavigator.tsx`, `App.tsx` (S+B) |
| Lock screen, PIN setup/change with vault re-wrap, attempt backoff | PARTIAL | `M`: setup, unlock, wrong-PIN rejection and restart lock verified; change-PIN re-wrap and backoff timing still need M-B |
| Home: groups/wallets, chain filter, balances, prices, refresh | PARTIAL | `M`: rendered generated group, Base token list, empty and populated states; funded balances need M-C |
| Token manager, add/remove defaults, contract import | PARTIAL | (S+B); M-C items 4–6 |
| Send / receive / QR / history | PARTIAL | `M`: Send renders (FLAG_SECURE), Receive renders QR + 5 addresses; broadcasting a transaction needs M-C |
| Profile, address book, saved pairs, console log | PARTIAL | `M`: Profile and wallet creation exercise verified; book/pairs/console need M-C/M-K |
| Settings: theme, currency, RPC manager, custom chains, proxy | PARTIAL | `M`: Settings renders and Lock now works; other toggles need M-C/M-K |
| Token chart (candles/line, fullscreen orientation) | PARTIAL | 2 of 11 legacy chart types; drawing tools absent (G8) |
| Swap UI (quote, slippage, execute, pairs) | PARTIAL | `M`: swap form renders; live quotes need proxy/keys, M-D |
| Bridge UI (routes, confirm, status, history) | PARTIAL | `M`: bridge form renders; routes need provider access, M-E |
| Transfer Hub dashboard + 9 tools + phrase derivation | PARTIAL | Core tested (T); UI tool runs need M-F |
| SUP / Base Swap Bot / Nansen / EIP-7702 screens | PARTIAL | Core tested (T); foreground timers need M-G |
| dApp browser + EIP-1193 approvals + origin bar | PARTIAL | Provider core tested (T); WebView runtime needs M-H |
| Exchange markets/trade/orders/portfolio | PARTIAL | `M`: markets loaded live Binance prices for all 15 adapters; trading UI restricted, M-I |
| Exchange keys, deposit, withdraw (7 exchanges) | PARTIAL | Signing tested (T); 8 exchanges throw explicit unsupported (G6) |
| Futures markets/positions/orders (5 exchanges) | PARTIAL | (T); live trading M-I |
| Migration screen (counts, verify, rollback) | PARTIAL | Orchestrator tested (T); end-to-end upgrade needs M-J |
| Portrait-only + chart fullscreen exception | PARTIAL | Manifest portrait (`M`: app stayed portrait through the QA pass); chart landscape needs M-K |
| `nexus://wallet` deep link (autoVerify) | DONE | `M`: `am start -a VIEW -d nexus://wallet/send` opened the Send screen; cold-start path untested |
| Release hardening (debug off, unsigned release) | DONE | `WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)`, minify/shrink release config (S) |

## 4. Delivery

| Item | Status | Evidence |
|------|--------|----------|
| `proxy/` forwarder, host allowlists, key injection, OKX signer, `.env.example` | DONE | `proxy/` (T: 15 tests) |
| CI workflow (tests, typechecks, Android debug APK) | PARTIAL | `.github/workflows/ci.yml` exists; not executed on GitHub in this environment |
| README (build, run, signing, proxy, security) | DONE | `README.md` |
| Debug APK | DONE | `ui/android/app/build/outputs/apk/debug/app-debug.apk`, aapt-verified |
| SHA256SUMS.txt | DONE | Generated inside the ZIP for every file |
| Final ZIP verified with `unzip -t` | DONE | `nexus-wallet-rebuild-2026-11-25.zip` |
| `FINAL_REPORT.md` | DONE | `docs/FINAL_REPORT.md` |
| Secret scan of deliverable | DONE | Packaging script rejects `.env`, keystores (except debug), `node_modules`, `legacy`, `.git`; manual grep recorded in `FINAL_REPORT.md` |

## 5. Cannot reproduce (explained)

| Item | Status | Reason |
|------|--------|--------|
| Service-worker eval bootstrap | CANNOT-REPRODUCE | G1 — no service workers in RN; stored-JS eval is unsafe |
| `ncx1:` encrypted keys | CANNOT-REPRODUCE | G2 — format has no retained key derivation |
| Legacy third-party relays | CANNOT-REPRODUCE | G3 — must not be reused; operator hosts the proxy |
| Pixel-identical Chromium UI | CANNOT-REPRODUCE | G4 — native components, functional parity only |
| GitHub commit provenance | CANNOT-REPRODUCE | G5 — reference ZIP contains no `.git` |
| 11 legacy chart types + drawing persistence | CANNOT-REPRODUCE | G8 — lightweight-charts WebView not shipped; native candles/line only |
