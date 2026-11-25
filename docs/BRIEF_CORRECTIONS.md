# Brief Corrections

Where the rebuild brief and the legacy code disagree, the legacy code wins. Each entry
records what the brief said, what the code actually does, and the decision taken.

| # | Brief claim | Legacy evidence | Decision |
|---|-------------|-----------------|----------|
| 1 | Legacy `versionCode` is 270, new build must start above it | `legacy/gradle.properties`: `VERSION_CODE=213`, `VERSION_NAME=1.213`; `app/build.gradle` reads them | Use `versionCode 10213` (10000 + legacy 213) so the upgrade installs over 213 and stays above 270 as the brief requires. `versionName 1.214-rebuild`. |
| 2 | Repository commit `1466278` | The provided ZIP (`nexus-wallet-main.zip`) contains no `.git` directory; commit cannot be verified | Recorded in `STATE.md`; audit references file/line evidence instead of commits. No legacy files modified. |
| 3 | "Exchange keys are AES-encrypted via SubtleCrypto" (implied by the brief's security section) | `nexus_exc_keys_v1` is written as plaintext JSON (audit ~line 86238); the AES comment is dead | Rebuild stores exchange credentials Keystore-wrapped; flagged in `SECRETS_TO_ROTATE.md`. |
| 4 | Target SDK 34 / min SDK 24 | `app/build.gradle`: compileSdk 34, minSdk 24, targetSdk 34 | Matches; preserved. |
| 5 | Deep link `nexus://wallet` with autoVerify | Manifest declares `<data scheme="nexus" host="wallet"/>` with `autoVerify="true"` | Preserved in `AndroidManifest.xml`. No `asset_statements` / hosted `assetlinks.json` ships in this archive; App Links verification requires the operator to host it. |
| 6 | Portrait-only except chart fullscreen | Manifest forces `screenOrientation="portrait"` on `MainActivity`; legacy JS cycles three orientation states for the chart (~line 32370) | RN keeps portrait app-wide; `TokenChart` calls `setOrientation(false)` on mount and restores portrait on unmount (runtime unverified, G24). |
| 7 | The brief lists SUP / BSB / Nansen / EIP-7702 automation as separate features | All live in the same single-page `index.html` behind Profile → TOOLS; they share wallet keys and RPC config | Ported as native screens over the same core services; no new product behaviour invented. |
| 8 | "Bridge providers: LiFi, Rubic, Rango, Bungee" | Legacy bridge `providerMap` includes `lifi/rubic/socket/rango/okx/kyber`; Bungee appears in swap/bridge UI labels | Implemented the four brief-named bridges (LiFi, Rubic, Rango, Bungee-style socket) and left the legacy aliases mapped; documented in `PROVIDER_API.md`. |
| 9 | The brief says `applicationId com.nexus.wallet` | Matches `app/build.gradle` | Preserved. |
| 10 | The brief asks for "100% UI parity" including chart tools | Legacy charts are lightweight-charts with 11 chart types + drawing tools, not 3D | Ported candles/line with timeframes; the other chart types, indicators and drawing persistence are NOT reproduced (G8). Functional parity, not full chart parity. |
| 11 | The brief implies the legacy app has a working service worker | `?__nexus_sw__=1` path `eval`s JS from localStorage after a hash check; hash mismatch falls back to inline code | Not reproduced in RN (no SW concept). Documented as an intentional omission, not a user-facing feature. |
| 12 | "Never write GitHub token values into any file" | ZIP contains no CI secrets; workflow requests only `contents: read` | No token values anywhere; packaging rejects `.env`/secret files and the archive was scanned before delivery. |
| 13 | "16 CEX adapters" | `index.html` exchange config defines 15 adapters (Binance, KuCoin, MEXC, Bybit, BitMart, Bitget, Kraken, Gate.io, Coinbase, BingX, HTX, Phemex, DigiFinex, LBank, Bitfinex); `EXCHANGES` in `core/src/exchanges/config.ts` mirrors 15 | Ported the 15 that exist. No 16th adapter invented; LBank signing (MD5+HMAC) throws an explicit "not enabled" error rather than shipping an unverified digest. |
| 14 | Transfer Hub has "9 tools" | Legacy dashboard has 9 tools plus a phrase→key utility | Ported 9 tools and the phrase derivation utility (10 tiles), matching the legacy dashboard. |
| 15 | `targetSdk 34` / legacy build uses SDK 34 | Legacy compileSdk 34; RN 0.81 requires compileSdk 35 | `compileSdk 35` + buildTools 35; `minSdk 24` and `targetSdk 34` preserved and aapt-verified. Recorded as D20/G14. |

No other disagreements were found. Additions beyond the brief are limited to the Section 11
security hardening allowed by the prompt and are listed in `SECURITY_CHANGES.md`.
