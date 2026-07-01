// Ported from handleMarketTokenTransfer in gmx-subgraph/synthetics-stats/src/mapping.ts
import { indexer } from "envio";
import { getOrCreateTransaction } from "../entities/common";
import {
  saveLiquidityProviderIncentivesStat,
  saveLiquidityProviderInfo,
} from "../entities/incentives/liquidityIncentives";
import { saveMarketInfoTokensSupply } from "../entities/markets";
import { saveUserGmTokensBalanceChange } from "../entities/userBalance";

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

indexer.onEvent({ contract: "MarketToken", event: "Transfer" }, async ({ event, context }) => {
  let chainId = event.chainId;
  let marketAddress = event.srcAddress.toLowerCase();
  let from = event.params.from.toLowerCase();
  let to = event.params.to.toLowerCase();
  let value = event.params.value;

  // `from` user redeems or transfers out GM tokens
  if (from != ADDRESS_ZERO) {
    // LiquidityProviderIncentivesStat *should* be updated before UserMarketInfo
    await saveLiquidityProviderIncentivesStat(
      from,
      marketAddress,
      "Market",
      "1w",
      -value,
      event.block.timestamp,
      chainId,
      context
    );
    await saveLiquidityProviderInfo(from, marketAddress, "Market", -value, chainId, context);
    let transaction = await getOrCreateTransaction(event, context);
    await saveUserGmTokensBalanceChange(from, marketAddress, -value, transaction, event.logIndex, chainId, context);
  }

  // `to` user receives GM tokens
  if (to != ADDRESS_ZERO) {
    // LiquidityProviderIncentivesStat *should* be updated before LiquidityProviderInfo
    await saveLiquidityProviderIncentivesStat(
      to,
      marketAddress,
      "Market",
      "1w",
      value,
      event.block.timestamp,
      chainId,
      context
    );
    await saveLiquidityProviderInfo(to, marketAddress, "Market", value, chainId, context);
    let transaction = await getOrCreateTransaction(event, context);
    await saveUserGmTokensBalanceChange(to, marketAddress, value, transaction, event.logIndex, chainId, context);
  }

  if (from == ADDRESS_ZERO) {
    await saveMarketInfoTokensSupply(marketAddress, value, chainId, context);
  }

  if (to == ADDRESS_ZERO) {
    await saveMarketInfoTokensSupply(marketAddress, -value, chainId, context);
  }
});
