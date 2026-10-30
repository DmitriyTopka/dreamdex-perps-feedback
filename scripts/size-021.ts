// Report 021: the TP/SL dialog shows the position size rounded to 4 decimals. Read-only, no key.
//   cd scripts && npm install && npx tsx size-021.ts
// The rounding itself is in the app and can't be seen on chain. This shows the numbers around it:
// 1. BTC-PERP lot size and minimum, so 5-decimal sizes are normal.
// 2. Our position at the moments the dialog was opened on 22 Oct, and the legs the Partial
//    "0.0004 BTC" request actually armed (tx 0x60df...4851), from archive reads and the tx's events.
// 3. Every open BTC-PERP position today (indexer, 10 checked on chain): how many are off the
//    0.0001 grid, and by how much a 4-decimal header would misstate them.

import { parseAbi, parseEventLogs, type Address, type Hex } from "viem";
import { INDEXER, client, human, out, rpc, stamp } from "./client.js";

const OWNER = "0x84326A92162Ece92ed257A31073fDd3a6599BF21" as Address;
const EVENTS = parseAbi([
  "event PendingOrderCreated(uint128 indexed orderId, address indexed owner, bool isBid, uint256 quantity, uint256 triggerPrice, uint8 triggerOperator, uint8 orderType, address builder, uint96 builderFeeBpsTimes1k)",
]);
const BANK = parseAbi([
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
]);

const markets = (await client.listPerpMarkets()) as any[];
const btc = markets.find((m) => m.baseSymbol === "BTC");
const dec = Number(btc.baseDecimals);
const STEP = 10n ** BigInt(dec - 4); // 0.0001 BTC in raw units
// What a 4-decimal header prints if it rounds to nearest. Our two app readings (0.00018 -> 0.0002,
// 0.00036 -> 0.0004) fit both nearest and round-up, so the magnitudes below assume nearest.
const shown = (raw: bigint) => Number((Number(raw) / 10 ** dec).toFixed(4));
const positionAt = async (a: Address, blockNumber?: bigint) => {
  const p = (await rpc.readContract({ address: btc.marginBank, abi: BANK, functionName: "getPosition", args: [a, btc.poolAddress], ...(blockNumber === undefined ? {} : { blockNumber }) })) as any;
  return { size: BigInt(p.size), entry: human(p.avgEntryPrice, 18) };
};

// 1. Market grid.
const grid = { lotSizeBtc: human(btc.lotSize, dec), minQuantityBtc: human(btc.minQuantity, dec), baseDecimals: dec };

// 2. Our dialog moments on 22 Oct: the stop pairs armed right after the dialog was confirmed.
const MOMENTS: [Hex, string][] = [
  ["0xb8b4a55485f97dc130838dee3c7ce20236c018a5ea9f12e48df1954bcc0e30a7", "16:36 Set TP/SL, Entire (dialog header said 0.0002 BTC)"],
  ["0x60df5789f1132eb7c1a294bc168af6672a47b3aed962465d068626027be24851", "18:41 Set TP/SL, Partial, 0.0004 BTC typed (Max said 0.0004 BTC)"],
];
const moments = [];
for (const [hash, what] of MOMENTS) {
  const r = await rpc.getTransactionReceipt({ hash });
  const p = await positionAt(OWNER, r.blockNumber);
  const legs = parseEventLogs({ abi: EVENTS, logs: r.logs.filter((l) => l.address.toLowerCase() === btc.stopRegistry.toLowerCase()) });
  moments.push({
    tx: hash,
    what,
    block: Number(r.blockNumber),
    time: new Date(Number((await rpc.getBlock({ blockNumber: r.blockNumber })).timestamp) * 1000).toISOString(),
    positionBtc: human(p.size, dec),
    avgEntry: p.entry,
    shownAt4Decimals: shown(p.size),
    overstatementPct: Math.round(((shown(p.size) - human(p.size, dec)) / human(p.size, dec)) * 1000) / 10,
    legs: legs.map((e: any) => ({ id: String(e.args.orderId), kind: Number(e.args.triggerOperator) === 1 ? "SL" : "TP", trigger: human(e.args.triggerPrice, 18), storedQuantityBtc: human(e.args.quantity, dec) })),
  });
}
// The 16:37 add: position after the second buy, when Manage TP/SL showed "Size 0.0004 BTC".
const addTx = "0xfacb0619579969a9781e5b70283ebc4017a7f3ceea58fbe7bebe3e394a44ee3a" as Hex;
const addR = await rpc.getTransactionReceipt({ hash: addTx });
const afterAdd = await positionAt(OWNER, addR.blockNumber);
const now = await positionAt(OWNER);

// 3. All open BTC-PERP positions (indexer rows), a sample re-read on chain.
const rows: any[] = [];
for (let offset = 0; ; offset += 1000) {
  const q = `{ PerpPosition(where:{pool:{_eq:"${btc.poolAddress.toLowerCase()}"}, size:{_neq:"0"}}, limit: 1000, offset: ${offset}, order_by:{account: asc}){ account size isLong } }`;
  const res = await (await fetch(INDEXER, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) })).json();
  const page = res.data?.PerpPosition ?? [];
  rows.push(...page);
  if (page.length < 1000) break;
}
const sizes = rows.map((r) => BigInt(r.size));
const off = rows.filter((r) => BigInt(r.size) % STEP !== 0n);
const err = (s: bigint) => Math.abs(shown(s) - human(s, dec)) / human(s, dec);
const sample = [];
for (const r of off.slice(0, 10)) {
  const chain = await positionAt(r.account as Address);
  sample.push({ account: r.account, indexerSize: human(BigInt(r.size), dec), chainSize: human(chain.size < 0n ? -chain.size : chain.size, dec), shownAt4Decimals: shown(BigInt(r.size)) });
}

out({
  ...(await stamp()),
  owner: OWNER,
  grid,
  ourDialogMoments: moments,
  afterSecondBuy: { tx: addTx, block: Number(addR.blockNumber), positionBtc: human(afterAdd.size, dec), shownAt4Decimals: shown(afterAdd.size) },
  ourPositionNow: { positionBtc: human(now.size, dec), shownAt4Decimals: shown(now.size) },
  openBtcPositions: {
    source: "indexer PerpPosition rows with size != 0; sample re-read with MarginBank.getPosition",
    total: rows.length,
    offTheFourDecimalGrid: off.length,
    belowMinimumOrderSize: sizes.filter((x) => x < BigInt(btc.minQuantity)).length,
    ifNearest_misstatedByMoreThan1Pct: sizes.filter((s) => err(s) > 0.01).length,
    ifNearest_misstatedByMoreThan5Pct: sizes.filter((s) => err(s) > 0.05).length,
    ifNearest_worstPct: Math.round(Math.max(0, ...sizes.map(err)) * 1000) / 10,
    sampleCheckedOnChain: sample,
  },
});
process.exit(0);
