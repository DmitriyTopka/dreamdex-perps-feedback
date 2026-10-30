// Report 018: a reduce-only linked TP/SL from an account with no position. Read-only, no key.
//   cd scripts && npm install && npx tsx stop-018.ts
// 1. The two transactions placePerpStopOrder sent from our bot key on 2026-10-22: the operator grant
//    and the createLinkedPendingOrders that reverted. Receipts, fees, decoded input.
// 2. The failed create replayed as eth_call (raw JSON-RPC, so the revert data is untouched) at the
//    block before it and at the head, plus the bot's position at both points.
// 3. The grant: isOperatorAuthorized before and after it, and today.
// 4. Control: the same bracket from our owner account, which holds a BTC long today, on both sides.
// 5. The app's limit order + TP/SL in one transaction (report 022): position before and after it.

import { contractErrorsAbi } from "@somnia-chain/markets-sdk";
import { decodeErrorResult, decodeFunctionData, encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { RPC, client, out, rpc, stamp } from "./client.js";

const OWNER = "0x84326A92162Ece92ed257A31073fDd3a6599BF21" as Address;
const BOT = "0x13f05c8e15cC0d7d3abff02C144fb74778018a55" as Address;
const GRANT_TX = "0x927e366abb65fbbf7827023e23e84a2cf76a3b47ffdaf530034776bffa7f9fce" as Hex;
const FAILED_TX = "0xf591fcd80f5736b32a75d84ab5a439ac22d5735670b12eb782b36775f7f68043" as Hex;
const APP_TX = "0xa116fb7e1de0b510d0c7bb949a579c37ce207242dd58eafef42c7c03432d3e1e" as Hex; // limit + TP/SL, report 022
const PLACE_ORDER_FOR = "0x80054449";

const LEG = "((bool isBid, address owner, uint64 userData, uint256 quantity) order, uint8 orderType, uint256 triggerPrice, uint8 triggerOperator, uint256 limitPrice, address builder, uint96 builderFeeBpsTimes1k)";
const REG_ABI = parseAbi([
  `function createLinkedPendingOrders(${LEG} gteOrder, ${LEG} lteOrder) payable returns (uint128, uint128)`,
  "function setOperatorApprovalGlobal(address operator, bytes4[] selectors, bool approved)",
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
  "function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)",
]);

const btc = ((await client.listPerpMarkets()) as any[]).find((m) => m.baseSymbol === "BTC");
const hex = (n: bigint | number) => `0x${BigInt(n).toString(16)}`;

async function call(from: Address, to: Address, data: Hex, value: bigint, block: bigint | "latest") {
  const res = await (await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from, to, data, value: hex(value), gas: "0x989680" }, block === "latest" ? "latest" : hex(block)] }),
  })).json();
  if (!res.error) return { result: "passes" };
  const raw = String(res.error.data ?? "0x");
  try {
    const d = decodeErrorResult({ abi: contractErrorsAbi as any, data: raw as Hex });
    return { result: `${d.errorName}()`, selector: raw.slice(0, 10) };
  } catch {
    return { result: `undecoded ${raw}` };
  }
}
const position = async (account: Address, block?: bigint) =>
  String(((await rpc.readContract({ address: btc.marginBank, abi: REG_ABI, functionName: "getPosition", args: [account, btc.poolAddress], blockNumber: block })) as any).size);
const authorized = async (block?: bigint) =>
  rpc.readContract({ address: btc.poolAddress, abi: REG_ABI, functionName: "isOperatorAuthorized", args: [BOT, btc.stopRegistry, PLACE_ORDER_FOR], blockNumber: block });
const balance = async (a: Address, block: bigint) => Number(await rpc.getBalance({ address: a, blockNumber: block })) / 1e18;

async function txInfo(hash: Hex) {
  const [t, r] = await Promise.all([rpc.getTransaction({ hash }), rpc.getTransactionReceipt({ hash })]);
  const b = await rpc.getBlock({ blockNumber: r.blockNumber });
  return {
    hash,
    block: Number(r.blockNumber),
    time: new Date(Number(b.timestamp) * 1000).toISOString(),
    from: t.from,
    to: t.to,
    status: r.status,
    function: decodeFunctionData({ abi: REG_ABI, data: t.input }).functionName,
    valueSTT: Number(t.value) / 1e18,
    gasUsed: Number(r.gasUsed),
    feeSTT: Number(r.gasUsed * r.effectiveGasPrice) / 1e18,
    tx: t,
  };
}

const grant = await txInfo(GRANT_TX);
const failed = await txInfo(FAILED_TX);
const legs = decodeFunctionData({ abi: REG_ABI, data: failed.tx.input }).args as any[];
const before = BigInt(failed.block) - 1n;

// Replay of the exact failed input, and the same bracket with OWNER as the order owner, sent from OWNER.
const ownerLegs = legs.map((l: any) => ({ ...l, order: { ...l.order, owner: OWNER } }));
const ownerData = encodeFunctionData({ abi: REG_ABI, functionName: "createLinkedPendingOrders", args: ownerLegs as any });
// The same bracket on the wrong side for OWNER's long (buy legs would grow it, not reduce it).
const wrongSide = ownerLegs.map((l: any) => ({ ...l, order: { ...l.order, isBid: true } }));
const wrongSideData = encodeFunctionData({ abi: REG_ABI, functionName: "createLinkedPendingOrders", args: wrongSide as any });

const appTx = await rpc.getTransactionReceipt({ hash: APP_TX });

out({
  ...(await stamp()),
  market: "BTC-PERP",
  pool: btc.poolAddress,
  stopRegistry: btc.stopRegistry,
  marginBank: btc.marginBank,
  sentOn20261022: {
    grant: { ...grant, tx: undefined },
    failedCreate: {
      ...failed,
      tx: undefined,
      legs: legs.map((l: any) => ({ owner: l.order.owner, isBid: l.order.isBid, quantity: String(l.order.quantity), triggerPrice: Number(l.triggerPrice) / 1e18, triggerOperator: l.triggerOperator, orderType: l.orderType })),
    },
    botSTT: { beforeGrant: await balance(BOT, BigInt(grant.block) - 1n), afterGrant: await balance(BOT, BigInt(grant.block)), afterFailedCreate: await balance(BOT, BigInt(failed.block)) },
    isOperatorAuthorized: { beforeGrant: await authorized(BigInt(grant.block) - 1n), afterGrant: await authorized(BigInt(grant.block)), today: await authorized() },
  },
  replayOfFailedCreate: {
    atBlockBefore: { block: Number(before), botPosition: await position(BOT, before), ...(await call(BOT, btc.stopRegistry, failed.tx.input, failed.tx.value, before)) },
    atHead: { botPosition: await position(BOT), ...(await call(BOT, btc.stopRegistry, failed.tx.input, failed.tx.value, "latest")) },
  },
  controlOwnerWithPosition: {
    ownerPosition: await position(OWNER),
    sellLegsThatReduceIt: await call(OWNER, btc.stopRegistry, ownerData, failed.tx.value, "latest"),
    buyLegsThatWouldGrowIt: await call(OWNER, btc.stopRegistry, wrongSideData, failed.tx.value, "latest"),
  },
  appLimitPlusTpSlTx: {
    hash: APP_TX,
    block: Number(appTx.blockNumber),
    status: appTx.status,
    ownerPositionBefore: await position(OWNER, appTx.blockNumber - 1n),
    ownerPositionAfter: await position(OWNER, appTx.blockNumber),
  },
});
process.exit(0);
