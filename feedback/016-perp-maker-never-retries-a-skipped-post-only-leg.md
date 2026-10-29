# perp-maker says "Re-quotes next cycle" after PostOnlyWouldCross, but never retries the skipped leg while the mark is still; on BTC, its default market, it quotes one side only
Severity: normal
Area: SDK

## Steps to reproduce
1. Bot kit at 2579866, trading key linked to an account with margin, all perp-maker settings left at their defaults (BTC-PERP, half-spread 15 bps, re-quote trigger 8 bps, refresh 15 s).
2. `DRY_RUN=false npm start -w perp-maker`, let it run about a minute, then Ctrl-C.

## Expected
`placePerp` turns a `PostOnlyWouldCross` revert into a skipped quote and logs "Re-quotes next cycle" (`packages/perp-core/src/orders.ts:191`). A reader expects the missing leg to be tried again on the next 15 s cycle.

## Actual
The skipped leg is not tried again until the mark moves 8 bps. In `strategies/perp-maker/src/index.ts`:

- line 146 starts the new quote as `{ atMark: mark }` before either leg is placed;
- line 186 stores it as `resting` even when one leg was skipped and has no order id;
- lines 123-124 then skip the whole cycle while `|mark - resting.atMark|` stays under 8 bps.

So a skipped leg stays missing for as long as the mark is quiet, and the log claims the opposite.

On BTC it happens on every cycle. Quotes are centred on the mark, and on BTC the book sits well above the mark (the bias in report 006). The ask at mark + 15 bps lands under the best bid and is rejected every time:

| time (UTC) | BTC mark | best bid | best ask | book mid vs mark |
|---|---|---|---|---|
| 2026-10-22 16:15 | 81533.03 | 81732.2 | 81737.4 | +24.7 bps |
| 2026-10-22 ~16:19 | 81562.23 | 81765.2 | 81772.2 | +25.0 bps |

The same check on all 21 markets at 16:15 found BTC the only one where a default quote crosses. BTC is also the strategy's default market (`index.ts:82`). The result is a maker that rests one bid about 40 bps under the touch and no ask, so it doesn't really make a market and doesn't get filled either.

Live run, 2026-10-22 ~16:17 UTC, 62 s, 4 refresh cycles:

```
perp-maker on BTC-PERP | 25 USDso per side at 2x | half-spread 15bps skew 10bps | cap 100 USDso | dry-run false
MarginBank ready: 999.99 unlocked, 0.00 locked, equity 999.99, status Healthy.
placed quote long 0.0003 BTC @ 81424 | filled 0 | order 8116567392432209725644
quote short 0.0003 BTC @ 81668.6: would cross the touch as a maker, skipped rather than paying the spread. Re-quotes next cycle.
stopping, finishing the current cycle first. Press Ctrl-C again to exit now.
quotes pulled, exiting
```

One short attempt in four cycles, no retry. Afterwards `perp:doctor` shows `positions: none` and `locked 0.00`, so the bid was pulled on exit as intended.

Suggested fix: only set `atMark` when both legs are resting (or keep a per-leg mark and retry any leg without an order id every cycle). Separately, centring on the mark when the book is 25 bps away means a maker ask under the bid by design; clamping each quote to the far side of the touch would keep it a maker quote.

## Evidence
Run log above (bot kit 2579866, linked key 0x13f0...8a55 for owner 0x8432...BF21). Book and mark from `getPerpHealthSnapshot` and `fetchOrderBook("BTC/USDso:USDso")`, and from `perp:doctor` at ~16:19 UTC: `BTC-PERP mark=81562.23 ... book[bid=81765.20 ask=81772.20]`.

## Environment
dreamdex-bot-kit 2579866, @somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), 2026-10-22.
