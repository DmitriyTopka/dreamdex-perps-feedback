# perp-starter prices its TP/SL from the mark, not from the entry: a default long's stop lands 1.09-1.47% away, and on LINK and BNB its take-profit sat below its own entry
Severity: major (a take-profit that can close at a loss)

Area: bot kit

In short: perp-starter opens with an IOC that takes the ask, then places the bracket around the mark. The trader asked for "2% profit, 1% loss" from what they paid. They get a stop further away than set, a target closer than set, and on a market whose book sits above the mark, a "take-profit" below the entry. The same lines also swap TP and SL on a short and ignore an existing position's side; those two parts were reported publicly before us (20-21 Oct) and are kept here only because one fix covers all three.

## Steps to reproduce
No key, nothing is sent. Our read-only script runs the kit's own level code on every market against the live book and on our real fill ([`scripts/starter-007.ts`](../scripts/starter-007.ts)):

```bash
cd scripts && npm install && npx tsx starter-007.ts > out.json
```

For the short-side part, the kit's own dry run at commit 2579866:

```bash
PRIVATE_KEY= OWNER_ADDRESS= DRY_RUN=true PERP_SIDE=short npx tsx strategies/perp-starter/src/index.ts
```

## Expected
`PERP_TAKE_PROFIT_PCT=2` and `PERP_STOP_LOSS_PCT=1` (the defaults, `strategies/perp-starter/src/index.ts:60-61`) mean: take profit 2% in my favour, stop out 1% against me, measured from what I paid. The banner says so (`take-profit 2% stop-loss 1%`), and the kit already has the position's `entryPrice` on what `positionIn()` returns.

## Actual

### 1. The bracket is priced from the mark, not from the entry (first reported here)
`strategies/perp-starter/src/index.ts:173-175`:

```ts
const mark = (await liveMark(ctx.exchange, market)) ?? markOf(market.info);
const up = BigInt(Math.round(mark * (1 + TAKE_PROFIT_PCT / 100) * 1e18));
const down = BigInt(Math.round(mark * (1 - STOP_LOSS_PCT / 100) * 1e18));
```

The open is an IOC that takes the ask (up to 20 bps past it, `packages/perp-core/src/orders.ts:154`). On a long the ask sits above the mark, so the stop ends up further than 1% from the entry and the target closer than 2%.

**Our real fill.** 2026-10-22, 0.00013 BTC long at **81,835.9**, tx `0x8980ab89c2710f5e77eba65ebf79ed05226bffebf0bf16fc7d311481ededa30b`, block 30,210,002 (12:43:30 UTC). The pool's mark at that block was 81,647.8 and stayed between 81,620.5 and 81,647.8 for the next 20 s, which is when perp-starter reads it. With the defaults that puts the stop **1.23% to 1.26%** under the entry and the target **1.73% to 1.77%** over it. At the default 2x a "1%" stop costs about 2.5% of margin instead of 2%; at 20x about 25% instead of 20%.

**Every market.** On 2026-10-30 06:47 UTC (block 36,895,966) the script priced a default 50 USDso open on the live book of all 21 markets:
- on the 19 markets whose book sat within 1% of the mark, the long's stop lands **1.09% to 1.47%** from the entry (BTC 1.09%) and the target **1.52% to 1.91%**;
- on LINK and BNB the book sat 10% and 4.5% above the mark at that moment (thin books move; BNB's was back near the index by 07:07). There a default long's **take-profit is 7.4% (LINK) and 2.4% (BNB) below its own entry**: when it fires, it closes the position at a loss and the log calls it a take-profit.

The "already long, managing it instead of opening another" path (lines 121-124) has the same problem: the bracket goes around the current mark, wherever that is relative to the original entry.

### 2. Also in these lines, reported earlier by others (20-21 Oct)
- **TP and SL swap on a short.** `up` is built from the take-profit percentage and `down` from the stop-loss one, and on a short the code uses `down` as the take-profit and `up` as the stop-loss (lines 176-177), so a default short gets a 1% target and a 2% stop. The kit's dry run on 2026-10-30 06:47 UTC ([`evidence/3010/starter-007-dryrun.txt`](../evidence/3010/starter-007-dryrun.txt)):

  ```
  perp-starter on BTC-PERP (BTC/USDso:USDso) | short 50 USDso at 2x | take-profit 2% stop-loss 1% | dry-run true
  [dry-run] would arm a short bracket on BTC-PERP: take-profit 77500.30, stop-loss 79848.80, whole position, 0.30 SOMI locked
  ```

  Both levels come from a mark of 78,283.1: 77,500.3 is 1% under it and 79,848.8 is 2% over it.
- **Side taken from the env.** The code uses `SIDE` from `PERP_SIDE`, not `existing.side`, so an existing short run with the default `PERP_SIDE=long` gets a long bracket. Found by reading the code, not run.

## Suggested fix
Price both levels from the position itself, after the open or from the existing position, and pick the direction per side. This fixes all three parts:

```ts
const position = me ? await positionIn(ctx.exchange, market) : undefined;
const side: Side = position?.side ?? SIDE;
const ref = position?.entryPrice ?? (await liveMark(ctx.exchange, market)) ?? markOf(market.info);
const sign = side === "long" ? 1 : -1;
const takeProfit = BigInt(Math.round(ref * (1 + (sign * TAKE_PROFIT_PCT) / 100) * 1e18));
const stopLoss = BigInt(Math.round(ref * (1 - (sign * STOP_LOSS_PCT) / 100) * 1e18));
```

and pass `side` (not `SIDE`) to `armBracket` and to the watched-exit checks on lines 224-225. The mark stays as the fallback for a dry run with no position.

**Ready patch with tests:** [`patches/007-perp-starter-bracket-from-entry.patch`](../patches/007-perp-starter-bracket-from-entry.patch) fixes all three parts in one change. Its three tests fail on 2579866 (take-profit 99,495 instead of 98,000; an existing short armed as long; a short in profit closed as a stop-loss) and pass with the patch. How to apply and run it: [`patches/README.md`](../patches/README.md).

## Evidence
- [`evidence/3010/starter-007.json`](../evidence/3010/starter-007.json): the 2026-10-22 fill with the mark at its block and the 20 s after, then all 21 markets at 2026-10-30 06:47 UTC, block 36,895,966.
- [`evidence/3010/starter-007-dryrun.txt`](../evidence/3010/starter-007-dryrun.txt): the kit's own dry run, long and short, no key.
- History: the first version of this report (2026-10-22) covered part 1 only. Part 2 was added on 2026-10-30, after the two earlier public reports on it.
- Re-run: `cd scripts && npx tsx starter-007.ts > ../evidence/3010/starter-007.json`.

## Environment
dreamdex-bot-kit 2579866 (main moved on to 4e75896 on 2026-10-29, but only files in examples/ changed; strategies and perp-core are the same), @somnia-chain/markets-sdk 0.31.0 inside the kit (its lockfile pins it for perp-core) and 0.32.1 in our `scripts/`, Node 24.14.1, Hideki testnet (chain 50383). Fill from our test account 0x84326A92162Ece92ed257A31073fDd3a6599BF21 via trading key 0x13f05c8e15cC0d7d3abff02C144fb74778018a55.
