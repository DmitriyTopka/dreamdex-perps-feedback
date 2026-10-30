// Report 008: perp-guard's reduce stage cannot act on small positions. Read-only, no key.
//   cd scripts && npm install && npx tsx guard-008.ts
// For every perp market: the largest position the default 25% reduce can never shrink, found with the
// kit's own alignQuantity and closePosition arithmetic on the live lot, minQuantity and mark.

import { formatUnits } from "viem";
import { client, out, stamp } from "./client.js";

// packages/perp-core/src/markets.ts:157-162, dreamdex-bot-kit 2579866, copied as is.
function alignQuantity(quantity: bigint, info: { lotSize: string; minQuantity: string }): bigint {
  const lot = BigInt(info.lotSize);
  const min = BigInt(info.minQuantity);
  const aligned = lot > 0n ? (quantity / lot) * lot : quantity;
  return aligned < min ? 0n : aligned;
}
// packages/perp-core/src/orders.ts:260-261, the partial-close size closePosition sends.
function sliceOf(whole: bigint, fraction: number, info: { lotSize: string; minQuantity: string }): bigint {
  const f = Math.min(1, Math.max(0, fraction));
  return f === 1 ? whole : alignQuantity((whole * BigInt(Math.round(f * 1000))) / 1000n, info);
}

const REDUCE_PCT = 25; // strategies/perp-guard/src/index.ts:52
const rows: any[] = [];
for (const m of (await client.listPerpMarkets()) as any[]) {
  const lot = BigInt(m.lotSize);
  const min = BigInt(m.minQuantity);
  const dec = Number(m.baseDecimals);
  const snap: any = await client.getPerpHealthSnapshot(m.poolAddress);
  const mark = snap.priceable ? Number(snap.markPrice) / 1e18 : Number(BigInt(m.markPrice)) / 1e18;
  // Smallest position on the lot grid whose 25% slice is sendable; the slice is monotone in the size.
  let lo = min / lot; // k * lot = min (minQuantity sits on the lot grid on every live market)
  let hi = lo * 8n;
  while (sliceOf(hi * lot, REDUCE_PCT / 100, m) === 0n) hi *= 2n;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (sliceOf(mid * lot, REDUCE_PCT / 100, m) === 0n) lo = mid + 1n;
    else hi = mid;
  }
  const firstReducible = lo * lot;
  const maxStuck = firstReducible - lot;
  const h = (x: bigint) => Number(formatUnits(x, dec));
  rows.push({
    market: `${m.baseSymbol}-PERP`,
    lot: h(lot),
    minQuantity: h(min),
    mark: +mark.toPrecision(8),
    minQuantityOnGrid: min % lot === 0n,
    maxUnreducible: h(maxStuck),
    maxUnreducibleUsdso: +(h(maxStuck) * mark).toFixed(2),
    maxUnreducibleInMinQuantities: +(Number(maxStuck) / Number(min)).toFixed(3),
    checkSliceAtMax: h(sliceOf(maxStuck, REDUCE_PCT / 100, m)),
    checkSliceOneLotMore: h(sliceOf(firstReducible, REDUCE_PCT / 100, m)),
  });
}
rows.sort((a, b) => a.maxUnreducibleUsdso - b.maxUnreducibleUsdso);
out({
  ...(await stamp()),
  kit: "dreamdex-bot-kit 2579866: markets.ts:157-162 alignQuantity, orders.ts:260-273 closePosition, perp-guard index.ts:157-159",
  reducePct: REDUCE_PCT,
  summary: {
    markets: rows.length,
    allMinQuantitiesOnLotGrid: rows.every((r) => r.minQuantityOnGrid),
    maxUnreducibleUsdsoRange: [rows[0].maxUnreducibleUsdso, rows[rows.length - 1].maxUnreducibleUsdso],
    smallest: `${rows[0].market} ${rows[0].maxUnreducible} (${rows[0].maxUnreducibleUsdso} USDso)`,
    largest: `${rows[rows.length - 1].market} ${rows[rows.length - 1].maxUnreducible} (${rows[rows.length - 1].maxUnreducibleUsdso} USDso)`,
  },
  rows,
});
process.exit(0);
