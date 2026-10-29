# Perp TP/SL from the SDK throws NotConfiguredError with every bundled preset, though each pool tells you the registry address
Severity: major
Area: SDK

Short version: with the addresses the SDK ships, you can't place a perp TP/SL, can't even build one unsigned, and can't read a grant back. The address is one call away on the pool, the SDK just never asks.

## Steps to reproduce
Nothing is sent, a fresh random key is enough ([`scripts/stops-015.ts`](../scripts/stops-015.ts)):

```bash
cd scripts && npm install && npx tsx stops-015.ts > out.json
```

It makes a client the way the SDK README does (`new SomniaMarkets({ chain: hidekiTestnet, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES, indexerUrl, privateKey })`) and tries a reduce-only stop loss on BTC-PERP without `operatorRegistry`.

## Expected
- `dist/trade.d.ts`, JSDoc on `operatorRegistry`: "Resolved from the live config (addresses.operatorPermissionsRegistry) if omitted."
- `docs/reference/configuration.md:157` in the SDK package: `operatorPermissionsRegistry` is "Discoverable at runtime with `getOperatorPermissionsRegistry(pool)`."

So with the bundled preset I expected it to work, or at least the SDK to look the address up from the `pool` it already gets.

## Actual
Run 2026-10-29 15:57 UTC, block 36,362,641, SDK 0.32.1.

**None of the three presets has the key:**

| preset | keys | operatorPermissionsRegistry |
|---|---|---|
| SOMNIA_HIDEKI_TESTNET_ADDRESSES | 14 | missing |
| SOMNIA_TESTNET_ADDRESSES | 16 | missing |
| SOMNIA_MAINNET_ADDRESSES | 13 | missing |

**Four calls fail before anything is signed:**

| call | result |
|---|---|
| `trader.placePerpStopOrder(stop)` | NotConfiguredError: a perp stop order ... needs operatorRegistry or addresses.operatorPermissionsRegistry |
| `trader.buildPlacePerpStopOrder(stop)` | same |
| `client.isGloballyApproved({ owner, operator, selector })` | NotConfiguredError: an operator grant read ... needs addresses.operatorPermissionsRegistry |
| `client.isApprovedForPool({ ..., pool })` | same |

The build one matters too. People who build unsigned to send through their own wallet or a relayer can't get around it either, even if the grant is already on chain.

**The pools know the address.** `client.getOperatorPermissionsRegistry(pool)` on all 21 perp pools returns the same one, `0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a`.

**Control, same run, address passed in:**
- `buildPlacePerpStopOrder({ ...stop, operatorRegistry })` builds fine: the grant call `setOperatorApprovalGlobal` and the stop call `createPendingOrder` with 0.15 STT value.
- A client with `{ ...SOMNIA_HIDEKI_TESTNET_ADDRESSES, operatorPermissionsRegistry }` reads the grant: `isGloballyApproved` true for our test account 0x8432...BF21, `isApprovedForPool` false.

So it's only the missing default.

Where it comes from: `dist/perp/stops.js:490`, `operatorGrantCall()` does `p.operatorRegistry ?? w.addresses().operatorPermissionsRegistry` and throws, it never calls the pool. The bot kit hit the same thing and hardcodes the address in `packages/perp-core/src/config.ts:81`, and the comment above it says the key is not in the bundled testnet and mainnet sets. Anyone using the SDK directly finds out on their first TP/SL.

One more small thing: the JSDoc of `getOperatorPermissionsRegistry` calls it "The OperatorPermissionsRegistry this SpotPool gates operator calls through". It works on perp pools too, but a perp dev reading that would not think to try it.

## Suggested fix
Any one of these is enough, the first two together are best:
1. Add `operatorPermissionsRegistry: 0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a` to `SOMNIA_HIDEKI_TESTNET_ADDRESSES` (the bot kit already uses `0x15C7e8CE38F021c5b45d098AaD788f63090bF20A` for testnet, `config.ts:82`).
2. In `operatorGrantCall` and the two grant reads, fall back to `getOperatorPermissionsRegistry(pool)` before throwing.
3. If neither, make the error say how to get it, e.g. "pass operatorRegistry, you can read it with client.getOperatorPermissionsRegistry(pool)", and fix the JSDoc that promises a default.

## Evidence
- [`evidence/2910/stops-015.json`](../evidence/2910/stops-015.json): presets, the four errors, the 21 pools, the control run.
- First seen 2026-10-22 on SDK 0.32.1, same result now. The SDK on npm is still 0.32.1.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem 2.57.10, Hideki testnet (chain 50383), Node 24.
