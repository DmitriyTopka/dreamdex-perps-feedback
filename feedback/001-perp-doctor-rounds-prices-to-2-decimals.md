# perp:doctor rounds marks and book prices to 2 decimals, ignoring tick size
Severity: normal
Area: SDK

## Steps to reproduce
1. Clone dreamdex-bot-kit at commit 2579866 and run `npm ci`.
2. Run `NETWORK=hideki npm run perp:doctor` (no PRIVATE_KEY needed).
3. Look at markets priced between 1 and 100 with a tick of 0.0001, for example ZRO-PERP or NEAR-PERP.

## Expected
Mark, bid and ask are printed with the market's tick precision (4 decimals for ZRO-PERP), so the spread is visible.

## Actual
Every price >= 1 is printed with 2 decimals. The book looks crossed or flat even when it is not:

```
ZRO-PERP   mark=1.85 · ... · book[bid=1.85 ask=1.85] · tick=0.0001 ...
NEAR-PERP  mark=5.00 · ... · book[bid=5.00 ask=5.00] · tick=0.0001 ...
AVAX-PERP  mark=9.21 · ... · book[bid=9.21 ask=9.21] · tick=0.001 ...
```

Cause: `scripts/perp-doctor.ts` line 44
`const px = (v: number) => (Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(4));`
The function never looks at `tickSize`, which the same script already reads on line 132.

## Evidence
Output of `perp:doctor` on 2026-10-22 around 12:10 UTC, Hideki testnet (chain 50383), 21 live markets. Source line quoted above.

## Environment
dreamdex-bot-kit 2579866 (2026-10-12), Node 24.14.1, network Hideki testnet (chain 50383), no wallet (read-only).
