# Perps market table: "Open interest cap" is 1/4 of the on-chain cap on 16 markets and 1/2 on 4; XRP shows 392% of the docs cap but is at 98% of the real one
Severity: normal

Area: docs

## Steps to reproduce
One command, read-only, no key ([`scripts/caps-009-011.ts`](../scripts/caps-009-011.ts)):

```bash
cd scripts && npm install && npx tsx caps-009-011.ts > out.json   # exit code 1 while the docs disagree with the chain
```

The script fetches the docs table as Markdown (`https://app.testnet.dreamdex.io/docs/trading/perps-testnet/README.md`), then for every market from `client.listPerpMarkets()` reads `client.getPerpRiskParams(pool).maxOpenInterest` and the market row's `openInterest` (live OI below), and divides both by `10 ** baseDecimals`.

## Expected
The page says, right under the table: "These figures are read from the live markets and can be retuned at any time. The open interest cap is market-wide, across every account, and is held in the base asset." So the "Open interest cap" column should equal `maxOpenInterest`.

## Actual
It matches on 1 market of 21. Fresh run on 2026-10-29 15:46 UTC, block 36,355,794 (first seen 2026-10-22, unchanged since):

| chain `maxOpenInterest` / docs | markets |
|---|---|
| 4x | XRP, NEAR, SUI, AVAX, BNB, DOGE, LINK, ADA, XLM, WLD, ZEC, LIT, ZRO, PUMP, VVV, 1000PEPE (16) |
| 2x | BTC, SOL, HYPE, ETH (4) |
| 1x | TAO (1) |

All 21 markets:

| market | docs "Open interest cap" | chain `maxOpenInterest` | chain / docs | live OI | live OI vs docs cap | live OI vs real cap |
|---|---|---|---|---|---|---|
| XRP-PERP | 344,632 | 1,378,528 | 4x | 1,350,390.4 | 391.8% | 98.0% |
| NEAR-PERP | 250,410 | 1,001,640 | 4x | 415,152.8 | 165.8% | 41.4% |
| SUI-PERP | 635,009 | 2,540,036 | 4x | 308,865 | 48.6% | 12.2% |
| AVAX-PERP | 66,672.2 | 266,688.8 | 4x | 25,762.5 | 38.6% | 9.7% |
| BNB-PERP | 693.975 | 2,775.9 | 4x | 266.339 | 38.4% | 9.6% |
| ZEC-PERP | 420 | 1,680 | 4x | 153.25 | 36.5% | 9.1% |
| DOGE-PERP | 5,613,590 | 22,454,360 | 4x | 1,995,680 | 35.6% | 8.9% |
| WLD-PERP | 1,264,000 | 5,056,000 | 4x | 259,437 | 20.5% | 5.1% |
| LINK-PERP | 42,643.6 | 170,574.4 | 4x | 6,366.2 | 14.9% | 3.7% |
| LIT-PERP | 138,896.6 | 555,586.4 | 4x | 19,879.3 | 14.3% | 3.6% |
| ADA-PERP | 2,254,678 | 9,018,712 | 4x | 305,324 | 13.5% | 3.4% |
| ZRO-PERP | 250,599.5 | 1,002,398 | 4x | 33,328.5 | 13.3% | 3.3% |
| XLM-PERP | 2,677,780 | 10,711,120 | 4x | 335,214 | 12.5% | 3.1% |
| PUMP-PERP | 87,993,700 | 351,974,800 | 4x | 9,967,600 | 11.3% | 2.8% |
| VVV-PERP | 21,786.14 | 87,144.56 | 4x | 1,772.81 | 8.1% | 2.0% |
| 1000PEPE-PERP | 130,285,600 | 521,142,400 | 4x | 10,070,400 | 7.7% | 1.9% |
| BTC-PERP | 246.81545 | 493.6309 | 2x | 346.86758 | 140.5% | 70.3% |
| SOL-PERP | 47,654.44 | 95,308.88 | 2x | 38,698.75 | 81.2% | 40.6% |
| HYPE-PERP | 23,812.72 | 47,625.44 | 2x | 15,490.97 | 65.1% | 32.5% |
| ETH-PERP | 3,995.6125 | 7,991.225 | 2x | 1,134.2145 | 28.4% | 14.2% |
| TAO-PERP | 2,185.491 | 2,185.491 | 1x | 273.278 | 12.5% | 12.5% |

What this does to someone reading the table:
- **XRP is 98.0% full** against the real cap while the docs make it look like nearly 4x its cap, a cap that does not exist. A bot that reads the table has no way to see that the next large XRP order may revert on the real cap.
- **BTC (140.5%) and NEAR (165.8%) already trade above the documented cap**, so the column is visibly not the enforced limit.
- On 17 of the other 18 markets the docs overstate how full the market is by 2x or 4x; only TAO matches (HYPE looks 65% full, it is 33%).

**It's not an old snapshot.** The other columns of the same table are right: price tick, min size, initial margin and max leverage match the chain on 21/21 markets (`controls` in the script output). Only the open interest cap column is off, and it was off by the same factors on 2026-10-22 and on 2026-10-29.

**My guess where the number comes from** (from the data only, not confirmed): on 10 markets (ZRO, LIT, VVV, 1000PEPE, PUMP, TAO, WLD, HYPE, SOL, ETH) the docs figure is exactly 10 x `maxPositionSize`, the per-account cap. That matches the page's own rule that an account is capped at "a tenth" of OI (report 009), applied backwards. On 9 more it is about 5 x `maxPositionSize`; ZEC and BTC fit neither.

## Suggested fix
- Generate the column from `getPerpRiskParams(pool).maxOpenInterest` (or `PerpPool.getRiskParams()`), the value the pool enforces, in the same build step that already gets tick and min size right.
- If the docs mean to show something else (a soft or per-account figure), rename the column and say so; today it is labelled and described as the market-wide cap.
- The "a tenth of it on most markets" sentence under the same table is wrong too, that is report 009 (per-account cap, separate fix).

## Evidence
- Full script output with block, time and every raw value: [`evidence/2910/caps-009-011.json`](../evidence/2910/caps-009-011.json).
- Raw `getPerpRiskParams` for XRP (baseDecimals 6): `maxOpenInterest 1378528000000`, `maxPositionSize 68926400000`; for BTC (baseDecimals 8): `maxOpenInterest 49363090000`, `maxPositionSize 10000000000`.
- First run 2026-10-22 ~15:10 UTC gave the same ratios on all 21 markets.

## Environment
@somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network, indexer https://hideki-dev.smk.somnia.host/v1/graphql, Node 24. Docs fetched 2026-10-29.
