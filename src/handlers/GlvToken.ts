// Ported from handleGlvTokenTransfer in gmx-subgraph/synthetics-stats/src/mapping.ts
import { indexer } from "envio";
import {
  saveLiquidityProviderIncentivesStat,
  saveLiquidityProviderInfo,
} from "../entities/incentives/liquidityIncentives";

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

indexer.onEvent({ contract: "GlvToken", event: "Transfer" }, async ({ event, context }) => {
  let chainId = event.chainId;
  let glvAddress = event.srcAddress.toLowerCase();
  let from = event.params.from.toLowerCase();
  let to = event.params.to.toLowerCase();
  let value = event.params.value;

  // `from` user redeems or transfers out GLV tokens
  if (from != ADDRESS_ZERO) {
    // LiquidityProviderIncentivesStat *should* be updated before LiquidityProviderInfo
    await saveLiquidityProviderIncentivesStat(from, glvAddress, "Glv", "1w", -value, event.block.timestamp, chainId, context);
    await saveLiquidityProviderInfo(from, glvAddress, "Glv", -value, chainId, context);
  }

  // `to` user receives GLV tokens
  if (to != ADDRESS_ZERO) {
    await saveLiquidityProviderIncentivesStat(to, glvAddress, "Glv", "1w", value, event.block.timestamp, chainId, context);
    await saveLiquidityProviderInfo(to, glvAddress, "Glv", value, chainId, context);
  }
});
