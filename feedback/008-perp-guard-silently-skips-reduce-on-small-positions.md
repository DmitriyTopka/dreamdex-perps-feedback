# perp-guard's reduce stage never runs on positions under about 4 x minQuantity (29 to 87 USDso at current prices), and nothing takes its place
Severity: normal

Area: bot kit

## Steps to reproduce
1. dreamdex-bot-kit at commit 2579866, `strategies/perp-guard/src/index.ts` with its defaults: `PERP_GUARD_REDUCE_BELOW=1.5`, `PERP_GUARD_REDUCE_PCT=25`, `PERP_GUARD_FLATTEN_BELOW=1.15` (lines 51-53).
2. Hold a position no bigger than about 4 x the market's `minQuantity`, for example 0.00051 BTC (about 40 USDso) or 0.0159 ETH (about 36 USDso).
3. Let the account's health fall between 1.15x and 1.5x of maintenance.

To see the sizes without holding a position, our read-only script runs the kit's own sizing code against the live market rows ([`scripts/guard-008.ts`](../scripts/guard-008.ts)):

```bash
cd scripts && npm install && npx tsx guard-008.ts > out.json
```

## Expected
Between the two thresholds the guard reduces. That is the point of having two: the README says it "closes part of a position before the liquidation waterfall reaches it". If 25% is smaller than the market allows, I expect it to close the smallest slice it can (one `minQuantity`), or the whole position, rather than nothing.

## Actual
`index.ts:157-159` calls `closePosition(ctx, market, me, { fraction: REDUCE_PCT / 100, label: "guard reduce" })` and drops the result. In `packages/perp-core/src/orders.ts:260-273`, `closePosition` sizes the slice as `alignQuantity((whole * 250n) / 1000n)`. `alignQuantity` (`markets.ts:157-162`) returns 0 for anything under `minQuantity`, so `closePosition` logs `close skipped: 25% of ... is below the market minimum of .... Close the whole position, or raise the fraction.` and returns `{ sent: false }`. Thirty seconds later the guard polls again and gets the same answer.

So on these positions the reduce stage does nothing at all. The first and only thing the guard ever does is flatten everything at 1.15x, which is closer to the liquidation line and has to cross more of the book in one go. A trader who set a two-stage guard on a small account gets a one-stage one, and the log asks them to change a setting while they are not watching.

The kit's README for perp-guard mentions this case ("the guard says so rather than looping silently"). Saying so is better than nothing, but it still leaves the reduce stage dead for exactly the accounts that need the cushion most, and the advice in the log line needs a person at the keyboard.

Largest position the default 25% reduce can never touch, per market, from the script at 2026-10-30 06:48:51 UTC (block 36,897,073), with the live mark:

| market | minQuantity | largest unreducible position | ~USDso |
|---|---|---|---|
| PUMP | 1800 | 7100 | 29.04 |
| LIT | 2.8 | 11.1 | 32.73 |
| ZRO | 5.1 | 20.3 | 34.01 |
| XRP | 6.9 | 27.5 | 34.67 |
| ADA | 46 | 183 | 35.43 |
| ETH | 0.004 | 0.0159 | 35.63 |
| DOGE | 120 | 470 | 35.75 |
| XLM | 54 | 215 | 35.79 |
| SOL | 0.1 | 0.39 | 38.12 |
| LINK | 0.9 | 3.5 | 38.71 |
| BNB | 0.014 | 0.055 | 39.23 |
| BTC | 0.00013 | 0.00051 | 39.93 |
| VVV | 0.44 | 1.75 | 40.56 |
| WLD | 26 | 103 | 40.70 |
| TAO | 0.044 | 0.175 | 41.46 |
| HYPE | 0.12 | 0.47 | 43.73 |
| ZEC | 0.009 | 0.035 | 44.33 |
| SUI | 13 | 51 | 45.46 |
| AVAX | 1.4 | 5.5 | 47.18 |
| 1000PEPE | 2700 | 10700 | 53.13 |
| NEAR | 5.1 | 20.3 | 86.89 |

On every market the line falls just under 4 x `minQuantity` (3.89x to 3.98x). In USDso it runs from 29 to 87. That is the size the kit's other strategies open: perp-maker quotes 25 USDso per side, perp-starter and perp-funding open 50. Anything up to 29 USDso has no working reduce stage on any market, and a 50 USDso position has none on 1000PEPE and NEAR.

The positions in the table match what I measured on 2026-10-22 (same lot and minimum on all six markets I listed then). The USDso column moved with the prices.

## Suggested fix
Let the reduce close at least one `minQuantity`, and the whole position when what would remain is under the minimum. In `closePosition`:

```ts
let wanted = fraction === 1 ? whole : alignQuantity((whole * BigInt(Math.round(fraction * 1000))) / 1000n, market.info);
if (wanted <= 0n && opts.atLeastMinimum) {
  const min = BigInt(market.info.minQuantity);
  wanted = whole - min >= min ? min : whole;
}
```

and call it from the guard with `{ fraction: REDUCE_PCT / 100, atLeastMinimum: true, label: "guard reduce" }`. If the kit prefers to keep the skip, the guard should at least read `{ sent: false }` and treat it as "not reduced", for example by escalating to the flatten after N skipped cycles, and the README should say the reduce stage is off for positions under 4 x `minQuantity`.

## Evidence
- [`evidence/3010/guard-008.json`](../evidence/3010/guard-008.json): lot, minimum, mark and the largest unreducible position for all 21 markets, plus a check row showing the 25% slice is 0 at that size and exactly `minQuantity` one lot above it.
- The script copies `alignQuantity` from `markets.ts:157-162` and the slice line from `orders.ts:261` unchanged and searches the lot grid for the first size whose slice is sendable.
- Re-run: `cd scripts && npx tsx guard-008.ts > ../evidence/3010/guard-008.json`.

## Environment
dreamdex-bot-kit 2579866, @somnia-chain/markets-sdk 0.32.1, Node 24.14.1, Hideki testnet (chain 50383). Read-only, no wallet.
