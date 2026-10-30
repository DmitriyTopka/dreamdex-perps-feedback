# perp-guard silently does nothing between its two thresholds when 25% of the position is below minQuantity
Severity: normal

Area: SDK

## Steps to reproduce
1. dreamdex-bot-kit 2579866, `strategies/perp-guard/src/index.ts` with defaults: `PERP_GUARD_REDUCE_BELOW=1.5`, `PERP_GUARD_REDUCE_PCT=25`, `PERP_GUARD_FLATTEN_BELOW=1.15`.
2. Hold a position of up to about 4 x minQuantity on any market, for example 0.00051 BTC (~41.6 USDso) or 0.0159 ETH (~38 USDso).
3. Let the account's health fall to between 1.15x and 1.5x of maintenance.

## Expected
The guard reduces risk at the reduce threshold. If a 25% slice is smaller than the market allows, it should close a bigger slice (one `minQuantity`, or the whole position), or at least treat the skip as "not reduced" and escalate.

## Actual
`index.ts` line 159 calls `closePosition(ctx, market, me, { fraction: 0.25 })`. In `packages/perp-core/src/orders.ts` lines 261-273 the slice is `alignQuantity(whole * 250 / 1000)`, which returns 0 below `minQuantity`, so `closePosition` logs "close skipped ... Close the whole position, or raise the fraction" and returns `{ sent: false }`. The guard ignores the result and polls again 30 s later with the same outcome. Nothing is done until health drops under 1.15x, i.e. the reduce stage never runs for these positions.

Largest position the 25% reduce can never touch, computed with the kit's own rounding against the live market rows (Hideki, 2026-10-22):

| market | minQuantity | max unreducible position | ~USDso |
|---|---|---|---|
| BTC | 0.00013 | 0.00051 | 41.59 |
| ETH | 0.004 | 0.0159 | 38.19 |
| SOL | 0.1 | 0.39 | 40.62 |
| NEAR | 5.1 | 20.3 | 100.31 |
| WLD | 26 | 103 | 55.35 |
| PUMP | 1800 | 7100 | 33.73 |

All 21 markets fall between 33.73 and 100.31 USDso. That's the size small accounts and first-time Arena traders open, and people copy the kit's strategies as they are.

## Evidence
Source lines above; the table comes from looping `q` from `minQuantity` in `lotSize` steps and applying `alignQuantity((q * 250n) / 1000n)` exactly as `closePosition` does, with `listPerpMarkets()` for lot, min and mark.

## Environment
dreamdex-bot-kit 2579866, @somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383).
