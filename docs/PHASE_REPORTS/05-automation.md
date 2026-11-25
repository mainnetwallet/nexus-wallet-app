# Phase 5 — Automation

Status: implementation complete; live-run QA pending.

## Objective
Port SUP Transfer, Base Swap Bot, Nansen/Jumper, EIP-7702 delegation and paymaster helpers.

## Work performed
- `core/src/automation/sup.ts`: cycle builder (per-key amounts, interval, chain), transfer
  execution through the existing send path.
- `core/src/automation/bsb.ts`: Base swap bot engine, allowance check/approve, swap request
  builder (`toSwapRequest`), transaction build, DCA loop.
- `core/src/automation/nansen.ts`: Nansen client (holdings, PnL, token flow) and Jumper quote
  URL. Premium key is user-supplied; calls go through `/v1/forward` when proxied.
- `core/src/automation/eip7702.ts`: exact type-0x04 authorization RLP (auth hash `0x05`,
  nonce+1, gas 350000, initialize selector `0x6f2de70e`) and delegation fee logic.
- `core/src/automation/paymaster.ts`: ERC-4337 helpers; paymaster URL is operator-supplied.
- UI: `SupTransferScreen` (interval, chain pills, run once/start/stop, log),
  `BaseSwapBotScreen` (amount/interval, token pair, start/stop), `NansenScreen` (proxy
  required, raw panels), `DelegationScreen` (RPC nonce/code/block checks, fees, delegate,
  send raw transaction).

## Evidence
- Automation unit tests (T): SUP cycle math, BSB request/allowance, 7702 RLP/hash, paymaster.
- Screens typecheck and compile (`S+B`); timers are interval-based and stop on unmount.

## Exit criteria
- [x] All five automation areas ported
- [x] No provider secret required in the client (Nansen via proxy or user key)
- [ ] Device run of timers/foreground service (M-G) — blocked (G18); no reboot resume (G20)

## Next phase
dApp browser.
