# perp-funding's default entry threshold (10% APR) sits under the protocol's fixed interest floor (10.95% APR), so it opens on 20 of 21 markets and its exit can never fire on 17 of them
Severity: normal

Area: SDK

## Steps to reproduce
1. Bot kit at 2579866, perp-funding with defaults: `PERP_FUNDING_MIN_APR=0.1`, `PERP_FUNDING_EXIT_APR=0.03` (`strategies/perp-funding/src/index.ts:50-51`).
2. For every perp market, run the kit's own `liveFunding()` (the call the strategy makes each cycle) and apply the strategy's test `Math.abs(funding.apr) >= MIN_APR`.

## Expected
The README describes a carry bot that "takes the paid side when the rate clears the entry threshold and closes when it falls through the exit one". With a 10% default, a reader expects it to sit out until funding is unusually high, and to step aside when it fades.

## Actual
Funding on Hideki never goes under +0.0100% per 8 h while the premium stays near zero. That is the fixed interest term from report 005: rate = premium + clamp(0.01% - premium, ±0.05%). Annualised by the kit's converter, it is exactly 10.95% APR, just above the 10% default. So:

- the bot qualifies to open on **20 of 21** markets;
- on **17** of them the rate is exactly the 0.0100% floor, so the "signal" is just the constant interest term;
- on those 17 the rate cannot drop under the 3% exit while the premium stays inside the ±0.05% clamp, so the carry exit never fires and the short is held with full price exposure;
- on 11 of the 17 the premium is negative, i.e. the perp already trades below the index (most of all on VVV, ZEC, TAO, NEAR, LINK, XRP), and the bot still goes short "for funding".

Snapshot 2026-10-22 16:25:54 UTC (rate per 8 h window, APR from `liveFunding`):

| market | rate / 8 h | premium | APR | default decision |
|---|---|---|---|---|
| ZRO, 1000PEPE, PUMP, XLM, AVAX, ADA, DOGE, ETH, SUI, BNB, HYPE | +0.0100% | -0.0042% to +0.0462% | 10.95% | short (interest floor only) |
| VVV, ZEC, TAO, NEAR, LINK, XRP | +0.0100% | -0.0065% to -0.0199% | 10.95% | short (interest floor only) |
| SOL | +0.0120% | +0.0620% | 13.18% | short |
| BTC | +0.1466% | +0.1966% | 160.50% | short |
| LIT | -0.0803% | -0.1303% | -87.95% | long |
| WLD | -0.0056% | -0.0556% | -6.17% | none |

Script result: `default PERP_FUNDING_MIN_APR=0.1: enters on 20 of 21; 17 of them only because of the fixed 0.01%/8h interest term`.

Suggested fix: compare the premium part (rate minus the interest term) against the threshold, or raise the default above 10.95% and say in the README why. Also worth a line in the README that the floor exists, since it decides which side "carry" is on most markets.

Minor, same file: the cap check `if (held >= MAX_POSITION)` (line 127) sits inside `else if (!position && ...)` (line 126), where `held` (line 101) is always 0, so it can never be true. The "at the position cap, not adding" branch is dead code. Today it does no harm, because the bot never adds to an open position.

## Evidence
Output of `liveFunding()` and `client.getPerpState(pool)` for all 21 pools from `listPerpMarkets()`, as above. Same rates appear in `perp:doctor` (e.g. `BTC-PERP ... funding 160.496% (pays shorts)`).

## Environment
dreamdex-bot-kit 2579866, @somnia-chain/markets-sdk 0.32.1, Hideki testnet (chain 50383), 2026-10-22.
