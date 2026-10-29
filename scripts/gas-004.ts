// Report 004: perp order gas and STT cost vs the two numbers in the perps dev docs. Read-only, no key.
//   cd scripts && npm install && npx tsx gas-004.ts
// 1. Our 8 receipts from 2026-10-22 (placeOrderFor / cancelOrderFor from a linked bot key).
// 2. The docs lines, fetched live, and what they imply at the network gas price.
// 3. eth_estimateGas now, from our test account (simulated, nothing sent): PostOnly at an existing
//    price level, PostOnly at a fresh level, and a small IOC that crosses.

import { perpPoolWriteAbi } from "@somnia-chain/markets-sdk";
import { encodeFunctionData, type Hex } from "viem";
import { client, out, RPC, rpc, stamp } from "./client.js";

const DOCS_RANGE_MAX = 0.003; // STT, "between 0.0003 and 0.003 STT each"
const DOCS_GAS_MAX = 1_560_000; // "used up to about 1.56M gas"
const OURS: [Hex, string][] = [
  ["0xaf077d282b0f9090aeb2daef21eea562908e3707c874c6d622d1e4f8cbcacfdf", "placeOrderFor ETH PostOnly"],
  ["0x8de658f97e5cc6584d3083e41bca93ed31be91c750cd9e3ec2ec0804e5a0ed44", "placeOrderFor ZRO PostOnly"],
  ["0xd55d4095c00533d9c1a20ab6c0747cfd238ffb6194e98357f43791e1dfdc9f55", "placeOrderFor ETH PostOnly"],
  ["0x67560ff046381b20c127afa883dcab70aecdffc8d696784f21be7dd899d4eb09", "placeOrderFor ETH PostOnly"],
  ["0xff313955663434b7bc0a0c5ac02c4d56cebb1156e8b40e0f4c85c5d4a59d1101", "placeOrderFor ETH PostOnly"],
  ["0x9d6586aa3bdea5ce422832d596ed04a3835b31ceace5c45c8b2f74b297f7dad0", "placeOrderFor ZRO PostOnly"],
  ["0x7d3d6af752956b0a9e0d209964807db8d2b8f150a6dcb3d578316946be7eb174", "cancelOrderFor ETH"],
  ["0xaa053991a9997044cbcd0d19ddb356051a00797fbb9a350de9e741b35318617a", "cancelOrderFor ZRO"],
];

const receipts = [];
for (const [hash, call] of OURS) {
  const r = await rpc.getTransactionReceipt({ hash });
  const block = await rpc.getBlock({ blockNumber: r.blockNumber });
  const stt = (Number(r.gasUsed) * Number(r.effectiveGasPrice)) / 1e18;
  receipts.push({
    hash,
    call,
    status: r.status,
    block: Number(r.blockNumber),
    time: new Date(Number(block.timestamp) * 1000).toISOString(),
    gasUsed: Number(r.gasUsed),
    gasPriceGwei: Number(r.effectiveGasPrice) / 1e9,
    stt: +stt.toFixed(6),
    overDocsGas: +(Number(r.gasUsed) / DOCS_GAS_MAX).toFixed(2),
    overDocsStt: +(stt / DOCS_RANGE_MAX).toFixed(2),
  });
}

const docs = await (await fetch("https://app.testnet.dreamdex.io/llms-full.txt")).text();
const docsLines = docs.split("\n").filter((l) => /0\.0003 and 0\.003|1\.56M gas/.test(l)).map((l) => l.trim());
const gasPrice = Number(await rpc.getGasPrice());

// Live estimates on ETH-PERP from our account (it holds margin). eth_estimateGas only.
const FROM = "0x84326A92162Ece92ed257A31073fDd3a6599BF21";
const eth = ((await client.listPerpMarkets()) as any[]).find((m) => m.baseSymbol === "ETH");
const tick = BigInt(eth.tickSize);
const tops: any = await client.getBookTopsOnchain([{ id: eth.id, poolAddress: eth.poolAddress }]);
const top = tops.tops[eth.id];
const bestBid = BigInt(top.bestBid);
const bestAsk = BigInt(top.bestAsk);
const expire = BigInt(Date.now() + 3_600_000) * 1_000_000n;
const qty = BigInt(eth.minQuantity);
const ZERO = "0x0000000000000000000000000000000000000000";
async function estimate(label: string, isBid: boolean, price: bigint, orderType: number) {
  const data = encodeFunctionData({ abi: perpPoolWriteAbi as any, functionName: "placeOrder", args: [isBid, 0n, price, qty, expire, orderType, 0, ZERO, 0n] });
  const res = await (await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_estimateGas", params: [{ from: FROM, to: eth.poolAddress, data }, "latest"] }),
  })).json();
  const gas = res.result ? Number(BigInt(res.result)) : null;
  return { label, price: Number(price) / 1e18, gas, stt: gas ? +((gas * gasPrice) / 1e18).toFixed(6) : null, error: res.error?.message ?? null };
}
const estimates = [
  await estimate("PostOnly bid at the current best bid (existing level)", true, bestBid, 3),
  await estimate("PostOnly bid 500 ticks under the best bid (fresh level)", true, bestBid - 500n * tick, 3),
  await estimate("IOC buy at the best ask (crosses)", true, bestAsk, 2),
];

const places = receipts.filter((r) => r.call.startsWith("place"));
out({
  ...(await stamp()),
  gasPriceGwei: gasPrice / 1e9,
  docsLines,
  docsOwnMath: { gas: DOCS_GAS_MAX, atGasPriceStt: +((DOCS_GAS_MAX * gasPrice) / 1e18).toFixed(6), docsUpperStt: DOCS_RANGE_MAX },
  summary: {
    placements: places.length,
    placementsAboveDocsStt: places.filter((r) => r.stt > DOCS_RANGE_MAX).length,
    placementsAboveDocsGas: places.filter((r) => r.gasUsed > DOCS_GAS_MAX).length,
    maxGas: Math.max(...places.map((r) => r.gasUsed)),
    maxStt: Math.max(...places.map((r) => r.stt)),
    ordersPer5SttAtDocsMax: Math.floor(5 / DOCS_RANGE_MAX),
    ordersPer5SttAtOurMax: Math.floor(5 / Math.max(...places.map((r) => r.stt))),
  },
  receipts,
  estimates,
});
process.exit(0);
