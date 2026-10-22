# perp-starter sets take-profit and stop-loss from the mark after the fill, not from the entry price
Severity: normal
Area: SDK

## Steps to reproduce
1. dreamdex-bot-kit at commit 2579866, `strategies/perp-starter/src/index.ts`.
2. Run perp-starter long with the defaults (`PERP_TAKE_PROFIT_PCT=2`, `PERP_STOP_LOSS_PCT=1`) on BTC-PERP, or read lines 170-177:

```ts
const mark = (await liveMark(ctx.exchange, market)) ?? markOf(market.info);
const up = BigInt(Math.round(mark * (1 + TAKE_PROFIT_PCT / 100) * 1e18));
const down = BigInt(Math.round(mark * (1 - STOP_LOSS_PCT / 100) * 1e18));
```

3. Compare the levels with the position's `avgEntryPrice`.

## Expected
"Stop-loss 1%" and "take-profit 2%" are measured from what the trader paid, the position's average entry price, as on most perp venues and bots. The entry is already available from `getPerpPosition` / `fetchPositions`.

## Actual
The levels are measured from the mark read after the open. The open is an IOC that crosses the book with 20 bps of slippage, so on a long the fill sits above the mark, and the mark on Hideki also sits under the oracle (see report 006). Both push the stop further away and the target closer.

Real numbers from a 0.00013 BTC long on Hideki:
- fill (avgEntryPrice) 81,835.9, tx 0x8980ab89c2710f5e77eba65ebf79ed05226bffebf0bf16fc7d311481ededa30b
- on-chain mark right after: 81,615.8 (the app showed the same mark and -5.4% ROI)
- with the defaults the bot would arm stop-loss 80,799.6 = **-1.27%** from entry instead of -1%, and take-profit 83,248.1 = **+1.73%** instead of +2%

At the default 2x that is a 2.54% margin loss on a "1%" stop; at 20x it is 25% of margin instead of 20%.

The same lines also run on the "already long, managing it instead of opening another" path (lines 121-124), where the mark can be anywhere relative to the original entry, so the bracket is placed around today's price rather than the trader's position.

Suggested fix: read `avgEntryPrice` from the position after the fill (or from the existing position) and derive both levels from it, falling back to the mark only when no position is found.

## Evidence
Source lines above, the fill tx, and the mark read with `getPerpState` right after the fill. Calculation: 81,615.8 x 0.99 = 80,799.6; 80,799.6 / 81,835.9 - 1 = -1.27%; 81,615.8 x 1.02 = 83,248.1; 83,248.1 / 81,835.9 - 1 = +1.73%.

## Environment
dreamdex-bot-kit 2579866, @somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21 via trading key 0x13f05c8e15cC0d7d3abff02C144fb74778018a55.
