# SDK type docs say LiquidationFee "is not in the deployed implementation" and no rows exist; the indexer returns 968 rows emitted by the live LiquidationEngine
Severity: normal

Area: SDK

## Steps to reproduce
1. Read `PerpFeeRecord.kind` in @somnia-chain/markets-sdk 0.32.1, `dist/perp/history.d.ts` lines 523-528:
   "LiquidationFee stage-3 health-preserving liquidation fee, routed WHOLLY to an Insurance Fund tier" and then "No `LiquidationFee` rows exist yet: the event is in the protocol ABI but not in the deployed implementation, and the subscription is staged ahead of the upgrade that brings it."
   The type comment above it also says "These rows come off `MarginBank`".
2. Call `client.listPerpFees({ kind: "LiquidationFee", limit: 500, offset })` and page through.
3. Take one row's `txHash` and read its receipt over the RPC.

## Expected
Either no rows (as the SDK says), or SDK docs that describe the fee as live.

## Actual
- `listPerpFees({ kind: "LiquidationFee" })` returns 968 rows, the oldest at 2026-09-29T12:35:30Z and the newest at 2026-10-22T15:09:21Z. `listPerpFees` with kind "Fee", "Rebate" and "BuilderFee" each returns 0 rows, so LiquidationFee is the only kind with any data at all.
- Receipt of tx 0xc528369fa573a2aae2d751dad08a5bbb0fc1c395548c51241956128913457f1f (block 30297445, status success): log 71 has topic0 0x7f65cfb17ffadd9ae9df22fa5fcf080b5a10e7371a02f623659a2c12ca299eee = keccak("LiquidationFeeCharged(address,address,uint256,uint256,uint256)") and is emitted by 0xa66d3c24ad4a389d863846905d8173e1017e9f4d, the LiquidationEngine from `getPerpSystemConfig` and the docs address table. So the event is in the deployed implementation, and it comes off LiquidationEngine, not MarginBank.

So an integrator who reads the type docs will not build liquidation fee accounting (or will filter the kind out as "not live yet"), while liquidations on testnet pay it all the time. The rate data also lines up with the user docs ("a fee of up to 1% of the notional it closes"): over the 968 rows `amount / fillNotional` ranges from 0.0045% to exactly 1.0000%, 905 rows at exactly 1%, none above.

## Evidence
Script output:
```
LiquidationFee rows: 3 [{"id":"0xc528369f..._71","account":"0xf077e9b4605178669db310e52fcf7e1d8b83f767","pool":"0xde9762b6b441133d1314c68864ae4e63a6ee45c7","amount":"765912000000000000","isRebate":false,"kind":"LiquidationFee","insurancePortion":"765912000000000000","tier":"2","fillNotional":"76591200000000000000",...}
Fee rows: 0 []
Rebate rows: 0 []
BuilderFee rows: 0 []
rows 968 ratio% min 0.0045 max 1 buckets { '=1%': 905, '0.5-1%': 31, '0-0.5%': 32 } from 2026-09-29T12:35:30.000Z to 2026-10-22T15:09:21.000Z
```
Receipt read:
```
block 30297445n status success to 0x03ca1f61c5a475951f69f51bd16523075fdfb1cc LiquidationFeeCharged topic 0x7f65cfb1...9eee
logIndex 71 emitter 0xa66d3c24ad4a389d863846905d8173e1017e9f4d topic0 0x7f65cfb1...9eee data 0x...0426ea9a9a38e60000 ...0aa110e7f1358000
```
(data decodes to fillNotional 76.5912 USDso and amount 0.765912 USDso, matching the indexer row.)

## Environment
@somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network, indexer https://hideki-dev.smk.somnia.host/v1/graphql, 2026-10-22.
