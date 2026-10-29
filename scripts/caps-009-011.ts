// Reports 009 and 011: the perps market table in the docs vs the chain, all 21 markets.
//   cd scripts && npm install && npx tsx caps-009-011.ts
// Read-only. Fetches the docs page as Markdown and each pool's risk params from the chain.
// Exit code 1 when any "Open interest cap" or the "a tenth" position-cap rule disagrees with the chain.

import { client, human, out, stamp } from "./client.js";

const DOCS = "https://app.testnet.dreamdex.io/docs/trading/perps-testnet/README.md";
const num = (s: string) => Number(s.replace(/[^0-9.]/g, ""));

const md = await (await fetch(DOCS)).text();
const docs = new Map<string, { lev: number; im: number; mm: number; tick: number; min: number; oi: number }>();
for (const line of md.split("\n")) {
  const m = line.match(/^\| \*\*([A-Z0-9]+)-PERP\*\* \| (\d+)x \| ([\d.]+)% \/ ([\d.]+)% \| ([\d.]+) \| ([\d,.]+) \S+ \| ([\d,.]+) \S+ \|/);
  if (m) docs.set(m[1], { lev: +m[2], im: +m[3], mm: +m[4], tick: num(m[5]), min: num(m[6]), oi: num(m[7]) });
}
const tenthQuote = md.split("\n").find((l) => /tenth/i.test(l))?.trim();

const rows: any[] = [];
for (const p of (await client.listPerpMarkets()) as any[]) {
  const d = docs.get(p.baseSymbol);
  const rp = await client.getPerpRiskParams(p.poolAddress);
  const maxOI = human(rp.maxOpenInterest, p.baseDecimals);
  const maxPos = human(rp.maxPositionSize, p.baseDecimals);
  const liveOI = human(p.openInterest, p.baseDecimals);
  const im = Number(rp.initialMarginBps) / 100;
  rows.push({
    market: `${p.baseSymbol}-PERP`,
    pool: p.poolAddress,
    docsOICap: d?.oi,
    chainMaxOpenInterest: maxOI,
    chainOverDocs: d ? +(maxOI / d.oi).toFixed(4) : null,
    liveOI,
    liveOIOverDocsCap: d ? +(liveOI / d.oi).toFixed(3) : null,
    liveOIOverChainCap: +(liveOI / maxOI).toFixed(3),
    maxPositionSize: maxPos,
    positionCapOverChainOI: +(maxPos / maxOI).toFixed(4),
    positionCapOverDocsOI: d ? +(maxPos / d.oi).toFixed(4) : null,
    docsOIover10xPositionCap: d ? +(d.oi / (10 * maxPos)).toFixed(4) : null,
    controls: d && {
      tick: human(p.tickSize, p.quoteDecimals) === d.tick,
      minSize: human(p.minQuantity, p.baseDecimals) === d.min,
      initialMargin: im === d.im,
      maxLeverage: Math.round(100 / im) === d.lev,
    },
  });
}

const oiWrong = rows.filter((r) => r.chainOverDocs !== 1);
const tenthTrue = rows.filter((r) => Math.abs(r.positionCapOverChainOI - 0.1) < 0.0005);
const controlsOk = rows.filter((r) => r.controls && Object.values(r.controls).every(Boolean)).length;
out({
  ...(await stamp()),
  docsUrl: DOCS,
  tenthQuote,
  summary: {
    markets: rows.length,
    docsOICapDiffersFromChain: oiWrong.length,
    chainOverDocsGroups: Object.fromEntries([...new Set(rows.map((r) => r.chainOverDocs))].map((k) => [k, rows.filter((r) => r.chainOverDocs === k).map((r) => r.market)])),
    marketsWhereLiveOIAboveDocsCap: rows.filter((r) => r.liveOIOverDocsCap > 1).map((r) => `${r.market} ${(r.liveOIOverDocsCap * 100).toFixed(1)}%`),
    positionCapIsATenthOfChainOI: tenthTrue.map((r) => r.market),
    positionCapRatioGroups: Object.fromEntries([...new Set(rows.map((r) => r.positionCapOverChainOI))].map((k) => [k, rows.filter((r) => r.positionCapOverChainOI === k).map((r) => r.market)])),
    controlsTickMinSizeMarginLeverageMatch: `${controlsOk}/${rows.length}`,
  },
  rows,
});
process.exit(oiWrong.length || tenthTrue.length < rows.length ? 1 : 0);
