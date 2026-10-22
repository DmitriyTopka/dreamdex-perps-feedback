# Perps market table lists min size but not lot size; e.g. 125 DOGE is above the documented minimum and still reverts InvalidQuantity
Severity: normal
Area: docs

## Steps to reproduce
1. Open https://app.testnet.dreamdex.io/docs/trading/perps-testnet, "Markets" table. Columns: Max leverage, Initial / maintenance margin, Price tick, Min size, Open interest cap, Paper USDso. DOGE-PERP row: "Min size 120 DOGE". There is no lot size column, and the Orders page does not mention a size increment either.
2. Read the DOGE market row from `client.listPerpMarkets()`: `lotSize` and `minQuantity`.
3. Simulate (eth_call only, nothing sent) `placeOrder` on the DOGE pool from 0x84326A92162Ece92ed257A31073fDd3a6599BF21, a GTC bid at 80% of mark, with 120, 125 and 130 DOGE.

## Expected
The user-facing market table shows every constraint that decides whether an order is accepted, or at least says that sizes must be a multiple of an increment and where to see it.

## Actual
The DOGE pool has `lotSize` 10 DOGE (1000000000 raw, 8 decimals) and `minQuantity` 120 DOGE. Simulation results:
```
PASSES 120 DOGE (= documented min size)
reverts 125 DOGE (above min size, not a multiple of lotSize 10) -> InvalidQuantity ["12500000000","1000000000"]
PASSES 130 DOGE
```
So a size the docs table presents as valid (anything at or above 120) is rejected unless it is a multiple of 10. The increment is large on several markets and is documented nowhere on the perps trading pages. Lot sizes read from `listPerpMarkets()` on 2026-10-22:

| market | min size (docs and chain) | lot size (chain only) |
|---|---|---|
| DOGE | 120 | 10 |
| 1000PEPE | 2,700 | 100 |
| PUMP | 1,800 | 100 |
| ADA, SUI, XLM, WLD | 46 / 13 / 54 / 26 | 1 |
| NEAR, ZRO, LIT, AVAX, LINK, XRP | 5.1 / 5.1 / 2.8 / 1.4 / 0.9 / 6.9 | 0.1 |

The developer page does say "a quantity on its lotSize, at least minQuantity", and the spot FAQ "My order was rejected" explains lotSize, so this is a gap on the perps trading pages, which are the ones linked for traders.

## Evidence
- Market row fields (DOGE): `tickSize 10000000000000`, `lotSize 1000000000`, `minQuantity 12000000000`, `baseDecimals 8` from `listPerpMarkets()`.
- Simulation script `sim102.mts` (viem `simulateContract`, account given as an address, no key): `placeOrder(true, 0, price, qty, 2^64-1, 0, 0, 0x0, 0)` on pool 0xc410012e39765cd5f772e84bacb19554aec040df at price 0.063 USDso (mark 0.0787576...). The revert decodes through the SDK `contractErrorsAbi` to `InvalidQuantity(uint256 quantity, uint256 constraint)` with args `[12500000000, 1000000000]`.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem simulateContract (eth_call), Hideki testnet (chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network, 2026-10-22.
