// Report 002: cancelling an order that is already gone. Read-only, eth_call only, no key.
//   cd scripts && npm install && npx tsx cancel-002.ts
// Takes every finished order of our test account from the indexer (Filled and Cancelled) and
// simulates, at one block: cancelOrderFor from our linked bot key, cancelOrder from the owner,
// reduceOrderFor from the bot key. Plus an id that never existed. Decodes each revert.

import { contractErrorsAbi } from "@somnia-chain/markets-sdk";
import { decodeErrorResult, encodeFunctionData, parseAbi, toFunctionSelector, type Address, type Hex } from "viem";
import { client, out, RPC, rpc, stamp } from "./client.js";

const OWNER = "0x84326A92162Ece92ed257A31073fDd3a6599BF21" as Address;
const BOT = "0x13f05c8e15cC0d7d3abff02C144fb74778018a55" as Address; // linked in the app, Link a bot
// Signatures checked against the PerpPool dispatcher; cancelOrderFor matches the SDK's CANCEL_ORDER_FOR_SELECTOR.
const ABI = parseAbi([
  "function cancelOrderFor(address owner, uint128 orderId)",
  "function cancelOrder(uint128 orderId)",
  "function reduceOrderFor(address owner, uint128 orderId, uint256 quantity)",
]);
const ORDER_ID_MISMATCH = toFunctionSelector("function OrderIdMismatch()");

const head = await rpc.getBlockNumber();
const blockTag = `0x${head.toString(16)}`;
async function sim(from: Address, to: Address, data: Hex) {
  const res = await (await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from, to, data, gas: "0x989680" }, blockTag] }),
  })).json();
  if (!res.error) return "passes";
  try {
    const d = decodeErrorResult({ abi: contractErrorsAbi as any, data: res.error.data });
    return `${d.errorName}(${(d.args ?? []).join(", ")})`;
  } catch {
    return `undecoded ${res.error.data ?? res.error.message}`;
  }
}

const symbolOf = new Map(((await client.listPerpMarkets()) as any[]).map((m) => [m.poolAddress.toLowerCase(), `${m.baseSymbol}-PERP`]));
const orders: any[] = await client.getOrders(OWNER, { limit: 200 } as any);
const rows = [];
for (const o of orders.filter((o) => symbolOf.has(o.pool.toLowerCase()) && ["Filled", "Cancelled"].includes(o.status))) {
  const id = BigInt(o.orderId);
  rows.push({
    market: symbolOf.get(o.pool.toLowerCase()),
    status: o.status,
    orderId: `0x${id.toString(16)}`,
    slot: Number(id >> 64n),
    placedTx: o.placedTxHash,
    cancelOrderFor_bot: await sim(BOT, o.pool, encodeFunctionData({ abi: ABI, functionName: "cancelOrderFor", args: [OWNER, id] })),
    cancelOrder_owner: await sim(OWNER, o.pool, encodeFunctionData({ abi: ABI, functionName: "cancelOrder", args: [id] })),
    reduceOrderFor_bot: await sim(BOT, o.pool, encodeFunctionData({ abi: ABI, functionName: "reduceOrderFor", args: [OWNER, id, 1n] })),
    onchain: (await client.getOrderOnchain(o.pool, id).catch((e: any) => `error ${e?.name}`)) ?? null,
  });
}
const eth = [...symbolOf].find(([, s]) => s === "ETH-PERP")![0] as Address;
const never = 999_999_999n;
const neverExisted = {
  market: "ETH-PERP",
  orderId: never.toString(),
  cancelOrderFor_bot: await sim(BOT, eth, encodeFunctionData({ abi: ABI, functionName: "cancelOrderFor", args: [OWNER, never] })),
  cancelOrder_owner: await sim(OWNER, eth, encodeFunctionData({ abi: ABI, functionName: "cancelOrder", args: [never] })),
};

const tally = (k: string) => {
  const t: Record<string, number> = {};
  for (const r of rows as any[]) {
    const key = String(r[k]).replace(/0x[0-9a-fA-F]{40}/g, (a) => (a.toLowerCase() === OWNER.toLowerCase() ? "OWNER" : a === "0x0000000000000000000000000000000000000000" ? "ZERO" : "OTHER_ADDRESS"));
    t[key] = (t[key] ?? 0) + 1;
  }
  return t;
};
const others = new Set<string>();
for (const r of rows as any[]) for (const m of String(r.cancelOrder_owner).match(/0x[0-9a-fA-F]{40}/g) ?? []) if (![OWNER.toLowerCase(), "0x0000000000000000000000000000000000000000"].includes(m.toLowerCase())) others.add(m);

out({
  ...(await stamp()),
  simulatedAtBlock: Number(head),
  owner: OWNER,
  bot: BOT,
  summary: {
    finishedOrders: rows.length,
    byStatus: Object.fromEntries(["Filled", "Cancelled"].map((s) => [s, rows.filter((r) => r.status === s).length])),
    cancelOrderFor_bot: tally("cancelOrderFor_bot"),
    cancelOrder_owner: tally("cancelOrder_owner"),
    reduceOrderFor_bot: tally("reduceOrderFor_bot"),
    otherAddressesNamedAsOwner: [...others],
    orderIdMismatchEverReturned: rows.some((r) => JSON.stringify(r).includes("OrderIdMismatch")),
    orderIdMismatchSelector: ORDER_ID_MISMATCH,
  },
  neverExisted,
  rows,
});
process.exit(0);
