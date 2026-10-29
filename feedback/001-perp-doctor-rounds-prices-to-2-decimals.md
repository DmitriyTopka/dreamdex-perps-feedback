# perp:doctor prints every price of 1 or more with 2 decimals, so on XRP a 43-tick spread shows as bid=1.31 ask=1.31
Severity: normal

Area: bot kit

## Steps to reproduce
1. dreamdex-bot-kit at commit 2579866, `npm ci`, then `NETWORK=hideki npm run perp:doctor` (no key needed).
2. Compare its `book[bid= ask=]` with the real top of book. Our read-only script does that for all 21 markets ([`scripts/doctor-001.ts`](../scripts/doctor-001.ts)):

```bash
cd scripts && npm install && npx tsx doctor-001.ts > out.json
```

It reads the best bid and ask from the chain with `client.getBookTopsOnchain` and prints each price twice: through the doctor's own `px()` copied as is, and with as many decimals as the tick has.

## Expected
The comment right above `px()` in `scripts/perp-doctor.ts` says it gives "a price with enough digits to read, whether it is 83,000 or 0.0058". And `docs/perps.md` in the kit, line 15, tells you to start with it: "Run `npm run perp:doctor` first. It lists the markets, their live marks and books..." So I expected prices at tick precision.

## Actual
`scripts/perp-doctor.ts:44`:

```ts
const px = (v: number) => (Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(4));
```

Anything 1 or above gets 2 decimals, whatever the tick. Below 1 it gets 4 significant digits, which is also short for 1000PEPE (tick 0.0000001). The tick is right there, the same script prints it on line 132.

At 2026-10-29 16:00 UTC (block 36,364,039) our script passed the live chain prices through the doctor's own `px()`. 11 of 21 markets lose digits. The raw doctor output from the run just before is in `perp-doctor-output.txt`; prices moved a little in between.

| market | tick | doctor's px() shows | chain has | spread in ticks |
|---|---|---|---|---|
| **XRP-PERP** | 0.0001 | **bid=1.31 ask=1.31** | bid=1.3090 ask=1.3133 | 43 |
| NEAR-PERP | 0.0001 | bid=4.65 ask=4.66 | bid=4.6531 ask=4.6572 | 41 |
| ZRO-PERP | 0.0001 | bid=1.76 ask=1.77 | bid=1.7582 ask=1.7689 | 107 |
| LIT-PERP | 0.0001 | bid=3.25 ask=3.27 | bid=3.2527 ask=3.2723 | 196 |
| AVAX-PERP | 0.001 | bid=9.00 ask=9.03 | bid=9.002 ask=9.027 | 25 |
| LINK-PERP | 0.001 | bid=11.94 ask=11.97 | bid=11.943 ask=11.969 | 26 |
| VVV-PERP | 0.001 | bid=25.72 ask=25.88 | bid=25.722 ask=25.877 | 155 |
| TAO-PERP | 0.001 | bid=258.55 ask=259.32 | bid=258.547 ask=259.325 | 778 |
| BNB-PERP | 0.001 | bid=749.12 ask=751.07 | bid=749.116 ask=751.066 | 1950 |
| ZEC-PERP | 0.001 | bid=1415.49 ask=1424.00 | bid=1415.494 ask=1424.001 | 8507 |
| 1000PEPE-PERP | 0.0000001 | bid=0.004716 ask=0.004745 | bid=0.0047164 ask=0.0047448 | 284 |

The other 10 print fine, because their tick fits the format: ticks of 0.01 and 0.1 (BTC, ETH, SOL, HYPE) and the markets under 1 where 4 significant digits are enough (SUI, ADA, WLD, XLM, DOGE, PUMP).

The doctor's own XRP line from that run was `mark=1.31 ... book[bid=1.31 ask=1.31] ... tick=0.0001`. On 2026-10-22 NEAR, ZRO and AVAX looked like that too (`bid=5.00 ask=5.00` and so on), so it depends on where the price sits, not on one market.

And this is the script the kit says to run first. A flat book reads as "locked market, no spread" and a mark that looks equal to bid and ask hides where the mark really is. You can't use it to check a quote or the tick-alignment of a price you're about to send.

## Suggested fix
Use the market's tick:

```ts
const px = (v: number, tickSize: bigint) => {
  const dp = Math.max(0, -Math.floor(Math.log10(Number(formatUnits(tickSize, 18)))));
  return v.toFixed(dp);
};
```

and call it as `px(bid, BigInt(m.info.tickSize))` (same for ask and mark). `tickSize` is in quote units and USDso, the quote token, has 18 decimals. For 1000PEPE that gives 7 decimals, for BTC 1.

## Evidence
- [`evidence/2910/doctor-001.json`](../evidence/2910/doctor-001.json): block, time, all 21 rows.
- [`evidence/2910/perp-doctor-output.txt`](../evidence/2910/perp-doctor-output.txt): the doctor's own output from the run just before the script, no wallet.

## Environment
dreamdex-bot-kit 2579866 (still the latest commit on 2026-10-29), @somnia-chain/markets-sdk 0.32.1, Node 24.14.1, Hideki testnet (chain 50383), no wallet.
