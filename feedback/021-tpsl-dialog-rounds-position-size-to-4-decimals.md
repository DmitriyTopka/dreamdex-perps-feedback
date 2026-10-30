# The TP/SL dialog rounds the position size to 4 decimals: 0.00018 BTC shows as 0.0002, 0.00036 as 0.0004
Severity: normal

Area: app

Display bug only, separate from report 019: the stored sizes are right, the dialog shows them rounded.

## Steps to reproduce
In the app (app.testnet.dreamdex.io, Perps):
1. BTC-PERP. Market Long 15 USDso. The confirm dialog and the positions row both say 0.00018 BTC.
2. Click Set TP/SL in the positions row and look at the Size in the header.
3. Add another 15 USDso long (position 0.00036 BTC) and open Manage TP/SL.
4. Switch to **Partial** and look at "Max", then type 0.0004 in "Protected size" and confirm.

On chain, no key, nothing sent ([`scripts/size-021.ts`](../scripts/size-021.ts)):

```bash
cd scripts && npm install && npx tsx size-021.ts > out.json
```

It prints the BTC-PERP grid, our position at the moments I opened the dialog, the legs the Partial request armed, and how many open BTC-PERP positions have a fifth decimal.

## Expected
The dialog header shows the size the same way the positions row and the Close position dialog do: 0.00018 and 0.00036 BTC. BTC-PERP's lot size is 0.00001 and its minimum is 0.00013 (`listPerpMarkets`, today), so five decimals are the normal case for small positions. In Partial mode, "Max" is the position size and the protected size I confirm is the size that gets armed.

## Actual
Reproduced in the app on 2026-10-22. The header says **Size 0.0002 BTC** for the 0.00018 position and **Size 0.0004 BTC** for the 0.00036 one, 11% above the real size. The positions row (0.00018, then 0.00036) and the Close position dialog ("Close size 0.00036", "Position 0.00036 BTC") show the true size. So the same position has two sizes in the app.

The chain confirms the sizes behind those screens (archive reads of MarginBank `getPosition`, re-run 2026-10-30 06:54 UTC):

| moment (22 Oct, UTC) | position on chain | dialog showed |
|---|---|---|
| 16:36:10, Set TP/SL, block 30,349,500 | 0.00018 | Size 0.0002 |
| after the second buy at 16:37:14, tx `0xfacb0619579969a9781e5b70283ebc4017a7f3ceea58fbe7bebe3e394a44ee3a` | 0.00036 | Size 0.0004 |
| 18:41:33, Partial, block 30,424,678 | 0.00036 | Max 0.0004 |

In **Partial** mode the rounded figure becomes the input limit. With the 0.00036 BTC position the tab says "Max 0.0004 BTC", accepts 0.0004 in "Protected size" and confirms "Protected size resolves to 0.0004 BTC on the lot grid". The estimates under it, +3.11 / -4.09 USDso at 90,000 / 70,000, are for 0.00036: the entry was 81,348.69, and 0.00036 × (90,000 - 81,348.69) = 3.11, 0.00036 × (81,348.69 - 70,000) = 4.09. The legs written on chain are 0.00036 BTC each (tx `0x60df5789f1132eb7c1a294bc168af6672a47b3aed962465d068626027be24851`, TP id 3431094397709976606831, SL id 5331109037302060423280, read from the `PendingOrderCreated` events today). So the contract clamped my 0.0004 down to the real 0.00036 and the whole position was covered. The protection was fine; the screen just showed a size that doesn't exist (the entry here, 81,348.69, is from this later 23 Oct position, not the 22 Oct one in report 019).

For a trader this matters in two places. In Entire mode the header is the only size on screen, and it hides report 019: the estimates are for 0.00018, the header says 0.0004, and neither matches the 0.00036 that is open. In Partial mode people work from the Max. Protect "half" of a Max of 0.0004 and you type 0.0002, which is 56% of the real 0.00036, not 50%.

It hits most BTC-PERP positions. Of 9,659 open ones today (indexer rows, 10 re-read on chain, all matched), 9,049 have a fifth decimal, so the header shows a number that is not their size. The smallest legal position, 0.00013, would show as 0.0001 (23% under) with round-to-nearest, or 0.0002 with round-up. My two readings fit both, so I can't tell which one the app uses. Assuming nearest, 2,739 open positions would be shown more than 5% off.

## Suggested fix
1. Format the header size with the market's lot precision (BTC-PERP: 5 decimals, from `lotSize`), using the same formatter as the positions row.
2. Make "Max" the exact position size. If someone types more, clamp it and show the size that will actually be armed.

## Evidence
- [`evidence/3010/size-021.json`](../evidence/3010/size-021.json): grid, position and entry at each dialog moment, the Partial legs, the open-positions count with the on-chain sample.
- Screenshot [../evidence/019-entire-tpsl-after-adding.png](../evidence/019-entire-tpsl-after-adding.png): "Size 0.0004 BTC" while the position is 0.00036 BTC. The first dialog at ~16:36 UTC showed "Size 0.0002 BTC" for the 0.00018 position.
- The rounding is UI-only, so the screen readings are from 22 Oct. I could not re-open the app today.

Re-run: `cd scripts && npx tsx size-021.ts > ../evidence/3010/size-021.json` (about 30 seconds, reads only).

## Environment
app.testnet.dreamdex.io (Perps, BTC-PERP), Chrome, owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21, Hideki testnet (chain 50383), app run 2026-10-22. Chain re-check 2026-10-30 06:54 UTC with @somnia-chain/markets-sdk 0.32.1.
