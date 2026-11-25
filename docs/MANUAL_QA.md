# Manual QA

**Status: partially executed.** An Android 14 (API 34) emulator was installed on 2026-11-25
and the build was exercised with the debug APK (Metro), a QA-signed release APK (Hermes
bundle, no Metro), and the archived debug APK built with `-PbundleInDebug=true` (Metro
stopped). Sections below remain the manual plan for a physical Android 7.0+ device
(minSdk 24); unchecked items are those that need real funds, keys, biometric hardware or a
legacy installation.

## Executed on the emulator (2026-11-25)

Device: Pixel 5 AVD, Android 14 / API 34 (google_apis x86_64), 1080×2340, headless.
Builds: debug `app-debug.apk` (also rebuilt with the JS bundle embedded), release
`app-release-unsigned.apk` signed with the debug key for QA only. Automated drivers:
`tools/smoke.mjs`, `tools/qa-wallet.mjs`, `tools/qa-nav.mjs`.

| # | Check | Result |
|---|-------|--------|
| 1 | Fresh install → "Create a PIN" → confirm → Home | Pass |
| 2 | Wrong PIN rejected; correct PIN unlocks | Pass |
| 3 | Generate 5 wallets → addresses + GENERATED badge | Pass |
| 4 | Force-stop + relaunch → locked; PIN decrypts and 5 keys persist | Pass |
| 5 | Screenshots blocked by FLAG_SECURE on lock, setup and Send; work after unlock | Pass (by design) |
| 6 | Home token list, tabs, Swap/Bridge/Profile/Settings render | Pass |
| 7 | Receive shows QR + full 0x address; Send form renders | Pass |
| 8 | Exchange mode loads live Binance markets for 15 adapters | Pass |
| 9 | `nexus://wallet/send` deep link opens Send | Pass |
| 10 | Logcat: no FATAL/ANR and no "Maximum update depth exceeded" | Pass |
| 11 | Archived debug APK (bundle embedded, Metro stopped) installs from scratch and completes checks 1–8 and 10 | Pass |

Not covered by this pass: biometrics, clipboard timing, funded sends, swaps/bridges,
Transfer Hub tools, automation timers, dApp signing, exchange trading, migration from a real
legacy install, chart landscape, physical StrongBox. See sections A–K and G10/G19/G21/G24.

Each section lists prerequisites, steps, and the expected result. Record pass/fail with build
SHA and device model. Never paste real seeds/keys into the QA log; use throwaway wallets
funded with dust.

## A. Install and identity

1. Install over the legacy APK (versionCode 213).
   - Expect: install succeeds (versionCode 10213), app name "Nexus Wallet", icon unchanged.
2. Launch. Expect portrait only; dark background `#050508`.
3. `adb shell dumpsys package com.nexus.wallet | grep version` → `versionCode=10213`.
4. Cold start with no legacy data → onboarding, no crash.

## B. Lock and secrets

1. Set a 6-digit PIN; kill and relaunch → lock overlay appears.
2. Five wrong PINs → attempts remaining decreases; after the limit, backoff timer blocks
   input and survives relaunch.
3. Biometric unlock (device with enrolled fingerprint) → unlocks; cancel → PIN fallback.
4. Screenshot on Import Keys / Seed / Exchange Keys → blocked (FLAG_SECURE).
5. Copy an address → paste elsewhere → clipboard cleared within 30 s while the app stays
   alive. Kill the app before 30 s → value may remain (G25).
6. Open Console Log after using swap/send → API keys and 0x-private-key-length strings are
   redacted.

## C. Wallet and home

1. Import 3 private keys + 1 seed phrase → group created; duplicate name rejected
   case-insensitively.
2. Create random wallets (x5) → addresses listed, group auto-selected.
3. Home shows native + default tokens for the selected group; switch group → list changes.
4. Add USDC on Base and USDC on Arbitrum → both allowed (different chain).
5. Re-add same contract on same chain → "Already added".
6. Remove a default token, relaunch → it stays removed.
7. Pull to refresh → balances update; switching chain filter shows only that chain.
8. Kill network → cached balances/prices still render; refresh shows an error toast.
9. Send 0.0001 native on Base → success overlay, hash opens explorer, history entry added.
10. Send an ERC-20 without allowance path → approve + send works where applicable.
11. History shows pending → confirmed after polling; bridge/swap list never exceeds 15.
12. Bridge history "clear" hides bridge+swap there but profile history still shows them.

## D. Swap

1. Quote ETH→USDC on Base with a valid proxy → route card shows amount, fees, provider.
2. Change percent slider to 50% / MAX → amounts recompute.
3. Slippage 0.5% default; change to 2% → quote refreshes.
4. Execute with insufficient gas → clear error, no stuck spinner.
5. Success → overlay shows sent/received, explorer link works; failure → "Swap Failed".
6. Save a pair → appears in Pair Manager; delete works.
7. Provider without key in direct mode → error names the missing key, no crash.

## E. Bridge

1. Base→Arbitrum USDC quote → routes listed with estimated time and fees.
2. Confirm → status overlay counts down; close while waiting → background pill remains.
3. Receive hash appears when provider reports completion → explorer link correct.
4. Bridge history filter pills; tombstone behavior as C12.
5. Recipient defaults to sender; custom recipient persists.

## F. Transfer Hub

For each of the 9 tools: open from dashboard, validate inputs, dry-run where offered,
execute a dust transaction, confirm log output and history entry.
- Batch: 2 recipients, native + token modes.
- Multi-key: 2 keys, direct and contract paths.
- NFT: transfer one ERC-721; distribute to 2 addresses.
- Approvals: list allowances, revoke one.
- Withdraw: withdraw from 2 keys to one address.
- Balance Check: paste 3 addresses → balances shown, invalid address rejected.
- Phrase→Key: derive from a throwaway phrase; wrong word count rejected.

## G. Automation

1. SUP: configure 2 throwaway keys, run a dust transfer, stop mid-run → state persists.
2. Base Swap Bot: configure amount + interval, start/stop, logs show each attempt.
3. Nansen: without key → clear "key required" message; with key → data loads.
4. EIP-7702: delegate a throwaway key, verify status; revoke.
5. Paymaster: disabled by default; enabling without URL shows validation error.

## H. dApp browser

1. Open a test dApp; `window.ethereum` is injected, chain id matches selected chain.
2. Connect → account permission prompt shows the selected wallet only.
3. `personal_sign` and `eth_sendTransaction` → modal shows origin, method, params; reject
   returns error to dApp; approve broadcasts.
4. Navigate away/back → session persists; open external link → system browser.
5. Release build: `chrome://inspect` cannot attach (debugging disabled).

## I. Exchange

1. Add a read-only API key for one exchange → masked display, stored encrypted.
2. Load markets; place a minimum-size limit order on one of the 7 supported spot exchanges
   (Binance, MEXC, Bybit, KuCoin, Gate.io, Bitget, HTX) → order appears.
3. Cancel order; check open orders refresh.
4. Futures (Binance, Bybit, Bitget, KuCoin, MEXC): set leverage, open/close a dust position;
   liquidation price displays.
5. Deposit screen shows address + memo + QR; withdraw validates fee and amount.
6. Remove keys → markets show "no keys" state, no stale secrets in logs.
7. On an unsupported exchange, a trading action shows an explicit "not supported" error
   (G6), not a silent failure.

## J. Migration

1. Install legacy, create a group with 2 keys, add a custom token, one tx history entry,
   set theme/currency, store one exchange key.
2. Upgrade to rebuild → migration screen shows counts only.
3. Complete migration → same group/key count, same token, same history, settings preserved.
4. Wrong PIN/secret path → migration stops; legacy data still readable in legacy app.
5. Rollback action → legacy keys restored; new data cleared.
6. Add an `ncx1:` fixture → migration reports "unsupported old format", does not drop silently.

## K. Packaging and security

1. Unzip deliverable into a clean folder → `unzip -t` OK; no `.env`, release keystore,
   `node_modules`, `legacy/`, or `.git` present (the standard `debug.keystore` is expected).
2. `grep -R` for known secret prefixes (masked list in `SECRETS_TO_ROTATE.md`) → no hits.
3. Build from source per README → debug APK installs and launches.
4. Verify `SHA256SUMS.txt`.
