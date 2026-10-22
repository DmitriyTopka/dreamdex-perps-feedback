# Market table "Open interest cap" is 1/4 of the on-chain cap on 16 markets and 1/2 on 4; XRP already trades above the documented cap
Severity: normal
Area: docs

## Steps to reproduce
1. Open https://app.testnet.dreamdex.io/docs/trading/perps-testnet, section "Markets", column "Open interest cap".
2. For every market from `client.listPerpMarkets()` call `client.getPerpRiskParams(poolAddress)` and read `maxOpenInterest` (raw base units, per the SDK type: "Market-wide open-interest cap, raw base units"). Divide by `10 ** baseDecimals`.
3. Compare with the docs column. Also read `openInterest` from the same market row.

Script used (read-only, `npx tsx cmp101.mts` in the probe folder):
```ts
const perps = await m.client.listPerpMarkets()
for (const p of perps) {
  const rp = await m.client.getPerpRiskParams(p.poolAddress)
  // human(rp.maxOpenInterest, p.baseDecimals) vs docs column
}
```

## Expected
The docs say: "These figures are read from the live markets and can be retuned at any time. The open interest cap is market-wide, across every account, and is held in the base asset." So the column should equal `maxOpenInterest` (or the page should say what else it shows).

## Actual
The column matches the chain on one market only. Hideki, 2026-10-22 ~15:10 UTC:

| on-chain maxOpenInterest / docs | markets |
|---|---|
| 4.0 | ZRO, LIT, VVV, 1000PEPE, PUMP, ZEC, WLD, NEAR, XLM, AVAX, LINK, SUI, ADA, BNB, DOGE, XRP (16) |
| 2.0 | HYPE, SOL, ETH, BTC (4) |
| 1.0 | TAO (1) |

Selected rows (docs value vs `getPerpRiskParams().maxOpenInterest`, human units):

| market | docs "Open interest cap" | chain maxOpenInterest | live openInterest (market row) |
|---|---|---|---|
| BTC | 246.81545 BTC | 493.6309 BTC | 318.48099 BTC |
| HYPE | 23,812.72 HYPE | 47,625.44 HYPE | 22,379.46 HYPE |
| XRP | 344,632 XRP | 1,378,528 XRP | 732,353.4 XRP |
| ZEC | 420 ZEC | 1,680 ZEC | 69.136 ZEC |
| TAO | 2,185.491 TAO | 2,185.491 TAO | 101.549 TAO |

Two consequences for a reader:
- XRP open interest (732,353.4, later 674,578.4 in a second read) is already about twice the documented cap of 344,632, so the documented number is clearly not the enforced limit.
- BTC open interest (318.48) is above the documented cap (246.82) too, and HYPE reads as 94% full by the docs (22,379 / 23,812) while it is 47% of the real cap. A trader or bot reading the table would expect OpenInterestCapExceeded where none will happen.

[inference, not verified] On most markets the docs figure equals 10 x `maxPositionSize` (ETH 399.5612 x 10 = 3,995.612, docs 3,995.6125; ZRO 25,059.9 x 10 = 250,599, docs 250,599.5), which suggests the column was derived from the per-account cap and the "a tenth" rule (see report 009) rather than read from `maxOpenInterest`. BTC (docs = maxOpenInterest / 2) and ZEC (docs = maxPositionSize) do not fit that pattern either.

Tick size and min size columns were checked the same way and match the chain on all 21 markets.

## Evidence
Raw output of `cmp101.mts` (excerpt):
```
ZRO  ... | maxOI 1002398 docs 250599.5 chain/docs 4.0000 | maxPos 25059.9 | liveOI 6463.6
ZEC  ... | maxOI 1680 docs 420 chain/docs 4.0000 | maxPos 420 | liveOI 69.136
TAO  ... | maxOI 2185.491 docs 2185.491 chain/docs 1.0000 | maxPos 218.549 | liveOI 101.549
XRP  ... | maxOI 1378528 docs 344632 chain/docs 4.0000 | maxPos 68926.4 | liveOI 732353.4
HYPE ... | maxOI 47625.44 docs 23812.72 chain/docs 2.0000 | maxPos 2381.27 | liveOI 22379.46
BTC  ... | maxOI 493.6309 docs 246.81545 chain/docs 2.0000 | maxPos 100 | liveOI 318.48099
```
Raw `getPerpRiskParams` for XRP pool: `{"initialMarginBps":"500","maintenanceMarginBps":"250","closeOutMarginBps":"125","maxOpenInterest":"1378528000000","maxPositionSize":"68926400000",...}` (XRP baseDecimals 6).
Raw for BTC: `"maxOpenInterest":"49363090000","maxPositionSize":"10000000000"` (baseDecimals 8).

## Environment
@somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network, indexer https://hideki-dev.smk.somnia.host/v1/graphql. Docs fetched 2026-10-22.
