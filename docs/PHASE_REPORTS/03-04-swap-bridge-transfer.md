# Phase 3–4 — Swap, Bridge, Transfer Hub

Status: implementation complete; live-provider and device QA pending.

## Objective
Port all swap/bridge providers, execution paths, and the nine Transfer Hub tools.

## Work performed
- Core swap: 16 providers (LiFi, Odos, 1inch, SwapAPI, Kyber, OpenOcean, Bungee, Rango,
  Symbiosis, Enso, Velora, Dodo, Portals, Fly, Squid, OKX DEX) with quote normalization,
  provider fan-out limits, allowance/approve handling and execution. (`core/src/swap/*`, tests.)
- Secret kinds (`lifi`, `odos`, `oneInch`, `okx`, `enso`, `rango`, `squid`, `dodo`) route via
  the proxy when no local key is present; OKX signing is byte-compatible in direct mode.
- Core bridge: 4 providers incl. LiFi/Rango status polling, route normalization, execution.
- Core transfer: batch native/token, multi-key direct/contract, wallet→wallet, self, NFT
  721/1155, approvals, withdraw fixed/split/sweep, balance check, phrase derivation.
- UI: `SwapScreen` (quote cards, percent slider, slippage, execute, save pair),
  `BridgeScreen` (routes, confirm sheet, status, history), `TransferHubScreen` (dashboard +
  `TransferToolScreen` for each tool), `PairManagerScreen`.

## Evidence
- Swap/bridge/transfer tests in `core/test` (T).
- UI screens typecheck and compile into the APK (S+B).
- Known limits: trading/live quote acceptance unverified without keys (G21); providers that
  require a proxy fail with an explicit error when it is unset.

## Exit criteria
- [x] Provider registry and execution code paths exist for all legacy providers
- [x] Nine tools mapped one-to-one
- [ ] Live quote/execute QA (M-D, M-E, M-F) — blocked (G18, G21)

## Next phase
Automation.
