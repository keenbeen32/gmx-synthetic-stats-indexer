// Ported from handleBatchSend in gmx-subgraph/synthetics-stats/src/mapping.ts
import { indexer } from "envio";
import { saveDistribution } from "../entities/distributions";

indexer.onEvent({ contract: "BatchSender", event: "BatchSend" }, async ({ event, context }) => {
  let chainId = event.chainId;
  let typeId = event.params.typeId;
  let token = event.params.token.toLowerCase();
  let receivers = event.params.accounts;
  let amounts = event.params.amounts;
  for (let i = 0; i < receivers.length; i++) {
    let receiver = receivers[i]!.toLowerCase();
    await saveDistribution(
      receiver,
      token,
      amounts[i]!,
      Number(typeId),
      event.transaction.hash,
      event.block.number,
      event.block.timestamp,
      chainId,
      context
    );
  }
});
