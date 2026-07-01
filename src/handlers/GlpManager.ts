// Ported from handleRemoveLiquidity in gmx-subgraph/synthetics-stats/src/mapping.ts
import { indexer } from "envio";
import { saveUserGlpGmMigrationStatGlpData } from "../entities/incentives/liquidityIncentives";

const SELL_USDG_ID = "last";

indexer.onEvent({ contract: "GlpManager", event: "RemoveLiquidity" }, async ({ event, context }) => {
  let chainId = event.chainId;
  let sellUsdgEntity = await context.SellUSDG.get(`${chainId}-${SELL_USDG_ID}`);

  if (sellUsdgEntity == null) {
    context.log.error(`No SellUSDG entity tx: ${event.transaction.hash}`);
    throw new Error("No SellUSDG entity");
  }

  if (sellUsdgEntity.txHash != event.transaction.hash) {
    context.log.error(
      `SellUSDG entity tx hashes don't match: expected ${event.transaction.hash} actual ${sellUsdgEntity.txHash}`
    );
    throw new Error("SellUSDG entity tx hashes don't match");
  }

  let expectedLogIndex = event.logIndex - 1;
  if (sellUsdgEntity.logIndex != expectedLogIndex) {
    context.log.error(
      `SellUSDG entity incorrect log index: expected ${expectedLogIndex.toString()} got ${sellUsdgEntity.logIndex.toString()}`
    );
    throw new Error("SellUSDG entity tx hashes don't match");
  }

  await saveUserGlpGmMigrationStatGlpData(
    event.params.account.toLowerCase(),
    event.block.timestamp,
    event.params.usdgAmount,
    sellUsdgEntity.feeBasisPoints,
    chainId,
    context
  );
});
