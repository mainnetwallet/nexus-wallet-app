/**
 * Complete legacy localStorage schema for origin file:///android_asset/.
 * Derived from docs/index/storage-keys.json (57 literal keys + 7 dynamic prefixes)
 * plus keys referenced through variables in index.html.
 *
 * `migrate: 'keys'` values hold wallet material and must be re-encrypted with the
 * Keystore-backed store. `migrate: 'value'` values are preferences/config and are
 * copied as-is with validation.
 */
export interface StorageKeyDef {
  key: string;
  dynamicPrefix?: string;
  type: string;
  meaning: string;
  migrate: 'keys' | 'value' | 'cache' | 'skip';
  target: string;
}

export const LEGACY_STORAGE_SCHEMA: StorageKeyDef[] = [
  { key: 'nexus_wallet_groups', type: 'JSON array', meaning: 'Wallet groups with AES-GCM (ncx4) encrypted private keys', migrate: 'keys', target: 'vault.walletGroups' },
  { key: 'nexus_wallet_groups_plain_backup', type: 'JSON array', meaning: 'Plaintext backup written before async encryption (must be wiped after migration)', migrate: 'keys', target: 'vault.walletGroups (then delete)' },
  { key: 'nexus_lock_master_secret', type: 'string', meaning: 'Plaintext AES master secret nexus:master:<salt>:<salt> used by NexusCrypto', migrate: 'keys', target: 'Keystore-wrapped vault key' },
  { key: 'nexus_lock_pin', type: 'hex string', meaning: 'SHA-256(salt + ":" + 6-digit PIN)', migrate: 'value', target: 'auth.legacyPinHash' },
  { key: 'nexus_lock_pin_salt', type: 'hex string', meaning: 'Per-user random salt for PIN hash', migrate: 'value', target: 'auth.legacyPinSalt' },
  { key: 'nexus_lock_pin_v6', type: 'string', meaning: 'Marker that PIN is 6-digit format', migrate: 'value', target: 'auth.pinV6' },
  { key: 'nexus_lock_pat', type: 'hex string', meaning: 'SHA-256(pattern indices joined by "-")', migrate: 'value', target: 'auth.legacyPatternHash' },
  { key: 'nexus_bio_lock', type: 'on|off', meaning: 'Biometric lock enabled flag', migrate: 'value', target: 'auth.biometricEnabled' },
  { key: 'nexus_bio_cred_id', type: 'string', meaning: 'Biometric credential marker (native_bio_android)', migrate: 'value', target: 'auth.credId' },
  { key: 'nexus_lock_default', type: 'string', meaning: 'Default lock method: pin | pattern | bio', migrate: 'value', target: 'auth.defaultMethod' },
  { key: '__nexus_fsk_v1__', type: 'string', meaning: 'Removed legacy device fallback key', migrate: 'skip', target: 'delete' },
  { key: 'nexus_active_group', type: 'string', meaning: 'Active wallet group id', migrate: 'value', target: 'wallet.activeGroupId' },
  { key: 'nexus_selected_groups_multi', type: 'JSON array', meaning: 'Settings multi-select group ids', migrate: 'value', target: 'wallet.settingsGroupIds' },
  { key: 'nexus_swap_selected_groups_multi', type: 'JSON array', meaning: 'Swap multi-select group ids (separate from settings)', migrate: 'value', target: 'swap.selectedGroupIds' },
  { key: 'nexus_hw_group_id_v2', type: 'string', meaning: 'Home active wallet group id', migrate: 'value', target: 'wallet.homeGroupId' },
  { key: 'nexus_hw_selected_group_v1', type: 'string', meaning: 'Home selected wallet group (legacy v1)', migrate: 'value', target: 'wallet.homeGroupId' },
  { key: 'nexus_active_chain', type: 'number|null string', meaning: 'Active home chain id ("null" = All Networks)', migrate: 'value', target: 'wallet.activeChainId' },
  { key: 'nexus_send_chain_id', type: 'number', meaning: 'Last send chain id', migrate: 'value', target: 'send.chainId' },
  { key: 'nexus_send_from_pk', type: 'ncx4 string', meaning: 'Encrypted sender key last used in Send', migrate: 'keys', target: 'send.lastSenderKey' },
  { key: 'nexus_swap_chain_id', type: 'number', meaning: 'Last swap chain id', migrate: 'value', target: 'swap.chainId' },
  { key: 'nexus_swap_selected_keys', type: 'JSON array', meaning: 'Swap selected keys (legacy)', migrate: 'keys', target: 'swap.selectedKeys' },
  { key: 'nexus_sw_signer', type: 'string', meaning: 'Selected swap signer key', migrate: 'keys', target: 'swap.signer' },
  { key: 'nexus_swap_paymaster_enabled', type: 'bool', meaning: 'Swap paymaster toggle', migrate: 'value', target: 'swap.paymasterEnabled' },
  { key: 'nexus_paymaster_enabled', type: 'bool', meaning: 'Base paymaster enable toggle', migrate: 'value', target: 'paymaster.enabled' },
  { key: 'nexus_paymaster_url', type: 'string', meaning: 'Custom paymaster URL', migrate: 'value', target: 'paymaster.url' },
  { key: 'nexus_custom_rpcs_v1', type: 'JSON object', meaning: 'Per-chain custom RPCs: { [chainId]: { defaultRpc, rpcs[] } }', migrate: 'value', target: 'chains.customRpcs' },
  { key: 'nexus_custom_chains_<groupId>', dynamicPrefix: 'nexus_custom_chains_', type: 'JSON array', meaning: 'Per-group custom chains', migrate: 'value', target: 'chains.customChains[groupId]' },
  { key: 'nexus_chain_wallet_<address>', dynamicPrefix: 'nexus_chain_wallet_', type: 'number|null', meaning: 'Per-wallet selected chain', migrate: 'value', target: 'wallet.chainByAddress' },
  { key: 'nexus_token_cache', type: 'JSON object', meaning: 'Token list cache (cleared on network switch)', migrate: 'cache', target: 'cache.tokens' },
  { key: 'nexus_token_cache_<id>', dynamicPrefix: 'nexus_token_cache_', type: 'JSON object', meaning: 'Per-wallet token cache', migrate: 'cache', target: 'cache.tokens' },
  { key: 'nexus_bal_cache_<id>', dynamicPrefix: 'nexus_bal_cache_', type: 'JSON object', meaning: 'Balance cache with TTL', migrate: 'cache', target: 'cache.balances' },
  { key: 'nexus-theme', type: 'dark|light', meaning: 'Theme', migrate: 'value', target: 'settings.theme' },
  { key: 'nexus_haptic', type: 'on|off', meaning: 'Haptic feedback toggle', migrate: 'value', target: 'settings.haptic' },
  { key: 'nexus_notif', type: 'on|off', meaning: 'Notifications toggle', migrate: 'value', target: 'settings.notifications' },
  { key: 'nexus_console_log_enabled', type: 'on|off', meaning: 'Console log panel', migrate: 'value', target: 'settings.consoleLog' },
  { key: 'nexus_display_currency', type: 'USD|BDT|ETH|BTC', meaning: 'Display currency', migrate: 'value', target: 'settings.currency' },
  { key: 'nexus_home_mode', type: 'wallet|exchange', meaning: 'Home mode switch', migrate: 'value', target: 'ui.homeMode' },
  { key: 'nexus-pwa-dismissed', type: '1', meaning: 'PWA install prompt dismissed', migrate: 'skip', target: 'not needed on native' },
  { key: 'nexus_exc_keys_v1', type: 'JSON object', meaning: 'CEX API credentials (plaintext apiKey/secret/passphrase, 16 exchanges)', migrate: 'keys', target: 'vault.exchangeKeys' },
  { key: 'nexus_exc_active', type: 'string', meaning: 'Active exchange id', migrate: 'value', target: 'exchange.active' },
  { key: 'nexus_exc_pair_<excId>', dynamicPrefix: 'nexus_exc_pair_', type: 'string', meaning: 'Last spot pair per exchange', migrate: 'value', target: 'exchange.pair[excId]' },
  { key: 'nexus_fut_pair_<excId>', dynamicPrefix: 'nexus_fut_pair_', type: 'string', meaning: 'Last futures pair per exchange', migrate: 'value', target: 'exchange.futuresPair[excId]' },
  { key: 'fut_lev_<excId>_<symbol>', dynamicPrefix: 'fut_lev_', type: 'number', meaning: 'Futures leverage per exchange/symbol', migrate: 'value', target: 'exchange.leverage' },
  { key: 'nexus_sup_pks', type: 'encrypted string', meaning: 'SUP Transfer private keys (AES)', migrate: 'keys', target: 'automation.supKeys' },
  { key: 'nexus_bsb_pm', type: 'string', meaning: 'Base Swap Bot paymaster URL', migrate: 'value', target: 'automation.bsbPaymaster' },
  { key: 'transferHub_currentSection', type: 'string', meaning: 'Last Transfer Hub tool', migrate: 'value', target: 'transferHub.section' },
  { key: 'transferHub_chain_batchNative', type: 'number', meaning: 'Batch native chain id', migrate: 'value', target: 'transferHub.chain.batchNative' },
  { key: 'transferHub_chain_batchToken', type: 'number', meaning: 'Batch token chain id', migrate: 'value', target: 'transferHub.chain.batchToken' },
  { key: 'transferHub_chain_withdraw', type: 'number', meaning: 'Withdraw manager chain id', migrate: 'value', target: 'transferHub.chain.withdraw' },
  { key: 'transferHub_chain_<section>', dynamicPrefix: 'transferHub_chain_', type: 'number', meaning: 'Per-tool selected chain', migrate: 'value', target: 'transferHub.chain' },
  { key: 'batchTransferContracts', type: 'JSON array', meaning: 'Deployed batch-native contracts', migrate: 'value', target: 'transferHub.contracts.batchNative' },
  { key: 'batchTransferContractsToken', type: 'JSON array', meaning: 'Deployed batch-token contracts', migrate: 'value', target: 'transferHub.contracts.batchToken' },
  { key: 'multiKeyNativeContracts', type: 'JSON array', meaning: 'Deployed multi-key native contracts', migrate: 'value', target: 'transferHub.contracts.multiKeyNative' },
  { key: 'centralContracts', type: 'JSON array', meaning: 'Central transfer contracts', migrate: 'value', target: 'transferHub.contracts.central' },
  { key: 'withdrawContracts', type: 'JSON array', meaning: 'Withdraw manager contracts', migrate: 'value', target: 'transferHub.contracts.withdraw' },
  { key: 'receiverAddresses', type: 'text', meaning: 'Saved receiver addresses (native tools)', migrate: 'value', target: 'transferHub.receivers.native' },
  { key: 'receiverAddressesToken', type: 'text', meaning: 'Saved receiver addresses (token tools)', migrate: 'value', target: 'transferHub.receivers.token' },
  { key: 'brh_cleared_ts', type: 'timestamp', meaning: 'Bridge history cleared timestamp', migrate: 'value', target: 'bridge.historyClearedAt' },
  { key: 'sw_recent', type: 'JSON array', meaning: 'Recent swap tokens', migrate: 'value', target: 'swap.recent' },
  { key: 'sw_recent_cleared_ts', type: 'timestamp', meaning: 'Swap recent cleared timestamp', migrate: 'value', target: 'swap.recentClearedAt' },
  { key: 'nexus_br_sender', type: 'number', meaning: 'Bridge sender key index', migrate: 'value', target: 'bridge.senderIndex' },
  { key: 'nexus_br_disconnected', type: '1', meaning: 'Bridge wallet disconnected flag', migrate: 'value', target: 'bridge.disconnected' },
  { key: '_nexusDraw_<COIN>', dynamicPrefix: '_nexusDraw_', type: 'JSON', meaning: 'Chart drawing persistence per coin', migrate: 'value', target: 'charts.drawings' },
  { key: '__nexus_sw_code__', type: 'string', meaning: 'Service-worker code cache (sha-gated eval)', migrate: 'skip', target: 'delete' },
  { key: '__nexus_sw_ver__', type: 'number', meaning: 'Service-worker cache version', migrate: 'skip', target: 'delete' },
];

export const LITERAL_LEGACY_KEYS = LEGACY_STORAGE_SCHEMA.filter((k) => !k.dynamicPrefix).map((k) => k.key);

export const WALLET_GROUP_STORAGE_KEY = 'nexus_wallet_groups';
export const WALLET_GROUP_BACKUP_KEY = 'nexus_wallet_groups_plain_backup';
export const MASTER_SECRET_KEY = 'nexus_lock_master_secret';
