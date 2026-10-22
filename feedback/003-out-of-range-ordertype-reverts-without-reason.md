# Out-of-range orderType or selfMatchingOption reverts with no error data, and the SDK does not check the range
Severity: normal
Area: SDK

## Steps to reproduce
1. On any perp pool (tested ETH-PERP), simulate `placeOrderFor` with a valid resting bid (minQuantity, price on tick).
2. Change only `orderType` to 4, 5, 9 or 255.
3. Change only `selfMatchingOption` to 2, 3 or 9.
4. Do the same through the SDK: `trader.placePerpOrder({ ..., orderType: 4 })`. The SDK types both fields as `number` and forwards them unchanged (`dist/orders.js` lines 1626-1627: `p.orderType ?? 0`, `p.selfMatchingOption ?? 0`).

## Expected
The SDK rejects values outside `ORDER_TYPE` (0-3) and `SELF_MATCHING_OPTION` (0-1) before sending, with a message naming the field. Every other bad input on this path already gets a named error (`InvalidPrice`, `InvalidQuantity`, `QuantityBelowMinimum`, `OrderAlreadyExpired`, `InvalidBuilder`, `BuilderFeeExceedsCap`).

## Actual
The call reverts with empty revert data, so viem shows only `execution reverted`. The Errors page says "A bare 0x revert with no selector is an out-of-gas or a low-level..." failure, which points the developer at gas, not at the enum. Results from one run:

```
OK   orderType 3 (PostOnly)
ERR  orderType 4   -> execution reverted
ERR  orderType 5   -> execution reverted
ERR  orderType 9   -> execution reverted
ERR  orderType 255 -> execution reverted
OK   selfMatchingOption 1
ERR  selfMatchingOption 2 -> execution reverted
ERR  selfMatchingOption 3 -> execution reverted
ERR  selfMatchingOption 9 -> execution reverted
```

## Evidence
eth_call simulations against ETH-PERP pool 0xd6cb1dd58580b84d76068ac21594219ce03aeddf on 2026-10-22, owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21 via linked operator 0x13f05c8e15cC0d7d3abff02C144fb74778018a55, gas limit 10,000,000. The same calls with orderType 0-3 and selfMatchingOption 0-1 return named results or named errors.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem, Hideki testnet (chain 50383).
