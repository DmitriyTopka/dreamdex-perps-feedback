// Report 005: who pays funding, the docs rule vs what the pools settle. Read-only.
//   cd scripts && npm install && npx tsx funding-005.ts
// 1. Live: for each pool, fundingRate vs emaPremium, checked against
//    rate = premium + clamp(0.01% - premium, -0.05%, +0.05%) (per 8 h window, 1e18-scaled).
// 2. History: the last HISTORY settled intervals per pool from the indexer, counting the ones
//    the docs say cannot happen: mark below index and longs still paying (rate > 0).

import { client, out, stamp } from "./client.js";

const HISTORY = 200;
const E18 = 10n ** 18n;
const INTEREST = E18 / 10_000n; // 0.01%
const CLAMP = (5n * E18) / 10_000n; // 0.05%
const pct = (x: bigint) => +(Number(x) / 1e16).toFixed(4); // 1e18-scaled fraction -> percent

const docs = await (await fetch("https://app.testnet.dreamdex.io/docs/trading/perps-testnet/funding.md")).text();
const docsRule = docs.split("\n").filter((l) => /above the index|below the index/i.test(l)).map((l) => l.trim());

const live: any[] = [];
const hist: any[] = [];
for (const p of (await client.listPerpMarkets()) as any[]) {
  const st = await client.getPerpState(p.poolAddress);
  const rate = BigInt(st.fundingRate);
  const prem = BigInt(st.emaPremium);
  let adj = INTEREST - prem;
  if (adj > CLAMP) adj = CLAMP;
  if (adj < -CLAMP) adj = -CLAMP;
  live.push({
    market: `${p.baseSymbol}-PERP`,
    emaPremiumPct: pct(prem),
    fundingRatePct: pct(rate),
    formulaPct: pct(prem + adj),
    formulaMatches: prem + adj === rate,
    payer: rate > 0n ? "longs" : rate < 0n ? "shorts" : "none",
    docsPayer: prem > 0n ? "longs" : prem < 0n ? "shorts" : "none",
    windowSec: Number(st.fundingWindowSec),
    intervalSec: Number(st.fundingIntervalSec),
  });

  const rows: any[] = await client.listFundingRateHistory(p.poolAddress, { limit: HISTORY });
  const below = rows.filter((r) => BigInt(r.markPrice) < BigInt(r.indexPrice));
  const belowLongsPay = below.filter((r) => BigInt(r.fundingRate) > 0n);
  const sample = belowLongsPay[0];
  hist.push({
    market: `${p.baseSymbol}-PERP`,
    settlements: rows.length,
    from: rows.length ? new Date(Number(rows[rows.length - 1].timestamp) * 1000).toISOString() : null,
    markBelowIndex: below.length,
    markBelowIndexAndLongsPay: belowLongsPay.length,
    atInterestFloor: rows.filter((r) => BigInt(r.fundingRate) === INTEREST).length,
    example: sample && {
      txHash: sample.txHash,
      block: sample.blockNumber,
      time: new Date(Number(sample.timestamp) * 1000).toISOString(),
      mark: Number(BigInt(sample.markPrice)) / 1e18,
      index: Number(BigInt(sample.indexPrice)) / 1e18,
      fundingRatePct: pct(BigInt(sample.fundingRate)),
    },
  });
}

const tot = (k: string) => hist.reduce((a, h) => a + h[k], 0);
out({
  ...(await stamp()),
  docsRule,
  summary: {
    formulaMatchesLive: `${live.filter((l) => l.formulaMatches).length}/${live.length}`,
    liveMarketsWherePayerDiffersFromDocs: live.filter((l) => l.payer !== l.docsPayer).map((l) => `${l.market} premium ${l.emaPremiumPct}% rate ${l.fundingRatePct}%`),
    settlementsChecked: tot("settlements"),
    settlementsMarkBelowIndex: tot("markBelowIndex"),
    settlementsMarkBelowIndexLongsStillPay: tot("markBelowIndexAndLongsPay"),
    settlementsAtExactInterestFloor: tot("atInterestFloor"),
  },
  live,
  history: hist,
});
process.exit(0);
