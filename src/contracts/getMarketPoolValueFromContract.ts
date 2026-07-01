// Ported from gmx-subgraph/synthetics-stats/src/contracts/getMarketPoolValueFromContract.ts
import type { EvmOnEventContext, Transaction } from "envio";
import { getReaderContractConfigByChainId } from "./readerConfigs";
import { getMarketInfo } from "../entities/markets";
import { getMarketPoolValue } from "../effects/getMarketPoolValue";

const ZERO = 0n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ⚠️ TESTING ONLY — the Reader.getMarketTokenPrice RPC call is the historical-sync
// bottleneck (one eth_call per fee event). It ONLY feeds two write-only fields on
// CollectedMarketFeesInfo: `feeUsdPerPoolValue` and `cumulativeFeeUsdPerPoolValue`
// (nothing else in the indexer reads poolValue). While this flag is `false` the
// call is skipped and poolValue is treated as 0, so those two fields will be 0 —
// a KNOWN, INTENTIONAL LIMITATION so the indexer can sync to head quickly and the
// rest of the data can be compared against the subgraph.
// TODO: set back to `true` (re-enable the effect) before relying on those two fields.
const POOL_VALUE_EFFECT_ENABLED: boolean = false;

export async function getMarketPoolValueFromContract(
  marketAddress: string,
  chainId: number,
  transaction: Transaction,
  context: EvmOnEventContext
): Promise<bigint> {
  // TESTING ONLY: skip the pool-value RPC and return 0 (see POOL_VALUE_EFFECT_ENABLED above).
  if (!POOL_VALUE_EFFECT_ENABLED) {
    return ZERO;
  }

  let contractConfig = getReaderContractConfigByChainId(chainId);

  if (transaction.blockNumber < contractConfig.blockNumber) {
    return ZERO;
  }

  let marketInfo = await getMarketInfo(marketAddress, chainId, context);

  let indexTokenPrice = await loadPriceForContractCall(marketInfo.indexToken, chainId, context);
  let longTokenPrice = await loadPriceForContractCall(marketInfo.longToken, chainId, context);
  let shortTokenPrice = await loadPriceForContractCall(marketInfo.shortToken, chainId, context);

  // The effect throws on any RPC/contract failure (so a bad value is never cached).
  // We catch here and fall back to ZERO (matching the subgraph's revert fallback)
  // so the indexer keeps running; the failed call stays uncached and is retried later.
  try {
    return await context.effect(getMarketPoolValue, {
      chainId,
      blockNumber: transaction.blockNumber,
      marketToken: marketInfo.marketToken,
      indexToken: marketInfo.indexToken,
      longToken: marketInfo.longToken,
      shortToken: marketInfo.shortToken,
      indexTokenPriceMin: indexTokenPrice.min,
      indexTokenPriceMax: indexTokenPrice.max,
      longTokenPriceMin: longTokenPrice.min,
      longTokenPriceMax: longTokenPrice.max,
      shortTokenPriceMin: shortTokenPrice.min,
      shortTokenPriceMax: shortTokenPrice.max,
    });
  } catch (e) {
    context.log.warn(
      `getMarketTokenPrice failed for market ${marketAddress} at block ${transaction.blockNumber}; falling back to 0 (uncached)`
    );
    return ZERO;
  }
}

async function loadPriceForContractCall(
  tokenAddress: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<{ min: bigint; max: bigint }> {
  let tokenPrice = await context.TokenPrice.get(`${chainId}-${tokenAddress}`);

  if (tokenPrice) {
    return { min: tokenPrice.minPrice, max: tokenPrice.maxPrice };
  }

  if (tokenAddress != ZERO_ADDRESS) {
    context.log.error(`TokenPrice not found ${tokenAddress}`);
    throw new Error("tokenAddress is not zero address");
  }

  return { min: ZERO, max: ZERO };
}
