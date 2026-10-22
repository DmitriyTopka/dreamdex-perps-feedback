# Docs say the per-account position cap is a tenth of the OI cap on most markets; it is a tenth on 1 of 21
Severity: normal
Area: docs

## Steps to reproduce
1. Read "Perps on Testnet for Developers", Common pitfalls: "Each account has a position cap per market, a tenth of the market's open interest cap on most markets."
2. For every perp market call `client.getPerpRiskParams(pool)` (fields `maxPositionSize`, `maxOpenInterest`) and `client.getMaxPerpOrderSize(...)` (field `maxPositionSize`). Both report the same per-account cap.
3. Divide the cap by `maxOpenInterest`.

## Expected
About 0.1 on most markets.

## Actual
0.1 on one market. On Hideki, 2026-10-22:

| ratio cap / OI cap | markets |
|---|---|
| 0.05 (1/20) | NEAR, XLM, AVAX, LINK, SUI, ADA, BNB, DOGE, XRP, HYPE, SOL, ETH (12) |
| ~0.025 (1/40) | ZRO, LIT, VVV, 1000PEPE, PUMP, WLD (6) |
| 0.0999 (1/10) | TAO |
| 0.25 (1/4) | ZEC |
| 0.2025 | BTC |

Example rows (raw units): ETH cap 399.5612 ETH vs OI cap 7,991.225 ETH (0.0499); ZRO cap 25,059.9 vs 1,002,398 (0.0249); BTC cap 100 BTC vs 493.6309 BTC (0.2025).

A builder who sizes against "a tenth of OI" overestimates the cap by 2x on most markets and 4x on the newest ones, and gets `MaxPositionSizeExceeded()` (0x714b36d6). The SDK already exposes the real number (`maxPositionSize`), so the fix is to point to it rather than state a ratio, or to state the ratio per market tier.

## Evidence
Output of a loop over `listPerpMarkets()` calling `getPerpRiskParams` and `getMaxPerpOrderSize` for owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21. ZRO risk params, for reference: initialMarginBps 2000, maintenanceMarginBps 1000, maxOpenInterest 1002398e18, maxPositionSize 25059.9e18.

## Environment
@somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383).
