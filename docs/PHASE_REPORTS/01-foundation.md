# Phase 1 — Foundation

Status: complete.

## Objective
Create the monorepo, UI-agnostic core, test harness, and the typed services every screen
depends on; preserve legacy arithmetic and storage semantics.

## Work performed
- npm workspaces (`core`, `ui`, `proxy`), strict TypeScript, Jest ESM + ts-jest.
- `core/src/http.ts`: timeout, abort, JSON errors; injectable `fetch`.
- Units and address utilities, including the legacy short-address format used by the UI.
- `NexusCrypto` v4 (AES-256-GCM, PBKDF2-SHA256 200k), `ncx3`/`nsx2` XOR readers, group
  decrypt/encrypt, legacy key derivation and address verification.
- PIN hashing (`nexus:pin:v2`, 600k) with `AttemptLimiter` backoff; `redact()` for logs.
- Storage schema types for `nexus2/*` and legacy key names.
- Groups CRUD, multi-key selection flattening, default-token rules (53 tokens, 10 chains).
- RPC failover client and gas math (EIP-1559 boost 1.20, legacy float quirk `112001n`).
- Price engine (Binance → CoinGecko → CMC → DexScreener, stablecoin pinning, TTL/cache).
- History store with the 15-entry bridge/swap cap and tombstones.
- Swap transport with secret providers and the proxy contract, provider registry skeleton.

## Evidence
- `core/test/*` — initial suites green; `npm run typecheck -w core` clean.
- `docs/STORAGE_SCHEMA.md`, `docs/DECISIONS.md` D2–D9.

## Exit criteria
- [x] Core builds and typechecks
- [x] Legacy crypto/gas/history quirks covered by tests
- [x] No UI imports from core internals (typed exports only)

## Next phase
React Native shell and the wallet screens.
