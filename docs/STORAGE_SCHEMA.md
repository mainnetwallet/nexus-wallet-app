# Storage Schema

Legacy uses `localStorage` inside a WebView. The rebuild uses a native
`SecureStore`-style KV interface (`core` talks only through `read/write/remove`)
backed by Android Keystore-wrapped AES-GCM files. **Key names and JSON shapes are
preserved** so the migration can read legacy data verbatim.

Evidence: `docs/index/storage-keys.json` (57 literal keys), plus constants found in
code (`nexus_tx_history`, `nexus_wallet_groups`, `nexus_saved_pairs`,
`nexus_price_cache_v1`, `nexus_integrators`, `nexus_alchemy_key`, `WG_ACTIVE_KEY`,
`nexus_selected_groups_multi`, `nexus_swap_selected_groups_multi`).

## 1. Wallet keys and groups

| Key | Shape | Notes / legacy crypto |
|-----|-------|-----------------------|
| `nexus_wallet_groups` | `LegacyWalletGroup[]` where group = `{id,name,keys:string[],mnemonics?:string[],createdAt?,source?}` | Entire array encoded with `NexusCrypto.encryptGroups` before `setItem`; a plaintext `_plain_backup` copy is also written (`WG_STORAGE_KEY+'_plain_backup'`, line 24617). **Security finding.** |
| `nexus_wallet_groups_plain_backup` | same array, plaintext | Removed by rebuild migration after successful verification. |
| `nexus_active_group` | group id string | active group in Settings |
| `nexus_selected_groups_multi` | `string[]` | Settings multi-select |
| `nexus_swap_selected_groups_multi` | `string[]` | Swap selection (separate) |
| `nexus_hw_selected_key_v1` | `ncx4:…` encrypted selected key | home wallet selection |
| `nexus_hw_group_id_v2` | group id | home group |
| `nexus_hw_selected_group_v1` | group id | legacy home selection fallback |
| `nexus_home_mode` | `'single'｜'multi'` | home mode |
| `nexus_send_from_pk` | `ncx4:…` encrypted private key | send modal sender |
| `nexus_br_sender` | JSON `{addr, encPk?: 'ncx4:…', pk?: string}` | bridge sender; legacy older builds stored plaintext `pk`. Rebuild re-encrypts. |
| `nexus_br_disconnected` | `'1'` | opt-out of auto-connect |
| `nexus_sw_signer` | JSON `{addr, encPk}` | swap signer |
| `nexus_swap_selected_keys` | `string[]` (keys) | multi-key swap selection; secret material. Rebuild stores ids + secure refs. |
| `nexus_sup_pks` | key list | SUP bot private keys (secret). |
| `nexus_bsb_pm` | JSON | Base Swap Bot per-wallet/per-amount config |
| `nexus_lock_*` | see §4 | app lock |

## 2. Tokens, prices, balances, history

| Key | Shape | Notes |
|-----|-------|-------|
| `nexus_custom_tokens` | `Token[]` | global fallback token list |
| `nexus_custom_tokens_<groupId>` | `Token[]` | per-wallet token list |
| `nexus_custom_tokens_<groupId>_removed_defaults` | `string[]` | ids the user deleted (prevents re-injection) |
| `nexus_price_cache_v1` | `{cache:{[cgId]:{usd,usd_24h_change}},saved:number}` | 5 min persisted, 15 s memory |
| `nexus_bal_cache_<last8>` | `{walletKey?,walletId?,cache:{[tokenId:chainId:suffix]:number},cacheTime,saved}` | **legacy `walletKey` is the private key**; rebuild writes `walletId` (address) only |
| `nexus_token_cache` / `nexus_token_cache_<pkLast8>` | HTML string of token cards | early-render flash suppressor. Not migrated (UI cache) |
| `nexus_tx_history` | `TxHistoryEntry[]`, newest first, bridge+swap capped at 15 | see `history/store.ts` |
| `brh_cleared_ts` | number (ms) | hides bridge+swap entries ≤ ts in bridge views only |
| `sw_recent_cleared_ts` | number | swap recent list tombstone |
| `sw_recent` | array of recent swaps | |
| `nexus_send_chain_id` | number | send chain (default 8453) |
| `nexus_swap_chain_id` | number | swap chain |
| `nexus_active_chain` | number | home chain filter (`null`/absent = All) |
| `nexus_display_currency` | `'USD'｜'EUR'｜…` | currency |
| `nexus-theme` | `'dark'｜'light'` | theme |
| `nexus_notif` | `'on'` | tx notifications |
| `nexus_haptic` | `'on'｜'off'` | haptics |
| `nexus_console_log_enabled` | `'1'` | console capture |

## 3. Chains, RPC, integrations

| Key | Shape |
|-----|-------|
| `nexus_custom_chains` | `CustomChainDef[]` (global fallback) |
| `nexus_custom_chains_<groupId>` | `CustomChainDef[]` |
| `nexus_custom_rpcs_v1` | `{[chainId]:{defaultRpc?:string,rpcs:string[]}}` |
| `nexus_alchemy_key` | string (plaintext API key) — **security finding** |
| `nexus_integrators` | array of swap integrator configs |
| `nexus_integrator_active` | integrator id |
| `nexus_paymaster_url` | URL with embedded key (legacy default) — **security finding** |
| `nexus_paymaster_enabled`, `nexus_swap_paymaster_enabled` | `'1'｜'0'` |
| `nexus_saved_pairs` | pair objects `{fromAddr,fromSym,toAddr,toSym,label,…}` |
| `nexus_saved_contracts*`, `batchTransferContracts`, `batchTransferContractsToken`, `multiKeyNativeContracts`, `withdrawContracts`, `centralContracts` | saved deployed contract addresses per tool |

## 4. App lock

| Key | Shape |
|-----|-------|
| `nexus_lock_pin` | salted SHA-256 hex (6-digit PIN) |
| `nexus_lock_pat` | pattern hash |
| `nexus_lock_method` | `'pin'｜'pattern'｜'bio'` default method |
| `nexus_bio_lock` | `'on'` |
| `nexus_bio_cred_id` / `nexus_lock_cred_id` | biometric credential id |
| `__nexus_fsk_v1__` | legacy device fallback secret — removed at boot (line 24389) |

## 5. Exchange

| Key | Shape | Security |
|-----|-------|----------|
| `nexus_exc_keys_v1` | `{[exchangeId]:{apiKey,secret,passphrase?}}` | **plaintext JSON in legacy** despite an "AES via SubtleCrypto" comment (86238). Rebuild stores exchange keys in Keystore-wrapped storage. |
| `nexus_exc_active` | exchange id | |
| `nexus_exc_pair_<id>` | last pair/symbol | |
| `fut_lev_<id>` | futures leverage | |
| `nexus_fut_pair_<id>` | futures pair | |

## 6. Browser / Web3

| Key | Shape |
|-----|-------|
| `nexus_browser_history` (3-dot recent) | array of URLs/titles |
| `nexus_active_browser_chain` | chain id (`getSelectedBrowserChainId`) |
| `nexus_selected_browser_wallet` | address |
| browser wallet persistence | `getPersistedBrowserWallet` native call |

## 7. Transfer Hub

`receiverAddresses`, `receiverAddressesToken`, `transferHub_chain_*`,
`transferHub_currentSection`, `_nexusDraw_<COIN>` (chart drawings, per coin and
orientation), `__nexus_sw_code__` / `__nexus_sw_ver__` (service-worker code),
`nexus-fwa-dismissed`, `fut_*` caches.

## 8. Target schema (new keys)

New data lives under `nexus2/*` and is never mixed with legacy keys:

- `nexus2/groups` → `{version:1, groups:[{id,name,keys:[{address,encPrivateKey,encMnemonic?,source}],createdAt}]}`
- `nexus2/settings` → theme, currency, chain, notifications, haptics, lock config, gas mode
- `nexus2/tokens/<groupId>` → same `Token[]` shape as legacy
- `nexus2/history` → `TxHistoryEntry[]` (same shape)
- `nexus2/prices` → price cache
- `nexus2/balances/<address>` → address-keyed balance cache
- `nexus2/exchange/<id>` → Keystore-wrapped API credentials
- `nexus2/browser` → tabs/history
- `nexus2/migration` → `{status:'pending'|'verified'|'rolled_back', backupId, legacyKeyHash, verifiedAt}`

## 9. Migration compatibility rules

1. Read legacy `nexus_wallet_groups`; decrypt `ncx4` (AES-GCM, PBKDF2-SHA256 200k,
   salt `nexus-wallet-salt-v4`), then `ncx3` (XOR/FNV), `nsx2`/`ncx1` are
   unrecoverable (report count, never silently drop).
2. Validate every derived address against stored `keys`; mismatches are reported.
3. Write new encrypted storage; re-read and compare; only then delete legacy keys,
   keeping a rollback copy until first successful unlock.
4. Copy token list, history, RPCs, custom chains, settings, exchange keys (re-encrypt),
   and chart drawings. Do not copy UI caches (`nexus_token_cache*`) or the service
   worker payload.
