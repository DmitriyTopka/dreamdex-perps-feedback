// Report 016: perp-maker drops a post-only leg that would cross and does not retry it. Read-only, no key.
//   cd scripts && npm install && npx tsx maker-016.ts
// Samples every perp market SAMPLES times, REFRESH_MS apart (the strategy's own refresh). Each sample:
// the live mark, the on-chain best bid and ask, and the two quotes perp-maker would post with its
// defaults and no inventory (index.ts:139-143, aligned down like placePerp does). A quote crosses when
// the bid is at or above the best ask, or the ask is at or below the best bid: the pool reverts it with
// PostOnlyWouldCross. Then the strategy's re-quote gate (index.ts:123-124) is replayed on the samples:
// once a quote is stored at the first mark, a cycle only re-quotes when the mark has drifted 8 bps.

import { parseAbi } from "viem";
import { client, out, rpc, stamp } from "./client.js";

// strategies/perp-maker/src/index.ts defaults, dreamdex-bot-kit 2579866.
const HALF_SPREAD_BPS = 15; // line 49
const SKEW_BPS = 10; // line 52
const REQUOTE_BPS = 8; // line 53
const REFRESH_MS = 15_000; // line 54
const SAMPLES = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const markets = (await client.listPerpMarkets()) as any[];
const samples: Record<string, any[]> = {};
const start = await stamp();
for (let i = 0; i < SAMPLES; i++) {
  if (i) await sleep(REFRESH_MS);
  const tops: any = await client.getBookTopsOnchain(markets.map((m) => ({ id: m.id, poolAddress: m.poolAddress })));
  const t0 = Date.now();
  for (const m of markets) {
    const snap: any = await client.getPerpHealthSnapshot(m.poolAddress);
    if (!snap.priceable) continue;
    const mark = Number(snap.markPrice) / 1e18;
    const tick = BigInt(m.tickSize);
    // index.ts:139-143 with inventory 0, then alignPrice (markets.ts:146-150) as placePerp does at orders.ts:159.
    const lean = 0;
    const skew = (SKEW_BPS / 10_000) * lean;
    const half = HALF_SPREAD_BPS / 10_000;
    const bidPx = (BigInt(Math.round(mark * (1 - half - skew) * 1e18)) / tick) * tick;
    const askPx = (BigInt(Math.round(mark * (1 + half - skew) * 1e18)) / tick) * tick;
    const t = tops.tops[m.id];
    const bestBid = t?.bestBid != null ? BigInt(t.bestBid) : undefined;
    const bestAsk = t?.bestAsk != null ? BigInt(t.bestAsk) : undefined;
    const f = (x?: bigint) => (x === undefined ? null : Number(x) / 1e18);
    const mid = bestBid && bestAsk ? (Number(bestBid) + Number(bestAsk)) / 2 / 1e18 : undefined;
    (samples[`${m.baseSymbol}-PERP`] ??= []).push({
      sample: i,
      secondsFromStart: Math.round((t0 - Date.parse(start.time)) / 1000),
      mark: +mark.toPrecision(8),
      bestBid: f(bestBid),
      bestAsk: f(bestAsk),
      bookMidVsMarkBps: mid ? +((mid / mark - 1) * 1e4).toFixed(1) : null,
      quoteBid: f(bidPx),
      quoteAsk: f(askPx),
      bidCrosses: bestAsk !== undefined && bidPx >= bestAsk,
      askCrosses: bestBid !== undefined && askPx <= bestBid,
    });
  }
}

// The live run in report 016 (2026-10-22): the bid it rested, read back from the indexer, and the BTC
// mark and top of book at the block it was placed in. The bot's own mark is recovered from the bid
// price (bid = mark x (1 - 15 bps)), which gives the ask it tried and the best bid that ask hit.
const BTC_POOL = "0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0";
const ORDER_ID = "8116567392432209725644";
const order: any = await client.getOrder(BTC_POOL, ORDER_ID);
const placedBlock = BigInt(order.placedAtBlock);
const markAbi = parseAbi(["function tryGetMarkPrice() view returns (bool ok, uint256 price)"]);
const [, markThen] = await rpc.readContract({ address: BTC_POOL, abi: markAbi, functionName: "tryGetMarkPrice", blockNumber: placedBlock });
const topsThen: any = await client.getBookTopsOnchain([{ id: "btc", poolAddress: BTC_POOL }], { blockNumber: placedBlock });
const bidThen = Number(BigInt(order.price)) / 1e18;
const botMark = bidThen / (1 - HALF_SPREAD_BPS / 10_000);
const askTried = botMark * (1 + HALF_SPREAD_BPS / 10_000);
const bestBidThen = Number(BigInt(topsThen.tops.btc.bestBid)) / 1e18;
const run22Oct = {
  order: {
    orderId: ORDER_ID,
    isBid: order.isBid,
    price: bidThen,
    quantityBtc: Number(order.fullQuantity) / 1e8,
    filled: order.filledQuantity,
    status: order.status,
    placedTxHash: order.placedTxHash,
    placedAtBlock: Number(placedBlock),
    placedAt: new Date(Number(order.placedAtTimestamp) * 1000).toISOString(),
    lastUpdatedAt: new Date(Number(order.lastUpdatedAtTimestamp) * 1000).toISOString(),
  },
  atPlacementBlock: {
    poolMark: +(Number(markThen) / 1e18).toFixed(2),
    bestBid: bestBidThen,
    bestAsk: Number(BigInt(topsThen.tops.btc.bestAsk)) / 1e18,
  },
  botMarkFromBidPrice: +botMark.toFixed(2),
  askTried: +askTried.toFixed(1),
  askAtOrBelowBestBid: askTried <= bestBidThen,
  askUnderBestBidBps: +((1 - askTried / bestBidThen) * 1e4).toFixed(1),
};

// Replay index.ts:106-186 on the samples: the first cycle places, `resting.atMark` is set even for a
// skipped leg, and later cycles skip while the drift is under REQUOTE_BPS.
const perMarket = Object.entries(samples).map(([market, s]) => {
  let atMark = 0;
  const cycles = s.map((x) => {
    const drift = atMark > 0 ? (Math.abs(x.mark - atMark) / atMark) * 10_000 : Infinity;
    const requotes = !(drift < REQUOTE_BPS);
    if (requotes) atMark = x.mark;
    return { sample: x.sample, driftBps: Number.isFinite(drift) ? +drift.toFixed(2) : null, requotes, bidCrosses: x.bidCrosses, askCrosses: x.askCrosses };
  });
  return {
    market,
    samplesWithACrossingLeg: s.filter((x) => x.bidCrosses || x.askCrosses).length,
    legThatCrosses: s.some((x) => x.askCrosses) ? "ask" : s.some((x) => x.bidCrosses) ? "bid" : null,
    cyclesThatRequote: cycles.filter((c) => c.requotes).length,
    bookMidVsMarkBpsRange: [Math.min(...s.map((x) => x.bookMidVsMarkBps ?? 0)), Math.max(...s.map((x) => x.bookMidVsMarkBps ?? 0))],
    cycles,
    samples: s,
  };
});
const crossing = perMarket.filter((p) => p.samplesWithACrossingLeg > 0);
out({
  ...start,
  end: await stamp(),
  kit: "dreamdex-bot-kit 2579866, strategies/perp-maker/src/index.ts:106-186",
  defaults: { HALF_SPREAD_BPS, SKEW_BPS, REQUOTE_BPS, REFRESH_MS },
  run22Oct,
  summary: {
    markets: perMarket.length,
    samplesPerMarket: SAMPLES,
    marketsWithACrossingDefaultQuote: crossing.map(
      (p) => `${p.market}: ${p.legThatCrosses} crosses in ${p.samplesWithACrossingLeg}/${SAMPLES} samples, re-quote cycles ${p.cyclesThatRequote}/${SAMPLES}, book mid ${p.bookMidVsMarkBpsRange.join(" to ")} bps vs mark`,
    ),
  },
  perMarket,
});
process.exit(0);
