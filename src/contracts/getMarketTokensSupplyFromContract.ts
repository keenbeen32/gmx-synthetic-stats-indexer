// Ported from gmx-subgraph/synthetics-stats/src/contracts/getMarketTokensSupplyFromContract.ts
import type { EvmOnEventContext } from "envio";
import { getMarketTokensSupply } from "../effects/getMarketTokensSupply";

export async function getMarketTokensSupplyFromContract(
  marketAddress: string,
  chainId: number,
  blockNumber: number,
  context: EvmOnEventContext
): Promise<bigint> {
  // The effect throws on RPC failure (so a wrong value is never cached). Catch here
  // and fall back to 0 so the indexer keeps running; the call stays uncached and is
  // retried on a later run.
  try {
    return await context.effect(getMarketTokensSupply, {
      chainId,
      marketAddress,
      blockNumber,
    });
  } catch (e) {
    context.log.warn(
      `MarketToken.totalSupply failed for ${marketAddress} at block ${blockNumber}; falling back to 0 (uncached)`
    );
    return 0n;
  }
}
