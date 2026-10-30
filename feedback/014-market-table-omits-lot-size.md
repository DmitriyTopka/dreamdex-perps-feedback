# Perps market table lists min size but not lot size; e.g. 125 DOGE is above the documented minimum and still reverts InvalidQuantity
Severity: normal

Area: docs

The "Markets" table on Perps on Testnet gives each market's min size but not its lot size, and no perps trading page mentions that sizes must be a multiple of an increment. The increments are coarse on some markets: 10 DOGE, 100 1000PEPE, 100 PUMP. So 125 DOGE, 2,750 1000PEPE and 1,850 PUMP are all above the minimum the table shows, and all revert with `InvalidQuantity`. A trader reading the table has no way to know the valid sizes.

## Steps to reproduce
One command, read-only, no key ([`scripts/lot-014.ts`](../scripts/lot-014.ts)):

```bash
cd scripts && npm install && npx tsx lot-014.ts > out.json
```

It:
1. Fetches `/docs/trading/perps-testnet/README.md`, `orders.md`, `margin-and-liquidations.md` and `funding.md`, prints the market table header and every line that mentions a lot, an increment or "multiple of".
2. Reads `lotSize` and `minQuantity` for all 21 markets from `client.listPerpMarkets()` and from each pool's `getOrderBookParameters()`, and checks the docs' "Min size" column against the chain.
3. Simulates (`eth_call`, nothing is sent) `placeOrder(true, 0, price, qty, 2^64-1, 0, 0, 0x0, 0)`, a GTC bid at 80% of mark, from our test account 0x84326A92162Ece92ed257A31073fDd3a6599BF21 on DOGE, 1000PEPE and PUMP with size = min, min + half a lot, min + one lot. Reverts are decoded with the SDK's `contractErrorsAbi`.

## Expected
The market table traders are sent to shows every per-market rule that decides whether an order is accepted, or at least says that sizes must be a multiple of an increment and where to see it.

## Actual
Run 2026-10-30 06:57 UTC, block 36,902,182.

The table header is `| Market | Max leverage | Initial / maintenance margin | Price tick | Min size | Open interest cap | Paper USDso |`. No lot size column, and the four perps trading pages have zero lines about lots or increments. The "Min size" column matches the chain on 21 of 21 markets, so that part is right.

Simulation results:

| market | lotSize | min size | size = min | min + half a lot | min + one lot |
|---|---|---|---|---|---|
| DOGE-PERP | 10 | 120 | 120 passes | 125 reverts `InvalidQuantity(12500000000, 1000000000)` | 130 passes |
| 1000PEPE-PERP | 100 | 2,700 | 2,700 passes | 2,750 reverts `InvalidQuantity(2750000000000000000000, 100000000000000000000)` | 2,800 passes |
| PUMP-PERP | 100 | 1,800 | 1,800 passes | 1,850 reverts `InvalidQuantity(1850000000, 100000000)` | 1,900 passes |

`InvalidQuantity` is selector `0x4f174b29`; its arguments are the raw quantity and the raw lotSize.

Lot sizes for all 21 markets (chain only, they appear nowhere on the perps trading pages):

| lot size | markets (min size) |
|---|---|
| 100 | 1000PEPE (2,700), PUMP (1,800) |
| 10 | DOGE (120) |
| 1 | ADA (46), SUI (13), XLM (54), WLD (26) |
| 0.1 | NEAR (5.1), ZRO (5.1), LIT (2.8), AVAX (1.4), LINK (0.9), XRP (6.9) |
| 0.01 | VVV (0.44), HYPE (0.12), SOL (0.1) |
| 0.001 | ZEC (0.009), TAO (0.044), BNB (0.014) |
| 0.0001 | ETH (0.004) |
| 0.00001 | BTC (0.00013) |

On 10 markets the lot is 5% or more of the minimum (ZEC and LINK 11%, SOL 10%, DOGE and HYPE 8.3%, BTC and SUI 7.7%, AVAX and BNB 7.1%, PUMP 5.6%). There the gap between valid sizes near the minimum is large enough that a size typed by hand, or computed from a notional, is likely to miss the grid.

The rule itself is written down, just not where perps traders look: the developer Perps page says "A price must sit on the market's `tickSize` and a quantity on its `lotSize`, at least `minQuantity`", and the support FAQ "My order was rejected" says sizes must be a whole multiple of `lotSize`. Neither gives a market's actual value, so a trader still cannot tell that DOGE moves in steps of 10.

**What it costs.** A hand-sized order or a bot that sizes from notional (say 10 USDso of DOGE at 0.08, which is 125 DOGE) reverts and pays gas for nothing, and the trader sees a raw `InvalidQuantity` with two large integers. The table invites exactly this: it shows a minimum and nothing else, which reads as "anything at or above it".

## Suggested fix
Add a "Size step" column to the market table, generated from `lotSize` like the other columns (DOGE: 10 DOGE, BTC: 0.00001 BTC), and one sentence under it: "Order size must be a whole multiple of the size step, at least the min size." Link the FAQ entry from the Orders page.

## Evidence
- Script output with the docs header, the lot/increment line search, all 21 rows (raw and human values, docs vs chain) and the three simulations: [`evidence/3010/lot-014.json`](../evidence/3010/lot-014.json).
- Re-run: `cd scripts && npx tsx lot-014.ts > ../evidence/3010/lot-014.json` (exit code 1 while the table has no lot column).
- Not checked today: whether the app's order ticket rounds or blocks an off-grid size before sending. This report is about the docs table; the reverts above are from `eth_call` on the pool directly.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem (`eth_call` via JSON-RPC), Hideki testnet (chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network. Docs fetched 2026-10-30.
