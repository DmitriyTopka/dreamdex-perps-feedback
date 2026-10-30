// Report 006: where the perp mark sits against the oracle index and the order book. Read-only.
//   cd scripts && npm install && npx tsx mark-006.ts > out.json
// 1. Live: SAMPLES rounds, GAP_MS apart. Each round reads, for all 21 pools, getPerpState
//    (markPrice, indexPrice), getPerpFundingPremium (lastObservedPremium) and the on-chain
//    top of book (getBookTopsOnchain, mid = (bestBid + bestAsk) / 2).
//    It also counts rounds where the index FELL since the previous round and the mark still
//    sat below it: an EMA that only lags a rising index cannot do that for long.
// 2. History: the last HISTORY settled funding intervals per pool from the indexer
//    (markPrice and indexPrice recorded at each settlement).
// 3. The BTC round trip from the report (2026-10-22): fill vs mark, index and mid at that block.
// 4. Where the mark comes from: for every pool, at one block, the pool's mark and index next to its
//    aggregator oracle's getMarkPrice() and getPrice().

import { parseAbi } from "viem";
import { client, out, rpc, stamp } from "./client.js";

const SAMPLES = 6;
const GAP_MS = 20_000;
const HISTORY = 200;
const pct = (a: bigint, b: bigint) => (Number(a - b) / Number(b)) * 100; // (a - b) / b in %
const r4 = (x: number) => +x.toFixed(4);

const pools = ((await client.listPerpMarkets()) as any[]).map((p) => ({ id: p.id as string, poolAddress: p.poolAddress, market: `${p.baseSymbol}-PERP` }));
const start = await stamp();

const rounds: any[][] = [];
for (let s = 0; s < SAMPLES; s++) {
  if (s) await new Promise((r) => setTimeout(r, GAP_MS));
  const tops = await client.getBookTopsOnchain(pools.map((p) => ({ id: p.id, poolAddress: p.poolAddress })));
  const row: any[] = [];
  for (const p of pools) {
    const st = await client.getPerpState(p.poolAddress);
    const fp = await client.getPerpFundingPremium(p.poolAddress);
    const top = tops.tops[p.id.toLowerCase()];
    const mid = top?.mid ? BigInt(top.mid) : null;
    row.push({
      market: p.market,
      block: Number(tops.blockNumber),
      markOk: st.markPriceOk,
      mark: Number(st.markPrice) / 1e18,
      index: Number(st.indexPrice) / 1e18,
      mid: mid === null ? null : Number(mid) / 1e18,
      markVsIndexPct: r4(pct(st.markPrice, st.indexPrice)),
      midVsIndexPct: mid === null ? null : r4(pct(mid, st.indexPrice)),
      markVsMidPct: mid === null ? null : r4(pct(st.markPrice, mid)),
      lastObservedPremiumPct: r4(Number(fp.lastObservedPremium) / 1e16),
    });
  }
  rounds.push(row);
}
const end = await stamp();

const live = pools.map((p, i) => {
  const xs = rounds.map((r) => r[i]);
  const avg = (k: string) => {
    const v = xs.map((x) => x[k]).filter((x) => x !== null);
    return v.length ? r4(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  let indexFellMarkStillBelow = 0;
  let indexFell = 0;
  for (let s = 1; s < xs.length; s++) {
    if (xs[s].index < xs[s - 1].index) {
      indexFell++;
      if (xs[s].mark < xs[s].index) indexFellMarkStillBelow++;
    }
  }
  return {
    market: p.market,
    pool: p.poolAddress,
    avgMarkVsIndexPct: avg("markVsIndexPct"),
    avgMidVsIndexPct: avg("midVsIndexPct"),
    avgMarkVsMidPct: avg("markVsMidPct"),
    avgLastObservedPremiumPct: avg("lastObservedPremiumPct"),
    roundsMarkBelowIndex: `${xs.filter((x) => x.mark < x.index).length}/${xs.length}`,
    roundsMidAboveIndex: `${xs.filter((x) => x.mid !== null && x.mid > x.index).length}/${xs.length}`,
    roundsMarkBelowMid: `${xs.filter((x) => x.mid !== null && x.mark < x.mid).length}/${xs.length}`,
    indexFell,
    indexFellMarkStillBelow,
    samples: xs,
  };
});

const hist: any[] = [];
for (const p of pools) {
  const rows: any[] = (await client.listFundingRateHistory(p.poolAddress, { limit: HISTORY })).filter((r: any) => r.markPrice !== null);
  const gaps = rows.map((r) => pct(BigInt(r.markPrice), BigInt(r.indexPrice)));
  const sorted = [...gaps].sort((a, b) => a - b);
  hist.push({
    market: p.market,
    settlements: rows.length,
    from: rows.length ? new Date(Number(rows[rows.length - 1].timestamp) * 1000).toISOString() : null,
    to: rows.length ? new Date(Number(rows[0].timestamp) * 1000).toISOString() : null,
    markBelowIndex: gaps.filter((g) => g < 0).length,
    markAboveIndex: gaps.filter((g) => g > 0).length,
    meanMarkVsIndexPct: gaps.length ? r4(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    medianMarkVsIndexPct: sorted.length ? r4(sorted[Math.floor(sorted.length / 2)]) : null,
    indexFirst: rows.length ? Number(BigInt(rows[rows.length - 1].indexPrice)) / 1e18 : null,
    indexLast: rows.length ? Number(BigInt(rows[0].indexPrice)) / 1e18 : null,
    // rows are newest first: rows[i + 1] is the settlement before rows[i]
    settlementsIndexFell: rows.filter((r, i) => i + 1 < rows.length && BigInt(r.indexPrice) < BigInt(rows[i + 1].indexPrice)).length,
    settlementsIndexFellMarkStillBelow: rows.filter((r, i) => i + 1 < rows.length && BigInt(r.indexPrice) < BigInt(rows[i + 1].indexPrice) && BigInt(r.markPrice) < BigInt(r.indexPrice)).length,
  });
}

// 3. The BTC round trip quoted in the report: fill price from the indexer, and the pool's mark,
//    index and book mid read from the chain at the fill block and a few blocks after it.
const stateAbi = parseAbi([
  "function tryGetMarkPrice() view returns (bool ok, uint256 price)",
  "function getIndexPrice() view returns (uint256 price, uint256 updatedAt)",
]);
const trades: any[] = [];
for (const tx of ["0x8980ab89c2710f5e77eba65ebf79ed05226bffebf0bf16fc7d311481ededa30b", "0xca85b2868fa314e1b2d1d69662eff9f242b9e014bcd1ed726b4db315e011d3ef"]) {
  const act: any = await client.getTransactionActivity(tx);
  const t = act.events.find((e: any) => e.kind === "TRADE");
  const b0 = BigInt(act.blockNumber);
  const reads: any[] = [];
  for (const d of [0n, 100n, 280n]) {
    const b = b0 + d;
    const [, mark] = await rpc.readContract({ address: t.pool, abi: stateAbi, functionName: "tryGetMarkPrice", blockNumber: b });
    const [index] = await rpc.readContract({ address: t.pool, abi: stateAbi, functionName: "getIndexPrice", blockNumber: b });
    const top = (await client.getBookTopsOnchain([{ id: t.pool, poolAddress: t.pool }], { blockNumber: b })).tops[t.pool.toLowerCase()];
    const ts = (await rpc.getBlock({ blockNumber: b })).timestamp;
    reads.push({
      block: Number(b),
      time: new Date(Number(ts) * 1000).toISOString(),
      mark: Number(mark) / 1e18,
      index: Number(index) / 1e18,
      mid: top?.mid ? Number(BigInt(top.mid)) / 1e18 : null,
      markVsIndexPct: r4(pct(mark, index)),
    });
  }
  const fill = Number(BigInt(t.fillPrice)) / 1e18;
  trades.push({
    tx,
    block: Number(b0),
    pool: t.pool,
    fillPrice: fill,
    fillVsIndexPct: r4((fill / reads[0].index - 1) * 100),
    reads: reads.map((r) => ({ ...r, unrealizedVsFillPct: r4((r.mark / fill - 1) * 100), roiAt20xPct: r4((r.mark / fill - 1) * 2000) })),
  });
}

const oracleAbi = parseAbi([
  "function oracle() view returns (address)",
  "function getMarkPrice() view returns (uint256)",
  "function getPrice() view returns (uint256)",
]);
const head = await rpc.getBlockNumber();
const oracleSource: any[] = [];
for (const p of pools) {
  const o = await rpc.readContract({ address: p.poolAddress, abi: oracleAbi, functionName: "oracle", blockNumber: head });
  const [, poolMark] = await rpc.readContract({ address: p.poolAddress, abi: stateAbi, functionName: "tryGetMarkPrice", blockNumber: head });
  const [poolIndex] = await rpc.readContract({ address: p.poolAddress, abi: stateAbi, functionName: "getIndexPrice", blockNumber: head });
  const oMark = await rpc.readContract({ address: o, abi: oracleAbi, functionName: "getMarkPrice", blockNumber: head });
  const oPrice = await rpc.readContract({ address: o, abi: oracleAbi, functionName: "getPrice", blockNumber: head });
  oracleSource.push({ market: p.market, oracle: o, poolMarkEqualsOracleGetMarkPrice: poolMark === oMark, poolIndexEqualsOracleGetPrice: poolIndex === oPrice, oracleMarkVsPricePct: r4(pct(oMark, oPrice)) });
}

const markBelowAllRounds = live.filter((l) => l.roundsMarkBelowIndex === `${SAMPLES}/${SAMPLES}`).map((l) => l.market);
const bookAboveMarkBelow = live.filter((l) => l.roundsMarkBelowIndex === `${SAMPLES}/${SAMPLES}` && (l.avgMidVsIndexPct ?? 0) > 0).map((l) => `${l.market} mark ${l.avgMarkVsIndexPct}% mid ${l.avgMidVsIndexPct}%`);
const tot = (k: string) => hist.reduce((a, h) => a + h[k], 0);
out({
  start,
  end,
  samples: SAMPLES,
  gapMs: GAP_MS,
  summary: {
    markets: pools.length,
    markBelowIndexInEveryRound: `${markBelowAllRounds.length}/${pools.length}`,
    marketsNotBelowInEveryRound: live.filter((l) => !markBelowAllRounds.includes(l.market)).map((l) => `${l.market} ${l.roundsMarkBelowIndex} avg ${l.avgMarkVsIndexPct}%`),
    markBelowIndexWhileBookMidAboveIndex: bookAboveMarkBelow,
    roundsIndexFell: live.reduce((a, l) => a + l.indexFell, 0),
    roundsIndexFellMarkStillBelow: live.reduce((a, l) => a + l.indexFellMarkStillBelow, 0),
    historySettlements: tot("settlements"),
    historyMarkBelowIndex: tot("markBelowIndex"),
    historyMarkAboveIndex: tot("markAboveIndex"),
    historySettlementsIndexFell: tot("settlementsIndexFell"),
    historyIndexFellMarkStillBelow: tot("settlementsIndexFellMarkStillBelow"),
  },
  oracleSource: { block: Number(head), poolMarkEqualsOracleGetMarkPrice: `${oracleSource.filter((x) => x.poolMarkEqualsOracleGetMarkPrice).length}/${pools.length}`, poolIndexEqualsOracleGetPrice: `${oracleSource.filter((x) => x.poolIndexEqualsOracleGetPrice).length}/${pools.length}`, rows: oracleSource },
  trades,
  live: live.map(({ samples, ...rest }) => rest),
  history: hist,
  rawSamples: live.map((l) => ({ market: l.market, samples: l.samples })),
});
process.exit(0);
