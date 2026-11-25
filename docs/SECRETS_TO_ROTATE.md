# Secrets To Rotate

All values are masked to the first three characters. No full secret is reproduced in
this repository, in logs, or in the deliverable ZIP. Evidence: the constants below were
read from `legacy/app/src/main/assets/index.html` during the audit (`docs/index/hosts.json`,
`docs/index/storage-keys.json`, chunk reports). The rebuild does **not** ship any of them.

## 1. Credentials embedded in the legacy client

| # | Secret | Masked value | Where in legacy | Risk | Action |
|---|--------|--------------|-----------------|------|--------|
| 1 | CoinMarketCap Pro API key | `fb8…` | price engine fallback (`batchCmc`) | Billing: per-credit key | Revoke; re-issue; store only in `/proxy` env, never in app |
| 2 | 1inch API key | `5Pr…` | swap provider #3 | Billing + signing | Revoke; use proxy with server-side key |
| 3 | Rango API key | `c63…` | bridge/swap provider | Billing | Revoke; proxy env |
| 4 | LiFi API key | `b3e…` | bridge/swap aggregator | Rate-limit/billing | Revoke; proxy env |
| 5 | Coinbase Paymaster URL key | `A6j…` | `nexus_paymaster_url` default | Sponsored-gas billing | Revoke; user-supplied only |
| 6 | Odos API key | `7d2…` | swap provider | Billing | Revoke; proxy env |
| 7 | Legacy proxy relays (not secrets, but private infra) | `nexus-relay-workers.alihasan09765.workers.dev`, `nexus-wallet-proxy.netlify.app`, `nexusproxy.alihasi.deno.net`, `project-dn5l2.vercel.app`, `seslyfqxbbrgpxhtprhu.supabase.co` | HTTP bridge fallbacks | Traffic/cost hijack, ToS | Retire; rebuild ships `proxy/` with operator-owned deployment |
| 8 | Service-worker integrity hash | `75f…` | `NEXUS_SW_CODE_HASH` (line 272) | Hash of downloadable JS, not a key | Remove with the SW-eval mechanism |

## 2. User secrets stored in plaintext by the legacy app

These are not bunded credentials but they are exposed by legacy storage; users should be
told to rotate anything that was stored there after upgrading.

| Storage key | What it holds | Legacy protection | Rebuild treatment |
|-------------|---------------|-------------------|-------------------|
| `nexus_wallet_groups_plain_backup` | Full wallet groups incl. private keys | **plaintext JSON** | Deleted after verified migration |
| `nexus_lock_master_secret` | `nexus:master:<32hex>:<32hex>` KEK input | **plaintext localStorage** | Deleted after migration; new KEK is Keystore-wrapped |
| `nexus_exc_keys_v1` | CEX `apiKey` / `secret` / `passphrase` | Comment claims AES; code writes plaintext | Re-encrypted in Keystore storage under `nexus2/exchange/*` |
| `nexus_br_sender`, `nexus_sw_signer`, `nexus_send_from_pk`, `nexus_hw_selected_key_v1` | Private keys (`ncx4` or plaintext older builds) | Mixed | Re-encrypted; legacy copies removed |
| `nexus_swap_selected_keys`, `nexus_sup_pks` | Private-key lists | Plaintext arrays | Converted to secure refs (`keyId`), raw list removed |
| `nexus_alchemy_key` | User RPC key | Plaintext | Keystore-wrapped; optional user entry |
| `nexus_paymaster_url` | URL containing an API key | Plaintext | Keystore-wrapped; user-supplied only |
| `__nexus_fsk_v1__` | Device fallback secret | Plaintext | Deleted at boot (legacy already deletes it) |

## 3. Rules applied in the rebuild

1. No provider key, exchange secret, paymaster URL, or relay URL is compiled into `ui/` or
   `core/`. Provider calls that need a key go through `/proxy` (`PROXY_BASE_URL`).
2. The proxy reads keys from its environment (`.env`, git-ignored). `.env.example` contains
   empty placeholders only.
3. Console logging redacts `0x`-prefixed 64-hex strings, mnemonics, `apiKey`/`secret`/
   `passphrase` fields, and long base64 blobs (`core/src/security/redact.ts`).
4. Docs, tests, and fixtures use synthetic keys only. Real keys seen during the audit are
   masked here and never copied.
5. Rotation is a release blocker: the operator must deploy `proxy/` with **new** keys and
   revoke the legacy credentials before publishing.

## 4. Verification status

- [x] Audit identified bundled secrets and plaintext storage paths.
- [x] Rebuild design keeps signed/billing keys out of the client.
- [x] Redaction utility implemented and unit-tested.
- [ ] Operator rotation of items 1–6 (cannot be performed from this workspace; documented
      in `README` release checklist).
