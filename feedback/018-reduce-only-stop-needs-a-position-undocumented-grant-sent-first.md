# Reduce-only perp TP/SL reverts NoReducingPositionAtCreation with nothing to reduce; undocumented in the SDK and developer docs, and the SDK has already sent the operator grant
Severity: normal

Area: SDK

## Steps to reproduce
Read-only, no key ([`scripts/stop-018.ts`](../scripts/stop-018.ts)):

```bash
cd scripts && npm install && npx tsx stop-018.ts > out.json
```

It reads the two transactions `placePerpStopOrder` sent from our bot key on 2026-10-22, replays the failed one as eth_call at the block before it and at the head, and runs two controls from our owner account, which holds a BTC long today.

The original live run, for reference: an account with STT for gas, no BTC-PERP position, no resting order and no grant for the BTC stop registry calls

```ts
trader.placePerpStopOrder({ registry: btc.stopRegistry, pool: btc.poolAddress, operatorRegistry,
  isBid: false, quantity: 0n, triggerPrice: 150000e18, triggerOperator: 0, stopOrderType: 1, intent: "reduceOnly",
  pair: { isBid: false, quantity: 0n, triggerPrice: 40000e18, triggerOperator: 1, stopOrderType: 1 } })
```

That is the bracket from the SDK docs and the same call the bot kit's `armBracket` makes (`packages/perp-core/src/stops.ts:86-104`).

## Expected
Somewhere a developer reads, a line saying when a reduce-only stop can be created. Or the SDK checking it before it sends anything. The SDK says it does that kind of check: `dist/perp/stops.js:571-572`, right above the grant, "Encoded (and validated) before the grant is sent, so bad input fails without having moved anything on chain."

## Actual
**1. The create reverts with a name nobody explains.** The bot got `ContractRevertError: ... createLinkedPendingOrders reverted: NoReducingPositionAtCreation()`. Today's replay of that exact input gives the same `0xd156c90a` both at block 30,342,073 (just before) and at the head, with the bot's BTC position at 0 both times.

The error is in the SDK's `contractErrorsAbi` and nowhere else I could find:
- not in `PlacePerpStopOrderParams`, whose `intent` doc only says "Reduce-only (default) or opening",
- not in the SDK's `docs/PERPS.md`,
- not in the bot kit (`packages/perp-core/src/stops.ts`, `docs/perps.md`),
- not anywhere in `llms-full.txt` (fetched today, same file as 2026-10-29), and the Errors page has no perp section at all (report 012).

The closest hint is on the app's user page "Orders" (perps): TP and SL "are reduce-only", and "On a limit order, TP/SL can be armed before it fills only with GTC or ALO". That's written for the app's UI, and it doesn't name the revert.

**2. The grant goes out first and stays.** `placePerpStopOrder` reads `isOperatorAuthorized`, and if it's false it sends `setOperatorApprovalGlobal` before the create (`dist/perp/stops.js:574-584`). The "validated" comment covers argument checks in `validateLeg`, not this state check. From the chain:

| block | time (UTC, 2026-10-22) | tx | result | gas | fee, STT |
|---|---|---|---|---|---|
| 30,342,069 | 16:23:46 | grant [`0x927e366a...7f9fce`](https://explorer.testnet.somnia.network/tokyo/tx/0x927e366abb65fbbf7827023e23e84a2cf76a3b47ffdaf530034776bffa7f9fce) | success | 283,347 | 0.001700 |
| 30,342,074 | 16:23:47 | create [`0xf591fcd8...f68043`](https://explorer.testnet.somnia.network/tokyo/tx/0xf591fcd80f5736b32a75d84ab5a439ac22d5735670b12eb782b36775f7f68043), value 0.3 STT | reverted | 213,653 | 0.001282 |

Bot balance went 4.899472 → 4.897772 → 4.896490 STT. That is 0.002982 STT for no stop, which matches the bot's own log from that run. The 0.3 STT value came back with the revert. `isOperatorAuthorized(bot, stopRegistry, 0x80054449)` on the BTC pool was false the block before the grant and is true today, so the account is now approved for a registry it holds no stop on.

**3. What the rule seems to be.** Two controls from our owner account, which is long 36,000 raw units (0.00036 BTC) today, same bracket, eth_call only:
- sell legs (they would close the long): passes,
- buy legs (they would grow it): `NoReducingPositionAtCreation()`.

So the legs must be on the side that closes something. A position is not the only thing that counts, though. The app's tx `0xa116fb7e...432d3e1e` (report 022) placed a limit order and a linked TP/SL in one go, and our position was 0 both the block before and the block after it. My reading is "a position or a resting order that these legs would reduce". I can't see the exact rule from outside, and that's the point of this report: a developer can't either.

**What it breaks.** A bot that arms its bracket before the entry fills, or re-arms after a close, gets a revert with a name it can't look up, pays for two transactions, and is left with a grant it may not have wanted yet. In our run that was 0.00298 STT, small on testnet, but the bigger cost is the time spent working out what "reducing position" means here. The app arms TP/SL on a resting limit order, so a bot copying the app with an entry that doesn't rest (IOC, or an order that already filled and closed) runs straight into it.

## Suggested fix
1. Docs: next to `intent` in `PlacePerpStopOrderParams`, in the SDK's `docs/PERPS.md` and on the developer perps page, say it plainly: "A reduce-only stop needs an open position, or a resting order, on the side the stop closes. Otherwise the registry reverts `NoReducingPositionAtCreation()` (`0xd156c90a`)." And add the error to the perp section of the Errors page (report 012).
2. SDK: for a reduce-only placement, read the position (`getPerpPosition`) and the account's open orders on that pool before sending the grant. If nothing is on the reducing side, throw a named `InvalidInputError` and send nothing. I did not test whether the registry also checks the grant at creation, so I'm not suggesting a plain eth_call of the create before the grant; it might fail for the other reason.
3. Fix the comment at `dist/perp/stops.js:571-572` so it says what it covers: argument checks only.

## Evidence
- [`evidence/3010/stop-018.json`](../evidence/3010/stop-018.json): both receipts with fee and decoded legs, bot balance at each step, `isOperatorAuthorized` before and after the grant and today, the replay at both blocks with the bot's position, the two owner controls, and the owner's position around tx `0xa116...`.
- SDK and kit lines checked in @somnia-chain/markets-sdk 0.32.1 (`dist/perp/stops.js`, `dist/trade.d.ts`, `docs/PERPS.md`) and dreamdex-bot-kit 2579866.
- Re-run: `cd scripts && npx tsx stop-018.ts > ../evidence/3010/stop-018.json` (last run 2026-10-30 06:52 UTC, block 36,898,933).

## Environment
@somnia-chain/markets-sdk 0.32.1, viem 2.57.10, Hideki testnet (chain 50383). BTC-PERP pool 0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0, stop registry 0x52e2ccebaec9332672c247e9a90aa3d61fb615ef, OperatorPermissionsRegistry 0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a. Bot key 0x13f05c8e15cC0d7d3abff02C144fb74778018a55 (acting as its own account in the 2026-10-22 run), owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21.
