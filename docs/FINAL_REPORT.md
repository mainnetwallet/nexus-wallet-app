# Final Report — Nexus Wallet rebuild

Date: 2026-11-25
Archive: `nexus-wallet-rebuild-2026-11-25.zip` — ≈36.5 MiB, 237 entries, 236 checksums
(verified with `sha256sum -c`). The archive's own byte size and SHA-256 are reported alongside
the delivered file; a ZIP cannot contain its own hash. Packaged debug APK: 105,045,098 bytes,
SHA-256 `41b8b8eb9c48d6fadec319d110b86165c54f76704e447ff937ad0301dc4ea7c6` (bundle embedded).
Legacy version replaced: 213 / 1.213 → rebuild 10213 / 1.214-rebuild

## What was delivered

- `core/` — UI-agnostic TypeScript engine: crypto, keys/groups, RPC/gas, prices, tokens,
  history, 16 swap providers, 4 bridge providers, 9 transfer tools + phrase derivation,
  automation (SUP, BSB, Nansen, EIP-7702, paymaster), 15 exchange adapters, futures,
  EIP-1193 provider, and the legacy migration orchestrator.
- `ui/` — React Native 0.81 app (React 19) with wallet and exchange tabs, lock/PIN, wallet
  screens, swap/bridge/Transfer Hub, automation, dApp browser, exchange/futures/deposit/
  withdraw, RPC manager, console, and migration screen.
- `ui/android/` — Gradle project + Kotlin modules: Keystore vault with PIN-derived KEK,
  hidden WebView legacy reader, FLAG_SECURE/clipboard/biometric, foreground service,
  orientation, deep link, legacy identity.
- `proxy/` — dependency-free Node key proxy with host allowlists, header stripping, key
  injection, server-side OKX HMAC signing, caps/timeouts, `.env.example`; 15 tests.
- `docs/` — full legacy audit, inventories, parity checklist with evidence, decisions, known
  gaps, manual QA, security changes, migration plan, phase reports, this report.
- CI workflow, README, packaging script, `SHA256SUMS.txt`, and a debug APK with the Hermes
  bundle embedded (`assembleDebug -PbundleInDebug=true`) so it installs and runs without Metro.

## Verification performed

| Check | Result |
|-------|--------|
| Core tests | 11 suites / 118 tests passing |
| Proxy tests | 15 tests passing (mocked upstream, no network) |
| Core typecheck | clean |
| UI typecheck (strict) | clean |
| Core ESLint | clean, zero warnings |
| Debug APK build | `BUILD SUCCESSFUL`; archived APK built with `-PbundleInDebug=true` (2.90 MB Hermes bundle inside) |
| Release APK build | `BUILD SUCCESSFUL`; Hermes bytecode bundle (2.90 MB) + R8; unsigned as required |
| Runtime QA (emulator) | Android 14 / API 34: PIN setup, wrong-PIN rejection, unlock, 5-wallet vault, restart persistence, Send/Receive/Exchange, deep link; debug (Metro), QA-signed release (no Metro) and archived debug APK (Metro stopped) all pass |
| Logcat | no FATAL/ANR, no render-loop errors after fixes |
| APK identity (aapt) | `com.nexus.wallet`, versionCode 10213, versionName 1.214-rebuild, minSdk 24, targetSdk 34, label "Nexus Wallet" |
| ZIP integrity | `unzip -t` OK; 236 checksums verified with `sha256sum -c` (covers every file except SHA256SUMS itself); packaged APK hash matches the QA-tested build |
| Packaging exclusions | no `node_modules`, build output, `legacy/`, `.git`, `.env`, release keystores or secrets; only `proxy/.env.example` and the standard `debug.keystore` |
| Secret scan | grep for `sk-…` and 64-hex/`0x`+64 over the extracted archive → only a public Hardhat dev key in `core/test/automation.test.ts`; no live secrets, `.env` values or mnemonics |

## Runtime QA fixes

The emulator pass found and fixed six issues that static checking could not:

1. Fresh installs never showed the create-PIN gate (`App.tsx` gate condition).
2. Debug builds could not load JS because cleartext to Metro was blocked; a debug-only
   security config now allows only `localhost`/`127.0.0.1`/`10.0.2.2`.
3. 600k-iteration PIN PBKDF2 never finished in Hermes; moved to native `NexusPin`/`Pbkdf2.kt`
   with identical output, also reused for the vault KEK on API 24–25.
4. Legacy WebView teardown ran on the JavaBridge thread and leaked the interface; now posted
   to the main looper.
5. Zustand v5 array-returning selectors caused "Maximum update depth exceeded" on Send,
   Automation, Transfer Hub, Exchange and Browser; selectors now return stable methods.
6. Six pre-existing ESLint errors (unused codes/imports, control-char regex, unused divisor).

Packaging also caught a defect: the first archived debug APK had no JS bundle and could not
launch without Metro. `app/build.gradle` now supports `-PbundleInDebug=true`; the rebuilt APK
was reinstalled on a wiped emulator with Metro stopped and passed all three QA drivers.

Drivers and evidence: `tools/smoke.mjs`, `tools/qa-wallet.mjs`, `tools/qa-nav.mjs`,
`docs/screenshots/runtime-*`, `docs/PHASE_REPORTS/runtime-*`.

## Parity checklist

Source: `PARITY_CHECKLIST.md`, 75 rows.

| Status | Count |
|--------|-------|
| DONE | 48 |
| PARTIAL | 21 |
| NOT DONE | 0 |
| CANNOT-REPRODUCE | 6 |

All PARTIAL rows are implemented but either have a documented scope limit or still need a
physical device, funding, keys or a real legacy install. The exact manual section that would
close each row is named in the checklist. Runtime-verified rows cite the `M` evidence key and
the screenshots/dumps under `docs/screenshots/runtime-*` and `docs/PHASE_REPORTS/runtime-*`.
The six CANNOT-REPRODUCE rows are explained (service-worker eval, `ncx1` format, legacy
relays, pixel parity, git provenance, 11 chart types/drawings).

## Security posture

- No provider/exchange/billing secrets are bundled. Secret-bearing provider calls use the
  proxy; the OKX signer runs server-side in `proxy/`.
- Vault entries are AES-256-GCM encrypted with a KEK combining a device-bound Android
  Keystore HMAC and PBKDF2(PIN). PIN changes re-wrap all entries before replacing the hash.
- PIN verifier: PBKDF2-SHA256 600k, constant-time compare, persisted attempt backoff; the
  derivation runs natively (`NexusPin`/`Pbkdf2.kt`) so it completes quickly on Hermes.
- dApp WebView: http/https only, no file access, no mixed content, no multiple windows, no
  JS interface; provider injection requires explicit origin connection and a signing sheet.
- WebView debugging is forced off in release (`BuildConfig.DEBUG`); release minimizes and
  shrinks.
- Logs and proxy logs are redacted/secret-free; clipboard clears after 30 s while the app is
  alive (G25).
- `.env` files and release keystores are ignored and excluded from the archive; only the
  standard Android debug keystore is present for reproducible debug builds.

## Migration

Legacy `ncx4`/`ncx3`/`nsx2` data is decrypted, addresses are derived and verified, new
`nexus2/*` records are staged and read back, a rollback blob is retained, and legacy keys are
deleted only after verification. `ncx1` is reported as unrecoverable with a masked count and
is never silently dropped. Tests cover wrong PIN, partial data and rollback.

## Top 5 risks

1. **Physical-device and funded-flow QA.** Emulator QA covers PIN/vault/screens, but
   biometrics, clipboard timing, real transactions, dApp signing and migration from a legacy
   install remain untested; live providers/exchanges were not exercised.
2. **Live provider/exchange integration untested.** Quotes, order placement and withdrawal
   were not exercised with real keys; signatures are fixture-tested only.
3. **New Architecture disabled.** `newArchEnabled=false` due to a react-native-screens C++
   NDK incompatibility; revisit on the next toolchain upgrade.
4. **Release signing and proxy hardening are operator tasks.** Release APK is unsigned; the
   proxy binds localhost and ships no TLS/auth, so it must be deployed behind both.
5. **Feature scope limits.** 8 exchanges are read-only, 2 of 11 chart types, USD-only
   formatting, dark palette only, foreground-only automation.

## Top 5 manual steps

1. Follow `MANUAL_QA.md` §A–C on a physical device: install over legacy, set PIN, import
   throwaway keys, send/receive and confirm migration-adjacent storage behavior.
2. Run §J with a legacy install containing 2 keys, a custom token, history and an exchange
   key; verify counts, address equality, rollback and `ncx1` reporting.
3. Run §H against a test dApp: connect, sign, send, reject, chain switch, and confirm release
   builds cannot be inspected.
4. Deploy `proxy/` behind TLS/auth, configure only the provider keys you use, and run §D/E/I
   with dust amounts.
5. Add release signing in the operator environment, rebuild `assembleRelease`, and re-run
   `MANUAL_QA.md` §B/§K on the signed APK.

## Honest limitations

See `KNOWN_GAPS.md` G1–G25. The build is functionally complete against the legacy feature
inventory. Emulator runtime QA closed the core lock/vault/screen rows; physical-device and
live-integration behaviour remains unverified, so those rows stay PARTIAL. No claim of DONE
is made for rows lacking evidence.
