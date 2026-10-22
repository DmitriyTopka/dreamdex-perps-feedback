# Funding docs say shorts pay when the perp is below the index, but longs pay in 11 of 21 markets right now
Severity: normal
Area: docs

## Steps to reproduce
1. Read "Funding" (app.testnet.dreamdex.io/docs/trading/perps-testnet/funding): "Perp above the index (positive funding): longs pay shorts. Perp below the index (negative funding): shorts pay longs."
2. For every perp market call `client.getPerpState(pool)` (SDK 0.32.1) and compare `emaPremium` with `fundingRate`.
3. Open VVV-PERP in the app: the header shows MARK 27.380 below ORACLE 27.387, and LAST FUNDING +0.0100%.

## Expected
Either the funding sign follows the premium as the page says, or the page states the full formula, including the interest component that keeps funding positive near zero premium.

## Actual
`fundingRate` matches `premium + clamp(0.01% - premium, -0.05%, +0.05%)` on all 21 markets, the same formula Binance and Hyperliquid use. Neither the 0.01% interest term nor the ±0.05% clamp is on the page. Result: in 11 markets the premium is negative (perp below index) and longs still pay shorts.

Snapshot 2026-10-22 ~14:00 UTC (per 8-hour window, hourly settlement pays 1/8):

| market | emaPremium | fundingRate | who pays |
|---|---|---|---|
| VVV | -0.0159% | +0.0100% | longs |
| ZEC | -0.0198% | +0.0100% | longs |
| TAO | -0.0151% | +0.0100% | longs |
| LINK | -0.0141% | +0.0100% | longs |
| ETH | -0.0158% | +0.0100% | longs |
| NEAR | -0.0094% | +0.0100% | longs |
| PUMP, AVAX, ADA, DOGE, XLM | -0.0000% to -0.0033% | +0.0100% | longs |
| LIT | -0.1274% | -0.0774% | shorts |
| WLD | -0.0885% | -0.0385% | shorts |
| BTC | +0.1814% | +0.1314% | longs |

Why it matters for traders: a long opened because "the perp is below the index, so I collect funding" pays 0.01% per 8 hours instead, about 11% a year on notional, at 20x leverage roughly 2.2% of margin per month. The page's own example (0.08%) also cannot show this. Hyperliquid's and Binance's funding pages both spell out the interest rate and the clamp; this page is the one a dreamDEX trader reads.

## Evidence
Script output above from `getPerpState` on Hideki testnet, 21 pools, 21/21 rates reproduced by the formula. App header on VVV-PERP at unix 1792672873: MARK 27.380, ORACLE 27.387, LAST FUNDING +0.0100%.

## Environment
@somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), app.testnet.dreamdex.io, 2026-10-22.
