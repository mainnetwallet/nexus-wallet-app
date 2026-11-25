# Port Map

Legacy (single `index.html`) → rebuild mapping. Line numbers refer to the legacy file;
IDs refer to `docs/index/dom-ids.json`. "Core" is `@nexus/core`; "UI" is the React Native
screen. Status is maintained in `PARITY_CHECKLIST.md`.

## Boot, shell, security

| Feature | Legacy evidence | Core | UI |
|---------|-----------------|------|----|
| Native HTTP bridge | `NexusBridge.httpGet/httpPost`, `nexusSignedFetch` (44–169) | `http.ts` + proxy client | `lib/nativeHttp.ts` |
| Console capture | 6–42, `nexus_console_log_enabled` | `security/redact.ts` | `ConsoleLog` screen |
| App lock PIN/pattern/bio | `#nexus-lock-overlay`, `#nexus-lock-setup` (7502–8066) | `security/pin.ts` | `Lock`, `LockSetup` |
| Foreground service / bg tx | `NexusForegroundService`, `#bg-pill` | — | `native/background.ts` |
| Theme + light mode | `:root` 362–397, `body.light-mode` 399–779 | `ui-tokens/theme.ts` | `theme/` |
| Toasts / haptics | `#toast`, `haptic()` | — | `components/Toast`, `native/haptics.ts` |
| Splash | `#splash` | — | native splash |
| Orientation | manifest portrait; chart cycles (32370) | — | navigation option per screen |

## Wallet and home

| Feature | Legacy evidence | Core | UI |
|---------|-----------------|------|----|
| Wallet groups CRUD | 24610+, `nexus_wallet_groups` | `wallet/groups.ts` | `Groups` / `GroupEdit` |
| Key import/derive | `deriveFromPhrases`, `nexus_send_from_pk` | `wallet/keys.ts` | `ImportKeys` |
| Home token list | `#page-home`, `#token-list` (8069–8480) | `tokens/*`, `prices/*` | `Home` |
| Mode single/multi | `#home-mode-*`, `nexus_home_mode` | `wallet/groups.ts` flatten | `Home` segmented |
| Wallet/group pickers | `#hw-*` | groups | `WalletPicker`, `GroupPicker` |
| Chain filter | `#home-chain-*`, `nexus_active_chain` | `chains/registry.ts` | `ChainPicker` |
| Pull to refresh | `#ptr-indicator-global` | — | `Home` RefreshControl |
| Token manager | `#tm-*` (28800–28975, 36368–36627) | `tokens/store.ts`, `tokens/erc20.ts` | `TokenManager` |
| Token detail sheet | `#ts-*` | prices/tokens | `TokenSheet` |
| Chart fullscreen | `#token-chart-full-overlay`, `tcf2` | chart data adapter | `TokenChart` (local WebView) |
| Address list | `#addr-list-*` | groups/keys | `AddressList` |
| Tx history | `#txh-overlay`, `nexus_tx_history` (28180–28338) | `history/store.ts` | `History` |
| Send | `#send-*`, `#snd-success-overlay` | `rpc`, `tokens/erc20`, `wallet` | `Send`, `SendSuccess` |
| Receive | QR/address sheets in profile | `util/address` | `Receive` |
| Balance cache | `nexus_bal_cache_*` (23700–23860) | `tokens/balances.ts` | `Home` |

## Swap and bridge

| Feature | Legacy evidence | Core | UI |
|---------|-----------------|------|----|
| Swap quote/execute | `#page-swap`, `SW` object | `swap/engine.ts`, `swap/execute.ts`, `swap/providers/*` | `Swap`, `SwapConfirm` |
| 16 providers | `providerMap` | `swap/providers` | `Swap` settings |
| Percent slider | `#sw-pct-*` | — | `Swap` slider |
| Swap settings | `#sw-settings-*` | `swap/types.ts` | `SwapSettings` |
| Swap history | `#sw-history-*`, `sw_recent*` | `history/store.ts` | `SwapHistory` |
| Saved pairs | `#pair-*`, `nexus_saved_pairs` | `swap` | `PairManager` |
| Bridge route/quote | `#page-bridge`, `br` object | `bridge/engine.ts`, `providers.ts` | `Bridge` |
| Bridge confirm | `#br-confirm-*` | — | `BridgeConfirm` |
| Bridge status/BSo | `_bso*` IIFE (11813–12395) | `bridge/status.ts` | `BridgeStatus` |
| Bridge history/tombstone | 50160–50410, `brh_cleared_ts` | `history/store.ts` | `BridgeHistory` |
| Bridge recipient/picker | `#br-recipient*`, `#br-chain-overlay` | — | `Bridge` pickers |

## Transfer Hub (9 tools)

| Tool | Legacy evidence | Core | UI |
|------|-----------------|------|----|
| Dashboard | `#mainDashboard`, 3×3 grid | — | `TransferHub` |
| Batch Transfer | `#batchTransferUI` | `transfer/batch.ts` | `BatchTransfer` |
| Multi-Key Native | `#multiKeyNativeUI` | `transfer/multikey.ts` | `MultiKey` |
| Wallet → Wallet | `#walletToWalletUI` | `transfer/walletToWallet.ts` | `WalletToWallet` |
| Self Transfer | `#selfTransferUI` | `transfer/self.ts` | `SelfTransfer` |
| NFT Transfer | `#nftTransferUI` | `transfer/nft.ts` | `NftTransfer` |
| Approval Manager | `#approvalManagerUI` | `transfer/approvals.ts` | `Approvals` |
| Withdraw Manager | `#withdrawUI` | `transfer/withdraw.ts` | `Withdraw` |
| Balance Check | `#balanceCheckUI` | `transfer/balanceCheck.ts` | `BalanceCheck` |
| Phrase → Key | `#phraseToKeyUI` | `wallet/keys.ts` | `PhraseTools` |

## Automation

| Feature | Legacy evidence | Core | UI |
|---------|-----------------|------|----|
| SUP transfer | `#page-sup-transfer`, `nexus_sup_pks` | `automation/sup.ts` | `SupTransfer` |
| Base Swap Bot | `#page-base-swap-bot`, `nexus_bsb_pm` | `automation/bsb.ts` | `BaseSwapBot` |
| Nansen & Jumper | `#page-nansen` | `automation/nansen.ts` | `Nansen` |
| EIP-7702 delegation | `eip7702-*` modal | `automation/eip7702.ts` | `Delegation` |
| Paymaster / ERC-4337 | `nexus_paymaster_*` | `automation/paymaster.ts` | settings toggles |

## Exchange, browser, settings

| Feature | Legacy evidence | Core | UI |
|---------|-----------------|------|----|
| Exchange markets/ticket | `#page-exchange`, `exc-*` | `exchanges/*` | `Exchange` |
| 16 CEX adapters | 73,801–86,100 | `exchanges/adapters/*` | — |
| Futures | `#page-futures`, `fut-*` | `exchanges/futures.ts` | `Futures` |
| API keys modal | `#exc-keys-*`, `nexus_exc_keys_v1` | `exchanges/keys.ts` | `ExchangeKeys` |
| Deposit/withdraw | `#dep-*`, `#wd-*` | `exchanges/transfers.ts` | `Deposit`, `ExchangeWithdraw` |
| dApp browser | `#page-browser`, chrome | `browser/provider.ts` | `Browser` |
| Web3 tx modal | `showTxModal` | `browser/eip1193.ts` | `DappTxModal` |
| Settings | `#page-settings` | `config/settings.ts` | `Settings` |
| RPC manager | `#rpc-*` | `rpc/client.ts`, `chains/registry.ts` | `RpcManager` |
| Integrators | `nexus_integrators` | `config/integrators.ts` | `Settings` |
| Profile stats | `#page-profile` | groups/automation | `Profile` |
| Migration | legacy crypto/bootstrap | `migration/*` | `Migration` |
