// Ported from gmx-subgraph/synthetics-stats/src/contracts/getMarketTokensSupplyFromContract.ts
// MarketToken.totalSupply() via the Effect API (viem readContract at the event's block).

import { createEffect, S } from "envio";
import { getClient, effectRateLimit } from "./client";

const TOTAL_SUPPLY_ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const getMarketTokensSupply = createEffect(
  {
    name: "getMarketTokensSupply",
    input: {
      chainId: S.number,
      marketAddress: S.string,
      blockNumber: S.number,
    },
    output: S.bigint,
    cache: true,
    rateLimit: effectRateLimit(),
  },
  async ({ input }): Promise<bigint> => {
    const client = getClient(input.chainId);
    const supply = await client.readContract({
      address: input.marketAddress as `0x${string}`,
      abi: TOTAL_SUPPLY_ABI,
      functionName: "totalSupply",
      blockNumber: BigInt(input.blockNumber),
    });
    return supply as bigint;
  }
);
