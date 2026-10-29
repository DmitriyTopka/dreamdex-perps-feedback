// Shared read-only client for Somnia Tokyo testnet (Hideki, chain 50383).
import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, http } from "viem";

export const RPC = "https://api.hideki2.infra.testnet.somnia.network";
export const INDEXER = "https://hideki-dev.smk.somnia.host/v1/graphql";
export const markets = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: INDEXER, addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
export const client = markets.client as any;
export const rpc = createPublicClient({ chain: hidekiTestnet, transport: http(RPC) });

export async function stamp() {
  const block = await rpc.getBlock();
  return { block: Number(block.number), time: new Date(Number(block.timestamp) * 1000).toISOString(), sdk: "0.32.1", chainId: 50383 };
}
export const human = (raw: bigint | string | number, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;
export const out = (x: unknown) => console.log(JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
