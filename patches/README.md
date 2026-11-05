# Fix patches for reports 001, 007 and 016

Each patch fixes one of our bot kit reports and adds one vitest file. That test fails on the kit as it is and passes once the fix is in. The tests run the real script or strategy file with the perp-core calls stubbed by `vi.mock`, so nothing touches the network and no key is needed.

All three patches are made against somnia-chain/dreamdex-bot-kit at 2579866. Each one applies cleanly on its own and on top of the others, both at 2579866 and at current main (4e75896, where only examples/ changed).

Setup, from the folder that holds `patches/`:

```bash
git clone https://github.com/somnia-chain/dreamdex-bot-kit
git -C dreamdex-bot-kit checkout 2579866
cd dreamdex-bot-kit && npm ci && cd ..
```

To watch a test fail first, apply only its test file:

```bash
git -C dreamdex-bot-kit apply --include='packages/perp-core/tests/*' ../patches/NNN.patch
```

Then `git -C dreamdex-bot-kit checkout -- . && git -C dreamdex-bot-kit clean -fd packages` puts the tree back. With `-C`, the patch path is relative to `dreamdex-bot-kit/`, so `../patches/` is this folder.

Full raw output for every run is in `logs/NNN-before.txt` and `logs/NNN-after.txt`.

## 001: perp:doctor prints prices at the tick's precision

Report: `feedback/001-perp-doctor-rounds-prices-to-2-decimals.md`.

`px()` in `scripts/perp-doctor.ts` now takes the market and prints as many decimals as the tick has. That gives 4 on XRP, 7 on 1000PEPE and 1 on BTC. The mark, the un-priceable row mark, the bid and the ask all go through it.

```bash
git -C dreamdex-bot-kit checkout 2579866 && git -C dreamdex-bot-kit apply ../patches/001-perp-doctor-tick-precision.patch
cd dreamdex-bot-kit && npx vitest run --root packages/perp-core tests/perp-doctor-prices.test.ts
```

Before:

```
× perp:doctor price format > prints mark, bid and ask with as many decimals as the tick has
  → expected 'XRP-PERP   mark=1.31 · funding unread…' to contain 'book[bid=1.3090 ask=1.3133]'
Tests  1 failed (1)
```

After:

```
✓ tests/perp-doctor-prices.test.ts (1 test)
Tests  1 passed (1)
```

## 007: perp-starter sets the bracket from the entry, per side, on the position's side

Report: `feedback/007-perp-starter-sets-tp-sl-from-mark-not-entry.md`.

Three changes in `strategies/perp-starter/src/index.ts`:

1. Both levels are measured from the position's `entryPrice`. After an open it is read back with `positionIn()`. A dry run has no position, so it falls back to the live mark as before.
2. Each level keeps its own percentage on both sides. A short gets its take-profit 2% under the entry and its stop-loss 1% over it, the mirror of a long.
3. A position that is already open is managed on its own side. `armBracket` and the trading-key watch both use that side, not `PERP_SIDE`.

```bash
git -C dreamdex-bot-kit checkout 2579866 && git -C dreamdex-bot-kit apply ../patches/007-perp-starter-bracket-from-entry.patch
cd dreamdex-bot-kit && npx vitest run --root packages/perp-core tests/perp-starter-bracket.test.ts
```

Before (fill at 100,000, mark 100,500, defaults 2% and 1%):

```
× opens a short and arms take-profit 2% under and stop-loss 1% over the entry price
  → expected 99495 to be close to 98000
× manages an existing short as a short even when PERP_SIDE says long
  → expected 'long' to be 'short'
× with a trading key, closes an existing short in profit as a take-profit
  → expected { label: 'stop-loss' } to deeply equal { label: 'take-profit' }
Tests  3 failed (3)
```

After:

```
✓ tests/perp-starter-bracket.test.ts (3 tests)
Tests  3 passed (3)
```

## 016: perp-maker quotes a refused leg again and keeps quotes off the touch

Report: `feedback/016-perp-maker-never-retries-a-skipped-post-only-leg.md`.

Two changes in `strategies/perp-maker/src/index.ts`, the two parts of the report's suggested fix:

1. When the pool refuses a leg with `PostOnlyWouldCross`, the quote is stored with `atMark: 0`. The next cycle then gets past the 8 bps drift gate and quotes again, which is what the log line "Re-quotes next cycle" promises.
2. Before placing, the bot reads the top of book. An ask at or under the best bid moves to one tick over it, and a bid at or over the best ask moves to one tick under it.

```bash
git -C dreamdex-bot-kit checkout 2579866 && git -C dreamdex-bot-kit apply ../patches/016-perp-maker-retry-missing-leg.patch
cd dreamdex-bot-kit && npx vitest run --root packages/perp-core tests/perp-maker-requote.test.ts
```

Before (mark 100 and never moving, half-spread 15 bps, tick 0.01):

```
× tries the ask again next cycle after the touch moved between the read and the send
  → expected 1 to be greater than 1
× keeps the ask on the maker side when the whole book sits above the mark
  → expected 100.15 to be close to 100.21
Tests  2 failed (2)
```

After:

```
✓ tests/perp-maker-requote.test.ts (2 tests)
Tests  2 passed (2)
```

## Other checks with each patch applied

- `npm test -w @dreamdex-bot-kit/perp-core`: the 31 existing tests still pass along with the new ones. That is 32, 34 and 33 tests, and 37 with all three patches.
- `npm run check`: 10 passed, 0 failed.
- `npm run typecheck -w perp-starter` and `-w perp-maker`: clean.
- `scripts/perp-doctor.ts` is not covered by any tsconfig in the kit. A strict `tsc --noEmit` on it shows the same 3 errors before and after the patch (lines 65, 66 and 91 upstream, all `noUncheckedIndexedAccess` on `markets[0]`). The patch adds none.
