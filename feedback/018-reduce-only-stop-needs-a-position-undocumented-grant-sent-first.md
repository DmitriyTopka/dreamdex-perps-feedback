# A reduce-only perp stop reverts NoReducingPositionAtCreation when the owner has no position; no doc says so, and placePerpStopOrder has already sent the operator grant by then
Severity: normal
Area: SDK

## Steps to reproduce
1. An account with STT for gas, no open position and no resting order on BTC-PERP, not yet operator-approved for the BTC stop registry.
2. `trader.placePerpStopOrder({ registry: btc.stopRegistry, pool: btc.poolAddress, operatorRegistry, isBid: false, quantity: 0n, triggerPrice: 150000e18, triggerOperator: 0, stopOrderType: 1, intent: "reduceOnly", pair: { isBid: false, quantity: 0n, triggerPrice: 40000e18, triggerOperator: 1, stopOrderType: 1 } })`, i.e. the bracket from the docs and from the bot kit's `armBracket`.

## Expected
Either the docs say when a reduce-only stop can be created, or the SDK checks that before it sends anything. The SDK comment in `dist/perp/stops.js` says the call is "encoded (and validated) before the grant is sent, so bad input fails without having moved anything on chain".

## Actual
1. The create reverts with `NoReducingPositionAtCreation()`. That error is in `contractErrorsAbi` and nowhere else: not in `PlacePerpStopOrderParams` (which only says reduce-only is the default), not in docs/PERPS.md, not in the bot kit's `stops.ts` or docs/perps.md, and the app's Errors page has no perp errors at all (report 012). A bot that arms a bracket before it sends its entry, or one that re-arms after a close, gets an unexplained revert.
2. By then `placePerpStopOrder` has already sent `setOperatorApprovalGlobal` (it checks `isOperatorAuthorized` and grants if false, before the create). The grant stays on chain and its gas is spent although no stop was created. The "validated before the grant" comment covers argument encoding, not this state check, which the SDK could read first (`getPerpPosition`) or simulate.

Live run on Hideki, 2026-10-22 16:23 UTC, account 0x13f05c8e15cC0d7d3abff02C144fb74778018a55 (no perp position):

```
signer 0x13f05c8e15cC0d7d3abff02C144fb74778018a55 registry 0x52e2ccebaec9332672c247e9a90aa3d61fb615ef somi/leg 0.15
[2026-10-22T16:23:45.323Z] start: STT 4.899472166
ARM failed ContractRevertError: @somnia-chain/markets-sdk: createLinkedPendingOrders reverted: NoReducingPositionAtCreation()
[2026-10-22T16:23:47.840Z] after failed arm: STT 4.896490166
```

Right after: `pool.isOperatorAuthorized(account, stopRegistry, 0x80054449)` returns `true`, so the grant went through. 0.00298 STT spent, no stop exists, no SOMI locked.

Note on the exact rule: the registry is not checking for a position only. The app itself creates a linked reduce-only pair for an account with no position when a limit order is placed in the same transaction (tx 0xa116fb7e1de0b510d0c7bb949a579c37ce207242dd58eafef42c7c03432d3e1e, see report 022). So the condition appears to be "a position or a resting order", which is exactly why it needs to be written down rather than guessed.

Suggested fix: document the requirement next to `intent` in `PlacePerpStopOrderParams` and in PERPS.md; in the SDK, read the position (or simulate the create) before sending the grant for a reduce-only placement and throw a named error instead.

## Evidence
Log above; `isOperatorAuthorized` read afterwards on pool 0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0.

## Environment
@somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), 2026-10-22.
