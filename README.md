# dreamDEX Perps Builder Bounty: feedback

Bug and documentation reports for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) on Somnia Tokyo testnet (Hideki, chain 50383).

One issue per file in [`feedback/`](feedback), in the format the bounty asks for: title, severity, area, steps to reproduce, expected, actual, evidence, environment.

| # | Title | Severity | Area |
|---|---|---|---|
| 001 | [perp:doctor rounds prices to 2 decimals, ignoring tick size](feedback/001-perp-doctor-rounds-prices-to-2-decimals.md) | normal | SDK |
| 002 | [Cancelling an order that is gone reverts IncorrectSender with another trader's address](feedback/002-stale-cancel-reverts-incorrectsender-with-another-traders-address.md) | normal | contracts |
| 003 | [Out-of-range orderType or selfMatchingOption reverts with no error data](feedback/003-out-of-range-ordertype-reverts-without-reason.md) | normal | SDK |

Test account on Hideki: owner `0x84326A92162Ece92ed257A31073fDd3a6599BF21`, linked trading key `0x13f05c8e15cC0d7d3abff02C144fb74778018a55`. Every transaction hash in the reports can be checked on the Hideki RPC or explorer.
