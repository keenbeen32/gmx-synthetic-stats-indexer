// Ported from gmx-subgraph/synthetics-stats/src/contracts/getMarketTokensSupplyFromContract.ts
import type { EvmOnEventContext } from "envio";
import { getMarketTokensSupply } from "../effects/getMarketTokensSupply";

// ⚠️ TESTING ONLY — the MarketToken.totalSupply RPC call is disabled to save RPC
// credits during historical sync. While this flag is `false` the call is skipped
// and supply is treated as 0, which corrupts the GM-token fee metrics and the
// LP-income fields. This is a KNOWN, INTENTIONAL LIMITATION — see EFFECTS_DISABLED.md
// for the exact list of affected fields.
// TODO: set back to `true` (re-enable the effect) before relying on those fields.
const TOTAL_SUPPLY_EFFECT_ENABLED: boolean = false;

export async function getMarketTokensSupplyFromContract(
  marketAddress: string,
  chainId: number,
  blockNumber: number,
  context: EvmOnEventContext
): Promise<bigint> {
  // TESTING ONLY: skip the totalSupply RPC and return 0 (see TOTAL_SUPPLY_EFFECT_ENABLED above).
  if (!TOTAL_SUPPLY_EFFECT_ENABLED) {
    return 0n;
  }

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
