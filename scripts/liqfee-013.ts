// Report 013: the SDK says no LiquidationFee rows exist and the event is not deployed. Read-only.
//   cd scripts && npm install && npx tsx liqfee-013.ts > out.json
// 1. Quotes the installed SDK's own type docs (dist/perp/history.d.ts) with line numbers.
// 2. Pages through client.listPerpFees({ kind }) for LiquidationFee, Fee, Rebate, BuilderFee.
// 3. Takes the oldest and the newest LiquidationFee row, reads each receipt over the RPC, and checks
//    the log's topic0, emitter and decoded data against the row and against the LiquidationEngine
//    that getPerpSystemConfig(marginBank) reports.
// 4. Where the fee is booked: insurancePortion on the rows, the InsuranceFund's own indexed ledger
//    (listPerpInsuranceFundEvents), and any log or collateral Transfer touching the InsuranceFund
//    in the two receipts.
// Exit code 1 when LiquidationFee rows exist (that is, when the SDK note is still wrong).

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { decodeEventLog, keccak256, parseAbi, toBytes } from "viem";
import { liquidationEngineEventsAbi, marginBankEventsAbi } from "@somnia-chain/markets-sdk";
import { client, out, rpc, stamp } from "./client.js";

const PAGE = 500;
const SIG = "LiquidationFeeCharged(address,address,uint256,uint256,uint256)";
const TOPIC0 = keccak256(toBytes(SIG));

// 1. The SDK's own words, read from the installed package.
const req = createRequire(import.meta.url);
const dts = readFileSync(req.resolve("@somnia-chain/markets-sdk").replace(/index\.js$/, "perp/history.d.ts"), "utf8").split("\n");
const quote = (re: RegExp) => dts.map((l, i) => ({ line: i + 1, text: l.trim() })).filter((x) => re.test(x.text));
const sdkQuotes = {
  file: "node_modules/@somnia-chain/markets-sdk/dist/perp/history.d.ts",
  rowsComeOff: quote(/These rows come off `MarginBank`/),
  routedToFund: quote(/LiquidationFee stage-3|routed WHOLLY|on `LiquidationFee` it equals `amount`/),
  noRowsYet: quote(/No `LiquidationFee` rows exist yet|deployed implementation, and the subscription|brings it\./),
  kindFilter: quote(/`kind` is `"Fee"` \| `"Rebate"` \| `"BuilderFee"`/),
};
const inAbi = (abi: readonly any[]) => abi.some((e) => e.type === "event" && e.name === "LiquidationFeeCharged");

// 2. Every row of each kind.
async function all(kind: string) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page: any[] = await client.listPerpFees({ kind, limit: PAGE, offset });
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}
const kinds: Record<string, any[]> = {};
for (const k of ["LiquidationFee", "Fee", "Rebate", "BuilderFee"]) kinds[k] = await all(k);

const liq = kinds.LiquidationFee;
const iso = (t: string) => new Date(Number(t) * 1000).toISOString();
const ratios = liq.filter((r) => r.fillNotional && BigInt(r.fillNotional) > 0n).map((r) => (Number(BigInt(r.amount)) / Number(BigInt(r.fillNotional))) * 100);
const byDay: Record<string, number> = {};
for (const r of liq) byDay[iso(r.timestamp).slice(0, 10)] = (byDay[iso(r.timestamp).slice(0, 10)] ?? 0) + 1;

// 3. Receipts for the oldest and the newest row.
const markets: any[] = await client.listPerpMarkets();
const sys = await client.getPerpSystemConfig(markets[0].marginBank);
const engine = String(sys.liquidationEngine).toLowerCase();
const fund = String(sys.insuranceFund).toLowerCase();
const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const checks: any[] = [];
for (const row of liq.length ? [liq[liq.length - 1], liq[0]] : []) {
  const logIndex = Number(row.id.split("_")[1]);
  const rc = await rpc.getTransactionReceipt({ hash: row.txHash });
  const log = rc.logs.find((l) => l.logIndex === logIndex)!;
  const ev = decodeEventLog({ abi: liquidationEngineEventsAbi, data: log.data, topics: log.topics as any }) as any;
  const fundTouches = rc.logs.filter((l) => {
    if (l.address.toLowerCase() === fund) return true;
    try {
      const t: any = decodeEventLog({ abi: transferAbi, data: l.data, topics: l.topics as any });
      return t.args.to.toLowerCase() === fund || t.args.from.toLowerCase() === fund;
    } catch {
      return false;
    }
  }).length;
  checks.push({
    rowId: row.id,
    rowInsurancePortion: row.insurancePortion,
    logsTouchingInsuranceFund: fundTouches,
    rowTime: iso(row.timestamp),
    block: Number(rc.blockNumber),
    status: rc.status,
    logIndex,
    emitter: log.address.toLowerCase(),
    emitterIsLiquidationEngine: log.address.toLowerCase() === engine,
    emitterIsMarginBank: log.address.toLowerCase() === String(markets[0].marginBank).toLowerCase(),
    topic0: log.topics[0],
    topic0IsLiquidationFeeCharged: log.topics[0] === TOPIC0,
    decoded: { event: ev.eventName, ...ev.args },
    matchesRow:
      String(ev.args.amount) === row.amount &&
      String(ev.args.fillNotional) === row.fillNotional &&
      String(ev.args.tier) === row.tier &&
      ev.args.account.toLowerCase() === row.account &&
      ev.args.perpPool.toLowerCase() === row.pool,
  });
}

const fundEvents: any[] = [];
for (let offset = 0; ; offset += PAGE) {
  const page: any[] = await client.listPerpInsuranceFundEvents({ limit: PAGE, offset });
  fundEvents.push(...page);
  if (page.length < PAGE) break;
}
const fundKinds: Record<string, number> = {};
for (const e of fundEvents) fundKinds[e.kind] = (fundKinds[e.kind] ?? 0) + 1;

const sorted = [...ratios].sort((a, b) => a - b);
out({
  ...(await stamp()),
  sdkQuotes,
  sdkAbiPlacement: {
    inLiquidationEngineEventsAbi: inAbi(liquidationEngineEventsAbi),
    inMarginBankEventsAbi: inAbi(marginBankEventsAbi),
  },
  liquidationEngine: engine,
  insuranceFund: fund,
  insuranceFundEvents: { rows: fundEvents.length, byKind: fundKinds, tierCredited: fundKinds.TierCredited ?? 0 },
  marginBank: String(markets[0].marginBank).toLowerCase(),
  topic0: { signature: SIG, keccak: TOPIC0 },
  rowsByKind: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.length])),
  liquidationFee: {
    rows: liq.length,
    oldest: liq.length ? iso(liq[liq.length - 1].timestamp) : null,
    newest: liq.length ? iso(liq[0].timestamp) : null,
    rowsPerDay: byDay,
    distinctPools: new Set(liq.map((r) => r.pool)).size,
    distinctAccounts: new Set(liq.map((r) => r.account)).size,
    insurancePortionEqualsAmount: `${liq.filter((r) => r.insurancePortion === r.amount).length}/${liq.length}`,
    insurancePortionZero: `${liq.filter((r) => r.insurancePortion === "0").length}/${liq.length}`,
    totalAmountUSDso: liq.reduce((a, r) => a + Number(BigInt(r.amount)) / 1e18, 0),
    ratePct: sorted.length && {
      min: +sorted[0].toFixed(4),
      median: +sorted[Math.floor(sorted.length / 2)].toFixed(4),
      max: +sorted[sorted.length - 1].toFixed(4),
      exactly1pct: liq.filter((r) => r.fillNotional && BigInt(r.amount) * 100n === BigInt(r.fillNotional)).length,
      above1pct: liq.filter((r) => r.fillNotional && BigInt(r.amount) * 100n > BigInt(r.fillNotional)).length,
    },
  },
  receiptChecks: checks,
});
process.exit(liq.length ? 1 : 0);
