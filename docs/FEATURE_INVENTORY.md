# Feature Inventory

Source of truth: `legacy/app/src/main/assets/index.html` (98,580 lines, 5,107,646 bytes).
Evidence: `docs/index/chunks/*.md` (eight sequential audit reports), `docs/index/*.json`
(IDs, keys, hosts, native calls). Legacy line numbers refer to that file.

Status legend used only here for orientation; the definitive DONE/PARTIAL/NOT DONE table is
`PARITY_CHECKLIST.md`. "core" means implemented in `core/src` with unit tests; "UI" means a
React Native screen exists in `ui/src`.

## 1. App shell, security and persistence

| # | Feature | Legacy evidence | Rebuild |
|---|---------|-----------------|---------|
| 1.1 | Splash, SPA page router (`switchPage`), bottom nav, page-timer registry | 171–232, 8069, 21657 | core: none needed; UI: navigation |
| 1.2 | App lock: 6-digit PIN, pattern, biometric gate, default method, security level | 7502–8066 | core `security/pin.ts`; UI lock screen; native biometrics |
| 1.3 | Wallet groups: create/generate/import/rename/reorder/delete, per-group keys and mnemonics | 24601–26100 | core `wallet/groups.ts`, `wallet/keys.ts`; UI Groups |
| 1.4 | Legacy crypto `ncx4` AES-256-GCM (PBKDF2 200k, fixed salt), ncx3/nsx2/ncx1 read, PIN migration | whole file (NexusCrypto) | core `crypto/legacyCrypto.ts` |
| 1.5 | Storage: localStorage keys, per-group/per-wallet namespacing, tombstones | 57 keys in `docs/index/storage-keys.json` | core stores + native Keystore-backed storage; schema in `STORAGE_SCHEMA.md` |
| 1.6 | Theme (dark/light CSS overrides), display currency, haptics, notifications, console log | 362–779, 61174, 40455–40687 | core settings model; UI settings; native services |
| 1.7 | Service-worker self-hosting with SHA-256 gate + `eval` | 264–339 | **removed** (security; not needed in RN) |
| 1.8 | PWA manifest/install prompt | 340–360, 82,xxx | **not reproduced** (native app) |

## 2. Home, balances, tokens, prices

| # | Feature | Legacy evidence | Rebuild |
|---|---------|-----------------|---------|
| 2.1 | Home token cards, per-chain filter, "All Networks", hide zero balances, sort by USD | 1161–1396, 23000–23300 | core `tokens/*`; UI Home |
| 2.2 | Portfolio total with animated counter and currency conversion | 23100–23200 | UI Home selector + `prices` |
| 2.3 | Balance fetch per token across all group wallets, balance cache `nexus_bal_cache_<last8>` (no TTL) | 23153–23197, 23748–23860 | core `tokens/balances.ts` (address-keyed) |
| 2.4 | Token manager: CG/CMC/DexScreener search, contract metadata, chain picker, add/remove, removed-defaults | 28805–28975, 36240–37930 | core `tokens/store.ts`, `tokens/erc20.ts`; UI Token Manager |
| 2.5 | Default token list across 9 chains (native + stables + majors) | 28825–28913 | core `tokens/defaults.ts` |
| 2.6 | Price engine: Binance batch → CoinGecko → CMC → DexScreener, 15 s TTL, 5 min persisted | 21595–22622 | core `prices/*` |
| 2.7 | Silent 15 s refresh; stale-safe UI updates | 62002–62041 | UI polling hook |
| 2.8 | USD/price chart sources: Binance, Bitget, Bybit, OKX, KuCoin, CG OHLC/market_chart, CMC chart | 22083–222xx, 34358–35600 | core chart adapters (partial); UI chart |
| 2.9 | Full-screen chart: lightweight-charts, MA7/25/99, 11 chart types, 11 timeframes, drawing engine (~24 tools), per-coin persisted drawings | 30500–35600 | UI chart + core transforms; drawing engine in UI |
| 2.10 | Token detail bottom sheet: quick actions / swap / bridge / send | 30424 | UI sheet |

## 3. Send / receive

| # | Feature | Legacy evidence | Rebuild |
|---|---------|-----------------|---------|
| 3.1 | Send native + ERC-20 on any chain, per-chain RPC map, explorer links | 37940–40182 | core `tokens/erc20.ts`, `rpc/gas.ts`; UI Send |
| 3.2 | Gas modes: EIP-1559 → legacy fallback, 1 retry, 400 ms pause, nonce refresh | 52660–52910 | core `rpc/gas.ts` |
| 3.3 | Base sponsored send via Coinbase Paymaster / ERC-4337 v0.6 | 27845–28210 | core paymaster module; UI send flow |
| 3.4 | Receive screen / QR (qrcode + jsQR), address copy, address list | 42953+ | UI Receive; native clipboard |
| 3.5 | "No Wallet Selected" empty state, retry states | 23204–23223 | UI Home |
| 3.6 | Transaction history save, 15-item trim, notifications, explorer links | 28212–28338 | core `history/store.ts`; UI History |
| 3.7 | Bridge-history tombstone (`brh_cleared_ts`) separate from profile history | 49772, 50206–50520 | core `history/store.ts` |

## 4. Swap

| # | Feature | Legacy evidence | Rebuild |
|---|---------|-----------------|---------|
| 4.1 | Swap page, token pickers, percent slider, slippage/deadline/expert settings, multi-route, gas mode | 1398–1620, 8483–9097, 53701–55200 | core `swap/*`; UI Swap |
| 4.2 | 16 quote providers (LiFi, Odos, 1inch, swapapi.dev, Kyber, OpenOcean, Bungee, Rango, Symbiosis, Enso, Velora, DODO, Portals, Fly, OKX DEX, Squid) | 55201–58200 | core `swap/providers/*` |
| 4.3 | Multi-RPC failover per quote, 429 handling, timeouts, concurrency caps | 55201–56000 | core `rpc/client.ts`, engines |
| 4.4 | Result normalization, USD gas, price impact, provider sort, best-route selection | 56701–58200 | core `swap/engine.ts` |
| 4.5 | Execution: direct calldata, LiFi step, Bungee build-tx, Rango confirm/create, Velora price→build, OKX approve+swap | 59148–59545, 47962–48380 | core `swap/execute.ts` |
| 4.6 | Wallet selection drawer, saved sender key (`nexus_sw_signer`), multi-key swap | 1908–2070, 53701+ | core stores; UI |
| 4.7 | Swap history, badge, bot integration | 28212, 49772 | core history; UI |

## 5. Bridge

| # | Feature | Legacy evidence | Rebuild |
|---|---------|-----------------|---------|
| 5.1 | Bridge page, chain/token pickers, wallet sender panel, settings, confirm sheet | 9099–9600, 12301–12495, 49201–50100 | core `bridge/*`; UI Bridge |
| 5.2 | Providers: LiFi, Rubic, Rango, Socket/Bungee with per-provider fees/gas/duration | 44400–45080, 46960–47160 | core `bridge/providers.ts` |
| 5.3 | Best-route selection (fee-free priority then output) | 44516–45080 | core `bridge/engine.ts` |
| 5.4 | Execution per provider (LiFi step, Bungee, Rango confirm+create, Rubic routes/swap) | 47962–48380 | core `bridge/execute.ts` |
| 5.5 | Pending destination status + false-failure guard + `recvHash` patch | 49860–50200, 28340 | core `bridge/status.ts`, history.patch |
| 5.6 | Bridge history modal + tombstone + inline recent 5 | 50206–50520 | core history; UI |

## 6. Transfer Hub (9 tools)

| # | Tool | Legacy evidence | Rebuild |
|---|------|-----------------|---------|
| 6.1 | Batch Transfer native + token (deploy v3.6 contract, per-address amount, batch size 50/100, progress/logs, saved contracts) | 12831–13125, 65522–67780 | core `transfer/batch.ts`; UI Batch |
| 6.2 | Multi-Key Native / Token (direct vs contract mode, sender keys, presets, retries 3×, 0.1 s pacing) | 13128–13463, 72900–75900 | core `transfer/multikey.ts`; UI |
| 6.3 | Wallet → Wallet (keys + recipient, per-wallet amounts, balance preview) | 77700–79200 | core transfer plan; UI |
| 6.4 | Self Transfer (consolidate one wallet to another / same group) | 68701–69900 | core transfer plan; UI |
| 6.5 | NFT Transfer (1→Many, Many→1, ERC-721/1155, grid selection) | 13466–13637, 79201–82700 | core `transfer/nft.ts`; UI |
| 6.6 | Token Approval Manager (read allowances, revoke) | 12755–12830, 75601–77500 | core `transfer/approvals.ts`; UI |
| 6.7 | Withdraw Manager (contract deployment, withdraw native/token, saved contracts) | 67501–68700, 77401–77900 | core `transfer/withdraw.ts`; UI |
| 6.8 | Balance Check (multi-address, multi-chain) | 75601–77500 | core `transfer/balanceCheck.ts`; UI |
| 6.9 | Phrase → Key / Key → Address tools | 13640–13781, 75601+ | core `wallet/keys.ts`; UI tools |

## 7. Automation

| # | Feature | Legacy evidence | Rebuild |
|---|---------|-----------------|---------|
| 7.1 | SUP Transfer bot, multi-key distributions, retries, background guard | 16260, 61501–63300 | core `automation/sup.ts`; UI |
| 7.2 | Base Swap Bot (7 DEX, fee tier, dry run, random counts, direction alternate, LI.FI quotes, balance verification) | 26135–27608 | core `automation/baseswap.ts`; UI |
| 7.3 | Nansen & Jumper Swap (external tools / analytics) | 61501–63300, profile menu | UI link + card |
| 7.4 | EIP-7702 delegation (batch delegate, checks `0xef0100` code, delegated/not-delegated stats) | 2482–2696, 26909 | core `automation/eip7702.ts`; UI |
| 7.5 | Coinbase Paymaster / ERC-4337 sponsoring | 27845–28210 | core `paymaster/*`; UI toggles |

## 8. dApp browser and Web3 bridge

| # | Feature | Legacy evidence | Rebuild |
|---|---------|-----------------|---------|
| 8.1 | Profile browser search bar, tabs, 3-dot recent history, tab switcher | 12476–12752, 42820 | UI Browser; native WebView |
| 8.2 | In-app browser activity, user agent, progress, back/forward, history | Java `InAppBrowserActivity` | Android Kotlin |
| 8.3 | EIP-1193 injection (`window.ethereum`), request/response via JS bridge, `eth_sendTransaction`, `personal_sign`, switch chain, wallet drawer, tx modal | 82701–86000, native-calls.json | core `dapp/provider.ts`; native bridge |
| 8.4 | dApp tx success modal + notification + explorer link | 84285, 85648 | native + UI |
| 8.5 | Deep link `nexus://wallet` autoVerify, open in system browser | AndroidManifest (legacy) | Android |

## 9. Exchange mode (16 CEX)

| # | Feature | Legacy evidence | Rebuild |
|---|---------|-----------------|---------|
| 9.1 | Exchange shell, exchange selector, key storage (`nexus_exc_keys_v1`), active exchange | 86101–87900 | core `exchange/*`; UI Exchange |
| 9.2 | Spot markets/tickers, pair picker, favorites/history (`nexus_exc_pair_`) | 86101–87900 | core adapters; UI |
| 9.3 | Spot order ticket: market/limit, buy/sell, amount/percent, balances | 87901–89300 | core adapters; UI |
| 9.4 | Order book WS/REST, trades, open orders, cancel | 89301–90700 | core adapters; UI |
| 9.5 | Convert | 89301–90700 | core adapter (where supported); UI |
| 9.6 | Futures: JWT/auth, leverage, positions, orders, feeds (`fut_lev_`, `nexus_fut_pair_`) | 90701–94900 | core `exchange/futures.ts`; UI |
| 9.7 | Deposit: chain/address/memo fetchers per exchange | 94901–96300 | core adapters; UI |
| 9.8 | Withdraw: chains, balance, fee, submit | 96301–98580 | core adapters; UI |
| 9.9 | 16 adapters: Binance, OKX, Bybit, KuCoin, Bitget, Gate, MEXC, BingX, Kraken, Coinbase, HTX, BitMart, Phemex, LBank, DigiFinex, Bitfinex | 86101–98580 | core `exchange/adapters/*` |

## 10. Cross-cutting

- Multi-RPC resolution order: custom RPCs → chain RPCs → hardcoded map → `BR_CHAIN_RPC` (core `chains/registry.ts`).
- Legacy theme tokens: `#050508` background, `--accent-primary #6366f1`, `--accent-secondary #8b5cf6`, `--neon-cyan #22d3ee`, `--accent-green #10b981`, `--accent-red`, `--accent-amber #f59e0b`; fonts display/mono/sans; Material Icons Round.
- Bengali inline comments and some UI strings exist in legacy; target keeps English UI, i18n scaffolding only (decision logged).
- Toast/haptic/notification patterns; background tx pill; wake lock via `NexusBGGuard`.
