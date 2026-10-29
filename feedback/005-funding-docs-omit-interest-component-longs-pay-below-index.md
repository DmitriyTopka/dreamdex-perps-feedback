# Funding docs say shorts pay when the perp is below the index; in 3,405 of 3,662 recent settlements with mark below index, longs paid
Severity: major
Area: docs

## Steps to reproduce
One command, read-only, no key ([`scripts/funding-005.ts`](../scripts/funding-005.ts)):

```bash
cd scripts && npm install && npx tsx funding-005.ts > out.json
```

It reads, for each of the 21 pools, `client.getPerpState(pool)` (`fundingRate`, `emaPremium`) and the last 200 settled intervals from `client.listFundingRateHistory(pool)` (`markPrice`, `indexPrice`, `fundingRate`, `txHash`).

## Expected
The Funding page (`/docs/trading/perps-testnet/funding`) says:

- "**Perp above the index** (positive funding): longs pay shorts."
- "**Perp below the index** (negative funding): shorts pay longs."

and gives no other term. So with the perp below the index, funding should be negative and shorts should pay.

## Actual
The pools charge `premium + clamp(0.01% - premium, -0.05%, +0.05%)` per 8-hour window, the formula Hyperliquid documents. The 0.01% interest term keeps funding at +0.01% whenever the premium sits between -0.04% and +0.06%, so **longs pay while the perp is below the index**. The page mentions neither the interest term nor the clamp.

**History, 2026-10-21 to 2026-10-29, 4,200 settlements (200 per pool):**
- mark below index in **3,662**;
- longs still paid (`fundingRate > 0`) in **3,405** of those (93%);
- **3,313** settlements charged exactly +0.0100%, the interest floor.

Example settlement, LINK-PERP, 2026-10-29 15:14:42 UTC, block 36,336,754, tx `0xf301aef081f613ce12215ea2305d547763aa97f38ad0ee4f5c05edd3f430d2d1`: mark 11.89686 below index 11.90465, funding **+0.0100%**, longs pay. Same on BTC-PERP at 15:11:44 UTC (tx `0x61f22648df59e6f29538397abbaf189e11d4d9bcd41e18ada49d2328d9607f9e`): mark 81,285.0 below index 81,313.9, funding +0.0901%.

**Live, 2026-10-29 15:49 UTC, block 36,357,557.** The formula reproduces `fundingRate` exactly on 21/21 pools. On 10 of them the premium is zero or negative and longs pay anyway:

| market | live premium | live funding rate | payer (pool) | payer (docs rule) | last 200 settlements: mark < index | of those, longs paid |
|---|---|---|---|---|---|---|
| HYPE-PERP | -0.3113% | -0.2613% | shorts | shorts | 199 | 154 |
| LIT-PERP | -0.0133% | +0.0100% | longs | shorts | 200 | 133 |
| DOGE-PERP | -0.0080% | +0.0100% | longs | shorts | 200 | 194 |
| ZEC-PERP | -0.0007% | +0.0100% | longs | shorts | 90 | 89 |
| WLD-PERP | -0.0006% | +0.0100% | longs | shorts | 200 | 187 |
| ADA-PERP | -0.0003% | +0.0100% | longs | shorts | 200 | 200 |
| PUMP-PERP | -0.0002% | +0.0100% | longs | shorts | 189 | 189 |
| LINK-PERP | -0.0002% | +0.0100% | longs | shorts | 200 | 200 |
| SUI-PERP | -0.0001% | +0.0100% | longs | shorts | 200 | 200 |
| TAO-PERP | -0.0000% | +0.0100% | longs | shorts | 168 | 168 |
| XLM-PERP | -0.0000% | +0.0100% | longs | shorts | 199 | 199 |
| 1000PEPE-PERP | +0.0001% | +0.0100% | longs | longs | 185 | 185 |
| VVV-PERP | +0.0002% | +0.0100% | longs | longs | 119 | 119 |
| ZRO-PERP | +0.0003% | +0.0100% | longs | longs | 24 | 24 |
| AVAX-PERP | +0.0040% | +0.0100% | longs | longs | 200 | 194 |
| ETH-PERP | +0.0059% | +0.0100% | longs | longs | 199 | 187 |
| BNB-PERP | +0.0161% | +0.0100% | longs | longs | 92 | 92 |
| NEAR-PERP | +0.0237% | +0.0100% | longs | longs | 200 | 186 |
| XRP-PERP | +0.0618% | +0.0118% | longs | longs | 199 | 126 |
| BTC-PERP | +0.1401% | +0.0901% | longs | longs | 200 | 200 |
| SOL-PERP | +0.1605% | +0.1105% | longs | longs | 199 | 179 |

The premium is measured on the order book (`timeWeightedPremium` in the SDK: "the time-weighted average of the order-book premium"), not on the mark price a trader sees in the header. That gap is report 006. So a trader reading "perp below the index" off the mark can be wrong twice: the book can sit above the index, and even below it the interest term still makes longs pay.

**What it costs.** A long opened because "the perp is below the index, so shorts pay me" pays 0.01% per 8 hours instead: 0.03% a day, about 11% a year on notional, about 18% of margin per month at 20x. The page's own example (0.08%) cannot show this, because it never reaches the floor. Hyperliquid's funding page states the same fixed interest rate and calls it "11.6% APR paid to short".

## Suggested fix
Replace the "Who pays whom" list with:

> Funding = premium + clamp(0.01% − premium, −0.05%, +0.05%), per 8-hour window. The premium is the time-weighted gap between the order book and the index. The 0.01% interest term means longs pay +0.01% per 8 h whenever the premium is between −0.04% and +0.06%, so longs can pay while the perp trades below the index. Shorts are paid only when the premium is below −0.05%.

and add a worked example at the floor (1 BTC at 100,000 USDso pays 100,000 × 0.0001 / 8 = 1.25 USDso per hour).

## Evidence
- Script output with block, time, all 21 live rows and the per-pool history counts and example tx: [`evidence/2910/funding-005.json`](../evidence/2910/funding-005.json).
- First reported 2026-10-22 with the same formula on 21/21 pools; nothing changed in a week.

## Environment
@somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), indexer https://hideki-dev.smk.somnia.host/v1/graphql. Docs fetched 2026-10-29.
