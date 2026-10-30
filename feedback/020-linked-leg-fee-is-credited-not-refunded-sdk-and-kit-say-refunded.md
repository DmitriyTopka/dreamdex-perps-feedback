# When one leg of a linked TP/SL fills, the other leg's 0.15 STT is only credited to unclaimedSomi; the SDK's pair docs and the bot kit say it is refunded, and the kit never claims it
Severity: normal

Area: SDK

The registry credits the cancelled leg's 0.15 STT to `unclaimedSomi` on purpose. The bug is in what everyone tells the trader: the SDK pair docs, PERPS.md, the app docs and the bot kit all say the fee is refunded, and the kit never claims it. Right now 354 account and market pairs hold 59.025 STT this way.

## Steps to reproduce
Read-only, no key ([`scripts/linkedfee-020.ts`](../scripts/linkedfee-020.ts)):

```bash
cd scripts && npm install && npx tsx linkedfee-020.ts > out.json
```

It does two things:
1. Our own bracket from 2026-10-22: finds the creation tx, the fire tx and its event, and reads the owner's wallet balance and `unclaimedSomi` one block before and at each step (archive state, no guessing from screenshots).
2. All 20,563 perp stops the indexer has as CANCELLED, every market and account. For each account that has a `LinkedFill` cancel it reads `unclaimedSomi` now and whether the account is an EOA.

How the bracket was made: a 0.00018 BTC long on BTC-PERP opened in app.testnet.dreamdex.io, then a linked pair with the take profit just above the mark (81,236) and the stop loss far below (70,000). Each leg prepays 0.15 STT.

## Expected
- SDK, `dist/trade.d.ts:1454-1455`, JSDoc on `PlacePerpStopOrderParams.pair`: "when one fires and fills, the other is cancelled and its SOMI refunded".
- Bot kit, `packages/perp-core/src/stops.ts:47-48` (`armBracket`): "so whichever fires cancels the other and refunds its SOMI". Same words in `strategies/perp-starter/src/index.ts:15-16`.
- The app's perps Orders page: each TP or SL "holds 0.15 STT ... and you get it back if you cancel it". The perps developer page: "Stop orders carry 0.15 STT each, sent with the order and refunded on cancel."

Nothing above mentions a claim step. The places that do talk about `unclaimedSomi` only list other causes:
- SDK `docs/PERPS.md:453-469`: a failed refund transfer ("the ordinary outcome for a contract owner with no payable receiver (most multisigs and smart accounts)") and a registry wind-down.
- SDK `dist/tradeAbi.js:306-317`: "TWO paths credit it", the same two.
- `ClaimPerpStopSomiParams` (`dist/trade.d.ts:1367-1368`) and `claimPerpStopSomi` (`dist/trade.d.ts:3619-3620`): "after a refund transfer failed", "the refund path for an owner that cannot receive native".

So I expected the stop loss's 0.15 STT back in the wallet when the take profit filled.

## Actual
The stop loss is cancelled with `cancelReason: "LinkedFill"` and its 0.15 STT goes to `unclaimedSomi`. It sits there until someone calls `claimSomi()`. From chain state at each block (owner account, BTC registry):

| step | tx | block | time (UTC, 2026-10-22) | wallet STT | unclaimed STT |
|---|---|---|---|---|---|
| before the bracket | | 30,382,388 | | 15.00 | 0 |
| bracket created, 2 x 0.15 paid | [`0xb36312c5...4728d4`](https://explorer.testnet.somnia.network/tokyo/tx/0xb36312c539f02640cd48dabd1fb0bbcdf709f282cef01f570cd56718f64728d4) | 30,382,389 | 17:31:02 | 14.70 | 0 |
| TP fires, SL cancelled | [`0xcdd7f80b...9d3fc2`](https://explorer.testnet.somnia.network/tokyo/tx/0xcdd7f80b0804f1f9822e29115687311b052e9282604c371f2a5631f9869d3fc2) | 30,382,467 | 17:31:10 | 14.70 | **0.15** |
| Claim pressed in the app | [`0x774205e0...afd15c`](https://explorer.testnet.somnia.network/tokyo/tx/0x774205e0008fd2bc1ba6e406f0cfed20ba8a61e515ef4970a2830aa361afd15c) | 30,389,135 | 17:42:17 | 14.85 | 0 |

The fire tx emits `LinkedOrderCancelled(cancelledOrderId 3431094397709976606824, filledOrderId 5700043918776251455591, owner, amount 150000000000000000)`, topic0 `0xd711b596...`. So the registry itself says "credited 0.15", and the wallet balance does not move in that block. The event is not in the SDK's `perpStopRegistryEventsAbi`; I matched the signature by its topic hash. The indexer agrees: TP `TRIGGERED`, SL `CANCELLED` with `cancelReason: "LinkedFill"`.

It isn't our account failing to receive. Our owner is an app account (a Safe), and an hour earlier the same account cancelled a leg by hand (`cancelReason` Owner, tx `0x8cd20d4d...6a6fc6ab`, block 30,350,544): wallet 14.70 → 14.85 in that block, unclaimed stayed 0. So the push works. It's the LinkedFill path that credits instead.

**How much this is across the testnet** (2026-10-30 06:53 UTC, block 36,900,024):

| | |
|---|---|
| CANCELLED perp stops in the indexer | 20,563 (Owner 16,966, **LinkedFill 3,597**, Inert 0) |
| fee per leg, all 21 registries | 0.15 STT |
| account/market pairs with a LinkedFill | 1,829 (576 accounts) |
| of them, holding unclaimed STT right now | **354, 59.025 STT in total** |
| of the 1,829, EOAs | 1, and it holds 0.15 STT on SOL-PERP |

Two things in that table rule out the documented causes. There are no Inert cancels at all, so it's not a wind-down. And the one EOA can always take a native transfer, yet it holds 0.15 STT, so it's not a failed refund either. I did not scan `SomiRefundFailed` events, so I can't say every one of the 59.025 STT is a LinkedFill credit. But our own account shows the Owner path pushes fine to a Safe, and 1,828 of the 1,829 pairs are contract accounts, like ours.

Our own account has 3 LinkedFill cancels by now and 0.15 STT is unclaimed again today.

The protocol does this on purpose. The SDK's `cancelReason` doc says LinkedFill and Inert "only CREDIT `unclaimedSomi`" (`dist/perp/stops.d.ts:126-139`), and on 2026-10-22 the app showed a banner: "0.15 STT in trigger fees is waiting for you. When one leg of a linked TP/SL executes, the other's fee is held for you to claim rather than refunded", with a Claim button. (I could not re-check the banner today; it only shows for an account with a balance in a logged-in session.) The problem is that the pair JSDoc, PERPS.md, the ABI comment, the claim JSDoc, the app's docs and the bot kit all say something else.

**What it breaks.** A trader on the app sees the banner. A bot doesn't. Nothing in the bot kit reads or claims the balance: `grep -rnE "Unclaimed|claimPerpStop|claimSomi" packages strategies advanced scripts --exclude-dir=node_modules` in dreamdex-bot-kit 2579866 finds nothing. When perp-starter sees the position closed it lists pending stops, gets none (the sibling is already CANCELLED, not PENDING) and calls `cancelStops` with an empty list, which returns without a word (`packages/perp-core/src/stops.ts:126`). So every run that ends on a filled TP or SL leaves 0.15 STT parked, and the operator was told at startup that stops are "refunded on cancel" (`index.ts:100`). A bot that re-arms brackets all day leaves 0.15 STT per fill. A developer who does notice the balance and reads PERPS.md is told it's what happens to "most multisigs and smart accounts", and may go chasing a problem with their Safe that isn't there.

## Suggested fix
1. SDK docs: change the `pair` JSDoc to "the other is cancelled and its SOMI is credited to `unclaimedSomi`; recover it with `claimPerpStopSomi`". Add LinkedFill as a third source in `docs/PERPS.md` ("The registry may be holding SOMI for you"), in the `tradeAbi.js` comment, and in the `ClaimPerpStopSomiParams` / `claimPerpStopSomi` JSDoc.
2. SDK: add `event LinkedOrderCancelled(uint128 indexed cancelledOrderId, uint128 indexed filledOrderId, address indexed owner, uint256 amount)` to `perpStopRegistryEventsAbi`, so a receipt reader can see the credit.
3. App docs: on the perps Orders page and the developer page, add one sentence: when one leg of a linked TP/SL fills, the other leg's 0.15 STT is held for you to claim.
4. Bot kit: fix the two comments, and in perp-starter (or a perp-core helper) read `getUnclaimedPerpStopSomi` when the position closes and call `claimPerpStopSomi` if it's above zero. It's one read and at most one tx per bracket.

## Evidence
- [`evidence/3010/linkedfee-020.json`](../evidence/3010/linkedfee-020.json): our bracket (indexer rows, all four txs, wallet and unclaimed before/at each), the decoded `LinkedOrderCancelled` event, the network-wide counts, the fee per registry, and every account/market pair holding a balance now.
- App banner text: seen 2026-10-22, not re-checked today.
- Re-run: `cd scripts && npx tsx linkedfee-020.ts > ../evidence/3010/linkedfee-020.json` (about 45 s; it pages through the whole CANCELLED list).

## Environment
@somnia-chain/markets-sdk 0.32.1, viem 2.57.10, dreamdex-bot-kit 2579866, app.testnet.dreamdex.io, owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21, BTC stop registry 0x52e2ccebaec9332672c247e9a90aa3d61fb615ef, Hideki testnet (chain 50383). Bracket run 2026-10-22, measurements 2026-10-30.
