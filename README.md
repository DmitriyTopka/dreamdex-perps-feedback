# dreamDEX Perps Builder Bounty: feedback

Bug and documentation reports for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) on Somnia Tokyo testnet (Hideki, chain 50383).

One issue per file in [`feedback/`](feedback), in the format the bounty asks for: title, severity, area, steps to reproduce, expected, actual, evidence, environment. Most reports also have a suggested fix before the evidence.

## Judges start here

- **First public report on 10 topics:** [006](feedback/006-mark-price-sits-below-oracle-on-19-of-21-markets.md), [008](feedback/008-perp-guard-silently-skips-reduce-on-small-positions.md), [013](feedback/013-sdk-says-no-liquidationfee-rows-but-968-exist.md), [014](feedback/014-market-table-omits-lot-size.md), [017](feedback/017-perp-funding-default-threshold-sits-under-the-interest-floor.md), [018](feedback/018-reduce-only-stop-needs-a-position-undocumented-grant-sent-first.md), [019](feedback/019-entire-tpsl-covers-only-the-size-at-creation.md), [020](feedback/020-linked-leg-fee-is-credited-not-refunded-sdk-and-kit-say-refunded.md), [021](feedback/021-tpsl-dialog-rounds-position-size-to-4-decimals.md), [022](feedback/022-cancelling-a-limit-order-leaves-its-tpsl-armed.md). The ones closest to a trader's money: 019 (an "Entire" stop loss closes only part of a grown position), 022 (stops of a cancelled order stay armed) and 020 (a 0.15 STT fee is parked, not refunded).
- **Every report can be re-checked without a key.** Each has a read-only script in [`scripts/`](scripts) and saved output with block and time in [`evidence/`](evidence).
- **Fixes you can apply.** For the three bot kit bugs (001, 007, 016) there is a patch with a test in [`patches/`](patches): each test fails on the kit as it is and passes with the patch, and the kit's own tests stay green (37 pass with all three applied).
- **11 topics where someone else was first** are listed [below](#topics-where-someone-reported-first), each with what our report adds.

| # | Title | Severity | Area |
|---|---|---|---|
| 001 | [perp:doctor prints every price of 1 or more with 2 decimals, so on XRP a 43-tick spread shows as bid=1.31 ask=1.31](feedback/001-perp-doctor-rounds-prices-to-2-decimals.md) | normal | bot kit |
| 002 | [Cancelling a finished perp order reverts IncorrectSender with another trader's address instead of the documented OrderIdMismatch](feedback/002-stale-cancel-reverts-incorrectsender-with-another-traders-address.md) | normal | contracts |
| 003 | [Out-of-range orderType or selfMatchingOption reverts with no error data, and the SDK does not check the range](feedback/003-out-of-range-ordertype-reverts-without-reason.md) | normal | SDK |
| 004 | [Perps developer docs put a perp tx at 0.0003-0.003 STT, but their own 1.56M gas figure costs 0.0094 STT and our placements cost up to 0.014 STT](feedback/004-docs-understate-perp-order-gas-and-stt-cost.md) | normal | docs |
| 005 | [Funding docs say shorts pay when the perp is below the index; in 3,405 of 3,662 recent settlements with mark below index, longs paid](feedback/005-funding-docs-omit-interest-component-longs-pay-below-index.md) | major | docs |
| 006 | [Perp mark sits below the oracle index in 3,632 of 4,200 settlements (21 markets, 8 days), even while the index falls; the docs never say how the mark is built](feedback/006-mark-price-sits-below-oracle-on-19-of-21-markets.md) | major | contracts |
| 007 | [perp-starter prices its TP/SL from the mark, not from the entry: a default long's stop lands 1.09-1.47% away, and on LINK and BNB its take-profit sat below its own entry](feedback/007-perp-starter-sets-tp-sl-from-mark-not-entry.md) | major | bot kit |
| 008 | [perp-guard's reduce stage never runs on positions under about 4 x minQuantity (29 to 87 USDso at current prices), and nothing takes its place](feedback/008-perp-guard-silently-skips-reduce-on-small-positions.md) | normal | bot kit |
| 009 | [Docs say the per-account position cap is "a tenth" of the open interest cap on most markets; it is a tenth on 1 of 21](feedback/009-docs-position-cap-tenth-of-oi-holds-on-1-of-21-markets.md) | normal | docs |
| 011 | [Perps market table: "Open interest cap" is 1/4 of the on-chain cap on 16 markets and 1/2 on 4; XRP shows 392% of the docs cap but is at 98% of the real one](feedback/011-docs-oi-cap-column-is-quarter-of-onchain-cap.md) | normal | docs |
| 012 | [The Errors page has no perp errors, though the perps developer page sends you there; 120 perp contract errors are named nowhere in the docs](feedback/012-errors-page-has-no-perp-errors.md) | major | docs |
| 013 | [SDK type docs say LiquidationFee "is not in the deployed implementation" and no rows exist; the indexer returns 2,179 rows emitted by the live LiquidationEngine](feedback/013-sdk-says-no-liquidationfee-rows-but-968-exist.md) | normal | SDK |
| 014 | [Perps market table lists min size but not lot size; e.g. 125 DOGE is above the documented minimum and still reverts InvalidQuantity](feedback/014-market-table-omits-lot-size.md) | normal | docs |
| 015 | [Perp TP/SL from the SDK throws NotConfiguredError with every bundled preset, though each pool tells you the registry address](feedback/015-perp-stop-order-throws-without-operator-registry.md) | major | SDK |
| 016 | [perp-maker logs "Re-quotes next cycle" after PostOnlyWouldCross, but the skipped leg is not tried again until the mark moves 8 bps](feedback/016-perp-maker-never-retries-a-skipped-post-only-leg.md) | normal | bot kit |
| 017 | [perp-funding's default entry threshold (10% APR) is under the +0.01%/8h default funding rate (10.95% APR), so it opens a short on any quiet market and its exit almost never fires](feedback/017-perp-funding-default-threshold-sits-under-the-interest-floor.md) | normal | bot kit |
| 018 | [Reduce-only perp TP/SL reverts NoReducingPositionAtCreation with nothing to reduce; undocumented in the SDK and developer docs, and the SDK has already sent the operator grant](feedback/018-reduce-only-stop-needs-a-position-undocumented-grant-sent-first.md) | normal | SDK |
| 019 | [TP/SL set as "Entire" stores a fixed size; after adding to the position the app still says "Entire", but the stop-loss would close only the original part and the shown loss is understated](feedback/019-entire-tpsl-covers-only-the-size-at-creation.md) | major | app |
| 020 | [When one leg of a linked TP/SL fills, the other leg's 0.15 STT is only credited to unclaimedSomi; the SDK's pair docs and the bot kit say it is refunded, and the kit never claims it](feedback/020-linked-leg-fee-is-credited-not-refunded-sdk-and-kit-say-refunded.md) | normal | SDK |
| 021 | [The TP/SL dialog rounds the position size to 4 decimals: 0.00018 BTC shows as 0.0002, 0.00036 as 0.0004](feedback/021-tpsl-dialog-rounds-position-size-to-4-decimals.md) | normal | app |
| 022 | [Cancelling a limit order leaves its attached TP/SL armed; the stops keep 0.30 STT locked and later act on an unrelated new position](feedback/022-cancelling-a-limit-order-leaves-its-tpsl-armed.md) | normal | app |

Test account on Hideki: owner `0x84326A92162Ece92ed257A31073fDd3a6599BF21`, linked trading key `0x13f05c8e15cC0d7d3abff02C144fb74778018a55`. One further item was reported privately to security@dreamdex.io on 2026-10-22, as the bounty rules ask.

Every transaction hash in the reports can be checked on the Hideki RPC or explorer.

## Topics where someone reported first

On 11 of our topics another participant filed a public report before us. Most of those reports are from 19-21 Oct and ours from 22 Oct. On 007 only one of its three parts is ours, see its row. We kept these reports in because the organizers said that when several people report the same improvement, the best report wins. This is what each of ours gives a reviewer, so you can compare quickly. Reports on the same topics filed after ours (from 6 Nov on) are not listed here; our files are dated 22 Oct.

| # | Topic | What this report adds |
|---|---|---|
| [001](feedback/001-perp-doctor-rounds-prices-to-2-decimals.md) | perp:doctor rounds prices | All 21 markets passed through the doctor's own `px()` next to the chain's top of book: 11 of 21 lose digits, with the spread in ticks (XRP: a 43-tick spread printed as bid=ask). A drop-in fix that derives decimals from `tickSize`. |
| [002](feedback/002-stale-cancel-reverts-incorrectsender-with-another-traders-address.md) | stale cancel reverts IncorrectSender | Every finished order of one account (34: 26 Filled, 8 Cancelled) x three calls, including the owner's own `cancelOrder`; 10 different strangers' addresses come back. The documented `OrderIdMismatch` selector (0x71fa8de6) is not in the PerpPool implementation bytecode, so the pool cannot return it today. A bot-side guard (`getOrderOnchain` is null for all 34). |
| [003](feedback/003-out-of-range-ordertype-reverts-without-reason.md) | out-of-range enum reverts blank | The SDK side: it defines the ranges itself (`ORDER_TYPE` 0-3, `SELF_MATCHING_OPTION` 0-1) but `perpOrderCall` (`dist/orders.js:1626`) passes any byte, broadcasts without simulating, and its own `decodeRevert` then says "for an unknown reason". The Errors page sends you to raise the gas limit, which cannot help. Checked on both `placeOrder` and `placeOrderFor`, four concrete fixes. |
| [004](feedback/004-docs-understate-perp-order-gas-and-stt-cost.md) | docs understate gas and STT cost | PostOnly placements and cancels (the cheap end), 8 receipts with explorer links; fresh `eth_estimateGas` for resting and IOC orders; what it does to a bot budget (5 STT is about 355 orders, not 1,666); a replacement paragraph for the docs. |
| [005](feedback/005-funding-docs-omit-interest-component-longs-pay-below-index.md) | funding docs omit the interest term | The formula reproduces the live `fundingRate` on 21/21 pools, with settlement history from all 21. Why the trader's mark can mislead twice: the premium is taken from the book, not the mark (see 006). A replacement paragraph for the docs and a worked example at the +0.01% default. |
| [007](feedback/007-perp-starter-sets-tp-sl-from-mark-not-entry.md) | perp-starter bracket levels | Only one of the three parts is ours: the bracket is priced from the mark after an IOC that took the ask, not from the entry, so a default long's stop lands 1.09-1.47% from the entry on 19 markets (our fill at 81,835.9 against a mark of 81,647.8, with the tx). The short-side TP/SL swap and the env side used for an existing position were reported earlier by others; they are in this report because one fix covers all three. |
| [009](feedback/009-docs-position-cap-tenth-of-oi-holds-on-1-of-21-markets.md) | position cap is not "a tenth" | The enforced ratio per market group (1/20, 1/40, set per market for BTC, TAO, ZEC), the same on 22 and 29 Oct. Why some reports show other numbers (ZEC 1.0, BTC 0.405): they divide by the docs column or by older values. |
| [011](feedback/011-docs-oi-cap-column-is-quarter-of-onchain-cap.md) | OI cap column vs chain | XRP at 98% of its real cap while the docs show 392% of a cap that does not exist, so a bot reading the table cannot see that the next large XRP order may revert. Kept separate from 009 (different number, different fix). |
| [012](feedback/012-errors-page-has-no-perp-errors.md) | Errors page has no perp errors | Errors filtered by what the deployed perp contracts can actually raise: 156 selectors found in the PerpPool, PerpStopOrderRegistry and MarginBank bytecode, 120 of them named nowhere in the docs. A live `eth_call` where the pool returns "ERC20: insufficient allowance" while the docs promise "transfer amount exceeds balance". Why 546 and 538 are both right. |
| [015](feedback/015-perp-stop-order-throws-without-operator-registry.md) | no operator registry in SDK presets | The exact line that throws (`dist/perp/stops.js:490`, it never asks the pool). The bot kit hardcodes two different registry addresses for its two networks (`config.ts:81-82`), so the `SOMNIA_TESTNET_ADDRESSES` fix needs the second one. The `getOperatorPermissionsRegistry` JSDoc says "SpotPool", which hides that it works on perp pools. |
| [016](feedback/016-perp-maker-never-retries-a-skipped-post-only-leg.md) | perp-maker never retries a skipped leg | A live run with the tx (bid placed, ask skipped, no retry in a minute) and a 21-market sample. The second half of the problem: quotes are centred on the mark and never checked against the book, so on LINK, BNB and HYPE the default ask crossed in 5 of 5 samples and a retry alone would not help. |

## Re-running the checks

Every report except 010 (sent privately) comes with a read-only script in [`scripts/`](scripts). None of them needs a key or sends a transaction, they only read the chain, the indexer and the docs:

```bash
cd scripts
npm install
npx tsx caps-009-011.ts   # each report's Re-run line names its script
```

Each one prints JSON with the block number and time it ran at. Our own runs from 2026-10-29 are in [`evidence/2910/`](evidence/2910), so you can compare. The block is read when the script finishes. Prices, funding and order slots on the chain keep moving, so a fresh run gives slightly different counts. When we re-ran all seven scripts at 20:04 UTC, every conclusion held: for example 002 still got IncorrectSender on all 34 orders, now split 24/10 instead of 27/7. That run is in [`evidence/2910-rerun/`](evidence/2910-rerun).

The other 13 reports (003, 006-008, 013, 014, 016-022) were re-checked against the chain on 2026-10-30; their script output is in [`evidence/3010/`](evidence/3010).
