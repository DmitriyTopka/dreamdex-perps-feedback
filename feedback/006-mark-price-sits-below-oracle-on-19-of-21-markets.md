# Mark price sits below the oracle on 19 of 21 markets, even where the book trades above it, and the mark formula is not documented
Severity: major
Area: contracts

## Steps to reproduce
1. For every perp pool, read `client.getPerpState(pool)` (markPrice, indexPrice) and `client.getPerpFundingPremium(pool)` (lastObservedPremium, the book's premium over the oracle).
2. Repeat 5 times, 20 seconds apart.
3. Open BTC-PERP in the app and compare the header MARK, ORACLE and MID.
4. Search the docs (Perps on Testnet, Margin & Liquidations, Funding, Orders, developer Perps page, contract Specifications) for how the mark is computed.

## Expected
The mark is the price used for unrealized PnL, margin and liquidation, so it should be an unbiased estimate of the fair perp price: centred on the oracle when the book is flat, above it when the book trades above it. For comparison, Hyperliquid documents its mark as the median of (oracle + 150 s EMA of book mid minus oracle), its own best bid / best ask / last trade, and a weighted median of CEX perp mids, and describes it as "an unbiased and robust estimate of the fair perp price" (hyperliquid.gitbook.io/hyperliquid-docs/trading/robust-price-indices).

## Actual
The mark is below the oracle in all 5 samples on 19 of 21 markets, typically by 0.04% to 0.08%. On 5 of them the book trades above the oracle at the same time, so the mark is not following the book either:

| market | mark vs oracle (avg of 5) | book premium (avg of 5) | samples with mark < oracle |
|---|---|---|---|
| BTC | -0.0420% | +0.1904% | 5/5 |
| SOL | -0.0527% | +0.0455% | 5/5 |
| SUI | -0.0680% | +0.0407% | 5/5 |
| BNB | -0.0171% | +0.0478% | 5/5 |
| ETH | -0.0481% | +0.0012% | 5/5 |
| PUMP | -0.0803% | 0.0000% | 5/5 |
| NEAR | -0.0784% | -0.0079% | 5/5 |
| ADA | -0.0728% | 0.0000% | 5/5 |
| AVAX | -0.0740% | 0.0000% | 5/5 |
| LIT | -0.1111% | -0.1310% | 5/5 |
| ZEC | +0.0031% | -0.0300% | 2/5 |
| ZRO | +0.0038% | +0.0026% | 1/5 |

(the other 9 markets are in the same range, all 5/5 below)

App view on BTC-PERP at unix 1792673038: MARK 81,616.4, ORACLE 81,656.4, MID 81,811.6. The mark is under both the oracle and the mid.

A live check shows the effect on a trader: a 0.00013 BTC long filled at 81,835.9 (tx 0x8980ab89c2710f5e77eba65ebf79ed05226bffebf0bf16fc7d311481ededa30b) was marked at 81,615.8 straight away, -5.4% ROI on its margin before the market moved. Closed at 81,865.1 (tx 0xca85b2868fa314e1b2d1d69662eff9f242b9e014bcd1ed726b4db315e011d3ef), so the book itself had not moved against the position.

Why it matters: with the mark consistently 0.04-0.08% under the oracle, every long shows less PnL and reaches maintenance margin earlier than the same long on a venue with an unbiased mark; shorts get the mirror benefit. At 20x, 0.06% of price is 1.2% of margin. Since none of the docs say how the mark is built, a trader cannot tell whether this is intended (for example a conservative haircut) or a bias in the formula.

We do not know the formula, so we cannot say which input causes it. If it is intended, documenting it would close this report.

## Evidence
Script output above (SDK reads on Hideki, 2026-10-22 ~14:10 UTC, 5 samples x 21 pools), the two transaction hashes, and the app header snapshot. Owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21, operator 0x13f05c8e15cC0d7d3abff02C144fb74778018a55.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem, Hideki testnet (chain 50383), app.testnet.dreamdex.io.
