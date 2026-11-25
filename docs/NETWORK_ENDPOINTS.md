# Network Endpoints

Complete host inventory from `docs/index/hosts.json` (deduplicated) plus per-provider
paths found in code. All secret-bearing calls in the rebuild go through `/proxy`
instead of embedding keys (see `PROVIDER_API.md`).

## 1. JSON-RPC

- Built-in chains (Base, Ethereum, Arbitrum, Optimism, Polygon, BNB, Avalanche,
  Linea, Scroll, zkSync) — URLs in `core/src/chains/registry.ts` (ported from
  `BUILTIN_CHAINS`, ~29019) and `BR_CHAIN_RPC` (~45194, 120 chains in
  `core/src/chains/brChainRpc.ts`).
- Fallback map `RPC_MAP` (legacy line 36473) includes Fantom, Celo, Gnosis, Mantle,
  Polygon zkEVM, Blast, Mode.
- Additional hosts observed: `base-rpc.publicnode.com`, `base.llamarpc.com`,
  `eth.llamarpc.com`, `rpc.coinex.net`, `rpc1.coinex.net`, `evm.cronos.org`,
  `forno.celo.org`, `rpc.ftm.tools`, `rpc.gnosischain.com`, `zkevm-rpc.com`,
  `rpc.blast.io`, `mainnet.mode.network`, `rpc.mantle.xyz`, `cyber.alt.technology`,
  `rpc.soniclabs.com`, `rpc.hyperliquid.xyz`, `rpc.apex.proofofplay.com`,
  `subnets.avax.network`.
- Alchemy: `https://base-mainnet.g.alchemy.com/v2/<key>` — legacy lets the user save
  a key in `nexus_alchemy_key`; no default key exists in source.

Resolution order (preserved in `getRpcListForChain`):
custom RPCs (`nexus_custom_rpcs_v1`) → chain RPCs → `RPC_MAP` → `BR_CHAIN_RPC`.

## 2. Prices and market data

| Host | Use | Auth |
|------|-----|------|
| `api.binance.com` | 24h tickers (primary), klines, price | none |
| `api.bitget.com` | candles | none |
| `api.bybit.com` | v5 candles | none |
| `www.okx.com` | candles | none |
| `api.kucoin.com` | candles | none |
| `api.kraken.com`, `futures.kraken.com` | OHLC | none |
| `api.coingecko.com`, `pro-api.coingecko.com`, `assets.coingecko.com` | simple price, coin search, OHLC, logos | optional demo/pro key |
| `pro-api.coinmarketcap.com` | quotes, info, chart | `X-CMC_PRO_API_KEY` (**secret**) |
| `api.coinmarketcap.com` | public chart widget (no key) | none |
| `api.dexscreener.com`, `dd.dexscreener.com` | token price fallback, search, icons | none |
| `api.coinbase.com`, `api.exchange.coinbase.com` | spot prices / CEX | keys for private |
| `chainid.network` | ChainList import | none |
| `icons.llamao.fi` | token icons | none |

## 3. Swap / bridge aggregators

| Provider id | Host(s) | Secret |
|-------------|---------|--------|
| LiFi | `li.quest`, `li.fi` | `x-lifi-api-key` (secret; legacy literal `b3e…`) |
| Odos | `api.odos.xyz` | `x-api-key` (secret; legacy literal `7d2…`) |
| 1inch | `api.1inch.dev` | `Authorization: Bearer` (secret; legacy literal `5Pr…`) |
| swapapi.dev | `api.swapapi.dev` | API key |
| KyberSwap | `aggregator-api.kyberswap.com` | none/optional |
| OpenOcean | `open-api.openocean.finance` | none/optional |
| Bungee / Socket | `public-backend.bungee.exchange`, `www.socket.tech`, `socketscan.io` | none |
| Rango | `api.rango.exchange`, `explorer.rango.exchange` | `apiKey` query (secret; legacy literal `c63…`) |
| Symbiosis | `api.symbiosis.finance` | none |
| Enso | `api.enso.finance` | `Authorization` bearer (secret) |
| Velora (ParaSwap) | `api.velora.xyz` | none |
| DODO | `api.dodoex.io` | none |
| Portals | `api.portals.fi` | `x-api-key` (secret) |
| Fly | `api.fly.trade` | `x-api-key` (secret) |
| OKX DEX | `www.okx.com` | OK-ACCESS-KEY/SIGN/PASSPHRASE (secret) |
| Squid | `v2.api.squidrouter.com` | `x-integrator-id` |

Rubic bridge uses `api-v2.rubic.exchange` (quotes, routes, status).

## 4. Explorers / utilities

`etherscan.io`, `basescan.org`, `arbiscan.io`, `optimistic.etherscan.io`,
`polygonscan.com`, `bscscan.com`, `snowtrace.io`, `lineascan.build`,
`scrollscan.com`, `explorer.zksync.io`, `blastscan.io`, `gnosisscan.io`,
`ftmscan.com`, `celoscan.io`, `cronoscan.com`, `moonscan.io`,
`moonriver.moonscan.io`, `sonicscan.org`, `seitrace.com`, `explorer.mantle.xyz`,
`explorer.mode.network`, `explorer.zora.energy`, `explorer.inkonchain.com`,
`explorer.immutable.com`, `explorer.kava.io`, `explorer.rsk.co`,
`flare-explorer.flare.network`, `explorer.fuse.io`, `explorer.gobob.xyz`,
`explorer.gravity.xyz`, `explorer.mintchain.io`, `explorer.aurora.dev`,
`andromeda-explorer.metis.io`, `pacific-explorer.manta.network`,
`amoy.polygonscan.com` + all `sepolia.*`/`testnet.*` variants.
`api.basescan.org` token info (`module=token&action=tokeninfo`) with placeholder
`apikey=YourApiKeyToken` in legacy — rebuilt as a keyless RPC metadata read.
`raw.githubusercontent.com` (TrustWallet logos), `ipfs.io`, `github.com`,
`fonts.googleapis.com`, `www.google.com`, `www.w3.org`.

## 5. Exchange REST/WS (16 CEX)

| Exchange | Hosts |
|----------|-------|
| Binance | `api.binance.com` |
| OKX | `www.okx.com`, `static.okx.com` |
| Bybit | `api.bybit.com` |
| KuCoin | `api.kucoin.com`, `api-futures.kucoin.com` |
| Bitget | `api.bitget.com` |
| Gate | `api.gateio.ws` |
| MEXC | `api.mexc.com` |
| BingX | `open-api.bingx.com` |
| Kraken | `api.kraken.com`, `futures.kraken.com` |
| Coinbase | `api.coinbase.com`, `api.exchange.coinbase.com` |
| HTX | `api.huobi.pro`, `api.hbdm.com` |
| BitMart | `api-cloud.bitmart.com`, `api-cloud-v2.bitmart.com` |
| Phemex | `api.phemex.com` |
| LBank | `api.lbank.com` |
| DigiFinex | `openapi.digifinex.com` |
| Bitfinex | `api.bitfinex.com`, `api-pub.bitfinex.com` |

## 6. Automation / analytics

- Nansen & Jumper: external website opened in the in-app browser.
- Coinbase Paymaster/bundler: `api.developer.coinbase.com/rpc/v1/base/<key>` —
  legacy embeds key `A6j…` in `DEFAULT_PAYMASTER_URL`. **Rebuild removes it**; the
  URL must be user/proxy supplied.
- Basescan, Alchemy as above.

## 7. Legacy proxy relays (must not be reused)

`nexus-relay-workers.alihasan09765.workers.dev`,
`nexus-wallet-proxy.netlify.app`, `nexusproxy.alihasi.deno.net`,
`project-dn5l2.vercel.app`, `seslyfqxbbrgpxhtprhu.supabase.co` — third-party relays
used to bypass CORS. The rebuild ships its own `/proxy` and treats these as
untrusted. Do not call them.

## 8. Timeouts and retries (behavioral contract)

- Price fetch: Binance 8 s, CG 8 s (10 s native retry), CMC 9 s, DexScreener 6 s.
- Swap quotes: 8 s per provider, 15 s overall guard; bridge quote 10 s.
- Status polling: 8 s per request; receipt waits 90 s (bot) / 24 s (userop).
- RPC: 6–8 s per endpoint, rotate on network/HTTP/JSON-RPC retryable errors,
  max 6 attempts (`RpcClient`), one gas fallback retry (`sendTransactionWithFallback`).
