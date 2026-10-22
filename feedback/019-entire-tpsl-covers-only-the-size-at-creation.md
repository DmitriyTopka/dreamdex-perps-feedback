# TP/SL set as "Entire" stores a fixed size; after adding to the position the app still says "Entire", but the stop-loss would close only the original part and the shown loss is understated
Severity: major
Area: app

## Steps to reproduce
1. app.testnet.dreamdex.io, BTC-PERP, Cross 20x. Market Long 15 USDso (0.00018 BTC).
2. Positions row, Set TP/SL, mode **Entire**: take profit 90,000, stop loss 70,000, Set TP / SL. The dialog says "These two will be linked".
3. Market Long another 15 USDso. The position is now 0.00036 BTC.
4. Open Manage TP/SL again.

## Expected
"Entire" means the whole position, as the SDK has a value for exactly that: `quantity: 0n` is "the whole position at trigger" (`PerpStopOrderOnChain.quantity` in the SDK types). After step 3 a stop-loss labelled "Entire" should close 0.00036 BTC, and the estimates should be for 0.00036 BTC. If the app stores a fixed size instead, it should say so after the position grows.

## Actual
The app stores the size at the moment of creation, 0.00018 BTC, in both legs, and keeps showing them as "Entire":

- the dialog shows Size 0.0004 BTC, **Entire** selected, Estimated profit +1.51 USDso and Estimated loss -2.09 USDso (screenshot [../evidence/019-entire-tpsl-after-adding.png](../evidence/019-entire-tpsl-after-adding.png));
- those estimates are for half the position: 0.00018 × (90,000 - 81,596.1) = 1.51 and 0.00018 × (81,596.1 - 70,000) = 2.09. For the real 0.00036 BTC they are 3.03 and 4.17;
- the positions row shows "90,000 / 70,000" with no hint that the stops are partial;
- on chain both legs read `quantity = 18000` (0.00018 BTC) after the second buy.

If BTC hits 70,000, the stop-loss closes 0.00018 BTC and leaves 0.00018 BTC open with no stop, while the trader was told the entire position was protected and the loss would be 2.09. At higher leverage the unprotected half can run into liquidation. Adding to a winning or losing position is common, so this is not an edge case.

On-chain reads (`client.getPerpStopOrders`, BTC stop registry 0x52e2...15ef), taken after the second buy at 2026-10-22 16:37:26 UTC:

```
{"status":"present","owner":"0x84326A92162Ece92ed257A31073fDd3a6599BF21","op":0,"trig":"90000000000000000000000","qty":"18000","sibling":"6161212520618990245985",...}
{"status":"present","owner":"0x84326A92162Ece92ed257A31073fDd3a6599BF21","op":1,"trig":"70000000000000000000000","qty":"18000","sibling":"1069911156275153999968",...}
```

Pair created in tx 0xb8b4a55485f97dc130838dee3c7ce20236c018a5ea9f12e48df1954bcc0e30a7 (stop ids 1069911156275153999968 and 6161212520618990245985).

Editing does not fix it either. Reproduced again on 2026-10-22 19:18-19:35 UTC: long 0.00018, Entire TP/SL, add 0.00018, then move the stop loss from 81,260 to 81,385 with the pencil in Manage TP/SL. The app cancels the old pair and arms a new one (`cancelReason: Owner` on the old legs at 19:31:45), and the new legs are again 0.00018 BTC while the position is 0.00036. When the mark crossed 81,385 the stop closed only 0.00018 (tx 0x2db1fbb610bcc905796b47326246ea95e5b055c011ca4b907fb9b3f043825178); the other half was closed 3 seconds later by our own keeper bot (tx 0x8524c1fb944ecc7ceacfcd08087aa940e0acfc5d77f75a1dad7cbff8dc67abc2), not by the app.

Suggested fix: arm "Entire" brackets with `quantity: 0`, which the SDK documents as "the whole position at trigger" (not tested live here); or, if a fixed size is intended, show the covered size in the dialog and the positions row, and recompute the estimates from it.

## Evidence
Screenshot [../evidence/019-entire-tpsl-after-adding.png](../evidence/019-entire-tpsl-after-adding.png), chain reads above. The test was cleaned up afterwards: TP cancelled, position closed, the remaining SL cancelled by the app, 0 pending stops, 0 unclaimed SOMI, owner STT back to 15.00.

## Environment
app.testnet.dreamdex.io (Perps, BTC-PERP), owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21, Hideki testnet (chain 50383), Chrome, 2026-10-22 ~16:36-16:39 UTC.
