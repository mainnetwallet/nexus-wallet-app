# Migration Plan

Goal: an existing user upgrades over the legacy APK (`com.nexus.wallet`, versionCode 213)
and keeps groups, keys, tokens, history, RPC settings, custom chains, exchange keys and
preferences. No key may be lost silently and the legacy data must remain recoverable until
the new copy is verified.

## 1. Inputs

| Source | Detail |
|--------|--------|
| Legacy localStorage | Read through the native `LegacyStore` module (WebView `localStorage` DB is copied/read, never modified in place) |
| Crypto | `ncx4:` AES-256-GCM, PBKDF2-SHA256 200k, salt `nexus-wallet-salt-v4`, secret `nexus_lock_master_secret` |
| Older formats | `ncx3:`/`nsx2:` FNV-XOR (recoverable), `ncx1:` (unrecoverable), plaintext keys from pre-v3 builds |
| Tokens/history | `nexus_custom_tokens*`, `nexus_tx_history`, `brh_cleared_ts`, `sw_recent*` |
| Settings | `nexus_active_chain`, `nexus_display_currency`, `nexus-theme`, `nexus_notif`, `nexus_haptic`, RPC keys, custom chains |
| Exchange | `nexus_exc_keys_v1`, `nexus_exc_active`, per-exchange pairs |
| Chart | `_nexusDraw_<COIN>` drawings, `nexus_browser_history` |

## 2. Target schema

Written under `nexus2/*` (see `STORAGE_SCHEMA.md` §8). Each value is encrypted by a
Keystore-wrapped AES-256-GCM key derived from the user PIN (KEK) via PBKDF2-HMAC-SHA256,
then verified by re-reading and re-deriving addresses. Legacy keys are never overwritten
during migration; they are deleted only in the final commit step.

## 3. Flow

```
boot
 └─ LegacyStore.probe()            // keys present? app version?
     ├─ no legacy data → normal first-run
     └─ legacy data
         ├─ Migration screen (blocking, no skip):
         │   1. show counts only, never values
         │   2. create PIN (or reuse lock secret for decryption)
         │   3. decrypt groups:
         │        ncx4  → AES-GCM
         │        ncx3/nsx2 → XOR
         │        ncx1 → count as unrecoverable (report, don't drop)
         │        plaintext 0x… → accept for older builds
         │   4. derive address for every key (ethers.Wallet)
         │   5. write nexus2/groups + tokens + history + settings
         │   6. read back, decrypt, compare key count and addresses
         │   7. compute legacy backup blob → secure rollback store
         │   8. mark nexus2/migration {status:'verified', legacyKeyHash, verifiedAt}
         │   9. delete legacy wallet/secret keys only after (8) succeeds
         └─ failure at any step → keep legacy intact, status 'pending', show masked error
```

## 4. What is copied vs dropped

| Copied | Dropped / regenerated |
|--------|-----------------------|
| Groups, keys, mnemonics that decrypt | `nexus_token_cache*` (HTML UI cache) |
| Token lists, removed-default ids | `__nexus_sw_code__` / `__nexus_sw_ver__` (service worker payload) |
| Tx history entries (same shape) | `_plain_backup` and `nexus_lock_master_secret` after verification |
| Bridge/swap tombstones (`brh_cleared_ts`, `sw_recent_cleared_ts`) | Balance cache entries keyed by private-key fragments (rebuilt by address) |
| Custom chains, RPCs, Alchemy/paymaster (re-encrypted) | Price cache (short TTL; refetched) |
| Exchange keys (re-encrypted) + active exchange/pairs | Legacy relay URLs (replaced by operator proxy) |
| Theme/currency/chain/haptics/notifications, lock config (PIN hash is re-created, not copied) | Legacy service-worker `eval` code |

## 5. Rollback

- Rollback blob = encrypted copy of every legacy key/value consumed, stored under
  `nexus2/migration/rollback` with the same Keystore key.
- Available until first successful unlock + 7 days. A Settings action "Restore legacy data"
  writes the blob back to the legacy key names and clears `nexus2/*` derived data.
- Automatic rollback triggers: read-back mismatch, address mismatch, zero groups decrypted
  while legacy reported >0 keys, or exception during write.

## 6. Edge cases and decisions

| Case | Behaviour |
|------|-----------|
| `ncx4` group decrypts partially | Keep decrypted keys, flag group `_decryptFailed` only when all keys fail, surface a masked count |
| Wrong / missing master secret | Stop; offer "enter legacy PIN" retry; never delete anything |
| `ncx1` entries | Count and report "N keys from an unsupported old format — re-import from backup"; not silently dropped |
| Duplicate keys across groups | Preserved (legacy kept them); dedupe only inside a group, as legacy did |
| Very large stores | Limits 500 groups / 10,000 keys per group (`decryptLegacyGroups`), same as legacy guards |
| App killed mid-migration | Idempotent: `nexus2/migration` status drives resume; writes are staged then committed |
| User already has `nexus2/*` (upgrade from a beta) | Never overwrite; merge only when key sets are disjoint, else keep current and archive legacy blob |
| Legacy exchange keys partly malformed | Copy entries that validate (`apiKey` string), report masked count of skipped |

## 7. Verification evidence

- Crypto round-trip and XOR fixtures: `core/test/migration.test.ts` (planned with the
  migration orchestrator).
- Address verification: `verifyMigratedGroups` (`core/src/wallet/groups.ts`).
- Manual QA: `MANUAL_QA.md` §Migration.
- The migration UI shows progress by category with counts, never values; keys are masked
  to `0x1234…abcd` in any diagnostic string.

## 8. Security changes vs legacy

- Keys re-encrypted under Android Keystore (StrongBox when available) with PIN-derived KEK.
- No plaintext `_plain_backup`; no plaintext master secret after commit.
- Legacy data read-only; deletion only after verified read-back.
- Clipboard is cleared after paste; key screens set `FLAG_SECURE`; screenshots blocked.
