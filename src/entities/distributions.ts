// Ported from gmx-subgraph/synthetics-stats/src/entities/distributions.ts
import type { EvmOnEventContext, Distribution } from "envio";
import type { Mutable } from "../utils/types";
import { getTokenPrice } from "./prices";

export async function saveDistribution(
  receiver: string,
  token: string,
  amount: bigint,
  typeId: number,
  txHash: string,
  blockNumber: number,
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let id = `${chainId}-${receiver}:${txHash}:${typeId.toString()}`;
  let existing = await context.Distribution.get(id);

  let entity: Mutable<Distribution>;
  if (existing == null) {
    entity = {
      id,
      tokens: [],
      amounts: [],
      amountsInUsd: [],
      typeId: typeId,
      receiver: receiver,
      blockNumber: blockNumber,
      transactionHash: txHash,
      timestamp: timestamp,
    };
  } else {
    entity = { ...existing };
  }

  let tokens = entity.tokens.slice();
  tokens.push(token);
  entity.tokens = tokens;

  let amounts = entity.amounts.slice();
  amounts.push(amount);
  entity.amounts = amounts;

  let amountsInUsd = entity.amountsInUsd.slice();
  amountsInUsd.push(await _getAmountInUsd(token, amount, chainId, context));
  entity.amountsInUsd = amountsInUsd;

  entity.typeId = typeId;
  entity.receiver = receiver;

  entity.blockNumber = blockNumber;
  entity.transactionHash = txHash;
  entity.timestamp = timestamp;

  context.Distribution.set(entity);
}

async function _getAmountInUsd(
  token: string,
  amount: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<bigint> {
  let tokenPrice = await getTokenPrice(token, chainId, context);
  return tokenPrice * amount;
}
