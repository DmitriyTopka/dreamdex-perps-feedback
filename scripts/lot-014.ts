// Report 014: the perps market table shows min size but not lot size. Read-only, no key.
//   cd scripts && npm install && npx tsx lot-014.ts > out.json
// 1. Docs: the market table header and "Min size" column on /docs/trading/perps-testnet, and every
//    line on the perps trading pages (README, orders, margin, funding) that mentions lot / increment.
// 2. Chain: lotSize and minQuantity for all 21 markets, from listPerpMarkets() and from each pool's
//    getOrderBookParameters().
// 3. Simulation (eth_call only, nothing is sent): a GTC bid at 80% of mark from our test account on
//    DOGE, 1000PEPE and PUMP with size = min, min + half a lot, min + one lot.
// Exit code 1 when the perps market table has no lot size column.

import { decodeErrorResult, encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { contractErrorsAbi, perpPoolWriteAbi } from "@somnia-chain/markets-sdk";
import { RPC, client, human, out, rpc, stamp } from "./client.js";

const BASE = "https://app.testnet.dreamdex.io/docs/trading/perps-testnet";
const PAGES = ["README.md", "orders.md", "margin-and-liquidations.md", "funding.md"];
const FROM = "0x84326A92162Ece92ed257A31073fDd3a6599BF21" as Address; // our test account, holds margin
const SIM = ["DOGE", "1000PEPE", "PUMP"];
const num = (s: string) => Number(s.replace(/[^0-9.]/g, ""));

// 1. Docs.
const pages: Record<string, string> = {};
for (const p of PAGES) pages[p] = await (await fetch(`${BASE}/${p}`)).text();
const header = pages["README.md"].split("\n").find((l) => /^\| Market \|/.test(l))?.trim();
const docsMin = new Map<string, number>();
for (const line of pages["README.md"].split("\n")) {
  const m = line.match(/^\| \*\*([A-Z0-9]+)-PERP\*\* \|(?:[^|]*\|){3} ([\d,.]+) \S+ \|/);
  if (m) docsMin.set(m[1], num(m[2]));
}
const lotMentions = Object.fromEntries(PAGES.map((p) => [p, pages[p].split("\n").filter((l) => /\blot\b|lotSize|increment|multiple of/i.test(l)).map((l) => l.trim())]));
const llms = await (await fetch("https://app.testnet.dreamdex.io/llms-full.txt")).text();
const elsewhere = llms.split("\n").filter((l) => /lotSize/.test(l) && /(quantity on its|increment order sizes)/.test(l)).map((l) => l.trim());

// 2. Chain.
const obAbi = parseAbi(["function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))"]);
const rows: any[] = [];
for (const p of (await client.listPerpMarkets()) as any[]) {
  const ob: any = await rpc.readContract({ address: p.poolAddress, abi: obAbi, functionName: "getOrderBookParameters" });
  const lot = human(p.lotSize, p.baseDecimals);
  const min = human(p.minQuantity, p.baseDecimals);
  rows.push({
    market: `${p.baseSymbol}-PERP`,
    pool: p.poolAddress,
    baseDecimals: p.baseDecimals,
    lotSize: lot,
    minQuantity: min,
    docsMinSize: docsMin.get(p.baseSymbol) ?? null,
    docsMinMatchesChain: docsMin.get(p.baseSymbol) === min,
    poolParamsMatchRow: ob.lotSize === BigInt(p.lotSize) && ob.minQuantity === BigInt(p.minQuantity),
    lotOverMinPct: +((lot / min) * 100).toFixed(2),
    firstRejectedSizeAboveMin: +(min + lot / 2).toPrecision(12),
    raw: { lotSize: p.lotSize, minQuantity: p.minQuantity, tickSize: p.tickSize },
    _p: p,
  });
}

// 3. Simulation.
async function simulate(p: any, qty: bigint) {
  const tick = BigInt(p.tickSize);
  const price = ((BigInt(p.markPrice) * 8n) / 10n / tick) * tick;
  const data = encodeFunctionData({
    abi: perpPoolWriteAbi as any,
    functionName: "placeOrder",
    args: [true, 0n, price, qty, 2n ** 64n - 1n, 0, 0, "0x0000000000000000000000000000000000000000", 0n],
  });
  const res = await (await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: FROM, to: p.poolAddress, data, gas: "0x1c9c380" }, "latest"] }),
  })).json();
  const size = human(qty, p.baseDecimals);
  if (!res.error) return { size, price: Number(price) / 1e18, result: "passes" };
  try {
    const e = decodeErrorResult({ abi: contractErrorsAbi as any, data: res.error.data as Hex });
    return { size, price: Number(price) / 1e18, result: "reverts", error: e.errorName, args: (e.args ?? []).map(String) };
  } catch {
    return { size, price: Number(price) / 1e18, result: "reverts", raw: String(res.error.data ?? res.error.message) };
  }
}
const sims: any[] = [];
for (const sym of SIM) {
  const r = rows.find((x) => x.market === `${sym}-PERP`);
  const p = r._p;
  const min = BigInt(p.minQuantity);
  const lot = BigInt(p.lotSize);
  sims.push({ market: r.market, lotSize: r.lotSize, minQuantity: r.minQuantity, results: [await simulate(p, min), await simulate(p, min + lot / 2n), await simulate(p, min + lot)] });
}

const noLotColumn = !!header && !/lot/i.test(header);
out({
  ...(await stamp()),
  docs: {
    tableUrl: `${BASE}/README.md`,
    tableHeader: header,
    tableHasLotColumn: !noLotColumn,
    lotMentionsOnPerpsTradingPages: lotMentions,
    lotRuleStatedElsewhere: elsewhere,
  },
  summary: {
    markets: rows.length,
    docsMinMatchesChain: `${rows.filter((r) => r.docsMinMatchesChain).length}/${rows.length}`,
    lotSizeByMarket: Object.fromEntries(rows.map((r) => [r.market, r.lotSize])),
    lotAtLeast5PctOfMin: rows.filter((r) => r.lotOverMinPct >= 5).map((r) => `${r.market} lot ${r.lotSize} min ${r.minQuantity} (${r.lotOverMinPct}%)`),
  },
  simulations: sims,
  rows: rows.map(({ _p, ...r }) => r),
});
process.exit(noLotColumn ? 1 : 0);
