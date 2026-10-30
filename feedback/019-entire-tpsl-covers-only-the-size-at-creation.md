# TP/SL set as "Entire" stores a fixed size; after adding to the position the app still says "Entire", but the stop-loss would close only the original part and the shown loss is understated
Severity: major

Area: app

Short version: "Entire" in the TP/SL dialog writes the position size of that moment into both legs. Add to the position and the stop loss still closes only the old size. Our test account carries this right now: a 0.00036 BTC long whose "Entire" stop loss covers 0.00018.

## Steps to reproduce
In the app (app.testnet.dreamdex.io, Perps):
1. BTC-PERP, Cross 20x. Market Long 15 USDso (0.00018 BTC).
2. Positions row, Set TP/SL, mode **Entire**: take profit 90,000, stop loss 70,000, Set TP / SL. The dialog says "These two will be linked".
3. Market Long another 15 USDso. The position is now 0.00036 BTC.
4. Open Manage TP/SL again. It still says Entire.
5. Optional: move the stop loss closer with the pencil and let the mark cross it. The stop closes half the position.

On chain, no key, nothing sent ([`scripts/entire-019.ts`](../scripts/entire-019.ts)):

```bash
cd scripts && npm install && npx tsx entire-019.ts > out.json
```

`live` shows our account's position next to the stored size of its stop legs. `ownPairs` shows every BTC pair the account armed, with the size the `PendingOrderCreated` event stored and the position at that block.

## Expected
The perps Orders page says a stop loss "closes it when the price moves against you", where "it" is the position. The docs never define "Entire". So the only promise is the word in the dialog, and it reads as the whole position, also after I add to it.

The contract can do that already. The SDK documents `quantity: 0` on a perp stop leg as "the whole position at trigger time" (`PerpStopOrderLeg.quantity`, `dist/trade.d.ts:1406`). Its JSDoc adds that such a stop keeps covering a position that grew after arming, while a non-zero size is fixed at creation and only ever clamped down. After step 3 I expected the stop loss to close 0.00036 BTC and the estimates to be for 0.00036 BTC. If a fixed size is intended, the app should say so once the position grows.

## Actual
In the app on 2026-10-22, after step 3 the dialog shows Size 0.0004 BTC, **Entire** selected, Estimated profit +1.51 USDso and Estimated loss -2.09 USDso (screenshot [../evidence/019-entire-tpsl-after-adding.png](../evidence/019-entire-tpsl-after-adding.png)). Those estimates are for half the position. The average entry after the second buy was 81,596.1 (MarginBank `getPosition` at block 30,350,138), so 0.00018 × (90,000 - 81,596.1) = 1.51 and 0.00018 × (81,596.1 - 70,000) = 2.09. For the real 0.00036 BTC they are 3.03 and 4.17. The positions row shows "90,000 / 70,000" with no hint that the stops are partial. The "0.0004" header is a rounding bug of its own, report 021.

On chain the legs keep the old size. I re-read every pair today (2026-10-30 06:58 UTC, block 36,902,598), from the creation events and archive reads of the position:

| armed (UTC) | what I did in the app | position when armed | stored per leg | largest position while armed | tx |
|---|---|---|---|---|---|
| 22 Oct 16:36:10 | Entire, TP 90,000 / SL 70,000 | 0.00018 | 0.00018 | 0.00036 | `0xb8b4a55485f97dc130838dee3c7ce20236c018a5ea9f12e48df1954bcc0e30a7` |
| 22 Oct 19:19:26 | Entire, TP 90,000 / SL 81,260 | 0.00018 | 0.00018 | 0.00036 | `0xcc8862c5194db6b1e68ad4e3071ad358f60ed07a4bfc3cb84e9454617a2cfd69` |
| 22 Oct 19:31:45 | moved that SL to 81,385 with the pencil | **0.00036** | 0.00018 | 0.00036 | `0x735325d3031bb43af498fe4fa72f00d6774a9644a21cb6d9ad4f9b20f6808432` |
| 26 Oct 06:18:07 | Entire, TP 90,000 / SL 79,900 | 0.00018 | 0.00018 | 0.00036 | `0x04f151862f4943a39e879989ee50f7608d97e9f97e9d07b8161934cafe8f7fce` |
| 26 Oct 06:29:23 | Entire, TP 90,000 / SL 70,000, **still armed** | 0.00018 | 0.00018 | 0.00036 | `0x52dc623b27779f9866991e688bf30fb2581378072da2a13734ce6bb35cac28f1` |

The 19:31:45 row is the worst one. When I edit a stop, the app cancels the old pair (`cancelReason: Owner`) and arms a new one. The position was already 0.00036 at that block, and the app still wrote 0.00018. So editing does not fix it, it copies the stale size.

Then the stops fired, twice, and each closed half:

| fired (UTC) | tx | sent by | position before | after |
|---|---|---|---|---|
| 22 Oct 19:34:35, SL 81,385 | `0x2db1fbb610bcc905796b47326246ea95e5b055c011ca4b907fb9b3f043825178` | stop registry 0x52e2...15ef | 0.00036 | 0.00018 |
| 22 Oct 19:34:38 | `0x8524c1fb944ecc7ceacfcd08087aa940e0acfc5d77f75a1dad7cbff8dc67abc2` | our gap keeper (StopCheck), bot key 0x13f0...8a55 | 0.00018 | 0 |
| 26 Oct 06:27:00, SL 79,900 | `0x9b13ce9e6fb4175ce030494444014a0afed12984188bf21d8531c4d92eda2aee` | stop registry | 0.00036 | 0.00018 |
| 26 Oct 06:27:15 | `0x01a5d298b7453fab8e22fe9689f99264ca7af821942c1eb2703c78b2eccbcc12` | our keeper bot | 0.00018 | 0 |

The second half was closed by our own bot, not by the app. Without it, half the position would have stayed open with no stop after the stop loss "on the entire position" fired.

Right now the account holds a 0.00036 BTC long (entry 80,021.2). Its linked pair from the last table row is armed: SL 70,000 (id 7876759719473978547959) and TP 90,000 (id 6013638568029313834742), 0.00018 BTC each, `reduceOnly`, 0.15 STT each. The stop loss covers 50%.

So when the price reaches the stop, the stop loss closes the old size and the rest of the position keeps running with no stop at all. The app told them the entire position was protected and showed a loss of 2.09 USDso. The true loss at 70,000 is 4.17, and below 70,000 the open half keeps losing until the trader notices or gets liquidated. Adding to a winning or losing position is ordinary trading, so anyone who adds after setting TP/SL walks into this.

How common it is today, across all accounts (same script, `scan`):
- 659 pending perp stops are live on chain. 636 store a fixed size, 23 use `quantity: 0`. Of the 376 created since 23 Oct, 353 are fixed. All 23 whole-position stops were created this morning (05:38 to 06:56 UTC) on BTC-PERP. The chain does not show which front end armed any of them.
- 94 open positions sit behind a reduce-only stop loss. For 12 of them the stop loss covers only part, from 6.8% to 78.7%. Together they leave positions worth about 280k USDso of notional without a stop. A deliberate Partial stop looks the same on chain, so 12 is how many traders are exposed, not a count of this bug.

Control: `quantity: 0` works on the live registry. I took 12 recent fired stops with quantity 0 (other accounts, BTC shorts of about 0.025 BTC). Each one closed the whole position, size 0 right after the fire. None of those positions had grown since arming, so the "keeps covering a grown position" part is the SDK's documented behaviour. I have not seen it fire on a grown position myself.

## Suggested fix
1. App: arm "Entire" legs with `quantity: 0`. The registry already resolves it against the live position when the stop fires.
2. App: when editing an Entire leg (pencil, drag on the chart), re-arm with `quantity: 0` too, not with the old leg's size.
3. If a fixed size is intended, stop calling it Entire. Label it with the size ("Current size, 0.00018 BTC"), show the covered size in the positions row, warn when the position grows past it, and compute the estimates from the covered size.

## Evidence
- [`evidence/3010/entire-019.json`](../evidence/3010/entire-019.json): live position and legs, every BTC pair of the account with stored size and position, the position after each of the account's fills, the four fires, the all-accounts scan, the quantity-0 control.
- Screenshot [../evidence/019-entire-tpsl-after-adding.png](../evidence/019-entire-tpsl-after-adding.png).
- 22 Oct read at 16:37:26 UTC, after the second buy, `client.getPerpStopOrders` on registry 0x52e2...15ef: both legs `present`, `qty 18000`, siblings pointing at each other.
- The 16:36 test was cleaned up: TP cancelled, position closed, SL cancelled by the app. Checked today with archive reads at 16:38:36 UTC: position 0, owner STT 15.00 as before the test, unclaimed 0.

Re-run: `cd scripts && npx tsx entire-019.ts > ../evidence/3010/entire-019.json` (about 1 minute, reads only).

## Environment
app.testnet.dreamdex.io (Perps, BTC-PERP), Chrome, owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21 (Safe smart account), BTC stop registry 0x52e2ccebaec9332672c247e9a90aa3d61fb615ef, Hideki testnet (chain 50383). App runs on 2026-10-22 16:36-16:39 and 19:18-19:35 UTC, and 2026-10-26 06:17-06:30 UTC. Chain re-check 2026-10-30 06:58 UTC with @somnia-chain/markets-sdk 0.32.1.
