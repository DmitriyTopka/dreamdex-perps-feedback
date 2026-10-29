# Perps dev docs say a perp tx costs 0.0003-0.003 STT, but their own 1.56M gas figure already costs 0.0094 STT. Our PostOnly placements cost up to 0.014 STT
Severity: normal
Area: docs

## Steps to reproduce
Read-only, no key ([`scripts/gas-004.ts`](../scripts/gas-004.ts)):

```bash
cd scripts && npm install && npx tsx gas-004.ts > out.json
```

It reads our 8 receipts from 2026-10-22 (small PostOnly bids and cancels with `placeOrderFor` / `cancelOrderFor` from a linked bot key), fetches the two docs lines, and runs three `eth_estimateGas` on ETH-PERP from our test account (simulated, nothing sent).

## Expected
"Perps on Testnet for Developers" gives two numbers a builder uses to fund a bot key:

1. "transactions to perp pools measured on testnet cost between 0.0003 and 0.003 STT each"
2. "Successful `placeOrderFor` transactions on testnet used up to about 1.56M gas"

I expected real orders to land inside those.

## Actual
First, the two lines don't agree with each other. Gas price on Hideki is 6 gwei (`eth_gasPrice`, same on 2026-10-22 and now). 1.56M gas x 6 gwei = **0.00936 STT**, about 3x the "0.003" upper bound on the same page.

Our receipts, all `success`, all at 6 gwei:

| time (UTC, 2026-10-22) | call | gasUsed | STT | vs 1.56M | vs 0.003 STT |
|---|---|---|---|---|---|
| 12:15:37 | placeOrderFor ETH PostOnly | 2,342,262 | 0.014054 | 1.50x | 4.68x |
| 12:15:38 | cancelOrderFor ETH | 176,715 | 0.001060 | 0.11x | 0.35x |
| 12:16:09 | placeOrderFor ETH PostOnly | 527,361 | 0.003164 | 0.34x | 1.05x |
| 12:16:12 | placeOrderFor ETH PostOnly | 511,148 | 0.003067 | 0.33x | 1.02x |
| 12:16:14 | placeOrderFor ETH PostOnly | 1,565,831 | 0.009395 | 1.00x | 3.13x |
| 12:16:43 | placeOrderFor ZRO PostOnly | 1,831,903 | 0.010991 | 1.17x | 3.66x |
| 12:16:46 | placeOrderFor ZRO PostOnly | 416,655 | 0.002500 | 0.27x | 0.83x |
| 12:16:48 | cancelOrderFor ZRO | 257,095 | 0.001543 | 0.16x | 0.51x |

So 5 of 6 placements cost more than 0.003 STT, and 3 of 6 used more than 1.56M gas (the 1,565,831 one just barely). (In the first version of this report I wrote "4 of 6" and "2 of 6", I counted wrong, sorry. The table didn't change.)

Fresh estimates now, ETH-PERP, 2026-10-29 16:04 UTC, block 36,366,356, owner `placeOrder` with min size:

| order | eth_estimateGas | STT at 6 gwei |
|---|---|---|
| PostOnly bid at the best bid | 2,091,232 | 0.0125 |
| PostOnly bid 500 ticks lower, new price level | 2,112,748 | 0.0127 |
| IOC buy at the best ask | 3,467,818 | 0.0208 |

An estimate is not gas used, it's an upper bound. But a resting order estimating at 2.1M and the docs' own "3.2M for a resting order" both sit above the 1.56M "used up to".

What it means for a bot budget. Say you send the bot key 5 STT. With the docs' upper bound that's about 1,666 orders. With our worst real placement (0.014 STT) it's 355. A bot funded from the docs number runs dry at about a fifth of what its owner planned.

Pattern in our data: the first placement on each pool was the expensive one (ETH 2.34M, ZRO 1.83M), later ones 0.4-0.5M, then one at 1.57M again. I guessed this is first-time storage (new account in the pool, new price level). The estimates above don't separate "existing level" from "new level" (2.09M vs 2.11M), so I can't confirm that from estimates. Leaving it as a guess.

The "use a generous limit" advice on the page is right and should stay. The kit sends 10,000,000. The problem is only the cost numbers.

## Suggested fix
Replace the cost sentence with something like:

> At 6 gwei a perp order costs about 0.003-0.015 STT. A resting order uses 0.4-2.4M gas (the first one on a pool is the expensive one), a cancel about 0.2M, an IOC that crosses several levels can go to 7M+. Budget about 0.015 STT per order, so 5 STT is roughly 300 orders.

and change "used up to about 1.56M gas" to the measured max (2.34M in our runs, other reports saw IOCs much higher).

## Evidence
- [`evidence/2910/gas-004.json`](../evidence/2910/gas-004.json): receipts with block and time, the docs lines as fetched, the 1.56M x gas price math, the three estimates.
- Owner `0x84326A92162Ece92ed257A31073fDd3a6599BF21`, operator (bot key) `0x13f05c8e15cC0d7d3abff02C144fb74778018a55`. Full tx hashes:
  - `0xaf077d282b0f9090aeb2daef21eea562908e3707c874c6d622d1e4f8cbcacfdf`
  - `0x7d3d6af752956b0a9e0d209964807db8d2b8f150a6dcb3d578316946be7eb174`
  - `0x67560ff046381b20c127afa883dcab70aecdffc8d696784f21be7dd899d4eb09`
  - `0xff313955663434b7bc0a0c5ac02c4d56cebb1156e8b40e0f4c85c5d4a59d1101`
  - `0xd55d4095c00533d9c1a20ab6c0747cfd238ffb6194e98357f43791e1dfdc9f55`
  - `0x8de658f97e5cc6584d3083e41bca93ed31be91c750cd9e3ec2ec0804e5a0ed44`
  - `0x9d6586aa3bdea5ce422832d596ed04a3835b31ceace5c45c8b2f74b297f7dad0`
  - `0xaa053991a9997044cbcd0d19ddb356051a00797fbb9a350de9e741b35318617a`
- The first version of this report said 12:55-13:12 UTC. The receipts say 12:15-12:16 UTC. Fixed above.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem 2.57.10, gas limit 10,000,000 on our sends, Hideki testnet (chain 50383).
