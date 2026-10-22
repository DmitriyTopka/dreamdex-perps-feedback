# dreamDEX Perps Builder Bounty: feedback

Bug and documentation reports for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) on Somnia Tokyo testnet (Hideki, chain 50383).

One issue per file in [`feedback/`](feedback), in the format the bounty asks for: title, severity, area, steps to reproduce, expected, actual, evidence, environment.

| # | Title | Severity | Area |
|---|---|---|---|
| 001 | [perp:doctor rounds prices to 2 decimals, ignoring tick size](feedback/001-perp-doctor-rounds-prices-to-2-decimals.md) | normal | SDK |
| 002 | [Cancelling an order that is gone reverts IncorrectSender with another trader's address](feedback/002-stale-cancel-reverts-incorrectsender-with-another-traders-address.md) | normal | contracts |
| 003 | [Out-of-range orderType or selfMatchingOption reverts with no error data](feedback/003-out-of-range-ordertype-reverts-without-reason.md) | normal | SDK |
| 004 | [Perps testnet docs understate placeOrderFor gas and STT cost](feedback/004-docs-understate-perp-order-gas-and-stt-cost.md) | normal | docs |
| 005 | [Funding docs omit the interest term: longs pay below the index](feedback/005-funding-docs-omit-interest-component-longs-pay-below-index.md) | normal | docs |
| 006 | [Mark price sits below the oracle on 19 of 21 markets; mark formula undocumented](feedback/006-mark-price-sits-below-oracle-on-19-of-21-markets.md) | major | contracts |
| 007 | [perp-starter sets TP/SL from the mark, not the entry price](feedback/007-perp-starter-sets-tp-sl-from-mark-not-entry.md) | normal | SDK |
| 008 | [perp-guard silently skips the reduce stage on small positions](feedback/008-perp-guard-silently-skips-reduce-on-small-positions.md) | normal | SDK |
| 009 | [Docs: position cap is a tenth of OI on most markets; true on 1 of 21](feedback/009-docs-position-cap-tenth-of-oi-holds-on-1-of-21-markets.md) | normal | docs |
| 011 | [Market table "Open interest cap" is 1/4 of the on-chain cap on 16 markets and 1/2 on 4; XRP already trades above the documented cap](feedback/011-docs-oi-cap-column-is-quarter-of-onchain-cap.md) | normal | docs |
| 012 | [Developer docs send perp builders to the Errors page for "the full list of order errors", but it has no perp errors at all](feedback/012-errors-page-has-no-perp-errors.md) | normal | docs |
| 013 | [SDK type docs say LiquidationFee "is not in the deployed implementation" and no rows exist; the indexer returns 968 rows emitted by the live LiquidationEngine](feedback/013-sdk-says-no-liquidationfee-rows-but-968-exist.md) | normal | SDK |
| 014 | [Perps market table lists min size but not lot size; e.g. 125 DOGE is above the documented minimum and still reverts InvalidQuantity](feedback/014-market-table-omits-lot-size.md) | normal | docs |
| 015 | [placePerpStopOrder throws NotConfiguredError with the bundled Hideki addresses, although the registry is readable from the pool](feedback/015-perp-stop-order-throws-without-operator-registry.md) | normal | SDK |
| 016 | [perp-maker says "Re-quotes next cycle" after PostOnlyWouldCross but never retries the skipped leg while the mark is still; on BTC it quotes one side only](feedback/016-perp-maker-never-retries-a-skipped-post-only-leg.md) | normal | SDK |
| 017 | [perp-funding's default 10% entry threshold sits under the fixed 10.95% interest floor: it opens on 20 of 21 markets and its exit can never fire on 17](feedback/017-perp-funding-default-threshold-sits-under-the-interest-floor.md) | normal | SDK |
| 018 | [Reduce-only perp stop reverts NoReducingPositionAtCreation without a position; undocumented, and the operator grant is already sent](feedback/018-reduce-only-stop-needs-a-position-undocumented-grant-sent-first.md) | normal | SDK |
| 019 | [TP/SL set as "Entire" stores a fixed size; after adding to the position the app still says "Entire", the stop-loss closes only the original part and the shown loss is half the real one](feedback/019-entire-tpsl-covers-only-the-size-at-creation.md) | major | app |
| 020 | [When one leg of a linked TP/SL fills, the other leg's 0.15 STT is only credited to unclaimedSomi; SDK pair docs and the bot kit say refunded, and the kit never claims it](feedback/020-linked-leg-fee-is-credited-not-refunded-sdk-and-kit-say-refunded.md) | normal | SDK |
| 021 | [The TP/SL dialog rounds the position size to 4 decimals: 0.00018 BTC shows as 0.0002, 0.00036 as 0.0004](feedback/021-tpsl-dialog-rounds-position-size-to-4-decimals.md) | normal | app |
| 022 | [Cancelling a limit order leaves its attached TP/SL armed; the stops keep 0.30 STT locked and later act on an unrelated new position](feedback/022-cancelling-a-limit-order-leaves-its-tpsl-armed.md) | normal | app |

Test account on Hideki: owner `0x84326A92162Ece92ed257A31073fDd3a6599BF21`, linked trading key `0x13f05c8e15cC0d7d3abff02C144fb74778018a55`. One further item was reported privately to security@dreamdex.io on 2026-10-22, as the bounty rules ask.

Every transaction hash in the reports can be checked on the Hideki RPC or explorer.
