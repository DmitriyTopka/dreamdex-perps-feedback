# dreamDEX Perps Builder Bounty: feedback

Bug and documentation reports for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) on Somnia Tokyo testnet (Hideki, chain 50383).

One issue per file in [`feedback/`](feedback), in the format the bounty asks for: title, severity, area, steps to reproduce, expected, actual, evidence, environment. Most reports also have a suggested fix before the evidence.

| # | Title | Severity | Area |
|---|---|---|---|
| 001 | [perp:doctor prints every price of 1 or more with 2 decimals, so on XRP a 43-tick spread shows as bid=1.31 ask=1.31](feedback/001-perp-doctor-rounds-prices-to-2-decimals.md) | normal | bot kit |
| 002 | [Cancelling a finished perp order reverts IncorrectSender with another trader's address instead of the documented OrderIdMismatch](feedback/002-stale-cancel-reverts-incorrectsender-with-another-traders-address.md) | normal | contracts |
| 003 | [Out-of-range orderType or selfMatchingOption reverts with no error data, and the SDK does not check the range](feedback/003-out-of-range-ordertype-reverts-without-reason.md) | normal | SDK |
| 004 | [Perps developer docs put a perp tx at 0.0003-0.003 STT, but their own 1.56M gas figure costs 0.0094 STT and our placements cost up to 0.014 STT](feedback/004-docs-understate-perp-order-gas-and-stt-cost.md) | normal | docs |
| 005 | [Funding docs say shorts pay when the perp is below the index; in 3,405 of 3,662 recent settlements with mark below index, longs paid](feedback/005-funding-docs-omit-interest-component-longs-pay-below-index.md) | major | docs |
| 006 | [Perp mark sits below the oracle index in 3,632 of 4,200 settlements (21 markets, 8 days), even while the index falls; the docs never say how the mark is built](feedback/006-mark-price-sits-below-oracle-on-19-of-21-markets.md) | major | contracts |
| 007 | [perp-starter swaps take-profit and stop-loss on a short, and measures both from the mark instead of the entry](feedback/007-perp-starter-sets-tp-sl-from-mark-not-entry.md) | major | bot kit |
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

## Re-running the checks

Every report except 010 (sent privately) comes with a read-only script in [`scripts/`](scripts). None of them needs a key or sends a transaction, they only read the chain, the indexer and the docs:

```bash
cd scripts
npm install
npx tsx caps-009-011.ts   # each report's Re-run line names its script
```

Each one prints JSON with the block number and time it ran at. Our own runs from 2026-10-29 are in [`evidence/2910/`](evidence/2910), so you can compare. The block is read when the script finishes. Prices, funding and order slots on the chain keep moving, so a fresh run gives slightly different counts. When we re-ran all seven scripts at 20:04 UTC, every conclusion held: for example 002 still got IncorrectSender on all 34 orders, now split 24/10 instead of 27/7. That run is in [`evidence/2910-rerun/`](evidence/2910-rerun).

The other 13 reports (003, 006-008, 013, 014, 016-022) were re-checked against the chain on 2026-10-30; their script output is in [`evidence/3010/`](evidence/3010).
