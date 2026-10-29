# Cancelling a filled or cancelled perp order reverts IncorrectSender and names another trader as the owner. Docs say it should be OrderIdMismatch, which the perp pool can't even return
Severity: normal
Area: contracts

## Steps to reproduce
Read-only, eth_call only, no key ([`scripts/cancel-002.ts`](../scripts/cancel-002.ts)):

```bash
cd scripts && npm install && npx tsx cancel-002.ts > out.json
```

It takes every finished order of our test account from the indexer (34: 26 Filled, 8 Cancelled, on BTC, ETH and ZRO perps) and simulates at one block:
- `cancelOrderFor(owner, id)` from our linked bot key,
- `cancelOrder(id)` from the owner itself (so it's not an operator link problem),
- `reduceOrderFor(owner, id, 1)` from the bot key,
- plus `cancelOrderFor` / `cancelOrder` with id 999999999 that never existed.

Each revert is decoded with the SDK's `contractErrorsAbi`.

## Expected
The docs are clear about this case.

Functions page, `cancelOrder`, "Reverts":
- "`OrderIdMismatch` (`0x71fa8de6`) - the slot no longer holds that `OrderId`. The order is already in a terminal state (filled, cancelled, or expired-and-reused) - there is nothing to cancel."
- "`IncorrectSender` (`0xf5e39c1f`) - the caller does not own the order."

Errors page says the same for `OrderIdMismatch` and adds "Re-read state with getOrder / getOwnOpenOrders before cancelling".

And for amend the docs even say why the two must differ: `AmendOldOrderGone` is "Kept distinct from `IncorrectSender` so a maker racing a fill can branch to a re-quote."

## Actual
Simulated 2026-10-29 16:06 UTC, block 36,367,582. **All 34 finished orders, all three calls, same answer:**

| call | result |
|---|---|
| `cancelOrderFor` from the bot key | `IncorrectSender(our account, other trader)` 27, `IncorrectSender(our account, 0x0)` 7 |
| `cancelOrder` from the owner | same 27 / 7 |
| `reduceOrderFor` from the bot key | same 27 / 7 |
| id 999999999, both calls | `IncorrectSender(our account, 0x0)` |

`OrderIdMismatch` came back zero times. And I don't think it can: its selector 0x71fa8de6 is not in the PerpPool implementation bytecode at all (`0x81F9EB88C95a52B4D3eA47A73ac394b8A547d443`, checked for report 012), while `IncorrectSender` and `IncorrectOrder` are.

The 27 "expected" addresses are 10 different accounts, none of them ours, for example `0x2e5e7F9Bd71aa5F51e25D7aa3bB42c1693951EEe` and `0xD511cAA0C74a3BF36E2dd205184f5BBa07D7Bf2A`. `getOrderOnchain` returns null for all 34, so the SDK itself knows these orders are gone.

Example, BTC-PERP, Filled order `0x338000000000077312c` (placed in tx `0x7d2a45db9a04fa22992459665e5110232e40b8fdf66d4bb5743813bd9d897f48`): the owner's own `cancelOrder` reverts `IncorrectSender(0x8432...BF21, 0x2e5e...1EEe)`.

How it looks like it works: the high bits of the id (`id >> 64`) are a storage slot, the low bits a sequence. When our order finishes, someone else's new order takes the slot. The pool checks the slot's owner first, so we get "you are not the owner, 0x2e5e... is". Back on 2026-10-22 one of our ZRO slots was re-taken by our own next order and the stale cancel then gave `IncorrectOrder()`. Today those ZRO slots belong to other traders, so it's `IncorrectSender` there too. Either way the stale id can't touch the wrong order. No funds at risk, the problem is the error.

Why it matters:
- A bot that retries a cancel after a fill gets "your operator link is broken" and a stranger's address. The obvious reaction is to re-link the bot or stop, not "order is done, move on".
- The owner gets the same error from its own wallet, so "Caller is not the order owner" is just wrong for them.
- It leaks which account now has an order in that slot. Not secret on a public chain, but weird to show in an error.
- The kit's `cancelQuietly` swallows it, so you only see this calling the pool or the SDK directly.

## Suggested fix
In cancel/reduce, check the stored id first: if the slot's current order id is not the one passed in (or the slot is empty), revert `OrderIdMismatch()` before the owner check, the way the docs already describe. Then `IncorrectSender` only means "live order, not yours".

If the contract can't change soon, fix the docs instead: say that on perp pools a finished or unknown id comes back as `IncorrectSender(caller, someoneElse or 0x0)`, and that a bot should call `getOrderOnchain` first (null means nothing to cancel).

## Evidence
- [`evidence/2910/cancel-002.json`](../evidence/2910/cancel-002.json): all 34 orders with market, status, id, slot, placing tx, the three results and `getOrderOnchain`, plus the never-existed id.
- 2026-10-22 run (same picture, fewer orders): ETH-PERP place `0x67560ff046381b20c127afa883dcab70aecdffc8d696784f21be7dd899d4eb09`, cancel `0x85701358f548fed18a5a32a764b3071d0e00cce84743dde6dd82d9e786c3fcfc`, second cancel named `0x6C2986A550DC4212b49a1710d8466553E3761ce4` (a busy account, about 773k txs). ZRO same-owner reuse: place A `0x8de658f97e5cc6584d3083e41bca93ed31be91c750cd9e3ec2ec0804e5a0ed44`, cancel A `0xdf3815c11f0c90e7953ff95ee407073f92b8c66365869c3867fa1d9976474a44`, place B `0x9d6586aa3bdea5ce422832d596ed04a3835b31ceace5c45c8b2f74b297f7dad0`, stale cancel of A gave `IncorrectOrder()`.
- Owner `0x84326A92162Ece92ed257A31073fDd3a6599BF21`, bot key `0x13f05c8e15cC0d7d3abff02C144fb74778018a55` (linked with Link a bot).

## Environment
@somnia-chain/markets-sdk 0.32.1 (`contractErrorsAbi`, `getOrders`, `getOrderOnchain`), viem 2.57.10, Hideki testnet (chain 50383).
