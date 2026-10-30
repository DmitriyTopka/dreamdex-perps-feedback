// Report 020: where the 0.15 STT of the cancelled leg of a linked TP/SL goes. Read-only, no key.
//   cd scripts && npm install && npx tsx linkedfee-020.ts
// 1. Our own bracket on BTC-PERP (2026-10-22): the creation tx, the fire tx and its
//    LinkedOrderCancelled event, and the owner's wallet balance + unclaimedSomi one block before and
//    at the fire, at our manual Owner cancel an hour earlier, and at the Claim.
// 2. Every perp stop the indexer has as CANCELLED, all markets and accounts, by cancelReason.
// 3. For each (registry, owner) that has a LinkedFill row: unclaimedSomi now, and whether the owner
//    is an EOA (code size 0). An EOA can always take a native transfer, so its balance is not a
//    failed refund. Owners that also have an Inert row are counted apart.

import { decodeEventLog, keccak256, parseAbi, toHex, type Address, type Hex } from "viem";
import { client, out, rpc, stamp } from "./client.js";

const OWNER = "0x84326A92162Ece92ed257A31073fDd3a6599BF21" as Address;
const TP_ID = 5700043918776251455591n;
const SL_ID = 3431094397709976606824n;
const CREATE_TX = "0xb36312c539f02640cd48dabd1fb0bbcdf709f282cef01f570cd56718f64728d4" as Hex;
const OWNER_CANCEL_TX = "0x8cd20d4d68a3ca5c3d26f10395bee54ba2e07c160371171b7d6892750a6fc6ab" as Hex; // 16:37:55, cancelReason Owner
const CLAIM_TX = "0x774205e0008fd2bc1ba6e406f0cfed20ba8a61e515ef4970a2830aa361afd15c" as Hex; // Claim pressed in the app

// Not in the SDK's perpStopRegistryEventsAbi. Signature recovered by matching topic0 0xd711b596...
const LINKED_CANCELLED = parseAbi(["event LinkedOrderCancelled(uint128 indexed cancelledOrderId, uint128 indexed filledOrderId, address indexed owner, uint256 amount)"]);
const REG = parseAbi(["function unclaimedSomi(address user) view returns (uint256)", "function somiPaymentPerOrder() view returns (uint256)"]);
const topic0 = keccak256(toHex("LinkedOrderCancelled(uint128,uint128,address,uint256)"));
const stt = (v: bigint) => Number(v) / 1e18;

const btc = ((await client.listPerpMarkets()) as any[]).find((m) => m.baseSymbol === "BTC");
const registry = btc.stopRegistry as Address;
async function state(block: bigint) {
  return {
    block: Number(block),
    walletSTT: stt(await rpc.getBalance({ address: OWNER, blockNumber: block })),
    unclaimedSTT: stt((await rpc.readContract({ address: registry, abi: REG, functionName: "unclaimedSomi", args: [OWNER], blockNumber: block })) as bigint),
  };
}
const around = async (hash: Hex) => {
  const r = await rpc.getTransactionReceipt({ hash });
  const t = (await rpc.getBlock({ blockNumber: r.blockNumber })).timestamp;
  return { hash, time: new Date(Number(t) * 1000).toISOString(), status: r.status, before: await state(r.blockNumber - 1n), at: await state(r.blockNumber) };
};

// 1. Our bracket.
const created = await rpc.getTransactionReceipt({ hash: CREATE_TX });
let fire: any = null;
for (let from = created.blockNumber; from < created.blockNumber + 20_000n && !fire; from += 1_000n) {
  const logs = await rpc.getLogs({ address: registry, fromBlock: from, toBlock: from + 999n, event: LINKED_CANCELLED[0], args: { cancelledOrderId: SL_ID } } as any);
  if (logs.length) fire = logs[0];
}
const ev = fire ? decodeEventLog({ abi: LINKED_CANCELLED, data: fire.data, topics: fire.topics }) : null;
const indexed = (await client.listPerpStopOrders({ account: OWNER, status: ["CANCELLED", "TRIGGERED"], limit: 200 })) as any[];
const row = (id: bigint) => {
  const r = indexed.find((x) => BigInt(x.orderIdRaw) === id);
  return r && { id: r.orderIdRaw, status: r.status, cancelReason: r.cancelReason, triggerPrice: Number(r.triggerPrice) / 1e18 };
};
const ours = {
  registry,
  takeProfit: row(TP_ID),
  stopLoss: row(SL_ID),
  createTx: { hash: CREATE_TX, ...(await state(created.blockNumber - 1n)), after: await state(created.blockNumber) },
  fireTx: fire && {
    hash: fire.transactionHash,
    time: new Date(Number((await rpc.getBlock({ blockNumber: fire.blockNumber })).timestamp) * 1000).toISOString(),
    event: { name: ev!.eventName, ...(ev!.args as any), amountSTT: stt((ev!.args as any).amount) },
    before: await state(fire.blockNumber - 1n),
    at: await state(fire.blockNumber),
  },
  manualOwnerCancelEarlier: await around(OWNER_CANCEL_TX),
  claim: await around(CLAIM_TX),
  unclaimedNow: stt((await rpc.readContract({ address: registry, abi: REG, functionName: "unclaimedSomi", args: [OWNER] })) as bigint),
  linkedFillRowsForThisAccount: indexed.filter((x) => x.cancelReason === "LinkedFill").length,
};

// 2. Every CANCELLED perp stop.
const seen = new Map<string, any>();
for (let offset = 0; ; offset += 1000) {
  const page = (await client.listPerpStopOrders({ status: ["CANCELLED"], limit: 1000, offset })) as any[];
  for (const r of page) seen.set(r.id, r);
  if (page.length < 1000) break;
}
const cancelled = [...seen.values()];
const byReason: Record<string, number> = {};
for (const r of cancelled) byReason[r.cancelReason ?? "null"] = (byReason[r.cancelReason ?? "null"] ?? 0) + 1;

// 3. Who holds what now.
const key = (r: any) => `${r.registry.toLowerCase()}|${r.owner.toLowerCase()}`;
const pairs = new Map<string, { registry: Address; owner: Address; linkedFills: number; inert: boolean; market: string }>();
for (const r of cancelled.filter((r) => r.cancelReason === "LinkedFill")) {
  const p = pairs.get(key(r)) ?? { registry: r.registry, owner: r.owner, linkedFills: 0, inert: false, market: `${r.market.baseSymbol}-PERP` };
  p.linkedFills++;
  pairs.set(key(r), p);
}
for (const r of cancelled.filter((r) => r.cancelReason === "Inert")) if (pairs.has(key(r))) pairs.get(key(r))!.inert = true;

const fee = new Map<string, bigint>();
const list = [...pairs.values()];
const results: any[] = [];
for (let i = 0; i < list.length; i += 25) {
  results.push(
    ...(await Promise.all(
      list.slice(i, i + 25).map(async (p) => {
        if (!fee.has(p.registry)) fee.set(p.registry, (await rpc.readContract({ address: p.registry, abi: REG, functionName: "somiPaymentPerOrder" })) as bigint);
        const [owed, code] = await Promise.all([
          rpc.readContract({ address: p.registry, abi: REG, functionName: "unclaimedSomi", args: [p.owner] }) as Promise<bigint>,
          rpc.getCode({ address: p.owner }),
        ]);
        return { ...p, eoa: !code || code === "0x", unclaimedSTT: stt(owed) };
      }),
    )),
  );
}
const sum = (xs: any[]) => Math.round(xs.reduce((a, x) => a + x.unclaimedSTT, 0) * 1e6) / 1e6;
const holding = results.filter((r) => r.unclaimedSTT > 0);
const eoaNoInert = results.filter((r) => r.eoa && !r.inert);

out({
  ...(await stamp()),
  linkedOrderCancelledTopic0: topic0,
  ours,
  network: {
    cancelledPerpStops: cancelled.length,
    byCancelReason: byReason,
    somiPaymentPerOrderSTT: Object.fromEntries([...fee].map(([r, v]) => [r, stt(v)])),
    ownerRegistryPairsWithLinkedFill: results.length,
    distinctOwners: new Set(results.map((r) => r.owner.toLowerCase())).size,
    pairsHoldingUnclaimedNow: holding.length,
    unclaimedSTTHeldByThem: sum(holding),
    eoaPairsWithoutInert: { pairs: eoaNoInert.length, holdingNow: eoaNoInert.filter((r) => r.unclaimedSTT > 0).length, unclaimedSTT: sum(eoaNoInert) },
    contractOwnerPairs: results.filter((r) => !r.eoa).length,
    pairsWithInertToo: results.filter((r) => r.inert).length,
  },
  holders: holding.sort((a, b) => b.unclaimedSTT - a.unclaimedSTT),
});
process.exit(0);
