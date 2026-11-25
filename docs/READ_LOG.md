# Read Log

Legacy file: `legacy/app/src/main/assets/index.html` — **98,580 lines / 5,107,646 bytes**
(verified with `wc -l` and `wc -c`). Read sequentially in windows of ≤1,500 lines, top to
bottom, with no gaps. The eight audit reports under `docs/index/chunks/` summarise contiguous
12,300-line ranges; the table below is the reading-window ledger. "Report" is the audit
report that covers the window start (reports are 12,300 lines wide and may overlap the next
window boundary).

| Lines | Count | Report |
|-------|-------|--------|
| 1–1,500 | 1500 | 01 |
| 1,501–3,000 | 1500 | 01 |
| 3,001–4,500 | 1500 | 01 |
| 4,501–6,000 | 1500 | 01 |
| 6,001–7,500 | 1500 | 01 |
| 7,501–9,000 | 1500 | 01 |
| 9,001–10,500 | 1500 | 01 |
| 10,501–12,000 | 1500 | 01 |
| 12,001–13,500 | 1500 | 01 |
| 13,501–15,000 | 1500 | 02 |
| 15,001–16,500 | 1500 | 02 |
| 16,501–18,000 | 1500 | 02 |
| 18,001–19,500 | 1500 | 02 |
| 19,501–21,000 | 1500 | 02 |
| 21,001–22,500 | 1500 | 02 |
| 22,501–24,000 | 1500 | 02 |
| 24,001–25,500 | 1500 | 02 |
| 25,501–27,000 | 1500 | 03 |
| 27,001–28,500 | 1500 | 03 |
| 28,501–30,000 | 1500 | 03 |
| 30,001–31,500 | 1500 | 03 |
| 31,501–33,000 | 1500 | 03 |
| 33,001–34,500 | 1500 | 03 |
| 34,501–36,000 | 1500 | 03 |
| 36,001–37,500 | 1500 | 03 |
| 37,501–39,000 | 1500 | 04 |
| 39,001–40,500 | 1500 | 04 |
| 40,501–42,000 | 1500 | 04 |
| 42,001–43,500 | 1500 | 04 |
| 43,501–45,000 | 1500 | 04 |
| 45,001–46,500 | 1500 | 04 |
| 46,501–48,000 | 1500 | 04 |
| 48,001–49,500 | 1500 | 04 |
| 49,501–51,000 | 1500 | 05 |
| 51,001–52,500 | 1500 | 05 |
| 52,501–54,000 | 1500 | 05 |
| 54,001–55,500 | 1500 | 05 |
| 55,501–57,000 | 1500 | 05 |
| 57,001–58,500 | 1500 | 05 |
| 58,501–60,000 | 1500 | 05 |
| 60,001–61,500 | 1500 | 05 |
| 61,501–63,000 | 1500 | 06 |
| 63,001–64,500 | 1500 | 06 |
| 64,501–66,000 | 1500 | 06 |
| 66,001–67,500 | 1500 | 06 |
| 67,501–69,000 | 1500 | 06 |
| 69,001–70,500 | 1500 | 06 |
| 70,501–72,000 | 1500 | 06 |
| 72,001–73,500 | 1500 | 06 |
| 73,501–75,000 | 1500 | 06 |
| 75,001–76,500 | 1500 | 07 |
| 76,501–78,000 | 1500 | 07 |
| 78,001–79,500 | 1500 | 07 |
| 79,501–81,000 | 1500 | 07 |
| 81,001–82,500 | 1500 | 07 |
| 82,501–84,000 | 1500 | 07 |
| 84,001–85,500 | 1500 | 07 |
| 85,501–87,000 | 1500 | 07 |
| 87,001–88,500 | 1500 | 08 |
| 88,501–90,000 | 1500 | 08 |
| 90,001–91,500 | 1500 | 08 |
| 91,501–93,000 | 1500 | 08 |
| 93,001–94,500 | 1500 | 08 |
| 94,501–96,000 | 1500 | 08 |
| 96,001–97,500 | 1500 | 08 |
| 97,501–98,580 | 1080 | 08 |

Coverage: **98,580 / 98,580 lines (100%)**, 66 windows, no gaps, no skipped ranges.
Machine-extracted cross-checks: `docs/index/dom-ids.json` (all IDs), `functions.json`
(global functions), `globals.json`, `hosts.json`, `storage-keys.json`, `network-endpoints.json`,
`css-vars.json`, `sections.json`, `native-calls.json`.

## Audit report summaries

| Report | Range | Headline content |
|--------|-------|------------------|
| 01 | 1–12,300 | Bootstrap/native bridge, lock overlay, home/swap/bridge markup, success overlays, BSO status overlay |
| 02 | 12,301–24,600 | Profile, Transfer Hub shell, send modal, token manager, price engine, gas engine, wallet crypto |
| 03 | 24,601–36,900 | Wallet groups, RPC manager, history, token rendering, charts, browser chrome |
| 04 | 36,901–49,200 | Send flow, bridge engine, swap engine, token import, settings, migration helpers |
| 05 | 49,201–61,500 | Bridge history/tombstone, bridge execution, Balance Check, Phrase→Key, withdraw |
| 06 | 61,501–73,800 | Transfer Hub tools, approvals, NFT transfer, automation config, Nansen/Jumper |
| 07 | 73,801–86,100 | Exchange UI, order book, futures, exchange adapters (16 CEX), deposit/withdraw |
| 08 | 86,101–98,580 | Exchange adapters tail, dApp browser/Web3 provider, EIP-7702/paymaster, boot sequence |

Details and line citations live in the individual reports; the six top-level docs
(`FEATURE_INVENTORY`, `UI_SCREEN_MAP`, `STORAGE_SCHEMA`, `NETWORK_ENDPOINTS`,
`JS_BRIDGE_API`, `PROVIDER_API`) consolidate them.
