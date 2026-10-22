# placePerpStopOrder throws NotConfiguredError with the bundled Hideki addresses, although the SDK can read the registry from the pool it is given
Severity: normal
Area: SDK

## Steps to reproduce
1. Create a client the way the SDK docs show: `new SomniaMarkets({ chain: hidekiTestnet, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES, indexerUrl, privateKey })`.
2. Take any perp market row from `client.listPerpMarkets()`, e.g. BTC (`stopRegistry` 0x52e2...15ef, `poolAddress` 0x4181...94c0).
3. Call `trader.placePerpStopOrder({ registry, pool, isBid: false, quantity: 0n, triggerPrice, triggerOperator: 0, stopOrderType: 1, intent: "reduceOnly" })` without `operatorRegistry`.

## Expected
The JSDoc on `operatorRegistry` in `dist/trade.d.ts` says: "Resolved from the live config (addresses.operatorPermissionsRegistry) if omitted." With the bundled Hideki address set a reader expects that to work, or at least expects the SDK to use `client.getOperatorPermissionsRegistry(pool)`, which `docs/reference/configuration.md` names as the way to discover it. The call already receives `pool`.

## Actual
The call throws before anything is signed:

```
NotConfiguredError | @somnia-chain/markets-sdk: a perp stop order needs operatorRegistry or addresses.operatorPermissionsRegistry
```

`SOMNIA_HIDEKI_TESTNET_ADDRESSES` has 14 keys and `operatorPermissionsRegistry` is not one of them. `dist/perp/stops.js:490` only looks at `p.operatorRegistry ?? addresses().operatorPermissionsRegistry` and never asks the pool.

The pool does know the answer. `client.getOperatorPermissionsRegistry(pool)` on all 21 perp pools returns the same address, `0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a`. The bot kit works around this by hardcoding exactly that address in `packages/perp-core/src/config.ts:80`, with a comment saying the SDK presets do not carry it. Anyone building on the SDK directly hits the throw on their first TP/SL.

Suggested fix (any one is enough): add `operatorPermissionsRegistry` to the bundled Hideki and testnet presets; or fall back to `getOperatorPermissionsRegistry(pool)` in `placePerpStopOrder` and `buildPlacePerpStopOrder`; or correct the JSDoc so it does not promise a default that the presets cannot supply.

## Evidence
Run with a fresh random key (no funds needed, the error comes before signing):

```
stopRegistry 0x52e2ccebaec9332672c247e9a90aa3d61fb615ef pool 0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0
ERR: NotConfiguredError | ... a perp stop order needs operatorRegistry or addresses.operatorPermissionsRegistry
```

`getOperatorPermissionsRegistry` over every pool from `listPerpMarkets()`:

```
[ [ '0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a', 21 ] ]
```

Keys of `SOMNIA_HIDEKI_TESTNET_ADDRESSES`: binaryModule, binaryPoolBeacon, binaryPoolImpl, binarySettlement, clobFactory, collateral, marginBank, marketCreator, marketCreatorFactory, marketsCore, oracleHub, perpPoolFactory, priceFeedScheduler, testUsdc.

## Environment
@somnia-chain/markets-sdk 0.32.1 (latest on npm, published 2026-10-14), Hideki testnet (chain 50383), Node 20+, 2026-10-22.
