// Ported from gmx-subgraph/synthetics-stats/src/entities/swaps.ts
import type { EvmOnEventContext, SwapInfo, Transaction } from "envio";
import { EventData } from "../utils/eventData";

export function handleSwapInfo(
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): SwapInfo {
  let orderKey = eventData.getBytes32Item("orderKey")!;
  let marketAddress = eventData.getAddressItemString("market")!;

  let swapInfoId = `${chainId}-${getSwapInfoId(orderKey, marketAddress, transaction)}`;

  let swapInfo: SwapInfo = {
    id: swapInfoId,
    orderKey: orderKey,
    marketAddress: marketAddress,
    transaction_id: transaction.id,
    receiver: eventData.getAddressItemString("receiver")!,
    tokenInAddress: eventData.getAddressItemString("tokenIn")!,
    tokenOutAddress: eventData.getAddressItemString("tokenOut")!,
    tokenInPrice: eventData.getUintItem("tokenInPrice")!,
    tokenOutPrice: eventData.getUintItem("tokenOutPrice")!,
    amountIn: eventData.getUintItem("amountIn")!,
    amountInAfterFees: eventData.getUintItem("amountInAfterFees")!,
    amountOut: eventData.getUintItem("amountOut")!,
    priceImpactUsd: eventData.getUintItem("priceImpactUsd")!,
  };

  context.SwapInfo.set(swapInfo);

  return swapInfo;
}

export function getSwapInfoId(orderKey: string, marketAddress: string, transaction: Transaction): string {
  let id = orderKey + ":" + marketAddress;

  if (orderKey == "0x0000000000000000000000000000000000000000000000000000000000000000") {
    // gasless relay fee swaps are emitted with zero orderKey
    id = id + ":" + transaction.hash;
  }

  return id;
}
