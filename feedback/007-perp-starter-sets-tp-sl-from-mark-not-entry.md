# perp-starter swaps take-profit and stop-loss on a short, and measures both from the mark instead of the entry
Severity: major

Area: bot kit

## Steps to reproduce
No key, nothing is sent. From the bot kit at commit 2579866:

```bash
PRIVATE_KEY= OWNER_ADDRESS= DRY_RUN=true PERP_SIDE=short npx tsx strategies/perp-starter/src/index.ts
```

Compare the two numbers in the last line with the banner on the first line. For the entry-price part, our read-only script runs the kit's level code on every market against the live book ([`scripts/starter-007.ts`](../scripts/starter-007.ts)):

```bash
cd scripts && npm install && npx tsx starter-007.ts > out.json
```

## Expected
`PERP_TAKE_PROFIT_PCT=2` and `PERP_STOP_LOSS_PCT=1` (the defaults, `strategies/perp-starter/src/index.ts:60-61`) mean the same thing on both sides: take profit 2% in my favour, stop out 1% against me. The banner says so: `take-profit 2% stop-loss 1%`. And the percentages are measured from what I paid, the position's entry price, which the kit already has as `entryPrice` on the position `positionIn()` returns.

## Actual
`strategies/perp-starter/src/index.ts:173-177`:

```ts
const mark = (await liveMark(ctx.exchange, market)) ?? markOf(market.info);
const up = BigInt(Math.round(mark * (1 + TAKE_PROFIT_PCT / 100) * 1e18));
const down = BigInt(Math.round(mark * (1 - STOP_LOSS_PCT / 100) * 1e18));
const takeProfit = SIDE === "long" ? up : down;
const stopLoss = SIDE === "long" ? down : up;
```

`up` is built from the take-profit percentage and `down` from the stop-loss one. On a short the code then uses `down` as the take-profit and `up` as the stop-loss, so the short gets a 1% target and a 2% stop. The kit's own dry run on 2026-10-30 06:47 UTC shows it ([`evidence/3010/starter-007-dryrun.txt`](../evidence/3010/starter-007-dryrun.txt)):

```
perp-starter on BTC-PERP (BTC/USDso:USDso) | short 50 USDso at 2x | take-profit 2% stop-loss 1% | dry-run true
[dry-run] would arm a short bracket on BTC-PERP: take-profit 77500.30, stop-loss 79848.80, whole position, 0.30 SOMI locked
```

Both levels come from a mark of 78,283.1: 77,500.3 is 1% under it and 79,848.8 is 2% over it. So every default short risks twice what it aims to make. On the default 50 USDso that is about 1.00 USDso lost at the stop and 0.50 USDso won at the target, the reverse of what the trader set. The long side is the right way round.

The second problem is the reference price. The open is an IOC that takes the ask (up to 20 bps past it, `packages/perp-core/src/orders.ts:154`), and the bracket is then priced off the mark. On a long the ask sits above the mark, so the stop ends up further than 1% from the entry and the target closer than 2%.

Our fill from 2026-10-22, read back on 2026-10-30: 0.00013 BTC long at **81,835.9**, tx `0x8980ab89c2710f5e77eba65ebf79ed05226bffebf0bf16fc7d311481ededa30b`, block 30,210,002 (12:43:30 UTC). The pool's mark read at that block was 81,647.8 and stayed between 81,620.5 and 81,647.8 for the next 20 s, which is when perp-starter reads it. With the defaults that puts the stop **1.23% to 1.26%** under the entry and the target **1.73% to 1.77%** over it. At the default 2x a "1%" stop costs about 2.5% of margin; at 20x it is about 25% instead of 20%.

It is not only that fill. On 2026-10-30 at 06:47 UTC the script priced a default 50 USDso open on the live book of every market. On the 19 markets whose book sits within 1% of the mark, the long's stop lands 1.09% to 1.47% from the entry (BTC 1.09%) and the target 1.52% to 1.91%. LINK and BNB had their books 10% and 4.5% above the mark at that moment (06:47 UTC; thin books move, and BNB's was back near the index by 07:07), and there a default long's "take-profit" sits 2.4% (BNB) and 7.4% (LINK) under its own entry.

Both problems also hit the "already long, managing it instead of opening another" path (lines 121-124). There the bracket is placed around the current mark, wherever that is relative to the original entry. And the code uses `SIDE` from the env, not `existing.side`, so an existing short run with the default `PERP_SIDE=long` gets a long bracket. I found that one by reading the code and have not run it.

## Suggested fix
Price both levels from the position itself, after the open or from the existing position, and pick the direction per side:

```ts
const position = me ? await positionIn(ctx.exchange, market) : undefined;
const side: Side = position?.side ?? SIDE;
const ref = position?.entryPrice ?? (await liveMark(ctx.exchange, market)) ?? markOf(market.info);
const sign = side === "long" ? 1 : -1;
const takeProfit = BigInt(Math.round(ref * (1 + (sign * TAKE_PROFIT_PCT) / 100) * 1e18));
const stopLoss = BigInt(Math.round(ref * (1 - (sign * STOP_LOSS_PCT) / 100) * 1e18));
```

and pass `side` (not `SIDE`) to `armBracket` and to the watched-exit checks on lines 224-225. The mark stays as the fallback for a dry run with no position.

## Evidence
- [`evidence/3010/starter-007-dryrun.txt`](../evidence/3010/starter-007-dryrun.txt): the kit's own dry run, long and short, no key.
- [`evidence/3010/starter-007.json`](../evidence/3010/starter-007.json): the 2026-10-22 fill with the mark at its block and the 20 s after, then all 21 markets at 2026-10-30 06:47 UTC, block 36,895,966.
- Re-run: `cd scripts && npx tsx starter-007.ts > ../evidence/3010/starter-007.json`.

## Environment
dreamdex-bot-kit 2579866 (still the latest commit on 2026-10-30), @somnia-chain/markets-sdk 0.32.1, Node 24.14.1, Hideki testnet (chain 50383). Fill from our test account 0x84326A92162Ece92ed257A31073fDd3a6599BF21 via trading key 0x13f05c8e15cC0d7d3abff02C144fb74778018a55.
