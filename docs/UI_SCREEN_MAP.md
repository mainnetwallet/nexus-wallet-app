# UI Screen Map

Reference screenshots: `docs/screenshots/` (captured from the legacy `index.html` in the
in-app Chromium at an 831×785 viewport, dark theme). Captured: `00-lock`, `01-home`,
`02-swap`, `03-bridge`, `04-transfer-hub`, `05-profile`, `06-settings`, `07-exchange`
(8 PNGs). Each entry lists the legacy DOM root, key IDs, entry point, and the target React
Navigation route. Confirm/status overlays are implemented as sheets inside their parent route
(e.g. `Swap`, `Bridge`) rather than separate stack routes.

| # | Screen | Legacy root / key IDs | Entry point | Target route |
|---|--------|-----------------------|-------------|--------------|
| 1 | Splash | `#splash` / `#splash-logo`, spinner | app boot | none (native splash) |
| 2 | Lock overlay | `#nexus-lock-overlay` (`nlk-*` dots/keypad/pattern/biometric) | boot when `nexus_lock_method` set | `Lock` |
| 3 | Lock setup | `#nexus-lock-setup` (`nlks-step-0/1/2/2-pat`) | Settings → Security | `LockSetup` |
| 4 | Home | `#page-home` (`#token-list`, `#home-token-search`, `#home-group-select`, `#home-wallet-select`, `#ptr-indicator-global`) | default tab | `Home` |
| 5 | Home mode toggle | `#home-mode-*` (single vs multi-key) | home header | `Home` segmented control |
| 6 | Network/chain picker | `#home-chain-*`, chain chips | home network pill | `ChainPicker` modal |
| 7 | Wallet/group pickers | `#hw-*` overlays | home wallet/group pills | `WalletPicker`, `GroupPicker` |
| 8 | Token detail sheet | `#ts-*` quick actions / swap / bridge / send | tap token icon | `TokenSheet` |
| 9 | Token manager | `#tm-*` (search, active list, contract import, chain-contract modal) | Home → MY TOKENS | `TokenManager` |
| 10 | Pair manager | `#pair-*` (from/to addr/sym, label, preview) | Swap → Save Pair | `PairManager` |
| 11 | Swap | `#page-swap` (`sw-*`, percent slider, settings sheet, history sheet) | tab | `Swap` |
| 12 | Swap confirm | `#sw-confirm-*` | Swap → action | `SwapConfirm` |
| 13 | Bridge | `#page-bridge` (`br-*`, chain/token/wallet panels, settings, history) | tab | `Bridge` |
| 14 | Bridge confirm | `#br-confirm-*`, close animation 380 ms, swipe 35% | Bridge → BRIDGE NOW | `BridgeConfirm` |
| 15 | Bridge status overlay | `bso` IIFE (`_bso*`) | after bridge send | `BridgeStatus` |
| 16 | Bridge history modal | `#br-history-modal`, `#brh-*`, filter pills | bridge header | `BridgeHistory` |
| 17 | Profile | `#page-profile` (hero pills, stats, TOOLS menu, browser search bar, 3-dot menu) | tab | `Profile` |
| 18 | Tx history modal | `#txh-overlay` / `#tx-history-list` | Profile → HISTORY | `History` |
| 19 | Address list modal | `#addr-list-*` | Profile address pill | `AddressList` |
| 20 | Settings | `#page-settings` (`settings-*`, RPC panel, integrators, toggles, console) | Profile → Settings | `Settings` |
| 21 | RPC manager | `#rpc-*` drawer, custom RPC modal, ChainList import | Settings → RPC | `RpcManager` |
| 22 | Transfer Hub dashboard | `#page-transfer-hub` / `#mainDashboard` / `#dashboardGrid` 3×3 | tab | `TransferHub` |
| 23 | Batch Transfer | `#batchTransferUI` (native/token modes, deploy/execute, logs) | TH card 1 | `BatchTransfer` |
| 24 | Multi-Key Native | `#multiKeyNativeUI` (keys, presets, direct/contract cards) | TH card 2 | `MultiKey` |
| 25 | Wallet → Wallet | `#walletToWalletUI` | TH card 3 | `WalletToWallet` |
| 26 | Self Transfer | `#selfTransferUI` | TH card 4 | `SelfTransfer` |
| 27 | NFT Transfer | `#nftTransferUI` (distribute/collect, grid) | TH card 5 | `NftTransfer` |
| 28 | Approval Manager | `#approvalManagerUI` | TH card 6 | `Approvals` |
| 29 | Withdraw Manager | `#withdrawUI` | TH card 7 | `Withdraw` |
| 30 | Balance Check | `#balanceCheckUI` | TH card 8 | `BalanceCheck` |
| 31 | Phrase → Key | `#phraseToKeyUI` (two modes) | TH card 9 | `PhraseTools` |
| 32 | SUP Transfer | `#page-sup-transfer` | Profile → TOOLS | `SupTransfer` |
| 33 | Base Swap Bot | `#page-base-swap-bot` (`cfg-*`, `bsb-*`) | Profile → TOOLS | `BaseSwapBot` |
| 34 | Nansen & Jumper | `#page-nansen` | Profile → TOOLS | `Nansen` |
| 35 | EIP-7702 Delegation | `#eip7702-*` modal | Profile → TOOLS | `Delegation` |
| 36 | Exchange | `#page-exchange` (`exc-*` markets, order ticket, order book, convert) | tab | `Exchange` |
| 37 | Exchange keys | `#exc-keys-*` modal | Exchange gear | `ExchangeKeys` |
| 38 | Futures | `#page-futures` (`fut-*` markets, ticket, positions) | Exchange tab | `Futures` |
| 39 | Deposit | `#dep-*` modal (chain, address, memo, QR) | Exchange → Deposit | `Deposit` |
| 40 | Withdraw | `#wd-*` modal (chain, amount, fee) | Exchange → Withdraw | `ExchangeWithdraw` |
| 41 | dApp browser | `#page-browser`, browser chrome, tabs | Profile search bar | `Browser` |
| 42 | Web3 tx modal | native `showTxModal` / `showDappTxSuccess` | dApp request | `DappTxModal` |
| 43 | Token chart fullscreen | `#token-chart-full-overlay` / `#tcf2` (timeframes, 11 chart types, drawing tools) | tap token price / chart | `TokenChart` |
| 44 | Toast / log console | `#toast`, `#nx-console-modal` | global | `ToastHost`, `ConsoleLog` |
| 45 | Background tx pill | `#bg-pill` | global | `TxPill` |

## Layout rules carried over

- Portrait only except the fullscreen token chart (legacy cycles 3 orientation states at 32370; target unlocks orientation only in `TokenChart`).
- Bottom nav height is composed with `env(safe-area-inset-bottom)`; Reanimated screens must respect `useSafeAreaInsets`.
- All overlays are bottom sheets (60–85 vh), right drawer for wallet panels (72% width, max 310px), swipe-to-dismiss thresholds 35–80 px depending on sheet.
- Color tokens: background `#050508`; surface `#0b0b12`; raised `#141420`; primary `#6366f1`; secondary `#8b5cf6`; cyan `#22d3ee`; green `#10b981`; red `#f43f5e`; amber `#f59e0b`.
- Monospace numerals (`IBM Plex Mono` / `Space Mono`) and display font `DM Sans` are emulated with bundled fonts; icon set replaced with `react-native-vector-icons` MaterialIconsRound equivalents.

## Capture notes

Screenshots were captured with the in-app browser against the legacy `file://` URL. The
lock overlay is hidden programmatically and `switchPage(id)` selects each tab; no wallet
data is entered. The viewport is the tool's available surface (831×785), not a phone
emulator, so spacing differs from a 412×915 device; the layout hierarchy is what matters.
Overlay-only screens (token manager, send, history, confirm sheets, chart) are not captured
because they require wallet state; `KNOWN_GAPS.md` G12 records this. The captures are of the
**legacy** UI and serve as the visual reference for the rebuild, not as evidence of the
React Native screens.
