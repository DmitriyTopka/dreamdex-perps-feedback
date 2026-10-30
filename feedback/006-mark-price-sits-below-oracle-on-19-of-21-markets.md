# Perp mark sits below the oracle index in 3,632 of 4,200 settlements (21 markets, 8 days), even while the index falls; the docs never say how the mark is built
Severity: major

Area: contracts

The pool's mark (`tryGetMarkPrice`, the price margin and liquidation read) is below its own oracle index almost all the time. On 10 of 21 markets it was below in every one of the last 200 hourly settlements, typically by 0.04% to 0.10%. An EMA that lags the index cannot explain it: over the same 8 days the index fell on 19 of 21 markets, and a lagging EMA in a falling market sits above the index, not below. Longs are marked down and reach maintenance earlier than they should; shorts get the mirror benefit. None of the perps docs say what the mark is.

## Steps to reproduce
One command, read-only, no key ([`scripts/mark-006.ts`](../scripts/mark-006.ts)):

```bash
cd scripts && npm install && npx tsx mark-006.ts > out.json
```

For all 21 pools it reads:
1. Live, 6 rounds 20 s apart: `client.getPerpState(pool)` (`markPrice`, `indexPrice`), `client.getPerpFundingPremium(pool)` and the on-chain top of book (`client.getBookTopsOnchain`, mid = (bestBid + bestAsk) / 2).
2. History: the last 200 settlements from `client.listFundingRateHistory(pool)`, which record `markPrice` and `indexPrice` at each settlement, plus a count of settlements where the index had fallen since the previous one and the mark was still below it.
3. Source: the pool's `oracle()` and that contract's `getMarkPrice()` and `getPrice()` at one block.
4. The BTC round trip below, read at its own blocks.

Then search the perps docs (Perps on Testnet, Margin & Liquidations, Funding, Orders, the developer Perps page, Contract Specifications) for how the perp mark is computed.

## Expected
The mark drives unrealized PnL, margin and liquidation, so it should be an unbiased estimate of the fair perp price, centred on the oracle over time. Hyperliquid, for comparison, documents its mark as a median of oracle, own book and external perp mids, built to be "an unbiased and robust estimate of the fair perp price".

The SDK says what the mark should be. `PerpStateOnchain.markPrice` is an "EMA-smoothed oracle mark price" (`dist/perp/state.d.ts:13`), and the SDK's price-feed methodology (`docs/PRICES.md`, section 07, lines 392-415) says the mark "is not a different data source", only an EMA over the spot series with alpha 0.125, about 80 s of smoothing on the DEX oracles. An EMA like that trails the index in a trend and returns to it when the price is flat. It should not hold one side of the index for days.

## Actual
Measured 2026-10-30. History covers 2026-10-21 23:xx to 2026-10-30 06:xx UTC; the live rounds ran 07:07 to 07:10 UTC, blocks 36,908,180 to 36,910,262.

- **History:** mark below index in **3,632 of 4,200** settlements (86%), above in 564.
- **Against the lag explanation:** in **1,970 of 2,255** settlements where the index had fallen since the previous settlement, the mark was still below it. BTC's index fell from 84,275.8 to 78,495.7 over the window (-6.9%), yet the mark was below the index in 200 of 200 settlements, including all 118 where the index had just fallen.
- **Live:** mark below index in all 6 rounds on 17 of 21 markets. On 7 of those (BTC, AVAX, SUI, ZEC, TAO, LIT, BNB; LINK left out, see the footnote) the average book mid was above the index at the same time, so the mark is not following the book either.
- **Source:** on 21 of 21 pools the pool's mark equals its `oracle().getMarkPrice()` and its index equals `oracle().getPrice()` at the same block. Both numbers come from the same per-pool aggregator contract, so the gap is inside the oracle, not in the pool.

| market | settlements, mark < index | mean mark vs index | index fell, mark still below | live rounds mark < index | live mark vs index | live book mid vs index |
|---|---|---|---|---|---|---|
| LIT-PERP | 200/200 | -0.0982% | 113/113 | 6/6 | -0.0222% | +0.0272% |
| WLD-PERP | 200/200 | -0.0770% | 120/120 | 6/6 | -0.0733% | -0.0540% |
| ADA-PERP | 200/200 | -0.0741% | 105/105 | 6/6 | -0.0477% | -0.0067% |
| AVAX-PERP | 200/200 | -0.0648% | 106/106 | 6/6 | -0.0558% | +0.1244% |
| SUI-PERP | 200/200 | -0.0646% | 118/118 | 6/6 | -0.0407% | +0.0868% |
| NEAR-PERP | 200/200 | -0.0617% | 117/117 | 6/6 | -0.0766% | -0.1874% |
| LINK-PERP | 200/200 | -0.0607% | 102/102 | 6/6 | -0.0505% | thin book* |
| XLM-PERP | 198/200 | -0.0603% | 109/110 | 6/6 | -0.0392% | -0.0075% |
| DOGE-PERP | 200/200 | -0.0556% | 96/96 | 6/6 | -0.0434% | -0.0243% |
| SOL-PERP | 199/200 | -0.0452% | 102/103 | 6/6 | -0.0428% | -0.0002% |
| XRP-PERP | 200/200 | -0.0445% | 117/117 | 6/6 | -0.0590% | -0.0682% |
| PUMP-PERP | 188/200 | -0.0426% | 94/103 | 6/6 | -0.0837% | -0.0776% |
| ETH-PERP | 199/200 | -0.0419% | 108/108 | 6/6 | -0.0500% | -0.0060% |
| HYPE-PERP | 189/200 | -0.0415% | 87/92 | 0/6 | +0.0274% | thin book* |
| BTC-PERP | 200/200 | -0.0392% | 118/118 | 6/6 | -0.0374% | +0.1330% |
| 1000PEPE-PERP | 180/200 | -0.0364% | 95/103 | 0/6 | +0.0829% | +0.1870% |
| TAO-PERP | 164/200 | -0.0344% | 84/104 | 6/6 | -0.0472% | +0.0225% |
| VVV-PERP | 120/200 | -0.0051% | 66/105 | 0/6 | +0.0559% | +0.0973% |
| BNB-PERP | 85/200 | -0.0025% | 46/101 | 6/6 | -0.0187% | +0.0238% |
| ZEC-PERP | 94/200 | -0.0004% | 58/102 | 6/6 | -0.0118% | +0.1364% |
| ZRO-PERP | 16/200 | +0.0388% | 9/112 | 0/6 | +0.1375% | -0.0186% |

\* LINK and HYPE mids sat 4% to 10% above the index because one side of the book was far away; they are in the JSON but say nothing about the mark.

The first report run (2026-10-22, 5 samples) found the same thing: mark below the oracle in every sample on 19 of 21 markets.

**What it does to a position.** Our BTC long on 22 Oct (tx `0x8980ab89c2710f5e77eba65ebf79ed05226bffebf0bf16fc7d311481ededa30b`, block 30,210,002): at that block the mark sat 0.045% under the index. At 20x that alone shows the position about 0.9% of margin worse than the oracle would. The rest of its opening loss was the fill price, not the mark.

In general: with the mark 0.04% to 0.10% under the oracle, every long shows less PnL than it has and hits maintenance margin earlier. At 20x, 0.06% of price is 1.2% of margin. A short gets the same amount in its favour. Bots that read `markPrice` for PnL, stops or liquidation distance inherit the bias.

**Why, as far as I can tell.** The SDK says the pool's aggregator oracle "chains to the sim-controlled oracle and then to the agent EMA feed" (`dist/perp/state.d.ts:80-82`, `dist/perp/system.js:18-19`). My guess, not confirmed: the index and the mark come from different legs of that chain, and the mark's leg runs below the index's. I cannot read the aggregator's source, so I cannot name the line.

**Docs.** The perps trading pages and the developer Perps page never say how the mark is computed, or even that margin and liquidation use it. The only mark definition in the docs is the spot stop-order trigger feed. If the offset is intended (for example a haircut), saying so would close this report.

## Suggested fix
1. Find which leg of the aggregator produces the offset and make the perp mark an EMA of the same series the index uses, so `mark - index` averages to zero over a day. The check is one line of the script: `historyMarkBelowIndex` should land near half of `historySettlements`.
2. Document the perp mark on Margin & Liquidations: inputs, smoothing (alpha, cadence), that unrealized PnL, margin and liquidation use it, and that `tryGetMarkPrice()` / `getPerpState().markPrice` is the value to read.
3. If you want the mark to reflect the book, consider the Hyperliquid median of oracle-plus-book-EMA, own book and external perp mids.

## Evidence
- Script output with blocks, times, every live sample, per-pool history and the oracle source check: [`evidence/3010/mark-006.json`](../evidence/3010/mark-006.json) (`summary`, `history`, `live`, `oracleSource`, `trades`).
- Re-run: `cd scripts && npx tsx mark-006.ts > ../evidence/3010/mark-006.json` (last run 2026-10-30 07:07-07:10 UTC). The live rounds change with the market; the history counts move slowly.
- Not re-checked today: the app header. The 2026-10-22 snapshot is a manual reading; the chain values at that second are in `trades[0].reads[2]` and match it within 0.01%.
- Accounts: owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21, operator 0x13f05c8e15cC0d7d3abff02C144fb74778018a55.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem, Hideki testnet (chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network, indexer https://hideki-dev.smk.somnia.host/v1/graphql, app.testnet.dreamdex.io. Docs fetched 2026-10-30.
