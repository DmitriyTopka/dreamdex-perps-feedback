# Cancelling an order that is gone reverts IncorrectSender and names another trader as the owner
Severity: normal
Area: contracts

## Steps to reproduce
1. Link a trading key to an account (Link a bot, Perps) on Hideki testnet.
2. On ETH-PERP, `placeOrderFor` a small PostOnly bid far below the mark. Note the orderId.
3. `cancelOrderFor(owner, orderId)`. It succeeds.
4. Simulate `cancelOrderFor(owner, orderId)` again, or `reduceOrderFor(owner, orderId, q)`.
5. Also simulate `cancelOrderFor(owner, 999999999)` (an id that never existed).

## Expected
A "no such order" style error, for example `IncorrectOrder()`, which the pool already uses when the slot holds a newer order of the same owner.

## Actual
- Step 4 reverts `IncorrectSender(sender=<our account>, expected=0x6C2986A550DC4212b49a1710d8466553E3761ce4)`. That address is not ours. It is a busy EOA (about 773k transactions), most likely a market maker whose new order took the freed storage slot. The orderId's high bits look like a slot index (`id >> 64`) and the low bits like a sequence number, and the owner of the slot is checked before the sequence.
- Step 5 reverts `IncorrectSender(<our account>, 0x0000000000000000000000000000000000000000)`.
- When the slot is re-taken by an order of the SAME owner, the pool answers `IncorrectOrder()` (checked on ZRO-PERP, see evidence), so the stale id cannot cancel the wrong order. The problem is the error, not funds.

Why it matters: the Errors page lists only two causes for `IncorrectSender` ("an eth_call sent without from, or placeOrderFor/cancelOrderFor from an unauthorized operator"). A bot that retries a cancel after a fill gets told its operator link is broken and shown a stranger's address. The bot kit's `cancelQuietly` hides the message, so the confusion lands on anyone calling the pool directly.

## Evidence
Hideki testnet, 2026-10-22, owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21, operator 0x13f05c8e15cC0d7d3abff02C144fb74778018a55.
- ETH-PERP pool 0xd6cb1dd58580b84d76068ac21594219ce03aeddf
  - place 0x67560ff046381b20c127afa883dcab70aecdffc8d696784f21be7dd899d4eb09 (orderId 0x600000000007cd93f)
  - cancel 0x85701358f548fed18a5a32a764b3071d0e00cce84743dde6dd82d9e786c3fcfc
  - second cancel (eth_call) -> IncorrectSender(owner, 0x6C29...1ce4)
- ZRO-PERP pool 0x2a1822b02039ddf0e293f3f7243673fc03eaf16c (same-owner slot reuse)
  - place A 0x8de658f97e5cc6584d3083e41bca93ed31be91c750cd9e3ec2ec0804e5a0ed44 (id 0x40000000000061041, slot 4)
  - cancel A 0xdf3815c11f0c90e7953ff95ee407073f92b8c66365869c3867fa1d9976474a44
  - place B 0x9d6586aa3bdea5ce422832d596ed04a3835b31ceace5c45c8b2f74b297f7dad0 (id 0x40000000000061044, slot 4)
  - stale cancel/reduce of A (eth_call) -> IncorrectOrder()

## Environment
@somnia-chain/markets-sdk 0.32.1 (contractErrorsAbi for decoding), viem simulateContract, network Hideki testnet (chain 50383), operator key linked via the app.
