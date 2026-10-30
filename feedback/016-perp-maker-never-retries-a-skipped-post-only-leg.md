# perp-maker logs "Re-quotes next cycle" after PostOnlyWouldCross, but the skipped leg is not tried again until the mark moves 8 bps
Severity: normal

Area: bot kit

Two linked problems: a skipped leg is retried only after an 8 bps move of the mark, and the quotes are centred on the mark without a check against the book, so on markets where the book sits away from the mark the same leg crosses every cycle.

## Steps to reproduce
Read-only, no key ([`scripts/maker-016.ts`](../scripts/maker-016.ts)):

```bash
cd scripts && npm install && npx tsx maker-016.ts > out.json
```

It samples all 21 perp markets five times, about 20 s apart (perp-maker refreshes every 15 s; RPC reads add the rest), computes the two quotes perp-maker would post with its defaults, checks each against the on-chain best bid and ask, and replays the strategy's re-quote gate on those samples. It also reads back the order from our live run on 2026-10-22 and the BTC book at the block it was placed in.

The live run itself, if you want to see the log: bot kit at 2579866, a trading key linked to an account with margin, perp-maker defaults (BTC-PERP, half-spread 15 bps, re-quote trigger 8 bps, refresh 15 s), `DRY_RUN=false npm start -w perp-maker` for about a minute. It only shows the bug while some market's book sits more than 15 bps away from its mark.

## Expected
When a post-only quote would cross, `placePerp` catches `PostOnlyWouldCross` and logs `would cross the touch as a maker, skipped rather than paying the spread. Re-quotes next cycle.` (`packages/perp-core/src/orders.ts:190-192`). So I expect the missing leg to be tried again on the next 15 s cycle.

## Actual
It is not tried again until the mark moves 8 bps. In `strategies/perp-maker/src/index.ts`:

- line 146 creates the new quote as `{ atMark: mark }` before either leg is placed;
- line 186 stores it as `resting` even when one leg was skipped and has no order id;
- lines 123-124 skip the whole cycle while `|mark - resting.atMark|` stays under 8 bps.

The README says the bot "re-quotes on movement, not on a timer", which is fine for two resting legs. For a leg that was never placed it means the bot sits one-sided for as long as the mark is quiet, while the log promises the opposite.

**Live run, 2026-10-22, BTC-PERP.** The log:

```
perp-maker on BTC-PERP | 25 USDso per side at 2x | half-spread 15bps skew 10bps | cap 100 USDso | dry-run false
MarginBank ready: 999.99 unlocked, 0.00 locked, equity 999.99, status Healthy.
placed quote long 0.0003 BTC @ 81424 | filled 0 | order 8116567392432209725644
quote short 0.0003 BTC @ 81668.6: would cross the touch as a maker, skipped rather than paying the spread. Re-quotes next cycle.
stopping, finishing the current cycle first. Press Ctrl-C again to exit now.
quotes pulled, exiting
```

One ask attempt in about a minute, no retry. Read back from the indexer on 2026-10-30: the bid was placed at 16:16:12 UTC in block 30,337,534 (tx `0xb92fb43f3abb9127ac848b2557444d4ee3f353cd83750cf251295b361c0e88d4`), rested unfilled and was cancelled at 16:17:01. At that block the pool's mark was 81,542.92 and the best bid 81,741.6, so the ask at 81,668.6 sat 8.9 bps under the best bid and the pool had to refuse it. The bid at 81,424 rested 39 bps under the best bid, where it was never going to fill.

**Today, 2026-10-30 06:52 to 06:54 UTC (blocks 36,899,080 to 36,900,031).** BTC's book has come back to within 3 to 17 bps of the mark, so BTC quotes fine at the moment. Three other markets have their books far above the mark (report 006), and on them the default ask crossed in all 5 samples:

| market | book mid vs mark | ask crosses | cycles the gate lets through |
|---|---|---|---|
| LINK-PERP | +962 to +978 bps | 5 of 5 | 2 of 5 |
| BNB-PERP | +440 to +442 bps | 5 of 5 | 1 of 5 |
| HYPE-PERP | +423 to +441 bps | 5 of 5 | 3 of 5 |

On BNB the mark never drifted more than 1.5 bps from the first sample in the 85 s that followed, so after the first cycle the bot would not have looked at the ask again. On these three a retry alone would not help either, because the ask lands under the bid every time. That is the second half of the problem: quotes are centred on the mark and never checked against the touch, so whenever the book sits more than one half-spread away from the mark, the maker is one-sided by construction.

What it does to someone running it: the bot shows as "quoting" but rests only a bid, far under the market, earns no spread and gets no fills. If that bid does fill on a dip, the bot is long with no ask to work the position back, and the inventory skew cannot help because the ask is the leg that keeps getting refused.

## Suggested fix
1. Only treat a quote as resting when every leg that was meant to be placed has an order id, so the next cycle retries the missing one. Set `intended[side] = false` where a side is held back at the cap (line 156), `true` otherwise, then replace line 186 with:

```ts
const missing = (["long", "short"] as const).some((s) => intended[s] && (s === "long" ? next.bid : next.ask) === undefined);
resting = missing ? { ...next, atMark: 0 } : next;
```

With `atMark: 0` the drift on the next cycle is `Infinity` and the bot re-quotes. A per-leg version that keeps the resting leg's queue position is nicer, but this is the smallest change that makes the log line true.

2. Keep a quote on the maker side of the touch, as the docs suggest for this error ("Re-price further from the touch", Contract errors page). `bidPx` and `askPx` become `let`:

```ts
const book = await ctx.exchange.fetchOrderBook(fresh.symbol, 1);
const tick = BigInt(fresh.info.tickSize);
const bestBid = book.bids[0] ? BigInt(Math.round(book.bids[0][0] * 1e18)) : undefined;
const bestAsk = book.asks[0] ? BigInt(Math.round(book.asks[0][0] * 1e18)) : undefined;
if (bestBid !== undefined && askPx <= bestBid) askPx = bestBid + tick;
if (bestAsk !== undefined && bidPx >= bestAsk) bidPx = bestAsk - tick;
```

## Evidence
- [`evidence/3010/maker-016.json`](../evidence/3010/maker-016.json): the 2026-10-22 order read back with the mark and book at its block, then 5 samples x 21 markets with quotes, crossings and the replayed gate.
- The run log above is from 2026-10-22 ~16:16 UTC, linked key 0x13f0...8a55 for owner 0x8432...BF21. Afterwards `perp:doctor` showed `positions: none` and `locked 0.00`, so the bid was pulled on exit as intended.
- Re-run: `cd scripts && npx tsx maker-016.ts > ../evidence/3010/maker-016.json`.

## Environment
dreamdex-bot-kit 2579866, @somnia-chain/markets-sdk 0.32.1, Node 24.14.1, Hideki testnet (chain 50383).
