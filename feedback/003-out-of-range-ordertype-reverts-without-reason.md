# Out-of-range orderType or selfMatchingOption reverts with no error data, and the SDK does not check the range
Severity: normal

Area: SDK

## Steps to reproduce
Read-only, eth_call only, no key ([`scripts/ordertype-003.ts`](../scripts/ordertype-003.ts)):

```bash
cd scripts && npm install && npx tsx ordertype-003.ts > out.json
```

On ETH-PERP it takes a resting bid 10% under the mark at min size and changes one field at a time: `orderType` 0, 1, 2, 3, 4, 5, 9, 255 and `selfMatchingOption` 0, 1, 2, 3, 9. For each value it:
1. asks the SDK to encode the order with `trader.buildPlacePerpOrder` (fresh random key, nothing signed),
2. simulates that exact calldata as `placeOrder` from our test account, which holds margin,
3. simulates the same order as `placeOrderFor` from our linked bot key.

Then it does the same with a few other bad inputs (size below the lot, price off tick, past expiry, unapproved builder, fee above cap, price 0, size 0) to see which ones the pool names. Last, it passes the blank revert through the SDK's exported `decodeRevert` to show the message a developer gets.

## Expected
The SDK defines both ranges itself: `ORDER_TYPE` is 0-3 (`dist/trade.d.ts:380`) and `SELF_MATCHING_OPTION` is 0-1 (`dist/trade.d.ts:779`). I expected `placePerpOrder` and `buildPlacePerpOrder` to refuse anything else with a message naming the field, the way they already refuse `price` or `quantity` of 0 ("price and quantity must be > 0", `dist/orders.js:1611-1612`).

Failing that, I expected the pool to name the problem. It names every other bad input I tried.

## Actual
Simulated 2026-10-30 06:56 UTC, block 36,901,348. The SDK builds every value without complaint, and the pool answers like this (owner `placeOrder` and bot `placeOrderFor` agree on every row):

| value | SDK build | pool |
|---|---|---|
| orderType 0 | builds | passes |
| orderType 1 | builds | `FillOrKillNotFillable()` |
| orderType 2 | builds | `ImmediateOrCancelNoFill()` |
| orderType 3 | builds | passes |
| orderType 4, 5, 9, 255 | builds | **reverts, empty revert data** |
| selfMatchingOption 0, 1 | builds | passes |
| selfMatchingOption 2, 3, 9 | builds | **reverts, empty revert data** |

Every other bad input gets a name: `InvalidQuantity` (below the lot), `InvalidPrice` (off tick), `OrderAlreadyExpired`, `BuilderFeeExceedsApproval`, `BuilderFeeExceedsCap`, and on the raw call `InvalidPrice(0, ...)` and `QuantityBelowMinimum(0, ...)`. Only the two enums come back blank.

Why it's blank, as far as I can tell: the ABI has both fields as `uint8`, so any byte encodes, and the pool's Solidity enum check fails while it decodes the arguments. That kind of failure reverts with no data at all. So the contract can't easily name it, and the SDK is the only place that can.

Where the SDK passes it through: `perpOrderCall` in `dist/orders.js:1626-1627` writes `p.orderType ?? 0` and `p.selfMatchingOption ?? 0` straight into the args. `PlacePerpOrderParams` types both as plain `number` (`dist/trade.d.ts:744` and `749`). The JSDoc on `orderType` there also says only "0 limit (default) or 2 market (IOC)", though 1 and 3 work on perps too.

What a bot or developer gets out of it:
- With a private key the SDK signs with a fixed 10,000,000 gas and broadcasts without simulating (`dist/executor/local.js:2-3`). So a typo like `orderType: 4` lands on chain as a reverted tx and the gas is spent.
- The SDK then replays the call at the receipt's block to find the reason (`dist/writer.js:214-235`) and runs the result through its own `decodeRevert`. The script feeds that decoder the blank revert of `orderType: 4` and gets: "@somnia-chain/markets-sdk: placeOrder reverted: for an unknown reason." No field name, no hint.
- The Errors page tells you what a blank revert means: "A bare `0x` revert with no selector is an out-of-gas or a low-level `call` failure - re-check the gas limit". So the developer goes and raises the gas limit, which can't help.

No funds at risk. It's lost gas and a debugging session spent on the wrong cause.

## Suggested fix
1. In `perpOrderCall` (and the spot and amend paths that build the same `PlaceOrderRequest`), throw `InvalidInputError` before encoding when `orderType` is not in 0-3 or `selfMatchingOption` is not in 0-1, e.g. "orderType must be one of ORDER_TYPE (0-3), got 4".
2. Type the fields as `0 | 1 | 2 | 3` and `0 | 1` (or as `typeof ORDER_TYPE[keyof typeof ORDER_TYPE]`) so TypeScript users see the mistake at compile time.
3. Fix the `orderType` JSDoc on `PlacePerpOrderParams` to list all four values.
4. On the Errors page, add one line to the bare `0x` note: an out-of-range enum argument (`orderType`, `selfMatchingOption`) also reverts with no data.

## Evidence
- [`evidence/3010/ordertype-003.json`](../evidence/3010/ordertype-003.json): block, pool, the order, every row with the SDK result, the owner `placeOrder` result and the bot `placeOrderFor` result, and the `decodeRevert` message.
- First seen 2026-10-22 with `placeOrderFor` from the bot key, same values, same blank reverts. Re-checked today with the SDK's own encoder added.
- Errors page quote checked on the live page today (`/docs/developers/contracts/errors.md`).
- Re-run: `cd scripts && npx tsx ordertype-003.ts > ../evidence/3010/ordertype-003.json`

## Environment
@somnia-chain/markets-sdk 0.32.1, viem 2.57.10, Hideki testnet (chain 50383), ETH-PERP pool 0xd6cb1dd58580b84d76068ac21594219ce03aeddf, owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21, bot key 0x13f05c8e15cC0d7d3abff02C144fb74778018a55.
