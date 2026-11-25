# Phase 2 — Core wallet and wallet UI

Status: implementation complete; runtime QA pending (G18).

## Objective
Reproduce groups/wallets, balances, tokens, send/receive, history, address book and settings
on the RN shell.

## Work performed
- Core: token metadata/ERC-20 codec, address-keyed balance cache, history patching by id/hash,
  chain registry and custom chains.
- UI scaffold: theme tokens (`#050508`, `#6366f1`), shared `Screen/Card/Row/Field/Sheet/Pill`
  components, Zustand stores, AsyncStorage persistence, native bridge.
- `App.tsx` bootstrap, `LockGate`, unlock → wallet load, prices, balances, toast host.
- `RootNavigator`: wallet tabs (Home, Swap, Bridge, Profile, Settings), exchange tabs, stack
  routes for every wallet screen.
- Screens: Home (group/wallet/chain selectors, token list, refresh), Send (secure flag),
  Receive (QR + copy), History, Token Manager, Token Chart (candles/line, fullscreen
  orientation), Address List, Pair Manager, Profile (import/mnemonic/generate), Settings
  (PIN, biometric toggle, theme, currency, RPC manager, custom chains, proxy, migration,
  reload), Console Log.
- Lock setup/change: PIN hash plus `rewrapVault` before hash replacement.

## Evidence
- `ui/src/screens/*.tsx`, `ui/src/navigation/RootNavigator.tsx`, `ui/src/App.tsx` (S).
- `tsc --noEmit` clean; debug APK compiles (`B`).
- Core tests cover derivation, balances, token rules, history (T).

## Exit criteria
- [x] All Phase 2 routes exist and typecheck
- [x] APK compiles with legacy identity
- [ ] Device QA (manual sections A–C) — blocked, no device (G18)

## Next phase
Swap, bridge, and Transfer Hub.
