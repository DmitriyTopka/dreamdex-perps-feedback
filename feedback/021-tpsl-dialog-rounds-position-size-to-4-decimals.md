# The TP/SL dialog rounds the position size to 4 decimals: 0.00018 BTC shows as 0.0002, 0.00036 as 0.0004
Severity: normal
Area: app

## Steps to reproduce
1. app.testnet.dreamdex.io, BTC-PERP. Market Long 15 USDso: the confirm dialog and the positions row both say 0.00018 BTC.
2. Click Set TP/SL in the positions row.
3. Add another 15 USDso long (position 0.00036 BTC) and open Manage TP/SL.

## Expected
The dialog header shows the position size the same way the positions row and the Close position dialog do: 0.00018 and 0.00036 BTC. BTC-PERP's lot size is 0.00001 and its minimum is 0.00013, so sizes with five decimals are the normal case for small positions.

## Actual
The header says **Size 0.0002 BTC** for the 0.00018 position and **Size 0.0004 BTC** for the 0.00036 one, 11% above the real size. The positions row (0.00018, then 0.00036) and the Close position dialog ("Close size 0.00036", "Position 0.00036 BTC") show the true size, so the same position has two sizes in the app. In the "Entire" mode the header is the only size the trader sees, which makes report 019 harder to notice: the estimates are for 0.00018, the header says 0.0004, and neither matches the 0.00036 that is open.

The rounded figure is also used as the input limit in **Partial** mode. With a 0.00036 BTC position (opened 2026-10-22 ~18:40 UTC) the Partial tab says "Max 0.0004 BTC", accepts 0.0004 in "Protected size" and confirms "Protected size resolves to 0.0004 BTC on the lot grid". The estimates under it (+3.11 / -4.09 USDso at 90,000 / 70,000) are computed for 0.00036, and the legs written on chain are 36000 (0.00036 BTC; tx 0x60df5789f1132eb7c1a294bc168af6672a47b3aed962465d068626027be24851, ids 3431094397709976606831 and 5331109037302060423280). So the size the trader types and is told is protected is not the size that gets armed.

## Evidence
Screenshot [../evidence/019-entire-tpsl-after-adding.png](../evidence/019-entire-tpsl-after-adding.png): "Size 0.0004 BTC" while the position is 0.00036 BTC (on-chain stop legs 0.00018 each, read with `getPerpStopOrders` at 16:37:26 UTC). The first dialog at ~16:36 UTC showed "Size 0.0002 BTC" for the 0.00018 position.

## Environment
app.testnet.dreamdex.io (Perps, BTC-PERP), Chrome, owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21, Hideki testnet (chain 50383), 2026-10-22.
