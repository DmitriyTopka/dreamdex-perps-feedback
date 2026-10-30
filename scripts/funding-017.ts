// Report 017: what perp-funding's default thresholds do on every perp market. Read-only, no key.
//   cd scripts && npm install && npx tsx funding-017.ts
// 1. Live: the pool's fundingRate and emaPremium, the APR exactly as the kit computes it
//    (annualizedFundingRate, packages/perp-core/src/funding.ts:48), and the strategy's entry test
//    (strategies/perp-funding/src/index.ts:116) with the defaults.
// 2. History: the last HISTORY settlements per pool from the indexer, replayed through the same entry
//    and exit tests: how often the rate was exactly the +0.01% default interest rate, and how often a
//    short opened on it would have seen its exit fire (index.ts:117-119: |APR| under 3%, or a flip).
// Rate model from report 005: rate = premium + clamp(0.01% - premium, -0.05%, +0.05%) per 8 h window.

import { annualizedFundingRate } from "@somnia-chain/markets-sdk";
import { client, out, stamp } from "./client.js";

const MIN_APR = 0.1; // index.ts:50
const EXIT_APR = 0.03; // index.ts:51
const HISTORY = 200;
const E18 = 10n ** 18n;
const INTEREST = E18 / 10_000n; // 0.01% per 8 h window
const CLAMP = (5n * E18) / 10_000n; // 0.05%
const pct = (x: bigint) => +(Number(x) / 1e16).toFixed(4);

const live: any[] = [];
const hist: any[] = [];
for (const p of (await client.listPerpMarkets()) as any[]) {
  const st = await client.getPerpState(p.poolAddress);
  const rate = BigInt(st.fundingRate);
  const prem = BigInt(st.emaPremium);
  const win = Number(st.fundingWindowSec);
  let adj = INTEREST - prem;
  if (adj > CLAMP) adj = CLAMP;
  if (adj < -CLAMP) adj = -CLAMP;
  const apr = annualizedFundingRate(rate, win);
  const enters = Math.abs(apr) >= MIN_APR;
  live.push({
    market: `${p.baseSymbol}-PERP`,
    fundingRatePct: pct(rate),
    emaPremiumPct: pct(prem),
    formulaMatches: prem + adj === rate,
    atDefaultInterestRate: rate === INTEREST,
    aprPct: +(apr * 100).toFixed(2),
    windowSec: win,
    defaultDecision: enters ? (rate > 0n ? "short" : "long") : "none",
    shortWhilePerpBelowIndex: enters && rate > 0n && prem < 0n,
  });

  const rows: any[] = await client.listFundingRateHistory(p.poolAddress, { limit: HISTORY });
  const r = rows.map((x) => ({ rate: BigInt(x.fundingRate), apr: annualizedFundingRate(BigInt(x.fundingRate), Number(x.fundingWindowSec ?? win)) }));
  hist.push({
    market: `${p.baseSymbol}-PERP`,
    settlements: rows.length,
    from: rows.length ? new Date(Number(rows[rows.length - 1].timestamp) * 1000).toISOString() : null,
    to: rows.length ? new Date(Number(rows[0].timestamp) * 1000).toISOString() : null,
    atDefaultInterestRate: r.filter((x) => x.rate === INTEREST).length,
    entryTestPasses: r.filter((x) => Math.abs(x.apr) >= MIN_APR).length,
    // A short is closed when |APR| < EXIT_APR or when the rate is no longer positive (paid side flips).
    shortExitWouldFire: r.filter((x) => Math.abs(x.apr) < EXIT_APR || x.rate <= 0n).length,
  });
}

const tot = (k: string) => hist.reduce((a, h) => a + h[k], 0);
const enters = live.filter((l) => l.defaultDecision !== "none");
out({
  ...(await stamp()),
  kit: "dreamdex-bot-kit 2579866, strategies/perp-funding/src/index.ts:50-51,116-119; packages/perp-core/src/funding.ts:48,53",
  defaults: { MIN_APR, EXIT_APR },
  defaultInterestRateAprPct: +(annualizedFundingRate(INTEREST, 28_800) * 100).toFixed(4),
  summary: {
    formulaMatchesLive: `${live.filter((l) => l.formulaMatches).length}/${live.length}`,
    entersOn: `${enters.length}/${live.length}`,
    entersOnlyBecauseOfDefaultInterestRate: enters.filter((l) => l.atDefaultInterestRate).map((l) => l.market),
    shortsWhilePerpBelowIndex: enters.filter((l) => l.shortWhilePerpBelowIndex).map((l) => `${l.market} premium ${l.emaPremiumPct}%`),
    noEntry: live.filter((l) => l.defaultDecision === "none").map((l) => `${l.market} ${l.aprPct}%`),
    history: {
      settlements: tot("settlements"),
      atDefaultInterestRate: tot("atDefaultInterestRate"),
      entryTestPasses: tot("entryTestPasses"),
      shortExitWouldFire: tot("shortExitWouldFire"),
    },
  },
  live: live.sort((a, b) => b.aprPct - a.aprPct),
  history: hist,
});
process.exit(0);
