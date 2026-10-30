// Report 003: out-of-range orderType / selfMatchingOption on a perp order. Read-only, eth_call only.
//   cd scripts && npm install && npx tsx ordertype-003.ts
// 1. The SDK's own buildPlacePerpOrder (fresh random key, nothing signed or sent) encodes each value.
//    If it throws, the SDK validated; if it returns calldata, the value goes to the pool unchanged.
// 2. That exact calldata is simulated as placeOrder from our test account (it holds margin), and the
//    same order as placeOrderFor from our linked bot key. Raw JSON-RPC so the revert data is untouched.
// 3. A row of other bad inputs on the same call, to show which ones the pool names.
// 4. The message the SDK's own decodeRevert (used by its failed-receipt replay) makes of the blank revert.

import { contractErrorsAbi, decodeRevert, SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { decodeAbiParameters, decodeErrorResult, encodeFunctionData, parseAbi, toFunctionSelector, type Address, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { INDEXER, RPC, client, out, rpc, stamp } from "./client.js";

const OWNER = "0x84326A92162Ece92ed257A31073fDd3a6599BF21" as Address;
const BOT = "0x13f05c8e15cC0d7d3abff02C144fb74778018a55" as Address; // linked to OWNER with Link a bot
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const trader = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: INDEXER, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES, privateKey: generatePrivateKey() }).trader as any;

// placeOrderFor is the operator twin of placeOrder: same tail, owner first.
const FOR_ABI = parseAbi([
  "function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)",
]);

const head = await rpc.getBlockNumber();
const blockTag = `0x${head.toString(16)}`;
async function sim(from: Address, to: Address, data: Hex) {
  const res = await (await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from, to, data, gas: "0x989680" }, blockTag] }),
  })).json();
  if (!res.error) return { result: "passes" };
  const raw = String(res.error.data ?? "0x");
  if (raw === "0x" || raw === "") return { result: "reverted, EMPTY revert data", rpcMessage: res.error.message };
  if (raw.startsWith("0x08c379a0")) return { result: `Error("${decodeAbiParameters([{ type: "string" }], `0x${raw.slice(10)}` as Hex)[0]}")` };
  try {
    const d = decodeErrorResult({ abi: contractErrorsAbi as any, data: raw as Hex });
    return { result: `${d.errorName}(${(d.args ?? []).join(", ")})`, selector: raw.slice(0, 10) };
  } catch {
    return { result: `undecoded ${raw.slice(0, 10)}` };
  }
}

const eth = ((await client.listPerpMarkets()) as any[]).find((m) => m.baseSymbol === "ETH");
const pool = eth.poolAddress as Address;
const tick = BigInt(eth.tickSize);
const price = ((BigInt(eth.markPrice) * 9n) / 10n / tick) * tick; // resting bid 10% under the mark, never crosses
const qty = BigInt(eth.minQuantity);
const expire = BigInt(Date.now() + 3_600_000) * 1_000_000n; // 1 h ahead, ns
const base = { pool, isBid: true, price, quantity: qty, expireTimestampNs: expire };

async function row(label: string, p: any) {
  let sdk: string;
  let calldata: Hex | undefined;
  try {
    const built = await trader.buildPlacePerpOrder({ ...base, ...p });
    calldata = built.order.data as Hex;
    sdk = "builds, no SDK error";
  } catch (e: any) {
    sdk = `${e?.name ?? "Error"}: ${String(e?.message ?? e).split("\n")[0]}`;
  }
  const a = { ...base, orderType: 0, selfMatchingOption: 0, builder: ZERO, builderFeeBpsTimes1k: 0n, ...p };
  const forData = encodeFunctionData({
    abi: FOR_ABI,
    functionName: "placeOrderFor",
    args: [OWNER, a.isBid, 0n, a.price, a.quantity, a.expireTimestampNs, a.orderType, a.selfMatchingOption, a.builder, a.builderFeeBpsTimes1k],
  });
  return {
    label,
    sdkBuildPlacePerpOrder: sdk,
    ownerPlaceOrder: calldata ? (await sim(OWNER, pool, calldata)).result : "not built",
    botPlaceOrderFor: (await sim(BOT, pool, forData)).result,
  };
}

const enumRows = [];
for (const t of [0, 1, 2, 3, 4, 5, 9, 255]) enumRows.push(await row(`orderType ${t}`, { orderType: t }));
for (const s of [0, 1, 2, 3, 9]) enumRows.push(await row(`selfMatchingOption ${s}`, { selfMatchingOption: s }));

// Other bad inputs on the same call. The SDK refuses price/quantity <= 0 itself, so those two
// go only through the raw placeOrderFor column.
const otherRows = [
  await row("quantity below minQuantity", { quantity: qty - 1n }),
  await row("price off tick", { price: price + 1n }),
  await row("expiry in the past", { expireTimestampNs: BigInt(Date.now() - 3_600_000) * 1_000_000n }),
  await row("builder not approved", { builder: "0x000000000000000000000000000000000000dEaD", builderFeeBpsTimes1k: 1n }),
  await row("builder fee far above cap", { builder: "0x000000000000000000000000000000000000dEaD", builderFeeBpsTimes1k: 10n ** 12n }),
  await row("price 0", { price: 0n }),
  await row("quantity 0", { quantity: 0n }),
];

// What the SDK says about orderType 4: viem's call error fed to the SDK's decoder.
const built4 = await trader.buildPlacePerpOrder({ ...base, orderType: 4 });
let sdkMessage = "call passed";
try {
  await rpc.call({ to: pool, data: built4.order.data, account: OWNER, gas: 10_000_000n });
} catch (e) {
  const d: any = decodeRevert(e, { address: pool, functionName: "placeOrder" });
  sdkMessage = String(d.message).split("\n")[0];
}

out({
  ...(await stamp()),
  simulatedAtBlock: Number(head),
  market: "ETH-PERP",
  pool,
  owner: OWNER,
  bot: BOT,
  order: { isBid: true, price, quantity: qty, note: "resting bid 10% under the mark" },
  placeOrderForSelector: toFunctionSelector(FOR_ABI[0]),
  enumRows,
  otherRows,
  sdkDecodeRevertForOrderType4: sdkMessage,
});
process.exit(0);
