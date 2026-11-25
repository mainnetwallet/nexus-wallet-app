# Provider API Contract

All swap/bridge providers implemented in `core/src/swap/providers/*` and
`core/src/bridge/providers.ts`. Keys are **never** bundled: providers receive
secrets from `ProviderSecrets` (user settings) or the `/proxy` forwarder.

## Transport modes

- **direct**: only keyless providers (Kyber, OpenOcean-without-key, Bungee, Velora,
  DODO, Symbiosis, Rango-free-tier only if key omitted).
- **proxy**: any request needing a key. The client POSTs
  `{provider,url,method,headers,body,query}` to `${proxyBaseUrl}/v1/forward`; the
  proxy validates an endpoint allowlist, injects the secret, forwards, and returns
  `{status,body}`. Client never sees the secret.
- **local signing**: OKX and all CEX adapters sign locally with user-supplied keys
  (HMAC-SHA256), then still proxy if `useProxy` is set (to hide the key from the
  network layer). OKX signing is byte-identical in both modes
  (`okxSign(timestamp+method+path+body)` → base64).

## Swap providers

| ID | Quote request | Auth / notes | Execute |
|----|---------------|--------------|---------|
| `lifi` | `GET https://li.quest/v1/quote?fromChain&toChain&fromToken&toToken&fromAmount&fromAddress&slippage&integrator&fee` | `x-lifi-api-key` | POST step 0 `/v1/step/transaction` with injected `fromAddress/toAddress/fromAmount` |
| `odos` | `POST https://api.odos.xyz/sor/quote/v2` `{chainId,inputTokens,outputTokens,userAddr,slippageLimitPercent,compact,simple}` | `x-api-key` | `POST /sor/assemble {pathId,userAddr,simulate:false}` |
| `oneinch` | `GET https://api.1inch.dev/swap/v6.0/{chain}/quote?...` | `Authorization: Bearer`; guard chain list before call | `/swap` at execute |
| `swapapi` | `GET https://api.swapapi.dev/api/v1/quote?...` | API key header; DEX names normalized (`SWAPAPI_NAME_MAP`) | returned tx |
| `kyber` | `GET https://aggregator-api.kyberswap.com/{chain}/api/v1/routes?...` | none | `POST /route/build`, `slippageTolerance = round(slip*100)`, `deadline + 1200` |
| `openocean` | `GET https://open-api.openocean.finance/v4/{chain}/quote?...` | optional key | returned tx |
| `bungee` | `GET https://public-backend.bungee.exchange/api/v1/bungee/quote?...` | none | `POST /build-tx`, spender `approvalData.spenderAddress` |
| `rango` | `GET https://api.rango.exchange/basic/quote?...` (multi-bests) | `apiKey` query (secret) | `POST /basic/confirm`, then `POST /tx/create` step 1 (`userSettings`, `validations`) |
| `symbiosis` | `GET https://api.symbiosis.finance/crosschain/v1/quote?...` | none | returned tx |
| `enso` | `GET https://api.enso.finance/api/v1/quote?...` | Bearer (secret) | returned tx |
| `velora` | `GET https://api.velora.xyz/.../prices?...` (price only) | none | `POST /transactions/{chainId}?ignoreGasEstimate=true` |
| `dodo` | `GET https://api.dodoex.io/route-service/v2/quote?...` | none | returned tx |
| `portals` | `GET https://api.portals.fi/v2/portal?...` | `x-api-key` (secret) | returned tx |
| `fly` | `GET https://api.fly.trade/quote?...` | `x-api-key` (secret) | returned tx |
| `okx` | `GET https://www.okx.com/api/v5/dex/aggregator/get-liquidity?...` then per-DEX `/quote` | HMAC + passphrase (secret), capped by `ctx.maxFanout ?? 25`, concurrency 5 | `/swap` (approve first via `/approve-transaction`) with `dexIds`, `slippagePercent`, `allowanceTarget` |
| `squid` | `GET https://v2.api.squidrouter.com/v2/route?...` | `x-integrator-id`; query assembled by provider (special case) | route transaction |

Normalization: every provider returns `ProviderQuote`
`{provider, outputAmount(wei), to, data, value, gasLimit?, approvalAddress?, meta}`.
`SwapEngine` enriches with `gasUsd`, `priceImpactPct`, `providerLabel`, `executable`
and sorts by bigint output desc.

## Bridge providers (legacy set)

| ID | Quote | Execute | Status |
|----|-------|---------|--------|
| `lifi-bridge` | `POST https://li.quest/v1/advanced/routes`; steps carry fee/gas/duration | step 0 `/v1/step/transaction` | `GET /v1/status?txHash&fromChain&toChain`; DONE/COMPLETED/PARTIAL = success |
| `rubic` | `POST https://api-v2.rubic.exchange/api/routes/quoteAll` (14 chains) | `POST /api/routes/swap` with route id, **human** amount, `fees.gasLimit` (avoid error 1003) | `GET /api/info/status?srcTxHash` |
| `rango` | `GET https://api.rango.exchange/routing/bests?...`; parse `expenseType`, `swapperId` | `POST /routing/confirm` → `POST /tx/create` | `GET /basic/status?txId&apiKey`; extract `rangoDestHash` from `bridgeData`/`explorerUrl`/steps |
| `bungee` | manual + auto routes deduped; fees from `gasFee.feeInUsd`, `routeFee.feeInUsd` | `POST /build-tx` | `socketscan.io/tx/<hash>` (no API status in legacy) |

`BridgeEngine` picks the highest-output fee-free route first, then highest output among
the rest. Status checkers return `null` on failure so a network hiccup never marks a
transfer FAILED (legacy false-failure guard).

## Price/market contract

See `prices/service.ts`: Binance `GET /api/v3/ticker/24hr?symbols=[..]` batched;
CoinGecko `GET /simple/price?...`; CMC `GET /v1/cryptocurrency/quotes/latest?symbol=`
with `X-CMC_PRO_API_KEY`; DexScreener `GET /latest/dex/tokens/{address}` (highest
liquidity pair wins).

## Exchange adapters

See `exchange/` — 16 adapters share `ExchangeAdapter`:
`{id,label,hosts,sign(request):Promise<SignedRequest>,markets(),ticker(),balances(),
placeOrder(),cancelOrder(),openOrders(),depositInfo(),withdraw()}`. Spot signing is
HMAC-SHA256 (Binance/Bybit/KuCoin/Gate/MEXC/BingX/BitMart/Phemex/LBank/DigiFinex/
Bitfinex), HMAC-SHA512 (Kraken), OKX HMAC+passphrase, Coinbase HMAC (CB-ACCESS-*),
HTX HmacSHA256 with sorted params. Keys come from Keystore storage only.
