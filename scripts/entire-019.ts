// Report 019: a TP/SL set as "Entire" in the app stores a fixed size. Read-only, no key.
//   cd scripts && npm install && npx tsx entire-019.ts
// 1. Our test account now: the live BTC position next to its pending stops, read from the chain.
// 2. Every BTC stop pair the account ever armed (indexer for the ids and tx hashes), with the size
//    the PendingOrderCreated event stored, the position at the creation block and the largest
//    position while the pair was armed (archive reads of MarginBank.getPosition at each fill block).
// 3. The four fires of the 22 Oct and 26 Oct live runs: position before and after each tx.
// 4. Every pending perp stop on Hideki: fixed size vs "whole position" (quantity 0), and how much of
//    each open position a fixed-size stop loss covers.
// 5. Control: recent quantity-0 stops that fired, position before and after the fire.

import { parseAbi, parseEventLogs, type Address, type Hex } from "viem";
import { client, human, out, rpc, stamp } from "./client.js";

const OWNER = "0x84326A92162Ece92ed257A31073fDd3a6599BF21" as Address;
const SINCE = Date.parse("2026-10-23T00:00:00Z") / 1000;
const EVENTS = parseAbi([
  "event PendingOrderCreated(uint128 indexed orderId, address indexed owner, bool isBid, uint256 quantity, uint256 triggerPrice, uint8 triggerOperator, uint8 orderType, address builder, uint96 builderFeeBpsTimes1k)",
]);
const REG = parseAbi(["function unclaimedSomi(address user) view returns (uint256)"]);
const BANK = parseAbi([
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
]);

const markets = (await client.listPerpMarkets()) as any[];
const byPool = new Map(markets.map((m) => [m.poolAddress.toLowerCase(), m]));
const btc = markets.find((m) => m.baseSymbol === "BTC");
const dec = Number(btc.baseDecimals);

async function positionAt(m: any, account: Address, blockNumber?: bigint) {
  const p = (await rpc.readContract({ address: m.marginBank, abi: BANK, functionName: "getPosition", args: [account, m.poolAddress], ...(blockNumber === undefined ? {} : { blockNumber }) })) as any;
  return { size: BigInt(p.size), entry: BigInt(p.avgEntryPrice) };
}
const btcAmt = (q: bigint) => human(q, dec);
const price = (p: bigint | string) => human(p, 18);

// 1. Live state of our account.
const pendingOwn: any[] = await client.listPerpStopOrders({ account: OWNER });
const ownReads: any[] = pendingOwn.length ? await client.getPerpStopOrders(pendingOwn.map((s) => ({ registry: s.registry, orderId: s.orderIdRaw }))) : [];
const livePos = await positionAt(btc, OWNER);
const live = {
  market: "BTC-PERP",
  positionBtc: btcAmt(livePos.size),
  avgEntry: price(livePos.entry),
  stops: pendingOwn.map((s, i) => {
    const r = ownReads[i];
    const o = r?.status === "present" ? r.order : null;
    return {
      id: s.orderIdRaw,
      kind: Number(s.triggerOperator) === 1 ? "SL (fires at or below)" : "TP (fires at or above)",
      trigger: price(s.triggerPrice),
      chainStatus: r?.status,
      storedQuantityRaw: o ? String(o.quantity) : null,
      storedQuantityBtc: o ? btcAmt(BigInt(o.quantity)) : null,
      wholePosition: o ? BigInt(o.quantity) === 0n : null,
      linkedTo: o && BigInt(o.siblingOrderId) !== 0n ? String(o.siblingOrderId) : null,
      intent: o?.intent ?? null,
      sttHeld: o ? human(o.somiPaid, 18) : null,
      createdAt: new Date(Number(s.createdAt) * 1000).toISOString(),
      txHash: s.txHash,
    };
  }),
};
const slLive = live.stops.filter((s) => s.kind.startsWith("SL") && s.chainStatus === "present");
const slCover = slLive.some((s) => s.wholePosition) ? livePos.size : slLive.reduce((a, s) => a + BigInt(s.storedQuantityRaw ?? 0), 0n);
const liveSummary = {
  slCoversBtc: btcAmt(slCover),
  uncoveredBtc: btcAmt((livePos.size < 0n ? -livePos.size : livePos.size) - slCover),
  slCoversPct: livePos.size === 0n ? null : Number((slCover * 10000n) / (livePos.size < 0n ? -livePos.size : livePos.size)) / 100,
};

// 2. Every BTC stop pair of the account, with the position timeline from its own fills.
const ownAll: any[] = await client.listPerpStopOrders({ account: OWNER, pool: btc.poolAddress, status: ["PENDING", "TRIGGERED", "TRIGGER_FAILED", "CANCELLED"], limit: 200 });
const orders: any[] = await client.getOrders(OWNER, { limit: 200 } as any);
const fills = orders.filter((o) => o.pool.toLowerCase() === btc.poolAddress.toLowerCase() && BigInt(o.filledQuantity ?? 0) > 0n);
const timeline: { tx: string; block: bigint; time: number; sizeAfter: bigint; entryAfter: bigint }[] = [];
for (const o of fills) {
  const r = await rpc.getTransactionReceipt({ hash: o.placedTxHash as Hex });
  const blk = await rpc.getBlock({ blockNumber: r.blockNumber });
  const p = await positionAt(btc, OWNER, r.blockNumber);
  timeline.push({ tx: o.placedTxHash, block: r.blockNumber, time: Number(blk.timestamp), sizeAfter: p.size, entryAfter: p.entry });
}
timeline.sort((a, b) => Number(a.block - b.block));

const byTx = new Map<string, any[]>();
for (const s of ownAll) byTx.set(s.txHash, [...(byTx.get(s.txHash) ?? []), s]);
const pairs = [];
for (const [tx, legs] of byTx) {
  const r = await rpc.getTransactionReceipt({ hash: tx as Hex });
  const created = parseEventLogs({ abi: EVENTS, logs: r.logs.filter((l) => l.address.toLowerCase() === btc.stopRegistry.toLowerCase()) });
  const atCreation = await positionAt(btc, OWNER, r.blockNumber);
  const from = Math.min(...legs.map((l) => Number(l.createdAt)));
  const to = Math.max(...legs.map((l) => (l.status === "PENDING" ? Infinity : Number(l.updatedAt))));
  const during = timeline.filter((t) => t.time >= from && t.time < to).map((t) => t.sizeAfter);
  const maxDuring = [atCreation.size, ...during].reduce((a, b) => (b > a ? b : a));
  pairs.push({
    tx,
    block: Number(r.blockNumber),
    createdAt: new Date(from * 1000).toISOString(),
    positionAtCreationBtc: btcAmt(atCreation.size),
    largestPositionWhileArmedBtc: btcAmt(maxDuring),
    legs: created.map((e: any) => {
      const row = legs.find((l) => l.orderIdRaw === String(e.args.orderId));
      return {
        id: String(e.args.orderId),
        kind: Number(e.args.triggerOperator) === 1 ? "SL" : "TP",
        trigger: price(e.args.triggerPrice),
        storedQuantityRaw: String(e.args.quantity),
        storedQuantityBtc: btcAmt(e.args.quantity),
        status: row?.status ?? null,
        cancelReason: row?.cancelReason ?? null,
        endedAt: row && row.status !== "PENDING" ? new Date(Number(row.updatedAt) * 1000).toISOString() : null,
      };
    }),
  });
}
pairs.sort((a, b) => a.block - b.block);

// Clean-up of the 22 Oct 16:36 test: owner STT and unclaimed fee right after its last leg ended.
async function blockAt(ts: number, lo: bigint, hi: bigint) {
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (Number((await rpc.getBlock({ blockNumber: mid })).timestamp) <= ts) lo = mid;
    else hi = mid;
  }
  return lo;
}
const first = pairs[0];
const endTs = Math.max(...first.legs.map((l: any) => Date.parse(l.endedAt) / 1000));
const endBlock = await blockAt(endTs + 5, BigInt(first.block), BigInt(first.block) + 20000n);
const cleanup = {
  pair: first.tx,
  block: Number(endBlock),
  time: new Date(Number((await rpc.getBlock({ blockNumber: endBlock })).timestamp) * 1000).toISOString(),
  positionBtc: btcAmt((await positionAt(btc, OWNER, endBlock)).size),
  ownerSttBeforeTest: human(await rpc.getBalance({ address: OWNER, blockNumber: BigInt(first.block) - 1n }), 18),
  ownerStt: human(await rpc.getBalance({ address: OWNER, blockNumber: endBlock }), 18),
  unclaimedStt: human((await rpc.readContract({ address: btc.stopRegistry, abi: REG, functionName: "unclaimedSomi", args: [OWNER], blockNumber: endBlock })) as bigint, 18),
};

// 3. The fires of the two live runs (README of the stopcheck tool).
const FIRES: [string, string][] = [
  ["0x2db1fbb610bcc905796b47326246ea95e5b055c011ca4b907fb9b3f043825178", "22 Oct, the account's own stop loss at 81,385 fires"],
  ["0x8524c1fb944ecc7ceacfcd08087aa940e0acfc5d77f75a1dad7cbff8dc67abc2", "22 Oct, our keeper closes the uncovered rest"],
  ["0x9b13ce9e6fb4175ce030494444014a0afed12984188bf21d8531c4d92eda2aee", "26 Oct, the account's own stop loss at 79,900 fires"],
  ["0x01a5d298b7453fab8e22fe9689f99264ca7af821942c1eb2703c78b2eccbcc12", "26 Oct, our keeper closes the uncovered rest"],
];
const fires = [];
for (const [hash, what] of FIRES) {
  const r = await rpc.getTransactionReceipt({ hash: hash as Hex });
  const blk = await rpc.getBlock({ blockNumber: r.blockNumber });
  const before = await positionAt(btc, OWNER, r.blockNumber - 1n);
  const after = await positionAt(btc, OWNER, r.blockNumber);
  fires.push({ tx: hash, what, block: Number(r.blockNumber), time: new Date(Number(blk.timestamp) * 1000).toISOString(), from: r.from, status: r.status, positionBeforeBtc: btcAmt(before.size), positionAfterBtc: btcAmt(after.size) });
}

// 4. Every pending perp stop on the chain.
const all: any[] = [];
for (let offset = 0; ; offset += 1000) {
  const page: any[] = await client.listPerpStopOrders({ limit: 1000, offset });
  all.push(...page);
  if (page.length < 1000) break;
}
const reads: any[] = [];
for (let i = 0; i < all.length; i += 200) reads.push(...(await client.getPerpStopOrders(all.slice(i, i + 200).map((s) => ({ registry: s.registry, orderId: s.orderIdRaw })))));
const present = all.map((s, i) => ({ s, o: reads[i]?.status === "present" ? reads[i].order : null })).filter((x) => x.o);
const isFixed = (x: any) => BigInt(x.o.quantity) !== 0n;
const recent = present.filter((x) => Number(x.s.createdAt) >= SINCE);
const whole = present.filter((x) => !isFixed(x));
const wholeTx = [];
for (const x of whole) {
  const tx = await rpc.getTransaction({ hash: x.s.txHash as Hex });
  wholeTx.push({ id: x.s.orderIdRaw, owner: x.s.owner, market: `${x.s.market?.baseSymbol}-PERP`, createdAt: new Date(Number(x.s.createdAt) * 1000).toISOString(), tx: x.s.txHash, txTo: tx.to, selector: tx.input.slice(0, 10) });
}

// Positions behind reduce-only stops, read from the MarginBank.
const groups = new Map<string, any[]>();
for (const x of present) {
  if (x.o.intent !== "reduceOnly") continue;
  const k = `${String(x.s.owner).toLowerCase()}|${String(x.s.market?.poolAddress).toLowerCase()}`;
  groups.set(k, [...(groups.get(k) ?? []), x]);
}
const keys = [...groups.keys()];
const sizes = new Map<string, bigint>();
for (let i = 0; i < keys.length; i += 25) {
  await Promise.all(
    keys.slice(i, i + 25).map(async (k) => {
      const [owner, pool] = k.split("|");
      const m = byPool.get(pool);
      if (!m) return;
      sizes.set(k, (await positionAt(m, owner as Address)).size);
    }),
  );
}
const under = [];
let withPositionAndSl = 0;
for (const [k, legs] of groups) {
  const size = sizes.get(k) ?? 0n;
  if (size === 0n) continue;
  const long = size > 0n;
  const abs = long ? size : -size;
  const sl = legs.filter((x) => (long ? !x.o.isBid && Number(x.o.triggerOperator) === 1 : x.o.isBid && Number(x.o.triggerOperator) === 0));
  if (!sl.length) continue;
  withPositionAndSl++;
  if (sl.some((x) => !isFixed(x))) continue;
  const cover = sl.reduce((a, x) => a + BigInt(x.o.quantity), 0n);
  if (cover >= abs) continue;
  const m = byPool.get(k.split("|")[1]);
  const d = Number(m.baseDecimals);
  under.push({
    owner: k.split("|")[0],
    market: `${m.baseSymbol}-PERP`,
    side: long ? "long" : "short",
    position: human(abs, d),
    stopLossCovers: human(cover, d),
    uncovered: human(abs - cover, d),
    uncoveredUsd: Math.round(human(abs - cover, d) * price(m.markPrice) * 100) / 100,
    coveredPct: Number((cover * 10000n) / abs) / 100,
  });
}
under.sort((a, b) => b.uncoveredUsd - a.uncoveredUsd);

// 5. Control: what a quantity-0 ("whole position") stop does when it fires. Recent TRIGGERED rows
//    with quantity 0; position at the creation block, just before the fire and right after it.
const triggered: any[] = await client.listPerpStopOrders({ limit: 400, status: ["TRIGGERED"] });
const zeroFired = [];
for (const s of triggered.filter((s) => BigInt(s.quantity) === 0n && s.placedOrderId)) {
  if (zeroFired.length >= 12) break;
  const m = byPool.get(String(s.market?.poolAddress).toLowerCase());
  if (!m) continue;
  const ords: any[] = await client.getOrders(s.owner, { limit: 200 } as any).catch(() => []);
  const o = ords.find((x) => x.orderId === s.placedOrderId);
  if (!o) continue;
  const cr = await rpc.getTransactionReceipt({ hash: s.txHash as Hex });
  const fr = await rpc.getTransactionReceipt({ hash: o.placedTxHash as Hex });
  const d = Number(m.baseDecimals);
  zeroFired.push({
    owner: s.owner,
    market: `${m.baseSymbol}-PERP`,
    created: s.txHash,
    fired: o.placedTxHash,
    positionAtCreation: human((await positionAt(m, s.owner, cr.blockNumber)).size, d),
    positionBeforeFire: human((await positionAt(m, s.owner, fr.blockNumber - 1n)).size, d),
    positionAfterFire: human((await positionAt(m, s.owner, fr.blockNumber)).size, d),
    filled: human(BigInt(o.filledQuantity), d),
  });
}

out({
  ...(await stamp()),
  owner: OWNER,
  btcRegistry: btc.stopRegistry,
  live,
  liveSummary,
  ownPairs: pairs,
  ownTimeline: timeline.map((t) => ({ tx: t.tx, block: Number(t.block), time: new Date(t.time * 1000).toISOString(), positionAfterBtc: btcAmt(t.sizeAfter), avgEntryAfter: t.sizeAfter === 0n ? null : price(t.entryAfter) })),
  cleanupOf22Oct1636: cleanup,
  fires,
  scan: {
    pendingRows: all.length,
    liveOnChain: present.length,
    fixedSize: present.filter(isFixed).length,
    wholePosition: whole.length,
    createdSince2026_10_23: { total: recent.length, fixedSize: recent.filter(isFixed).length, wholePosition: recent.filter((x) => !isFixed(x)).length },
    owners: new Set(present.map((x) => String(x.s.owner).toLowerCase())).size,
    wholePositionStops: wholeTx,
    positionsWithStopLoss: withPositionAndSl,
    stopLossCoversOnlyPart: under.length,
    uncoveredUsdTotal: Math.round(under.reduce((a, u) => a + u.uncoveredUsd, 0) * 100) / 100,
    underCovered: under,
  },
  wholePositionControl: {
    sampled: zeroFired.length,
    closedWholePosition: zeroFired.filter((z) => z.positionAfterFire === 0).length,
    positionHadGrownSinceCreation: zeroFired.filter((z) => Math.abs(z.positionBeforeFire) > Math.abs(z.positionAtCreation)).length,
    fires: zeroFired,
  },
});
process.exit(0);
