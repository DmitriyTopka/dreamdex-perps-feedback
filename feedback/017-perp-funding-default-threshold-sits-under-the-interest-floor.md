# perp-funding's default entry threshold (10% APR) is under the +0.01%/8h default funding rate (10.95% APR), so it opens a short on any quiet market and its exit almost never fires
Severity: normal

Area: bot kit

## Steps to reproduce
Read-only, no key ([`scripts/funding-017.ts`](../scripts/funding-017.ts)):

```bash
cd scripts && npm install && npx tsx funding-017.ts > out.json
```

For every perp pool it reads `fundingRate`, `emaPremium` and the window from `client.getPerpState(pool)`, which is what the kit's `liveFunding()` reads (`packages/perp-core/src/funding.ts:74-75`). It annualises the rate with the SDK's `annualizedFundingRate`, as the kit does (`funding.ts:48`), and applies the strategy's tests with the defaults `PERP_FUNDING_MIN_APR=0.1` and `PERP_FUNDING_EXIT_APR=0.03` (`strategies/perp-funding/src/index.ts:50-51`, tests on lines 116-119). Then it replays the same tests over the last 200 settlements of each pool from the indexer.

## Expected
The README describes a carry bot that "takes the paid side when the rate clears the entry threshold and closes when it falls through the exit one". With a 10% default I expect it to sit out until funding is unusually high, and to step aside when it fades back to normal.

## Actual
Normal on this venue is +0.01% per 8 h. The pools charge `premium + clamp(0.01% - premium, -0.05%, +0.05%)` (report 005), so while the premium is between -0.04% and +0.06% the rate is exactly +0.0100%. That is the default interest rate, not a floor: it goes negative when the premium drops under -0.05%. The kit's converter annualises +0.01% per 8 h to 10.95% APR, just above the 10% default. So the entry test passes on any market at rest, and the bot goes short for nothing more than the constant interest term.

The exit is the other half. A short is closed when `|APR|` falls under 3% or the rate stops being positive (line 119). Under 3% APR means under 0.00274% per 8 h, and with the formula above that needs the premium to fall below about -0.047%. At rest the rate sits at 10.95% APR, nowhere near 3%, so the carry exit does not fire and the short stays open with full price exposure.

**Live, 2026-10-30 06:54:30 UTC, block 36,900,469.** The formula reproduces `fundingRate` on 21/21 pools. With the defaults:

| market | rate / 8 h | premium | APR | default decision |
|---|---|---|---|---|
| LINK | +0.4790% | +0.5290% | 524.52% | short |
| BTC | +0.3557% | +0.4057% | 389.52% | short |
| BNB | +0.1561% | +0.2061% | 170.97% | short |
| HYPE | +0.0607% | +0.1107% | 66.43% | short |
| ETH | +0.0212% | +0.0712% | 23.22% | short |
| ZRO, VVV, ZEC, TAO, AVAX, SOL | +0.0100% | 0.0000% to +0.0242% | 10.95% | short, interest term only |
| LIT, 1000PEPE, PUMP, WLD, NEAR, XLM, SUI, ADA, DOGE, XRP | +0.0100% | -0.0238% to just under 0 | 10.95% | short, interest term only, premium negative |

- The bot enters on **21 of 21** markets.
- On **16** of them the rate is exactly the +0.0100% default, so the only "signal" is the interest term.
- On **10** of those 16 the premium is negative, meaning the book trades under the index (on PUMP, WLD, XLM and ADA by less than 0.00005%, so it prints as 0.0000%), and the bot still shorts "for funding". NEAR is the clearest at -0.0238%.

**History, 4,200 settlements (200 per pool, 2026-10-21 22:55 to 2026-10-30 06:54 UTC):**
- **3,373** settled at exactly +0.0100%;
- the default entry test passes on **4,131** (98%);
- a short's exit would have fired on only **206** (4.9%), and on **11** markets never once in those 8 days (BTC, BNB, LINK, ADA, AVAX, PUMP, SUI, TAO, VVV, XLM, ZRO).

What it costs: the bot runs on one market, `PERP_SYMBOL`, BTC-PERP by default. On BTC on 2026-10-30 the premium is real and the entry is a fair carry trade. Point it at any quiet market and it opens a 50 USDso short to earn 0.01% per 8 h, about 0.015 USDso a day. A 1% move against it costs 0.50 USDso, more than a month of that funding, and the exit that is supposed to take it out when the carry is gone will not trigger. The README warns that carry is not a hedge. It does not say that the default threshold treats the venue's resting rate as a carry signal.

Minor, same file: the cap check `if (held >= MAX_POSITION)` (line 127) sits inside `else if (!position && worthHolding && me)` (line 126), where `held` (line 101) is always 0, so it can never be true and the "at the position cap, not adding" branch is dead code. It does no harm today because the bot never adds to an open position.

## Suggested fix
Compare the part of the rate that is not the interest term against the thresholds:

```ts
const INTEREST_PER_WINDOW = 10n ** 14n; // 0.01% per 8 h window, 1e18-scaled
const excess = state.fundingRate - INTEREST_PER_WINDOW;
const excessApr = annualizedFundingRate(excess, Number(state.fundingWindowSec));
const worthHolding = Math.abs(excessApr) >= MIN_APR;
const worthKeeping = Math.abs(excessApr) >= EXIT_APR;
```

(the paid side still comes from the sign of the full rate). If the kit prefers to keep the raw rate, raise the default above 10.95% and say in the README why, and add one line that funding rests at +0.01% per 8 h, because that decides which side "carry" is on for most markets most of the time.

## Evidence
- [`evidence/3010/funding-017.json`](../evidence/3010/funding-017.json): block and time, all 21 live rows with the kit's APR and the default decision, and per-pool history counts.
- First measured 2026-10-22 16:25 UTC: then the bot entered on 20 of 21 markets, 17 at exactly +0.0100%. The picture is the same a week later.
- Re-run: `cd scripts && npx tsx funding-017.ts > ../evidence/3010/funding-017.json`.

## Environment
dreamdex-bot-kit 2579866, @somnia-chain/markets-sdk 0.32.1, Node 24.14.1, Hideki testnet (chain 50383), indexer https://hideki-dev.smk.somnia.host/v1/graphql. Read-only, no wallet.
