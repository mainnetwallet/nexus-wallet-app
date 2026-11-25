# Phase 0 — Audit and Documentation

Status: complete (screenshots and final checklist verification pending packaging).

## Objective
Read the entire legacy WebView app, inventory every feature, screen, storage key, endpoint,
native call, and provider contract; record disagreements with the brief; plan migration and
security hardening.

## Work performed
- Cloned/copied the provided legacy ZIP to `legacy/` (read-only reference; no `.git` present).
- Verified file size: 98,580 lines / 5,107,646 bytes.
- Read sequentially in ≤1,500-line windows; produced 8 audit reports covering 1–98,580 with
  no gaps (`docs/READ_LOG.md`).
- Machine-extracted indexes: DOM ids, global functions, globals, hosts, storage keys, network
  endpoints, CSS variables, sections, native calls.
- Wrote the documentation set: feature inventory, screen map, storage schema, endpoints,
  JS bridge, provider API, secrets inventory (masked), migration plan, brief corrections,
  decisions, known gaps, state, port map, parity checklist, manual QA, security changes.

## Key findings
- Legacy is a single 98,580-line `index.html` SPA with 3 Java classes; all logic is JS.
- Wallet crypto is AES-GCM v4 with PBKDF2 200k and a plaintext master secret; older XOR
  formats exist; `ncx1` is unrecoverable.
- Six provider secrets and a paymaster URL ship in the client; exchange keys are plaintext.
- Balance cache is keyed by the last 8 characters of private keys (security issue).
- Gas math depends on JS float rounding (`112001n` for 100k).
- Version is 213, not 270 as the brief states; no git metadata in the ZIP.

## Evidence
- `docs/index/*` (JSON), `docs/index/chunks/*.md` (8 reports)
- `docs/READ_LOG.md` coverage table
- 6 core test suites / 57 tests passing; `tsc --noEmit` clean

## Exit criteria
- [x] 100% line coverage in READ_LOG
- [x] All required Phase 0 docs exist
- [x] Brief/code disagreements recorded
- [x] Core scaffolding with green tests
- [x] Screenshots captured (8 legacy reference PNGs; overlay-only screens not captured, G12)

## Next phase
React Native shell: project scaffold, Android identity, Keystore storage, lock screen,
navigation, theme, and the settings skeleton.
