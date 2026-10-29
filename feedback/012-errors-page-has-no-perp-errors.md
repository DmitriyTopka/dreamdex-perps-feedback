# The perps dev page sends you to the Errors page for "the full list of order errors", but that page has no perp errors. 120 errors the perp contracts can revert with are not named anywhere in the docs
Severity: major
Area: docs

## Steps to reproduce
Read-only, no key ([`scripts/errors-012.ts`](../scripts/errors-012.ts)):

```bash
cd scripts && npm install && npx tsx errors-012.ts > out.json
```

What it does:
1. Takes the 546 entries of `contractErrorsAbi` in @somnia-chain/markets-sdk 0.32.1.
2. Finds the three perp implementations for BTC-PERP from the chain (PerpPool behind its beacon, PerpStopOrderRegistry behind its beacon, MarginBank behind EIP-1967) and keeps the errors whose 4-byte selector is in their runtime bytecode.
3. Looks each name up on the Errors page (`/docs/developers/contracts/errors.md`) and in the whole docs dump (`/llms-full.txt`).

## Expected
https://app.testnet.dreamdex.io/docs/developers/perps-testnet, under "An IOC that fills nothing reverts": "The full list of order errors is on the Errors page."

The Errors page itself says: "This page maps every selector to its error so integrators can decode a revert instead of guessing."

So I expected a PerpPool / MarginBank / PerpStopOrderRegistry section there, like the spot one.

## Actual
The Errors page has four sections: Decoding a revert, SpotPool errors, SpotStopOrderRegistry errors, Preflight (HTTP API) reverts. Nothing for perps.

Run on 2026-10-29 15:55 UTC, block 36,361,271:

| | count |
|---|---|
| errors in the SDK table | 546 |
| of them, selector present in the perp bytecode | **156** (PerpPool 59, MarginBank 71, PerpStopOrderRegistry 51, some shared) |
| of the 156, listed on the Errors page | 34, all in the spot sections: 26 under "SpotPool errors", 8 under "SpotStopOrderRegistry errors" (shared ones like `IncorrectSender`, `InvalidPrice`, `TriggerTooCloseToEma`) |
| of the 156, named somewhere else in the docs | 2 (`InsufficientCollateral`, `IsolatedMarketBlocked`, both mentioned in passing on the "Perps on Testnet for Developers" page) |
| of the 156, **not named anywhere in the docs** | **120** (MarginBank 68, PerpPool 36, stop registry 32) |

156 is a floor. `MaxPositionSizeExceeded()` (0x714b36d6), `OpenInterestCapExceeded()` (0xd8ca61d6) and `InsufficientMarginForOrder()` (0x7ea61260) are in the SDK table but their selectors are not in these three bytecodes, so they are raised by some other contract the pool calls. The first one is mentioned on the dev page, the other two nowhere.

A lot of the 120 are admin or init errors a trader will never see (`InvalidInitialization`, `OwnableInvalidOwner`...). Those can stay out. But these ones a trader or a bot can hit, and none of them is in the docs:

| selector | error | contract |
|---|---|---|
| 0x50e929ad | `MarketSettled()` | PerpPool |
| 0xe114c921 | `SettlementWindowOpen()` | PerpPool |
| 0x08b9f95b | `OraclePriceStale()` | PerpPool |
| 0xfe9e1842 | `TakerFillWouldMintBadDebt()` | PerpPool |
| 0x806109d7 | `InsufficientMarginAtCreation()` | PerpStopOrderRegistry |
| 0x28e0a7ba | `RegistryNotApprovedByOwner()` | PerpStopOrderRegistry |
| 0x649b887d | `VoucherMarketNotAllowed()` | MarginBank |
| 0x702f620d | `VoucherAccountCannotBeMainFunded()` | MarginBank |
| 0x6485347d | `VoucherLeverageCapNotSet()` | MarginBank |
| 0xaaaa9911 | `CloseOutMarginExceedsBalance()` | MarginBank |
| 0x805a02c3 | `FundingRecipientInDebt()` | MarginBank |
| 0xd8ca61d6 | `OpenInterestCapExceeded()` | (not in these three, see above) |
| 0x7ea61260 | `InsufficientMarginForOrder()` | (not in these three, see above) |

Full list of all 156 with selector, contract and docs status is in the evidence file.

One I hit myself: `NoReducingPositionAtCreation()` (0xd156c90a) from the stop registry, when a reduce-only TP/SL is created with no position (report 018). It is in the SDK table and nowhere in the docs, so the bot just gets an unexplained revert.

**One small live thing.** I simulated a BTC-PERP `placeOrder` from our own test account (eth_call only, nothing sent) at 1x, 1,000x, 10,000x, 100,000x and 1,000,000x min size. Up to 1,000x it passes. From 10,000x it reverts with a plain string, `Error("ERC20: insufficient allowance")`. The dev page says the owner's own `placeOrder` fails with "ERC20: transfer amount exceeds balance" in that case. Close, but if you grep your logs for the docs string you won't find it.

## Suggested fix
Add a "Perps errors" part to the Errors page, three tables in the same format as the spot ones. A start:

```md
## PerpPool errors
| Selector | Error | Meaning / fix |
| `0x50e929ad` | `MarketSettled()` | ... |
| `0xe114c921` | `SettlementWindowOpen()` | ... |
| `0x08b9f95b` | `OraclePriceStale()` | ... |
| `0xfe9e1842` | `TakerFillWouldMintBadDebt()` | ... |
| `0xd8ca61d6` | `OpenInterestCapExceeded()` | ... |
| `0x714b36d6` | `MaxPositionSizeExceeded()` | Order takes the account past maxPositionSize, see getMaxPerpOrderSize |

## MarginBank errors
| `0x3a23d825` | `InsufficientCollateral()` | ... |
| `0x7ea61260` | `InsufficientMarginForOrder()` | ... |
| `0x649b887d` | `VoucherMarketNotAllowed()` | Paper USDso can't open this market |
| ... |

## PerpStopOrderRegistry errors
| `0x28e0a7ba` | `RegistryNotApprovedByOwner()` | Owner has not granted the stop registry, see Link a bot |
| `0x806109d7` | `InsufficientMarginAtCreation()` | ... |
| `0xaa4fc774` | `IsolatedMarketBlocked()` | Isolated account, other market |
```

The SDK already has the source for it. Its generated header says perp errors come from `indexer/abis/{PerpPool,MarginBank,PerpStopOrderRegistry}.json`. Also fix the "ERC20: transfer amount exceeds balance" line to the string the pool actually returns.

## Evidence
- [`evidence/2910/errors-012.json`](../evidence/2910/errors-012.json): block, time, implementation addresses (PerpPool `0x81F9EB88C95a52B4D3eA47A73ac394b8A547d443`, PerpStopOrderRegistry `0x8d7FcDfC6D043B0296Ccf84D82f9dbe2c701096E`, MarginBank `0x78c989c9c5cd2ed68b4486373c0e4b118c8f1d5c`), all 156 errors, the live eth_call results.
- The selectors the spot part of the Errors page lists are fine. I recomputed all 49 of them plus the 7 admin ones and the retired `AmendReplacementFailed` with keccak back on 2026-10-22, all match. The problem is only the missing perp part.
- About 546 vs 538: both are right. `contractErrorsAbi` has 546 entries and 538 unique names, because 8 entries are overloads of a name already in the list (for example `QuantityBelowMinimum()` 0x84c3adbe and `QuantityBelowMinimum(uint256,uint256)` 0xeaa68ceb). Some other reports use 538, we count entries.

## Environment
@somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), docs and llms-full.txt fetched 2026-10-29.
