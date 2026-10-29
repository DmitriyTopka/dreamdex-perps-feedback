// Report 012: perp errors the SDK can decode vs what the docs list. Read-only, no key.
//   cd scripts && npm install && npx tsx errors-012.ts
// 1. Which of the SDK's 546 contractErrorsAbi entries the deployed perp contracts can revert with:
//    the error selector appears in the bytecode of the PerpPool implementation (behind the beacon),
//    the PerpStopOrderRegistry implementation or the MarginBank implementation (EIP-1967).
// 2. Which of those are named anywhere in the docs: the Errors page and the whole /llms-full.txt.
// 3. Live eth_call reverts on BTC-PERP from an our test account, decoded against the same table.

import { contractErrorsAbi, perpPoolWriteAbi } from "@somnia-chain/markets-sdk";
import { decodeAbiParameters, encodeFunctionData, toFunctionSelector, type Address, type Hex } from "viem";
import { client, out, RPC, rpc, stamp } from "./client.js";

const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const slotAddr = (v?: string) => (v && v !== "0x" && BigInt(v) ? (`0x${v.slice(-40)}` as Address) : undefined);

async function implOf(proxy: Address): Promise<Address> {
  const direct = slotAddr(await rpc.getStorageAt({ address: proxy, slot: IMPL_SLOT }));
  if (direct) return direct;
  const beacon = slotAddr(await rpc.getStorageAt({ address: proxy, slot: BEACON_SLOT }));
  if (!beacon) return proxy;
  return rpc.readContract({
    address: beacon,
    abi: [{ type: "function", name: "implementation", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" }],
    functionName: "implementation",
  }) as Promise<Address>;
}

const sel = (e: any) => toFunctionSelector(`function ${e.name}(${e.inputs.map((i: any) => i.type).join(",")})`);
const sig = (e: any) => `${e.name}(${e.inputs.map((i: any) => i.type).join(",")})`;
const errors = (contractErrorsAbi as any[]).filter((e) => e.type === "error");
const bySel = new Map(errors.map((e) => [sel(e), sig(e)]));

const btc = ((await client.listPerpMarkets()) as any[]).find((m) => m.baseSymbol === "BTC");
const contracts: Record<string, Address> = {
  PerpPool: await implOf(btc.poolAddress),
  PerpStopOrderRegistry: await implOf(btc.stopRegistry),
  MarginBank: await implOf(btc.marginBank),
};
const code: Record<string, string> = {};
// A selector counts only at a byte boundary of the runtime code.
const hasSel = (c: string, s: string) => { for (let i = c.indexOf(s, 2); i !== -1; i = c.indexOf(s, i + 1)) if (i % 2 === 0) return true; return false; };
for (const [k, a] of Object.entries(contracts)) code[k] = ((await rpc.getCode({ address: a })) ?? "0x").toLowerCase();

const docsErrorsPage = await (await fetch("https://app.testnet.dreamdex.io/docs/developers/contracts/errors.md")).text();
const llmsFull = await (await fetch("https://app.testnet.dreamdex.io/llms-full.txt")).text();
const named = (text: string, name: string) => new RegExp(`\\b${name}\\b`).test(text);

const perp = errors
  .map((e) => ({ selector: sel(e), error: sig(e), in: Object.keys(code).filter((k) => hasSel(code[k], sel(e).slice(2))) }))
  .filter((r) => r.in.length)
  .map((r) => {
    const name = r.error.split("(")[0];
    return { ...r, onErrorsPage: named(docsErrorsPage, name), anywhereInDocs: named(llmsFull, name) };
  });

// Live: an order from an account with no collateral, and one far above the position cap.
// From our own test account (it holds margin), simulated only: eth_call sends nothing.
const EMPTY = "0x84326A92162Ece92ed257A31073fDd3a6599BF21" as Address;
async function tryCall(label: string, args: any[]) {
  const data = encodeFunctionData({ abi: perpPoolWriteAbi as any, functionName: "placeOrder", args });
  // Raw JSON-RPC so the revert data comes back untouched.
  const res = await (await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: EMPTY, to: btc.poolAddress, data, gas: "0x1c9c380" }, "latest"] }),
  })).json();
  if (!res.error) return { label, reverted: false };
  const raw = String(res.error.data ?? "0x");
  const s = raw.slice(0, 10);
  // 0x08c379a0 is a plain require(string) revert, not a custom error.
  const decoded = s === "0x08c379a0" ? `Error("${decodeAbiParameters([{ type: "string" }], `0x${raw.slice(10)}` as Hex)[0]}")` : bySel.get(s);
  return { label, reverted: true, selector: s, decoded: decoded ?? "not in SDK table", onErrorsPage: decoded && s !== "0x08c379a0" ? named(docsErrorsPage, decoded.split("(")[0]) : false, anywhereInDocs: decoded && s !== "0x08c379a0" ? named(llmsFull, decoded.split("(")[0]) : false };
}
const tick = BigInt(btc.tickSize);
const price = (BigInt(btc.markPrice) / tick) * tick;
const lot = BigInt(btc.minQuantity);
const expire = BigInt(Date.now() + 3_600_000) * 1_000_000n; // 1 h ahead, ns
const live = [];
for (const mult of [1n, 1_000n, 10_000n, 100_000n, 1_000_000n])
  live.push(await tryCall(`BTC long ${mult}x min size from our test account`, [true, 0n, price, lot * mult, expire, 0, 0, "0x0000000000000000000000000000000000000000", 0n]));

out({
  ...(await stamp()),
  contracts,
  summary: {
    sdkErrors: errors.length,
    perpContractErrors: perp.length,
    perpErrorsOnErrorsPage: perp.filter((p) => p.onErrorsPage).length,
    perpErrorsNamedNowhereInDocs: perp.filter((p) => !p.anywhereInDocs).length,
    errorsPageSections: docsErrorsPage.split("\n").filter((l) => /^## /.test(l)).map((l) => l.slice(3)),
  },
  live,
  perp,
});
process.exit(0);
