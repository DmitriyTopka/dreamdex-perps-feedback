// Report 022: cancelling a limit order in the app leaves its attached TP/SL armed. Read-only, no key.
//   cd scripts && npm install && npx tsx orphan-022.ts
// 1. Our 22 Oct case, block by block from archive reads: the tx that placed the limit order and its
//    two stops, the block where the limit order disappeared, the stops still live after it, the
//    unrelated long that the stops then sat on, and the owner's STT balance at each step.
// 2. Every pending perp stop on Hideki today: which were placed in the same tx as a limit order
//    by the same owner, which of those parents were cancelled without a fill, and what the
//    leftover stops sit on now (no position, or a position opened later). STT they hold.

import { parseAbi, parseEventLogs, type Address, type Hex } from "viem";
import { client, human, out, rpc, stamp } from "./client.js";

const OWNER = "0x84326A92162Ece92ed257A31073fDd3a6599BF21" as Address;
const PLACE_TX = "0xa116fb7e1de0b510d0c7bb949a579c37ce207242dd58eafef42c7c03432d3e1e" as Hex;
const NEW_LONG_TX = "0x80bfd2d31c5264ed9aeec4c37a24245b791b6a82741a0238d409b08c11cdea22" as Hex;
const CLOSE_TX = "0xc9a3f95a482403be3b9560051d494499c7a3b0bb8e4c46a38ff518c2dc1d6986" as Hex;
const EVENTS = parseAbi([
  "event PendingOrderCreated(uint128 indexed orderId, address indexed owner, bool isBid, uint256 quantity, uint256 triggerPrice, uint8 triggerOperator, uint8 orderType, address builder, uint96 builderFeeBpsTimes1k)",
]);
const REG = parseAbi([
  "function getPendingOrder(uint128 orderId) view returns (bool live, (((bool isBid, address owner, uint64 userData, uint256 quantity) order, uint8 orderType, uint256 triggerPrice, uint8 triggerOperator, uint256 limitPrice, address builder, uint96 builderFeeBpsTimes1k) orderWithTrigger, uint128 orderId, uint256 somiPaid, uint128 siblingOrderId, uint8 intent) order)",
  "function somiPaymentPerOrder() view returns (uint256)",
  "function unclaimedSomi(address user) view returns (uint256)",
]);
const BANK = parseAbi([
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
]);

const markets = (await client.listPerpMarkets()) as any[];
const byPool = new Map(markets.map((m) => [m.poolAddress.toLowerCase(), m]));
const btc = markets.find((m) => m.baseSymbol === "BTC");
const dec = Number(btc.baseDecimals);
const iso = async (b: bigint) => new Date(Number((await rpc.getBlock({ blockNumber: b })).timestamp) * 1000).toISOString();
const positionAt = async (m: any, a: Address, blockNumber?: bigint) =>
  BigInt(((await rpc.readContract({ address: m.marginBank, abi: BANK, functionName: "getPosition", args: [a, m.poolAddress], ...(blockNumber === undefined ? {} : { blockNumber }) })) as any).size);
const legAt = async (id: bigint, blockNumber: bigint) => {
  const [live, o] = (await rpc.readContract({ address: btc.stopRegistry, abi: REG, functionName: "getPendingOrder", args: [id], blockNumber })) as any;
  return live ? { live: true, quantityBtc: human(o.orderWithTrigger.order.quantity, dec), trigger: human(o.orderWithTrigger.triggerPrice, 18), sibling: String(o.siblingOrderId), intent: Number(o.intent) === 0 ? "reduceOnly" : String(o.intent), sttPaid: human(o.somiPaid, 18) } : { live: false };
};
const orderLiveAt = async (id: bigint, blockNumber: bigint) => (await client.getOrderOnchain(btc.poolAddress, id, { blockNumber })) !== null;
// First block in (lo, hi] where pred turns false, given pred(lo) is true and pred(hi) is false.
async function firstFalse(lo: bigint, hi: bigint, pred: (b: bigint) => Promise<boolean>) {
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (await pred(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}

// 1. Our case.
const placed = await rpc.getTransactionReceipt({ hash: PLACE_TX });
const legs = parseEventLogs({ abi: EVENTS, logs: placed.logs.filter((l) => l.address.toLowerCase() === btc.stopRegistry.toLowerCase()) }).map((e: any) => ({
  id: BigInt(e.args.orderId),
  kind: Number(e.args.triggerOperator) === 1 ? "SL" : "TP",
  trigger: human(e.args.triggerPrice, 18),
  quantityBtc: human(e.args.quantity, dec),
}));
const ownOrders: any[] = await client.getOrders(OWNER, { limit: 200 } as any);
const parent = ownOrders.find((o) => o.placedTxHash.toLowerCase() === PLACE_TX);
const parentId = BigInt(parent.orderId);
const newLong = await rpc.getTransactionReceipt({ hash: NEW_LONG_TX });
const close = await rpc.getTransactionReceipt({ hash: CLOSE_TX });
const parentGone = await firstFalse(placed.blockNumber, newLong.blockNumber, (b) => orderLiveAt(parentId, b));
const legsGone = await firstFalse(close.blockNumber, close.blockNumber + 400n, async (b) => (await legAt(legs[0].id, b)).live);
const stt = async (b: bigint) => human(await rpc.getBalance({ address: OWNER, blockNumber: b }), 18);
const snap = async (label: string, b: bigint) => ({
  label,
  block: Number(b),
  time: await iso(b),
  limitOrderLive: await orderLiveAt(parentId, b),
  positionBtc: human(await positionAt(btc, OWNER, b), dec),
  legs: await Promise.all(legs.map(async (l) => ({ id: String(l.id), kind: l.kind, ...(await legAt(l.id, b)) }))),
  ownerStt: await stt(b),
  unclaimedStt: human((await rpc.readContract({ address: btc.stopRegistry, abi: REG, functionName: "unclaimedSomi", args: [OWNER], blockNumber: b })) as bigint, 18),
});
const ourCase = {
  placeTx: PLACE_TX,
  limitOrder: { id: parent.orderId, side: parent.isBid ? "buy" : "sell", price: human(parent.price, 18), quantityBtc: human(parent.fullQuantity, dec), filledBtc: human(parent.filledQuantity, dec), indexerStatus: parent.status },
  stopsCreatedInSameTx: legs.map((l) => ({ ...l, id: String(l.id) })),
  steps: [
    { ...(await snap("block before placement", placed.blockNumber - 1n)) },
    { ...(await snap("placement block", placed.blockNumber)) },
    { ...(await snap("first block without the limit order (cancelled in the app)", parentGone)) },
    { ...(await snap("new long opened without TP/SL", newLong.blockNumber)), tx: NEW_LONG_TX },
    { ...(await snap("long closed", close.blockNumber)), tx: CLOSE_TX },
    { ...(await snap("first block without the stops (cancelled in the app)", legsGone)) },
  ],
  feePerStopTodaySTT: human((await rpc.readContract({ address: btc.stopRegistry, abi: REG, functionName: "somiPaymentPerOrder" })) as bigint, 18),
};

// 2. Every pending stop today.
const all: any[] = [];
for (let offset = 0; ; offset += 1000) {
  const page: any[] = await client.listPerpStopOrders({ limit: 1000, offset });
  all.push(...page);
  if (page.length < 1000) break;
}
const reads: any[] = [];
for (let i = 0; i < all.length; i += 200) reads.push(...(await client.getPerpStopOrders(all.slice(i, i + 200).map((s) => ({ registry: s.registry, orderId: s.orderIdRaw })))));
const live = all.map((s, i) => ({ s, o: reads[i]?.status === "present" ? reads[i].order : null })).filter((x) => x.o && x.o.intent === "reduceOnly");

const owners = [...new Set(live.map((x) => String(x.s.owner).toLowerCase()))];
const ordersByOwner = new Map<string, any[]>();
for (let i = 0; i < owners.length; i += 10) {
  await Promise.all(owners.slice(i, i + 10).map(async (o) => ordersByOwner.set(o, await client.getOrders(o, { limit: 200 } as any).catch(() => []))));
}
const outlived = [];
const parentStatus: Record<string, number> = {};
let placedWithOrder = 0;
for (const x of live) {
  const owner = String(x.s.owner).toLowerCase();
  const pool = String(x.s.market?.poolAddress).toLowerCase();
  const p = (ordersByOwner.get(owner) ?? []).find((o) => o.placedTxHash?.toLowerCase() === String(x.s.txHash).toLowerCase() && o.pool.toLowerCase() === pool);
  if (!p) continue;
  placedWithOrder++;
  parentStatus[p.status] = (parentStatus[p.status] ?? 0) + 1;
  if (p.status === "Cancelled" && BigInt(p.filledQuantity ?? 0) === 0n) {
    const m = byPool.get(pool);
    const created = await rpc.getTransactionReceipt({ hash: x.s.txHash as Hex });
    const long = Boolean(p.isBid);
    outlived.push({
      owner,
      market: `${m.baseSymbol}-PERP`,
      stopId: x.s.orderIdRaw,
      kind: (Number(x.o.triggerOperator) === 1) === long ? "SL" : "TP",
      trigger: human(x.o.triggerPrice, 18),
      txHash: x.s.txHash,
      createdAt: new Date(Number(x.s.createdAt) * 1000).toISOString(),
      parentOrderId: p.orderId,
      parentSide: long ? "buy" : "sell",
      parentPrice: human(p.price, 18),
      parentQuantity: human(p.fullQuantity, Number(m.baseDecimals)),
      stopQuantity: human(x.o.quantity, Number(m.baseDecimals)),
      sttHeld: human(x.o.somiPaid, 18),
      positionWhenArmed: human(await positionAt(m, owner as Address, created.blockNumber), Number(m.baseDecimals)),
      m,
    });
  }
}
const pairs = [...new Set(outlived.map((x) => `${x.owner}|${x.m.poolAddress.toLowerCase()}`))];
const posNow = new Map<string, bigint>();
for (const k of pairs) {
  const [o] = k.split("|");
  const m = outlived.find((x) => `${x.owner}|${x.m.poolAddress.toLowerCase()}` === k)!.m;
  posNow.set(k, await positionAt(m, o as Address));
}
const leftovers = outlived.map(({ m, ...x }) => {
  const size = posNow.get(`${x.owner}|${m.poolAddress.toLowerCase()}`) ?? 0n;
  return { ...x, positionNow: human(size, Number(m.baseDecimals)), sitsOn: size === 0n ? "no position" : "an open position the cancelled order never filled into" };
});

out({
  ...(await stamp()),
  owner: OWNER,
  btcRegistry: btc.stopRegistry,
  ourCase,
  scan: {
    pendingReduceOnlyLive: live.length,
    owners: owners.length,
    placedInSameTxAsAnOrder: placedWithOrder,
    parentOrderStatus: parentStatus,
    outlivedCancelledParent: leftovers.length,
    accounts: new Set(leftovers.map((x) => x.owner)).size,
    onNoPosition: leftovers.filter((x) => x.sitsOn === "no position").length,
    onAnOpenPosition: leftovers.filter((x) => x.sitsOn !== "no position").length,
    sttHeld: Math.round(leftovers.reduce((a, x) => a + x.sttHeld, 0) * 100) / 100,
    leftovers,
  },
});
process.exit(0);
