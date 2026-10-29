// Report 001: perp:doctor prints prices through px(), which ignores the tick. Read-only, no key.
//   cd scripts && npm install && npx tsx doctor-001.ts
// Reads the best bid and ask of every perp pool straight from the chain (getBookTopsOnchain)
// and prints each price twice: through the kit's px() as written, and with the tick's decimals.
// A market is flagged when px() makes a real spread look flat or hides digits the tick allows.

import { client, out, stamp } from "./client.js";

// scripts/perp-doctor.ts:44 in dreamdex-bot-kit 2579866, copied as is.
const px = (v: number) => (Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(4));
const E18 = 1e18;

const markets = (await client.listPerpMarkets()) as any[];
const tops: any = await client.getBookTopsOnchain(markets.map((m) => ({ id: m.id, poolAddress: m.poolAddress })));
const rows = markets.map((m) => {
  const t = tops.tops[m.id];
  const tick = Number(BigInt(m.tickSize)) / E18;
  const dp = Math.max(0, Math.round(-Math.log10(tick)));
  const bid = t?.bestBid != null ? Number(BigInt(t.bestBid)) / E18 : undefined;
  const ask = t?.bestAsk != null ? Number(BigInt(t.bestAsk)) / E18 : undefined;
  const real = (v?: number) => (v === undefined ? "none" : v.toFixed(dp));
  const shown = (v?: number) => (v === undefined ? "none" : px(v));
  return {
    market: `${m.baseSymbol}-PERP`,
    tick,
    doctorShows: `bid=${shown(bid)} ask=${shown(ask)}`,
    chainHas: `bid=${real(bid)} ask=${real(ask)}`,
    spreadTicks: bid !== undefined && ask !== undefined ? Math.round((ask - bid) / tick) : null,
    looksFlat: bid !== undefined && ask !== undefined && bid !== ask && shown(bid) === shown(ask),
    digitsHidden: bid !== undefined && ask !== undefined && (Number(shown(bid)) !== Number(real(bid)) || Number(shown(ask)) !== Number(real(ask))),
  };
});
out({
  ...(await stamp()),
  kit: "dreamdex-bot-kit 2579866, scripts/perp-doctor.ts:44",
  summary: {
    markets: rows.length,
    digitsHidden: rows.filter((r) => r.digitsHidden).map((r) => r.market),
    realSpreadShownAsFlat: rows.filter((r) => r.looksFlat).map((r) => `${r.market} ${r.chainHas} (${r.spreadTicks} ticks)`),
  },
  rows,
});
process.exit(0);
