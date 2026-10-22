# Cancelling a limit order leaves its attached TP/SL armed; the stops keep 0.30 STT locked and later act on an unrelated new position
Severity: normal
Area: app

## Steps to reproduce
1. app.testnet.dreamdex.io, BTC-PERP, no position. Order panel: Limit, Long, limit price 80,000, size 15 USDso (0.00018 BTC), tick TP/SL, TP 90,000, SL 70,000. Submit.
2. Open orders shows three rows: the Long 80,000 limit and two "Close Long" triggers (Above 90,000 / Below 70,000), all from one transaction.
3. Cancel only the limit order with its X.
4. Open any new long on BTC-PERP without TP/SL.

## Expected
The TP/SL were entered as part of the limit order, so cancelling the order cancels them too, as on most venues where attached TP/SL live and die with the parent order. At least the cancel should ask whether to keep them.

## Actual
- After step 1 the app arms both legs on chain straight away, linked, `intent: reduceOnly`, fixed size 0.00018 BTC, 0.15 STT each (tx 0xa116fb7e1de0b510d0c7bb949a579c37ce207242dd58eafef42c7c03432d3e1e, stop ids 5331109037302060423273 and 3431094397709976606826).
- After step 3 the toast says "Order cancelled", and both triggers stay in Open orders as "Close Long" with "No position". Owner STT was 14.55 with the triggers armed and came back to 14.85 only when they were finally cancelled (below), so the 0.30 STT stays locked meanwhile. The app shows a red banner: "2 triggers on markets with no open position. They will spend their STT fees if triggered, and would close a new position on that market."
- After step 4 the leftover triggers attach themselves to the new position. The Close position dialog for the new long says "After a confirmed full fill, 2 pending triggers are cancelled separately". So a position the trader opened without any TP/SL carries a stop-loss at 70,000 and a take-profit at 90,000 sized for a different, never-filled order. They would close 0.00018 BTC of it at those prices, and if they fire before any position exists they burn their 0.15 STT for nothing.

Timeline 2026-10-22 (UTC): limit + TP/SL placed 17:52:42; limit cancelled ~17:54 (both stops still listed in Open orders); new long opened ~17:55; position closed and both stops cancelled by the app at 17:55:54 (`cancelReason: Owner`); STT back to 14.85, unclaimed 0.

The banner shows the team knows the state exists. The trader still has to notice it and press "Cancel all" by hand, and it says nothing when a new position picks the stops up.

Suggested fix: cancel the attached legs in the same batch as the parent order cancel (the app already batches limit + stops into one transaction when placing); or prompt "also cancel its TP/SL?"; and do not show stops from a cancelled order as belonging to a new position.

## Evidence
Transaction and stop ids above; stop reads from `client.listPerpStopOrders({ account, pool })` and `client.getPerpStopOrders` (both legs `present`, `siblingOrderId` pointing at each other, `intent: reduceOnly`, `quantity 18000`, read at 17:52:59 with no position open); cancellation rows `cancelReason: Owner` at 17:55:54; banner and dialog text quoted.

## Environment
app.testnet.dreamdex.io (Perps, BTC-PERP), Chrome, owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21 (Safe smart account, app key 0xacad...8467), BTC stop registry 0x52e2ccebaec9332672c247e9a90aa3d61fb615ef, Hideki testnet (chain 50383), 2026-10-22.
