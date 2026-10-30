// Report 007: perp-starter prices its take-profit and stop-loss off the mark, not the entry. Read-only, no key.
//   cd scripts && npm install && npx tsx starter-007.ts
// 1. The fill in report 007 (tx 0x8980...a30b): fill price from the indexer, and the pool's mark read
//    from the chain at the fill block and in the 20 s after it, the window in which perp-starter reads it.
// 2. Today, every perp market: what a default perp-starter open (50 USDso, IOC, 20 bps past the touch)
//    would fill at on the live book, the levels lines 173-177 would set from the live mark, and how far
//    those levels really sit from the fill. Both sides.

import { parseAbi } from "viem";
import { client, markets, out, rpc, stamp } from "./client.js";

// strategies/perp-starter/src/index.ts defaults, dreamdex-bot-kit 2579866.
const NOTIONAL = 50; // line 59
const TAKE_PROFIT_PCT = 2; // line 60
const STOP_LOSS_PCT = 1; // line 61
const SLIP_BPS = 20; // packages/perp-core/src/orders.ts:154, taker default

// strategies/perp-starter/src/index.ts:174-177, copied as is (mark is the live mark).
function levels(mark: number, side: "long" | "short") {
  const up = BigInt(Math.round(mark * (1 + TAKE_PROFIT_PCT / 100) * 1e18));
  const down = BigInt(Math.round(mark * (1 - STOP_LOSS_PCT / 100) * 1e18));
  return { takeProfit: side === "long" ? up : down, stopLoss: side === "long" ? down : up };
}
const n = (x: bigint) => Number(x) / 1e18;
const pctFrom = (level: number, entry: number) => +((level / entry - 1) * 100).toFixed(3);

const markAbi = parseAbi(["function tryGetMarkPrice() view returns (bool ok, uint256 price)"]);

// ---- 1. The fill from the report ----
const TX = "0x8980ab89c2710f5e77eba65ebf79ed05226bffebf0bf16fc7d311481ededa30b";
const act: any = await client.getTransactionActivity(TX);
const trade = act.events.find((e: any) => e.kind === "TRADE");
const fillBlock = BigInt(act.blockNumber);
const fill = n(BigInt(trade.fillPrice));
const marksAfter: any[] = [];
for (const d of [0n, 30n, 100n, 200n]) {
  const b = fillBlock + d;
  const [ok, raw] = await rpc.readContract({ address: trade.pool, abi: markAbi, functionName: "tryGetMarkPrice", blockNumber: b });
  const t = (await rpc.getBlock({ blockNumber: b })).timestamp;
  const mark = n(raw);
  const l = levels(mark, "long");
  marksAfter.push({
    block: Number(b),
    time: new Date(Number(t) * 1000).toISOString(),
    markOk: ok,
    mark: +mark.toFixed(2),
    stopLoss: +n(l.stopLoss).toFixed(1),
    stopLossFromEntryPct: pctFrom(n(l.stopLoss), fill),
    takeProfit: +n(l.takeProfit).toFixed(1),
    takeProfitFromEntryPct: pctFrom(n(l.takeProfit), fill),
  });
}
const reportFill = {
  txHash: TX,
  block: Number(fillBlock),
  time: new Date(Number(act.timestamp) * 1000).toISOString(),
  taker: trade.taker,
  takerIsBid: trade.takerIsBid,
  quantityBtc: Number(trade.quantity) / 1e8,
  fillPrice: fill,
  limitPrice: n(BigInt(act.ordersPlaced[0].price)),
  markAtAndAfterFill: marksAfter,
};

// ---- 2. Today, all markets ----
const rows = (await client.listPerpMarkets()) as any[];
await (markets as any).loadMarkets(true);
const today: any[] = [];
for (const m of rows) {
  const snap: any = await client.getPerpHealthSnapshot(m.poolAddress);
  if (!snap.priceable) {
    today.push({ market: `${m.baseSymbol}-PERP`, priceable: false });
    continue;
  }
  const mark = Number(snap.markPrice) / 1e18;
  const book = await (markets as any).fetchOrderBook(`${m.baseSymbol}/USDso:USDso`, 20);
  const r: any = { market: `${m.baseSymbol}-PERP`, mark };
  for (const side of ["long", "short"] as const) {
    // What the IOC takes: levels from the touch up to 20 bps past it, until 50 USDso of notional.
    const levelsBook: [number, number][] = side === "long" ? book.asks : book.bids;
    if (!levelsBook.length) {
      r[side] = { fill: null };
      continue;
    }
    const touch = levelsBook[0][0];
    const limit = side === "long" ? touch * (1 + SLIP_BPS / 1e4) : touch * (1 - SLIP_BPS / 1e4);
    let qty = 0;
    let quote = 0;
    const wantedQty = NOTIONAL / mark;
    for (const [px, size] of levelsBook) {
      if (side === "long" ? px > limit : px < limit) break;
      const take = Math.min(size, wantedQty - qty);
      qty += take;
      quote += take * px;
      if (qty >= wantedQty - 1e-12) break;
    }
    const entry = quote / qty;
    const l = levels(mark, side);
    r[side] = {
      entry: +entry.toPrecision(8),
      entryVsMarkBps: +(((entry / mark - 1) * 1e4) * (side === "long" ? 1 : -1)).toFixed(1),
      filledOfWantedPct: +((qty / wantedQty) * 100).toFixed(1),
      stopLossFromEntryPct: pctFrom(n(l.stopLoss), entry),
      takeProfitFromEntryPct: pctFrom(n(l.takeProfit), entry),
    };
  }
  today.push(r);
}
const priced = today.filter((t) => t.long?.entry && t.short?.entry);
// A book more than 1% away from the mark (report 006) says more about the book than about this bug.
const near = priced.filter((t) => Math.abs(t.long.entryVsMarkBps) < 100 && Math.abs(t.short.entryVsMarkBps) < 100);
const far = priced.filter((t) => !near.includes(t)).map((t) => `${t.market} book ${t.long.entryVsMarkBps} bps from mark`);
const range = (xs: number[]) => [Math.min(...xs), Math.max(...xs)];
out({
  ...(await stamp()),
  kit: "dreamdex-bot-kit 2579866, strategies/perp-starter/src/index.ts:173-177",
  defaults: { NOTIONAL, TAKE_PROFIT_PCT, STOP_LOSS_PCT, SLIP_BPS },
  reportFill,
  summary: {
    marketsPriced: priced.length,
    bookMoreThan1pctFromMark: far,
    long: {
      markets: near.length,
      stopLossWiderThanConfigured: near.filter((t) => -t.long.stopLossFromEntryPct > STOP_LOSS_PCT).length,
      stopLossFromEntryPctRange: range(near.map((t) => t.long.stopLossFromEntryPct)),
      takeProfitFromEntryPctRange: range(near.map((t) => t.long.takeProfitFromEntryPct)),
    },
    short: {
      markets: near.length,
      configured: { takeProfitPct: TAKE_PROFIT_PCT, stopLossPct: STOP_LOSS_PCT },
      stopLossFromEntryPctRange: range(near.map((t) => t.short.stopLossFromEntryPct)),
      takeProfitFromEntryPctRange: range(near.map((t) => t.short.takeProfitFromEntryPct)),
    },
    btc: today.find((t) => t.market === "BTC-PERP"),
  },
  today,
});
process.exit(0);
