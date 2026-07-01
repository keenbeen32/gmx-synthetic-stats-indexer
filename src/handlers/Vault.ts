// Ported from handleSellUSDG in gmx-subgraph/synthetics-stats/src/mapping.ts
import { indexer } from "envio";

const SELL_USDG_ID = "last";

indexer.onEvent({ contract: "Vault", event: "SellUSDG" }, async ({ event, context }) => {
  context.SellUSDG.set({
    id: `${event.chainId}-${SELL_USDG_ID}`,
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    feeBasisPoints: event.params.feeBasisPoints,
  });
});
