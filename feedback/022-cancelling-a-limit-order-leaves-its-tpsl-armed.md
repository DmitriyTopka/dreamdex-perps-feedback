# Cancelling a limit order leaves its attached TP/SL armed; the stops keep 0.30 STT locked and later act on an unrelated new position
Severity: normal

Area: app

## Steps to reproduce
In the app (app.testnet.dreamdex.io, Perps):
1. BTC-PERP, no position. Order panel: Limit, Long, limit price 80,000, size 15 USDso (0.00018 BTC), tick TP/SL, TP 90,000, SL 70,000. Submit.
2. Open orders shows three rows: the Long 80,000 limit and two "Close Long" triggers (Above 90,000 / Below 70,000), all from one transaction.
3. Cancel only the limit order with its X.
4. Open any new long on BTC-PERP without TP/SL.

On chain, no key, nothing sent ([`scripts/orphan-022.ts`](../scripts/orphan-022.ts)):

```bash
cd scripts && npm install && npx tsx orphan-022.ts > out.json
```

`ourCase` replays our 22 Oct run block by block from archive reads. `scan` looks for the same state on every account today.

## Expected
I entered the TP/SL as part of the limit order, so cancelling the order should cancel them too. That is what most venues do with attached TP/SL. At least the cancel should ask whether to keep them. The perps Orders page says TP/SL can be armed on a limit order before it fills (GTC or ALO). It says nothing about what happens to them if the order never fills.

## Actual
Reproduced in the app on 2026-10-22. Re-checked on chain today (2026-10-30 06:57 UTC, block 36,902,191), all values from archive reads:

| block (UTC) | what happened | limit order | TP + SL legs | position | owner STT |
|---|---|---|---|---|---|
| 30,395,381 (17:52:42) | limit + TP/SL placed in one tx `0xa116fb7e1de0b510d0c7bb949a579c37ce207242dd58eafef42c7c03432d3e1e` | live | live, 0.00018 BTC each | 0 | 14.85 to 14.55 |
| 30,396,575 (17:54:42) | I cancel the limit order, toast "Order cancelled" | gone | **still live** | 0 | 14.55 |
| 30,396,968 (17:55:21) | new long without TP/SL, tx `0x80bfd2d31c5264ed9aeec4c37a24245b791b6a82741a0238d409b08c11cdea22` | gone | **still live** | 0.13818 | 14.55 |
| 30,397,276 (17:55:52) | long closed, tx `0xc9a3f95a482403be3b9560051d494499c7a3b0bb8e4c46a38ff518c2dc1d6986` | gone | still live | 0 | 14.55 |
| 30,397,294 (17:55:54) | the app cancels both legs (`cancelReason: Owner`) | gone | gone | 0 | 14.85 |

The limit order was order 7692292278736890052724, buy 0.00018 at 80,000, never filled. The legs were TP 90,000 (id 5331109037302060423273) and SL 70,000 (id 3431094397709976606826), linked to each other, `reduceOnly`, 0.15 STT paid each. Unclaimed fees stayed 0 the whole time, so the 0.30 STT sat inside the registry until the cancel.

In the app, after step 3 both triggers stay in Open orders as "Close Long" with "No position". The app shows a red banner: "2 triggers on markets with no open position. They will spend their STT fees if triggered, and would close a new position on that market." After step 4 the Close position dialog for the new long says "After a confirmed full fill, 2 pending triggers are cancelled separately". So the app attaches the leftovers to the new position.

For the trader this means a position opened without any TP/SL carries a stop loss at 70,000 and a take profit at 90,000. Both are sized for an order that never filled: they would sell 0.00018 BTC of the 0.13818 long at those prices. If either fires before any position exists, it burns its 0.15 STT and places nothing. Meanwhile 0.30 STT is locked, about 2% of the 14.85 STT in our wallet. The banner shows the team knows this state exists. Still, the trader has to notice it and press "Cancel all" by hand, and nothing warns them when a new position picks the stops up.

Today the state is rare but real. Of 632 live reduce-only stops (this count is reduce-only stops only, taken a few minutes after the 659 pending stops of any kind in report 019), 289 were armed in the same tx as an order by the same owner on the same market. Their parents: 287 filled, 1 closed, 1 **cancelled without a fill**. That one belongs to another account: a take profit from a limit order cancelled unfilled on 29 Oct is still armed and now sits on an open long it was never attached to. If it fires, the SDK clamps it to the position, so it would close all of it. Details are in the evidence file.

## Suggested fix
1. App: cancel the attached legs in the same batch as the parent order. The app already batches limit + stops into one tx when placing, and the registry has `cancelPendingOrders(uint128[])`. The link is easy to find: the stop rows and the order row share owner, pool and placing `txHash` in the indexer. My script finds them that way.
2. If keeping them can be useful, ask on cancel: "Also cancel its TP/SL?"
3. Don't present stops from a cancelled order as belonging to a new position. Show them as orphans with their STT and one Cancel button.

## Evidence
- [`evidence/3010/orphan-022.json`](../evidence/3010/orphan-022.json): the snapshots above (plus one from the block before placement) (order liveness via `getOrderOnchain`, legs via the registry's `getPendingOrder`, position, owner STT, unclaimed), the fee per stop today (0.15 STT, `somiPaymentPerOrder`), and the scan with the other account's leftover leg.
- 22 Oct reads at 17:52:59 UTC with `client.listPerpStopOrders({ account, pool })` and `client.getPerpStopOrders`: both legs `present`, siblings pointing at each other, `intent: reduceOnly`, `quantity 18000`, no position open.
- Banner and dialog text quoted from the app on 22 Oct. I could not re-run the UI today.

Re-run: `cd scripts && npx tsx orphan-022.ts > ../evidence/3010/orphan-022.json` (about 1 minute, reads only).

## Environment
app.testnet.dreamdex.io (Perps, BTC-PERP), Chrome, owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21 (Safe smart account, app key 0xacad...8467), BTC stop registry 0x52e2ccebaec9332672c247e9a90aa3d61fb615ef, Hideki testnet (chain 50383), app run 2026-10-22. Chain re-check 2026-10-30 06:57 UTC with @somnia-chain/markets-sdk 0.32.1.
