# Phase 8 — Migration, hardening, packaging

Status: complete, including Android emulator runtime QA on the debug and QA-signed
release builds (physical-device migration/biometric QA remains out of scope, G18).

## Objective
Land legacy-data migration, Android hardening, the key proxy, CI, documentation and a
verified delivery archive.

## Work performed
- Migration: `core/src/migration/orchestrator.ts` decrypts `ncx4`/`ncx3`/`nsx2`, reports
  `ncx1` as unrecoverable, verifies derived addresses, stages `nexus2/*` writes, reads them
  back, retains a rollback blob, and deletes legacy keys only after verification. UI
  `MigrationScreen` shows counts and supports retry/rollback; PIN changes re-wrap the vault
  before replacing the PIN hash.
- Android: RN 0.81 Gradle project with legacy identity (applicationId, versionCode 10213,
  versionName 1.214-rebuild, minSdk 24, targetSdk 34, `nexus://wallet` autoVerify, portrait).
  Kotlin modules: Keystore vault (HMAC + PBKDF2 KEK + AES-GCM, `rewrap`), hidden WebView
  legacy reader, device security (FLAG_SECURE, clipboard, biometric), app control (foreground
  service, orientation), plus manifest/FGS/deep-link wiring.
- Hardening: release WebView debugging forced off, dApp WebView lockdown, log redaction,
  clipboard clear timer, attempt backoff, secrets excluded from storage and packaging.
- Proxy: dependency-free Node server (`POST /v1/forward`, `GET /health`), provider host
  allowlists, header stripping, key injection, server-side OKX HMAC signing, request/response
  caps, manual redirects, secret-free logs; `.env.example` only; 15 Node tests.
- Delivery: GitHub Actions workflow (core/proxy tests, typechecks, debug APK), root README,
  `.gitignore`, `tools/package.mjs` (staging, SHA256SUMS, PowerShell zip, `unzip -t`, forbidden
  entry scan), debug APK.
- Runtime QA (Android emulator, Pixel 5 AVD API 34 x86_64, headless): `tools/smoke.mjs`,
  `tools/qa-wallet.mjs`, `tools/qa-nav.mjs` drive install → PIN setup → unlock → wallet
  generation → tab navigation → restart persistence → deep link, capturing 13 device PNGs
  plus UI XML dumps for the FLAG_SECURE screens. Run against the debug build with Metro
  (`adb reverse`), against the QA-signed release build with no Metro, and finally against
  the archived debug APK built with `-PbundleInDebug=true` with Metro stopped — the
  delivered APK installs and runs standalone.
- Runtime defects found and fixed during QA: Metro cleartext blocked in debug (debug-only
  network security config), fresh install unlocked with no PIN (`App.tsx` gate), pure-JS
  PBKDF2 never completing on Hermes (native `NexusPin`/`Pbkdf2.kt`, reused for the vault KEK,
  store format unchanged), legacy WebView teardown on the JavaBridge thread (posted to the
  main looper), Zustand v5 selector array churn causing "Maximum update depth exceeded"
  (stable function selectors in 5 screens), plus six ESLint findings (unused codes/imports,
  control-char regex, unused divisor).
- Packaging defect fixed: the archive's debug APK had no embedded JS bundle and could not
  launch without Metro. `app/build.gradle` now accepts `-PbundleInDebug=true`, which embeds
  the Hermes bundle; the rebuilt APK was reinstalled on a wiped emulator with Metro stopped
  and passed all three QA drivers.

## Evidence
- Core: 11 suites / 118 tests; proxy: 15 tests; `tsc --noEmit` clean for core and ui; ESLint
  clean for core.
- APK: assembled; aapt reports `com.nexus.wallet`, versionCode 10213, versionName
  1.214-rebuild, sdkVersion 24, targetSdkVersion 34. Release variant builds with Hermes
  bytecode (bundle magic `c61fbc03`) and R8 shrinking; QA copy signed with the standard
  debug keystore for install only.
- Runtime: PIN created and verified with the native KDF, five wallets generated and grouped,
  wrong PIN rejected, state survived force-stop/restart, all main tabs rendered, live Binance
  markets loaded, `nexus://wallet` deep link opened, no render-loop or crash entries in
  logcat; screenshots in `docs/screenshots/runtime-*` and dumps in
  `docs/PHASE_REPORTS/runtime-*.xml`.
- Archive: `nexus-wallet-rebuild-2026-11-25.zip`, `unzip -t` OK, SHA256SUMS present.

## Exit criteria
- [x] Migration with rollback and post-verification deletion
- [x] Android identity preserved and verified
- [x] Proxy with allowlists/signing and tests
- [x] CI, README, packaging, checksums, verified ZIP
- [x] Emulator runtime QA of install, PIN/lock, wallet generation, navigation, deep link and
  logcat on debug and QA-signed release builds (`MANUAL_QA.md` §A–C, §H partial)
- [ ] Physical-device QA of migration with real legacy data, biometrics, clipboard timing and
  funded transactions — needs hardware (G18)

## Remaining risks
See `FINAL_REPORT.md` top risks: physical-device/funded-flow QA outstanding, live
provider/exchange verification, new architecture disabled, release unsigned, proxy
deployment hardening.
