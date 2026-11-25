# Nexus Wallet — rebuild

React Native + TypeScript rebuild of the Nexus Wallet Android app. The legacy
single-file WebView SPA (`legacy/`, read-only reference) is the source of truth
for behaviour; the rebuild reproduces its wallet, swap, bridge, transfer,
automation, browser and 15-exchange features on a typed core.

- Android identity preserved: `com.nexus.wallet`, minSdk 24, targetSdk 34,
  versionCode `10213`, versionName `1.214-rebuild`, deep link `nexus://wallet`.
- UI-agnostic core in `core/` (TypeScript, Jest), UI in `ui/` (React Native
  0.81, React 19), native modules in Kotlin, key proxy in `proxy/`.
- Legacy namespaces (`ncx4`/`ncx3`/`nsx2`/`ncx1`) are migrated to Keystore-
  backed `nexus2/*` storage; legacy data is deleted only after read-back and
  address verification.

## Layout

```
core/                 UI-agnostic TypeScript engine (crypto, wallet, RPC, swap,
                      bridge, transfer, automation, exchanges, browser, migration)
  src/  test/
ui/                   React Native app
  src/screens/  src/navigation/  src/stores/  src/native/  src/components/
  android/            Gradle project + Kotlin modules (vault, legacy reader, security)
proxy/                Dependency-free key-injection proxy (Node >= 20)
docs/                 Audit, parity evidence, schema, security, phase reports
tools/                Legacy indexer, packaging script, emulator QA drivers
.github/workflows/    CI (core tests, UI typecheck, Android debug APK)
```

## Requirements

- Node.js >= 20.19.4
- JDK 17
- Android SDK platform 35, build-tools 35.0.0, NDK 27.1.12297006
  (targetSdk remains 34; compileSdk 35 is required by React Native 0.81)

## Install and verify

```sh
npm install
npm run typecheck          # core + ui (strict)
npm run test               # core: 11 suites / 118 tests
npm run test:proxy         # proxy: 15 tests
npm run lint               # core ESLint, zero warnings
```

## Android build

```sh
cd ui/android
./gradlew assembleDebug
# output: app/build/outputs/apk/debug/app-debug.apk

./gradlew assembleDebug -PbundleInDebug=true
# standalone debug APK with the JS bundle embedded (no Metro required)
```

Create `ui/android/local.properties` with `sdk.dir=<path>` if the SDK is not
found via `ANDROID_HOME`. A plain debug build loads JS from Metro: start
`npx react-native start` inside `ui/` and run `adb reverse tcp:8081 tcp:8081`;
`-PbundleInDebug=true` embeds the Hermes-compiled bundle instead and is how the
APK in the delivery archive was built. Only the debug variant allows cleartext
to `localhost`/`10.0.2.2`; release keeps cleartext disabled. Release builds are
intentionally unsigned: add your own `signingConfigs` and keystore outside the
repo (never commit keystores). WebView debugging is enabled in debug builds only
(`BuildConfig.DEBUG`) and forced off in release.

Emulator QA drivers (require a booted API 34 emulator and the debug APK):

```sh
node tools/smoke.mjs      # PIN setup, tabs, screenshots, logcat
node tools/qa-wallet.mjs  # generate wallets, vault round-trip, restart
node tools/qa-nav.mjs     # unlock, Send/Receive/Exchange, deep link evidence
```

All three pass against the bundled debug APK with Metro stopped, so the archived
APK installs and runs on a clean device.

## Key proxy

Billing-sensitive providers (1inch, CMC, Alchemy) and signing-secret providers
(OKX key/secret/passphrase, Nansen) never ship inside the client. Run the proxy
and point the app at it in **Settings → Proxy base URL**:

```sh
cp proxy/.env.example proxy/.env    # fill in only the keys you use; never commit .env
npm run proxy                       # http://127.0.0.1:8787
```

`POST /v1/forward` accepts `{ provider, url, method, headers, body, query }`,
enforces a per-provider upstream host allowlist, strips client credential
headers, injects server-side keys, signs OKX requests (HMAC-SHA256 over
timestamp + method + path), and returns `{ status, body }`. `GET /health`
reports provider readiness without values. The proxy binds to localhost by
default; expose it only behind TLS and authentication. Tests mock the upstream
and make no network calls.

The app still supports user-supplied keys entered locally (they are stored in
the Keystore-backed vault); a proxy is optional.

## Security model

- PIN is never stored; PBKDF2-SHA256 (600k) hash + attempt limiter with backoff.
  Derivation runs natively (`NexusPin`/`Pbkdf2.kt`) so it stays fast on Hermes.
- Secrets are encrypted AES-256-GCM with a Keystore HMAC-wrapped, PIN-derived
  KEK; PIN changes re-wrap every vault entry before the PIN hash is replaced.
- `FLAG_SECURE` on key screens, clipboard auto-clear, log redaction.
- dApp WebView is locked down (http/https only, no file access, mixed content
  blocked, no multiple windows) and `window.ethereum` requires an explicit
  per-origin connection plus a user approval sheet for signing.
- Release WebView debugging is disabled; no API keys or mnemonics are bundled
  or logged.

See `docs/SECURITY_CHANGES.md`, `docs/SECRETS_TO_ROTATE.md` (masked) and
`docs/MIGRATION_PLAN.md`.

## Migration

First launch detects legacy encrypted storage, decrypts the supported formats
(`ncx4` AES-GCM, `ncx3`/`nsx2` XOR; `ncx1` is documented as unrecoverable),
derives addresses to verify each key, writes staged `nexus2/*` entries, reads
them back, keeps a rollback blob, and removes legacy keys only after the new
records verify. Existing user data survives the upgrade.

## Packaging

```sh
npm run package
```

Produces `nexus-wallet-rebuild-<YYYY-MM-DD>.zip` with source, docs, proxy, CI,
README and (when present) the debug APK. `node_modules`, build output, `.git`,
`legacy/`, `.env`, keystores and secrets are excluded. `SHA256SUMS.txt` covers
every archived file; verify with `unzip -t`. See `docs/FINAL_REPORT.md`.

## Documentation

`docs/` contains the legacy audit (`READ_LOG.md`, `FEATURE_INVENTORY.md`,
`UI_SCREEN_MAP.md` with screenshots), storage and network inventories, the
parity checklist with evidence, decisions, known gaps, manual QA, security
changes and per-phase reports. Status is honest: unsupported exchange
operations and partial UI areas are listed in `docs/KNOWN_GAPS.md`.

## Known limitations

- New Architecture is disabled (`newArchEnabled=false`) to avoid a
  react-native-screens C++/NDK incompatibility on this toolchain.
- Release APK is unsigned; CI builds debug APKs only.
- Exchange spot order placement/withdraw are implemented for 7 exchanges;
  the remaining adapters expose markets, orders and portfolio reads and throw
  explicit "not supported" errors for trading operations.
- Some legacy-only conveniences are marked PARTIAL in the parity checklist.

## License

Unlicensed private rebuild. The legacy app and its assets remain the property
of their original owners; `legacy/` is included only as a read-only reference
during development and is excluded from release archives.
