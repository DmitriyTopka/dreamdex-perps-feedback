// Report 015: a perp TP/SL from the SDK with the bundled addresses. No funds, nothing is sent.
//   cd scripts && npm install && npx tsx stops-015.ts
// A fresh random key signs nothing: every step below either throws before signing or only builds.
// 1. Which of the three bundled presets carry operatorPermissionsRegistry.
// 2. placePerpStopOrder, buildPlacePerpStopOrder and the two grant reads with the Hideki preset.
// 3. What the pools themselves answer to getOperatorPermissionsRegistry (all 21).
// 4. Control: the same build and reads with that address passed explicitly.

import {
  PLACE_ORDER_FOR_SELECTOR,
  SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  SOMNIA_MAINNET_ADDRESSES,
  SOMNIA_TESTNET_ADDRESSES,
  SomniaMarkets,
} from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { INDEXER, client, out, stamp } from "./client.js";

// Our own test account, only as the owner in the grant reads.
const OWNER = "0x84326A92162Ece92ed257A31073fDd3a6599BF21" as const;
const key = generatePrivateKey();
const exchange = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: INDEXER, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES, privateKey: key });
const trader = exchange.trader as any;

const presets = Object.fromEntries(
  Object.entries({ SOMNIA_HIDEKI_TESTNET_ADDRESSES, SOMNIA_TESTNET_ADDRESSES, SOMNIA_MAINNET_ADDRESSES }).map(([k, v]) => [
    k,
    { keys: Object.keys(v as object).length, operatorPermissionsRegistry: (v as any).operatorPermissionsRegistry ?? null },
  ]),
);

const markets = (await client.listPerpMarkets()) as any[];
const btc = markets.find((m) => m.baseSymbol === "BTC");
const mark = BigInt(btc.markPrice);
const tick = BigInt(btc.tickSize);
const stop = {
  registry: btc.stopRegistry,
  pool: btc.poolAddress,
  isBid: false,
  quantity: 0n,
  triggerPrice: ((mark * 7n) / 10n / tick) * tick, // 30% under the mark, a stop loss for a long
  triggerOperator: 1,
  stopOrderType: 1,
  intent: "reduceOnly",
};

async function attempt(label: string, fn: () => Promise<any>) {
  try {
    const r = await fn();
    return { label, ok: true, result: r };
  } catch (e: any) {
    return { label, ok: false, error: `${e?.name ?? "Error"}: ${String(e?.shortMessage ?? e?.message ?? e).split("\n")[0]}` };
  }
}

const grantRead = { owner: OWNER, operator: btc.stopRegistry, selector: PLACE_ORDER_FOR_SELECTOR };
const withPreset = [
  await attempt("trader.placePerpStopOrder", () => trader.placePerpStopOrder(stop)),
  await attempt("trader.buildPlacePerpStopOrder", () => trader.buildPlacePerpStopOrder(stop)),
  await attempt("client.isGloballyApproved", () => (exchange.client as any).isGloballyApproved(grantRead)),
  await attempt("client.isApprovedForPool", () => (exchange.client as any).isApprovedForPool({ ...grantRead, pool: btc.poolAddress })),
];

const regs = new Map<string, string[]>();
for (const m of markets) {
  const r = String(await client.getOperatorPermissionsRegistry(m.poolAddress));
  regs.set(r, [...(regs.get(r) ?? []), `${m.baseSymbol}-PERP`]);
}
const registry = [...regs.keys()][0] as `0x${string}`;

const withReg = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: INDEXER, addresses: { ...SOMNIA_HIDEKI_TESTNET_ADDRESSES, operatorPermissionsRegistry: registry } as any }).client as any;
const built = await attempt("trader.buildPlacePerpStopOrder({ operatorRegistry })", () => trader.buildPlacePerpStopOrder({ ...stop, operatorRegistry: registry }));
const control = [
  built.ok
    ? { label: built.label, ok: true, grantFn: built.result.operatorApproval?.functionName ?? null, stopFn: built.result.stopOrder?.functionName, stopValueWei: String(built.result.stopOrder?.value ?? "") }
    : built,
  await attempt("client.isGloballyApproved, preset + operatorPermissionsRegistry", () => withReg.isGloballyApproved(grantRead)),
  await attempt("client.isApprovedForPool, preset + operatorPermissionsRegistry", () => withReg.isApprovedForPool({ ...grantRead, pool: btc.poolAddress })),
];

out({
  ...(await stamp()),
  freshSigner: privateKeyToAccount(key).address,
  presets,
  withHidekiPreset: withPreset,
  poolsAnswer: Object.fromEntries([...regs].map(([r, ms]) => [r, ms.length])),
  control,
});
process.exit(0);
