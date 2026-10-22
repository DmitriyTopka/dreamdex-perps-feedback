# Developer docs send perp builders to the Errors page for "the full list of order errors", but it has no perp errors at all
Severity: normal
Area: docs

## Steps to reproduce
1. Open https://app.testnet.dreamdex.io/docs/developers/perps-testnet. Under "An IOC that fills nothing reverts" it says: "The full list of order errors is on the Errors page." The same page names three perp-only errors: `InsufficientCollateral() (0x3a23d825)`, `MaxPositionSizeExceeded() (0x714b36d6)` and `IsolatedMarketBlocked`.
2. Open https://app.testnet.dreamdex.io/docs/developers/contracts/errors.
3. Search the page body for any perp error.

## Expected
A PerpPool / MarginBank section with the errors a perp order can hit, in the same selector table format the spot section uses.

## Actual
The Errors page has only two sections: "SpotPool errors" and "SpotStopOrderRegistry errors". Outside the sidebar navigation the words "perp", "MarginBank", "MaxPositionSize", "IsolatedMarket", "InsufficientCollateral" and "Voucher" do not appear anywhere on it (grep count on the extracted text: 2, both are the sidebar link "Perps (Testnet)").

The SDK knows these errors. `contractErrorsAbi` in @somnia-chain/markets-sdk 0.32.1 has 546 entries, including these perp ones that a perp trader or bot can hit (selector computed with viem `toFunctionSelector` from the SDK ABI entry):

| selector | error | documented where |
|---|---|---|
| 0x3a23d825 | InsufficientCollateral() | only as a side note on the developer page |
| 0x714b36d6 | MaxPositionSizeExceeded() | only as a side note on the developer page |
| 0xaa4fc774 | IsolatedMarketBlocked() | name only, no selector |
| 0xd8ca61d6 | OpenInterestCapExceeded() | nowhere |
| 0x7ea61260 | InsufficientMarginForOrder() | nowhere |
| 0x649b887d | VoucherMarketNotAllowed() | nowhere |
| 0xe1ab8175 | VoucherAccountLeverageLocked() | nowhere |
| 0x4dd4646a | ReduceOnlyBudgetExceeded() | nowhere |
| 0x7fd13972 | InvalidLeverage() | nowhere |
| 0x19abf40e | StalePrice() | nowhere |
| 0x08b9f95b | OraclePriceStale() | nowhere |

A developer who calls the pools directly (the developer page itself shows raw `placeOrderFor`) and gets 0xd8ca61d6 or 0x649b887d back has no page to look it up on. The Errors page also says "This page maps every selector to its error so integrators can decode a revert instead of guessing", which is not true for perps.

For completeness: all 49 selectors that the Errors page does list, plus the 7 admin selectors and the retired AmendReplacementFailed, were recomputed with keccak and all match. The problem is only the missing perp section.

## Evidence
- Docs text extracted from the server-rendered HTML of both pages on 2026-10-22.
- SDK script (read-only):
```ts
import { contractErrorsAbi } from "@somnia-chain/markets-sdk"
import { toFunctionSelector } from "viem"
for (const e of contractErrorsAbi) if (want.includes(e.name))
  console.log(toFunctionSelector(`function ${e.name}(${e.inputs.map(i => i.type).join(",")})`), e.name)
```
Output:
```
total errors in contractErrorsAbi: 546
0x3a23d825 InsufficientCollateral()
0x7ea61260 InsufficientMarginForOrder()
0x7fd13972 InvalidLeverage()
0xaa4fc774 IsolatedMarketBlocked()
0x714b36d6 MaxPositionSizeExceeded()
0xd8ca61d6 OpenInterestCapExceeded()
0x08b9f95b OraclePriceStale()
0x4dd4646a ReduceOnlyBudgetExceeded()
0x19abf40e StalePrice()
0xe1ab8175 VoucherAccountLeverageLocked()
0x649b887d VoucherMarketNotAllowed()
```
- The SDK's own generated header says perp errors come from "indexer/abis/{PerpPool,MarginBank,PerpStopOrderRegistry}.json", so the source for a docs table already exists.

## Environment
@somnia-chain/markets-sdk 0.32.1 (dist/contractErrorsAbi.js), docs at app.testnet.dreamdex.io fetched 2026-10-22, Hideki testnet (chain 50383).
