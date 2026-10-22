# Perps testnet docs understate placeOrderFor gas and STT cost by up to ~4.7x
Severity: normal
Area: docs

## Steps to reproduce
1. Open "Perps on Testnet for Developers" (app.testnet.dreamdex.io/docs/developers/perps-testnet).
2. Read the two numbers it gives for budgeting:
   - "transactions to perp pools measured on testnet cost between 0.0003 and 0.003 STT each"
   - "Successful placeOrderFor transactions on testnet used up to about 1.56M gas"
3. Place a few small PostOnly bids with `placeOrderFor` from a linked trading key on ETH-PERP and ZRO-PERP, and read the receipts.

## Expected
Measured costs inside the documented ranges, so a builder who funds a bot key from these numbers does not run dry.

## Actual
At the network gas price of 6 gwei (`eth_gasPrice` = 0x165a0bc00), 4 of 6 placements cost more than the documented upper bound, and 2 used more gas than the documented maximum:

| tx | call | gasUsed | STT |
|---|---|---|---|
| 0xaf077d282b0f9090aeb2daef21eea562908e3707c874c6d622d1e4f8cbcacfdf | placeOrderFor ETH | 2,342,262 | 0.014054 |
| 0x8de658f97e5cc6584d3083e41bca93ed31be91c750cd9e3ec2ec0804e5a0ed44 | placeOrderFor ZRO | 1,831,903 | 0.010991 |
| 0xd55d4095c00533d9c1a20ab6c0747cfd238ffb6194e98357f43791e1dfdc9f55 | placeOrderFor ETH | 1,565,831 | 0.009395 |
| 0x67560ff046381b20c127afa883dcab70aecdffc8d696784f21be7dd899d4eb09 | placeOrderFor ETH | 527,361 | 0.003164 |
| 0xff313955663434b7bc0a0c5ac02c4d56cebb1156e8b40e0f4c85c5d4a59d1101 | placeOrderFor ETH | 511,148 | 0.003067 |
| 0x9d6586aa3bdea5ce422832d596ed04a3835b31ceace5c45c8b2f74b297f7dad0 | placeOrderFor ZRO | 416,655 | 0.002500 |
| 0x7d3d6af752956b0a9e0d209964807db8d2b8f150a6dcb3d578316946be7eb174 | cancelOrderFor ETH | 176,715 | 0.001060 |
| 0xaa053991a9997044cbcd0d19ddb356051a00797fbb9a350de9e741b35318617a | cancelOrderFor ZRO | 257,095 | 0.001543 |

The expensive placements are the first order an account puts into a pool or onto a new price level, which looks like first-time storage writes. The doc's "use a generous limit" advice still holds (the bot kit sends 10,000,000), but the cost range and the 1.56M figure are what a builder reads when deciding how much STT to give a bot key.

## Evidence
Receipts above, Hideki testnet (chain 50383), 2026-10-22 between 12:55 and 13:12 UTC, `effectiveGasPrice` 6 gwei on all of them. Owner 0x84326A92162Ece92ed257A31073fDd3a6599BF21, operator 0x13f05c8e15cC0d7d3abff02C144fb74778018a55.

## Environment
viem writeContract with gas limit 10,000,000, @somnia-chain/markets-sdk 0.32.1 for decoding, Hideki testnet.
