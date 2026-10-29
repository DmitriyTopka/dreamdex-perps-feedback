# Docs say the per-account position cap is "a tenth" of the open interest cap on most markets; it is a tenth on 1 of 21
Severity: normal

Area: docs

## Steps to reproduce
One command, read-only, no key ([`scripts/caps-009-011.ts`](../scripts/caps-009-011.ts), shared with report 011):

```bash
cd scripts && npm install && npx tsx caps-009-011.ts > out.json
```

For every market it reads `client.getPerpRiskParams(pool)` (`maxPositionSize`, `maxOpenInterest`) and prints `positionCapOverChainOI`.

## Expected
Two pages state the rule:
- Trading docs, under the market table: "A single account is capped at a tenth of it on most markets."
- Perps on Testnet for Developers, Common pitfalls: "Each account has a position cap per market, a tenth of the market's open interest cap on most markets. An order that would take the account past it reverts with `MaxPositionSizeExceeded()` (0x714b36d6); `getMaxPerpOrderSize` reports the cap as `maxPositionSize`."

So `maxPositionSize / maxOpenInterest` should be about 0.1 on most markets.

## Actual
It is 0.1 on TAO only. Fresh run 2026-10-29 15:46 UTC, block 36,355,794 (same result as 2026-10-22):

| `maxPositionSize` / `maxOpenInterest` | markets | how far off "a tenth" is |
|---|---|---|
| 0.025 (1/40) | ZRO, LIT, VVV, 1000PEPE, PUMP, WLD (6) | 4x |
| 0.05 (1/20) | XRP, NEAR, SUI, AVAX, BNB, DOGE, LINK, ADA, XLM, HYPE, SOL, ETH (12) | 2x |
| 0.1 (1/10) | TAO (1) | holds |
| 0.2026 | BTC | understates, cap is 2x higher |
| 0.25 | ZEC | understates, cap is 2.5x higher |

All 21 markets:

| market | `maxPositionSize` | chain `maxOpenInterest` | cap / OI | docs rule "a tenth" |
|---|---|---|---|---|
| ZRO-PERP | 25,059.9 | 1,002,398 | 0.025 | no |
| LIT-PERP | 13,889.6 | 555,586.4 | 0.025 | no |
| VVV-PERP | 2,178.61 | 87,144.56 | 0.025 | no |
| 1000PEPE-PERP | 13,028,500 | 521,142,400 | 0.025 | no |
| PUMP-PERP | 8,799,300 | 351,974,800 | 0.025 | no |
| WLD-PERP | 126,400 | 5,056,000 | 0.025 | no |
| NEAR-PERP | 50,000 | 1,001,640 | 0.0499 | no |
| XLM-PERP | 535,556 | 10,711,120 | 0.05 | no |
| AVAX-PERP | 13,334.4 | 266,688.8 | 0.05 | no |
| LINK-PERP | 8,528.6 | 170,574.4 | 0.05 | no |
| SUI-PERP | 127,000 | 2,540,036 | 0.05 | no |
| ADA-PERP | 450,934 | 9,018,712 | 0.05 | no |
| DOGE-PERP | 1,122,700 | 22,454,360 | 0.05 | no |
| XRP-PERP | 68,926.4 | 1,378,528 | 0.05 | no |
| HYPE-PERP | 2,381.27 | 47,625.44 | 0.05 | no |
| SOL-PERP | 4,765.44 | 95,308.88 | 0.05 | no |
| ETH-PERP | 399.5612 | 7,991.225 | 0.05 | no |
| BNB-PERP | 140 | 2,775.9 | 0.0504 | no |
| TAO-PERP | 218.549 | 2,185.491 | 0.1 | holds |
| BTC-PERP | 100 | 493.6309 | 0.2026 | no |
| ZEC-PERP | 420 | 1,680 | 0.25 | no |

A builder who sizes orders from "a tenth of OI" overshoots the real cap 2x on 12 markets and 4x on the 6 at 1/40, and gets `MaxPositionSizeExceeded()` (0x714b36d6) instead of a fill. On BTC and ZEC the same rule makes a bot cap itself well below what the pool allows.

The rule also cannot be checked against the docs' own table, because the table's "Open interest cap" column is itself 2x or 4x below the chain on 20 of 21 markets (report 011). Against that docs column the ratio is 0.1 on 10 markets and 0.2 on 9. That may be where "a tenth" came from (my guess, not confirmed).

**If you see other ratios elsewhere** (for example ZEC 1.0, BTC 0.405 in reports from 19-20 Oct): those divide by the docs column or by older on-chain values. The on-chain ratios above were the same on 2026-10-22 and on 2026-10-29.

How this differs from report 011: this one is the per-account cap sentence, 011 is the market-wide "Open interest cap" column. Same script, different numbers, different fix.

## Suggested fix
Replace both sentences with the number that is enforced:

> Each account has a position cap per market. Read it with `getMaxPerpOrderSize(...)` (`maxPositionSize`) or `getPerpRiskParams(pool).maxPositionSize`; it is currently 1/20 of the open interest cap on most markets, 1/40 on ZRO, LIT, VVV, 1000PEPE, PUMP and WLD, and set per market for BTC, TAO and ZEC.

Or add a "Position cap" column to the market table, generated from `maxPositionSize` like the other columns.

## Evidence
- Script output with block, time and every raw value: [`evidence/2910/caps-009-011.json`](../evidence/2910/caps-009-011.json) (`positionCapOverChainOI`, `positionCapOverDocsOI`).
- Example raw values: ETH `maxPositionSize` 399.5612 vs `maxOpenInterest` 7,991.225 (0.05); ZRO 25,059.9 vs 1,002,398 (0.025); BTC 100 vs 493.6309 (0.2026).
- `getMaxPerpOrderSize(...).maxPositionSize` returns the same per-account cap as `getPerpRiskParams` (checked on all 21 markets on 2026-10-22).

## Environment
@somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), Node 24. Docs fetched 2026-10-29.
