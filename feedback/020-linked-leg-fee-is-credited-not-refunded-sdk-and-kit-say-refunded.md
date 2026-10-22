# When one leg of a linked TP/SL fills, the other leg's 0.15 STT is only credited to unclaimedSomi; the SDK's pair docs and the bot kit say it is refunded, and the kit never claims it
Severity: normal
Area: SDK

## Steps to reproduce
1. Open a small long on BTC-PERP (here 0.00018 BTC through app.testnet.dreamdex.io).
2. Arm a linked pair: take profit just above the mark (81,236), stop loss far below (70,000). Both legs prepay 0.15 STT.
3. Let the take profit fire, then read `client.getUnclaimedPerpStopSomi({ registry, account })`, the wallet balance and `listPerpStopOrders({ account, status: "CANCELLED" })`.

## Expected
`PlacePerpStopOrderParams.pair` in the SDK (`dist/trade.d.ts`) says: "when one fires and fills, the other is cancelled and its SOMI refunded". The bot kit repeats it: `packages/perp-core/src/stops.ts:48` "whichever fires cancels the other and refunds its SOMI", `strategies/perp-starter/src/index.ts:16` the same. docs/PERPS.md only mentions an unclaimed balance when a refund transfer fails or the registry winds down. A reader expects the stop-loss's 0.15 STT back in the wallet.

## Actual
The stop-loss is cancelled with `cancelReason: "LinkedFill"`, and its 0.15 STT is **credited** to `unclaimedSomi`, not sent back. It stays there until someone calls `claimSomi()`:

| time (UTC) | owner STT | unclaimed | pending stops |
|---|---|---|---|
| 17:29:56, before | 15.00 | 0 | 0 |
| 17:31:26, after the TP fired (created 17:31:02, fired 17:31:10, tx 0xb36312c539f02640cd48dabd1fb0bbcdf709f282cef01f570cd56718f64728d4) | 14.70 | **0.15** | 0 |
| 17:41:15, ten minutes later | 14.70 | 0.15 | 0 |
| 17:42:30, after pressing Claim in the app | 14.85 | 0 | 0 |

Indexer rows: TP id 5700043918776251455591 `TRIGGERED`; SL id 3431094397709976606824 `CANCELLED`, `cancelReason: "LinkedFill"`.

The same account got its 0.15 STT pushed straight back an hour earlier when it cancelled a leg by hand (`cancelReason` Owner, wallet 14.70 to 14.85), so the account can receive native transfers. The difference is the LinkedFill path itself.

The app handles it: it shows "0.15 STT in trigger fees is waiting for you. When one leg of a linked TP/SL executes, the other's fee is held for you to claim rather than refunded" with a Claim button. The SDK's own `cancelReason` field doc also says LinkedFill "only CREDITs unclaimedSomi". So the protocol behaviour is intended, and it is the pair docs, PERPS.md and the bot kit that contradict it.

Effect on bots: nothing in the bot kit calls `getUnclaimedPerpStopSomi` or `claimPerpStopSomi` (searched `packages/`, `strategies/`, `advanced/`, `scripts/`). A perp-starter run that ends on a filled take profit or stop loss leaves 0.15 STT parked per bracket, and its log line "SOMI refunded" tells the operator the opposite.

Suggested fix: change the `pair` JSDoc and the kit comments to "credited to unclaimedSomi, recover with claimPerpStopSomi"; add LinkedFill to the unclaimed section of PERPS.md; have perp-starter (or perp-core) read the unclaimed balance on exit and claim it.

## Evidence
Table above from `getUnclaimedPerpStopSomi`, `getBalance` and `listPerpStopOrders` on Hideki; app banner text quoted above.

## Environment
@somnia-chain/markets-sdk 0.32.1, dreamdex-bot-kit 2579866, app.testnet.dreamdex.io, owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21, BTC stop registry 0x52e2ccebaec9332672c247e9a90aa3d61fb615ef, Hideki testnet (chain 50383), 2026-10-22.
