# SDK type docs say LiquidationFee "is not in the deployed implementation" and no rows exist; the indexer returns 2,179 rows emitted by the live LiquidationEngine
Severity: normal

Area: SDK

`PerpFeeRecord.kind` in `@somnia-chain/markets-sdk` 0.32.1 tells integrators that liquidation fee rows do not exist yet and that the event is not deployed. Both are wrong today. `listPerpFees({ kind: "LiquidationFee" })` returns 2,179 rows, the newest from this morning, every one backed by a `LiquidationFeeCharged` log from the LiquidationEngine proxy. It is the only perp fee kind with any rows at all. An integrator who trusts the comment drops 332,025 USDso of fees from their accounting.

## Steps to reproduce
One command, read-only, no key ([`scripts/liqfee-013.ts`](../scripts/liqfee-013.ts)):

```bash
cd scripts && npm install && npx tsx liqfee-013.ts > out.json
```

It does four things:
1. Quotes the installed SDK's `dist/perp/history.d.ts` with line numbers.
2. Pages through `client.listPerpFees({ kind })` for `LiquidationFee`, `Fee`, `Rebate` and `BuilderFee`.
3. Reads the receipts of the oldest and the newest LiquidationFee row, decodes the log with the SDK's `liquidationEngineEventsAbi`, and compares topic0, emitter and fields with the row and with `getPerpSystemConfig(marginBank).liquidationEngine`.
4. Looks for the fee arriving at the Insurance Fund: `insurancePortion` on the rows, `client.listPerpInsuranceFundEvents()`, and any log or collateral `Transfer` touching the InsuranceFund in those two receipts.

## Expected
Either no rows, as the SDK says, or SDK docs that describe the fee as live. The SDK text, `dist/perp/history.d.ts`:

- line 501: "These rows come off `MarginBank`, and `kind` says which rail within it."
- line 523: "LiquidationFee stage-3 health-preserving liquidation fee, routed WHOLLY to an Insurance Fund tier"
- lines 526-528: "No `LiquidationFee` rows exist yet: the event is in the protocol ABI but not in the deployed implementation, and the subscription is staged ahead of the upgrade that brings it."
- line 535: on `LiquidationFee`, `insurancePortion` "equals `amount`"
- line 788 (`listPerpFees` options): "`kind` is `"Fee"` | `"Rebate"` | `"BuilderFee"`", so LiquidationFee is not even listed as a filter value.

## Actual
Run 2026-10-30 06:56 UTC, block 36,901,480.

- `listPerpFees({ kind: "LiquidationFee" })`: **2,179 rows**, oldest 2026-09-29 12:35:30 UTC, newest 2026-10-30 06:22:23 UTC, 20 pools, 1,166 accounts, 332,024.76 USDso in total. 614 of them landed on 2026-10-29 alone.
- `Fee`, `Rebate` and `BuilderFee`: 0 rows each. Perps on testnet are zero-fee as far as I can tell, so I read that as expected, not as a second gap.
- Oldest row (tx `0x6b503743de9af62c442852f608f5e83b589392463dc847189d79710e00f18ff7`, block 10,360,563) and newest row (tx `0xab4d1b82323516ab24210698c06ab7b249bb06d77823e7b7e0c48b0cdc7e6ee6`, block 36,881,201): both receipts succeed, the log's topic0 is `0x7f65cfb17ffadd9ae9df22fa5fcf080b5a10e7371a02f623659a2c12ca299eee` = keccak(`LiquidationFeeCharged(address,address,uint256,uint256,uint256)`), the emitter is `0xa66d3c24ad4a389d863846905d8173e1017e9f4d`, which is the `liquidationEngine` from `getPerpSystemConfig` and the docs address table, and the decoded account, pool, tier, fillNotional and amount match the indexer row exactly. The event comes off the LiquidationEngine, not MarginBank. The SDK agrees with itself on that point elsewhere: `LiquidationFeeCharged` sits in `liquidationEngineEventsAbi`, not in `marginBankEventsAbi`.
- The rate matches the user docs ("a fee of **up to 1%** of the notional it closes", Margin & Liquidations): `amount / fillNotional` runs from 0.0045% to exactly 1%, 2,066 rows at exactly 1%, none above.

The first run of this report (2026-10-22) found 968 rows over the same start date. The count has more than doubled in a week.

**Side finding, separate from the main bug.** `insurancePortion` reads `"0"` on all 2,179 rows. On 2026-10-22 the same row (`0xc528369f..._71`) returned `insurancePortion` 765912000000000000, equal to its `amount`, as the SDK says it should. So an integrator who follows the SDK's own advice ("`SUM(insurancePortion)` is the fund's fee inflow") now gets 0 instead of 332,025 USDso. I could not find where the fee is booked: `listPerpInsuranceFundEvents()` has 11 rows (10 `TierFunded`, 1 `TierWithdrawn`) and no `TierCredited`, and neither receipt has a log from the InsuranceFund (`0x50826894d47c6d4f3bea38bfdc7dc5c5be171b80`) or a collateral transfer to it. That may be internal accounting with no event. I am reporting what the public data shows, not claiming the fee is lost.

**What it breaks.** A bot or dashboard that reads the type docs either skips liquidation fee accounting or filters the kind out as "not live yet", while liquidations on testnet charge it daily. One that builds an insurance fund view from `insurancePortion` or `TierCredited`, as the SDK suggests, shows no fee inflow at all.

## Suggested fix
1. In `PerpFeeRecord.kind` (`dist/perp/history.d.ts:501, 526-528`), drop the "No `LiquidationFee` rows exist yet" note and say these rows come off the LiquidationEngine (`LiquidationFeeCharged`), not MarginBank.
2. Add `"LiquidationFee"` to the `kind` filter values on `listPerpFees` (line 788).
3. Either restore `insurancePortion = amount` on LiquidationFee rows in the indexer, or update line 535 and the `SUM(insurancePortion)` advice to say where the fund inflow can be read now.

## Evidence
- Script output with SDK quotes, row counts per kind and per day, rate stats and both receipt checks: [`evidence/3010/liqfee-013.json`](../evidence/3010/liqfee-013.json).
- Re-run: `cd scripts && npx tsx liqfee-013.ts > ../evidence/3010/liqfee-013.json` (the script exits 1 to flag the mismatch while LiquidationFee rows exist).
- The 2026-10-22 row with `insurancePortion` equal to `amount` is in the first version of this report; it is not in a saved JSON file, so that earlier value rests on that output alone.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem, Hideki testnet (chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network, indexer https://hideki-dev.smk.somnia.host/v1/graphql. Docs fetched 2026-10-30.
