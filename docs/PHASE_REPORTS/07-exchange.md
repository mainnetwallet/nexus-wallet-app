# Phase 7 — Exchange mode

Status: implementation complete with explicit coverage limits.

## Objective
Port the 15-exchange mode: markets, trading, orders, portfolio, API keys, deposit,
withdraw, and futures.

## Work performed
- `core/src/exchanges/config.ts`: 15 exchange configs (Binance, KuCoin, MEXC, Bybit,
  BitMart, Bitget, Kraken, Gate.io, Coinbase, BingX, HTX, Phemex, DigiFinex, LBank,
  Bitfinex) with base URLs, colors and capabilities.
- `sign.ts`: per-exchange signing (HMAC-SHA256, HMAC-SHA512 for Kraken, OKX-style HMAC +
  passphrase, Coinbase CB-ACCESS-*, query/body canonicalization), unit-tested.
- `adapter.ts`: markets, ticker, balances/portfolio, open orders, order status, deposit
  addresses; `futures.ts`: 5 futures venues (Binance, Bybit, Bitget, KuCoin, MEXC), market
  normalization, position parsing, leverage and order bodies.
- API keys stored per exchange in the Keystore vault (`nexus2/exchange/<id>`), masked in UI.
- UI: `ExchangeScreen` (markets/trade/orders/portfolio tabs, spot order bodies for 7
  exchanges, read paths for all), `ExchangeKeysScreen`, `DepositScreen` (address/memo/QR/copy,
  7 exchanges), `ExchangeWithdrawScreen` (signed withdraw bodies, 7 exchanges),
  `FuturesScreen` (markets, ticket, positions, 5 venues), exchange tab navigator.

## Coverage limits (G6)
Spot order placement + withdraw: Binance, MEXC, Bybit, KuCoin, Gate.io, Bitget, HTX.
Other adapters support reads and throw an explicit "not supported" error for trading rather
than sending malformed signed orders. Futures live placement was not exercised (G21).

## Evidence
- Signing and adapter tests (T).
- Screens typecheck/compile (`S+B`).
- Manual §I (not executed — no device or exchange keys, G18/G21).

## Exit criteria
- [x] 15 adapters with signing
- [x] Keys never stored plaintext
- [ ] Live order verification (M-I) — blocked

## Next phase
Migration, hardening, packaging.
