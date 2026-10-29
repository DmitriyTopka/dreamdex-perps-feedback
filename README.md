# dreamDEX Perps Builder Bounty: feedback

Bug and documentation reports for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) on Somnia Tokyo testnet (Hideki, chain 50383).

One issue per file in [`feedback/`](feedback), in the format the bounty asks for: title, severity, area, steps to reproduce, expected, actual, evidence, environment.

| # | Title | Severity | Area |
|---|---|---|---|
| 001 | [perp:doctor rounds every price above 1 to 2 decimals, so on XRP a 43-tick spread prints as bid=1.31 ask=1.31](feedback/001-perp-doctor-rounds-prices-to-2-decimals.md) | normal | bot kit |
| 002 | [Cancelling a filled or cancelled perp order reverts IncorrectSender and names another trader as the owner. Docs say it should be OrderIdMismatch, which the perp pool can't even return](feedback/002-stale-cancel-reverts-incorrectsender-with-another-traders-address.md) | normal | contracts |
| 003 | [Out-of-range orderType or selfMatchingOption reverts with no error data](feedback/003-out-of-range-ordertype-reverts-without-reason.md) | normal | SDK |
| 004 | [Perps dev docs say a perp tx costs 0.0003-0.003 STT, but their own 1.56M gas figure already costs 0.0094 STT. Our PostOnly placements cost up to 0.014 STT](feedback/004-docs-understate-perp-order-gas-and-stt-cost.md) | normal | docs |
| 005 | [Funding docs say shorts pay when the perp is below the index; in 3,405 of 3,662 recent settlements with mark below index, longs paid](feedback/005-funding-docs-omit-interest-component-longs-pay-below-index.md) | major | docs |
| 006 | [Mark price sits below the oracle on 19 of 21 markets; mark formula undocumented](feedback/006-mark-price-sits-below-oracle-on-19-of-21-markets.md) | major | contracts |
| 007 | [perp-starter sets TP/SL from the mark, not the entry price](feedback/007-perp-starter-sets-tp-sl-from-mark-not-entry.md) | normal | SDK |
| 008 | [perp-guard silently skips the reduce stage on small positions](feedback/008-perp-guard-silently-skips-reduce-on-small-positions.md) | normal | SDK |
| 009 | [Docs say the per-account position cap is "a tenth" of the open interest cap on most markets; it is a tenth on 1 of 21](feedback/009-docs-position-cap-tenth-of-oi-holds-on-1-of-21-markets.md) | normal | docs |
| 011 | [Perps market table: "Open interest cap" is 1/4 of the on-chain cap on 16 markets and 1/2 on 4; on XRP the real cap is 98% full while the docs show it 4x over](feedback/011-docs-oi-cap-column-is-quarter-of-onchain-cap.md) | normal | docs |
| 012 | [The perps dev page sends you to the Errors page for "the full list of order errors", but that page has no perp errors. 120 errors the perp contracts can revert with are not named anywhere in the docs](feedback/012-errors-page-has-no-perp-errors.md) | major | docs |
| 013 | [SDK type docs say LiquidationFee "is not in the deployed implementation" and no rows exist; the indexer returns 968 rows emitted by the live LiquidationEngine](feedback/013-sdk-says-no-liquidationfee-rows-but-968-exist.md) | normal | SDK |
| 014 | [Perps market table lists min size but not lot size; e.g. 125 DOGE is above the documented minimum and still reverts InvalidQuantity](feedback/014-market-table-omits-lot-size.md) | normal | docs |
| 015 | [Perp TP/SL from the SDK throws NotConfiguredError with every bundled preset, though each pool tells you the registry address](feedback/015-perp-stop-order-throws-without-operator-registry.md) | major | SDK |
| 016 | [perp-maker says "Re-quotes next cycle" after PostOnlyWouldCross but never retries the skipped leg while the mark is still; on BTC it quotes one side only](feedback/016-perp-maker-never-retries-a-skipped-post-only-leg.md) | normal | SDK |
| 017 | [perp-funding's default 10% entry threshold sits under the fixed 10.95% interest floor: it opens on 20 of 21 markets and its exit can never fire on 17](feedback/017-perp-funding-default-threshold-sits-under-the-interest-floor.md) | normal | SDK |
| 018 | [Reduce-only perp stop reverts NoReducingPositionAtCreation without a position; undocumented, and the operator grant is already sent](feedback/018-reduce-only-stop-needs-a-position-undocumented-grant-sent-first.md) | normal | SDK |
| 019 | [TP/SL set as "Entire" stores a fixed size; after adding to the position the app still says "Entire", the stop-loss closes only the original part and the shown loss is half the real one](feedback/019-entire-tpsl-covers-only-the-size-at-creation.md) | major | app |
| 020 | [When one leg of a linked TP/SL fills, the other leg's 0.15 STT is only credited to unclaimedSomi; SDK pair docs and the bot kit say refunded, and the kit never claims it](feedback/020-linked-leg-fee-is-credited-not-refunded-sdk-and-kit-say-refunded.md) | normal | SDK |
| 021 | [The TP/SL dialog rounds the position size to 4 decimals: 0.00018 BTC shows as 0.0002, 0.00036 as 0.0004](feedback/021-tpsl-dialog-rounds-position-size-to-4-decimals.md) | normal | app |
| 022 | [Cancelling a limit order leaves its attached TP/SL armed; the stops keep 0.30 STT locked and later act on an unrelated new position](feedback/022-cancelling-a-limit-order-leaves-its-tpsl-armed.md) | normal | app |

Test account on Hideki: owner `0x84326A92162Ece92ed257A31073fDd3a6599BF21`, linked trading key `0x13f05c8e15cC0d7d3abff02C144fb74778018a55`. One further item was reported privately to security@dreamdex.io on 2026-10-22, as the bounty rules ask.

Every transaction hash in the reports can be checked on the Hideki RPC or explorer.

## Re-running the checks

Eight reports (001, 002, 004, 005, 009, 011, 012, 015) come with a read-only script in [`scripts/`](scripts). None of them needs a key or sends a transaction, they only read the chain, the indexer and the docs:

```bash
cd scripts
npm install
npx tsx caps-009-011.ts   # or funding-005.ts, errors-012.ts, stops-015.ts, doctor-001.ts, gas-004.ts, cancel-002.ts
```

Each one prints JSON with the block number and time it ran at. Our own runs from 2026-10-29 are in [`evidence/2910/`](evidence/2910), so you can compare.
