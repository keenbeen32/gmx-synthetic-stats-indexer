// Ported from gmx-subgraph/synthetics-stats/src/entities/positions.ts
import type { EvmOnEventContext, PositionDecrease, PositionIncrease, Transaction } from "envio";
import { EventData } from "../utils/eventData";

export function savePositionIncrease(
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): PositionIncrease {
  let orderKey = eventData.getBytes32Item("orderKey")!;

  let entity: PositionIncrease = {
    id: `${chainId}-${orderKey}`,
    orderKey: orderKey,
    positionKey: eventData.getBytes32Item("positionKey")!,
    account: eventData.getAddressItemString("account")!,
    marketAddress: eventData.getAddressItemString("market")!,
    collateralTokenAddress: eventData.getAddressItemString("collateralToken")!,
    collateralTokenPriceMin: eventData.getUintItem("collateralTokenPrice.min")!,
    collateralTokenPriceMax: eventData.getUintItem("collateralTokenPrice.max")!,
    sizeInUsd: eventData.getUintItem("sizeInUsd")!,
    sizeInTokens: eventData.getUintItem("sizeInTokens")!,
    collateralAmount: eventData.getUintItem("collateralAmount")!,
    sizeDeltaUsd: eventData.getUintItem("sizeDeltaUsd")!,
    sizeDeltaInTokens: eventData.getUintItem("sizeDeltaInTokens")!,
    collateralDeltaAmount: eventData.getIntItem("collateralDeltaAmount")!,
    borrowingFactor: eventData.getUintItem("borrowingFactor")!,
    priceImpactDiffUsd: eventData.getUintItem("priceImpactDiffUsd")!,
    executionPrice: eventData.getUintItem("executionPrice")!,
    longTokenFundingAmountPerSize: eventData.getIntItem("longTokenFundingAmountPerSize")!,
    shortTokenFundingAmountPerSize: eventData.getIntItem("shortTokenFundingAmountPerSize")!,
    priceImpactAmount: eventData.getIntItem("priceImpactAmount")!,
    priceImpactUsd: eventData.getIntItem("priceImpactUsd")!,
    basePnlUsd: eventData.getIntItem("basePnlUsd")!,
    orderType: eventData.getUintItem("orderType")!,
    isLong: eventData.getBoolItem("isLong"),
    transaction_id: transaction.id,
  };

  context.PositionIncrease.set(entity);

  return entity;
}

export function savePositionDecrease(
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): PositionDecrease {
  let orderKey = eventData.getBytes32Item("orderKey")!;

  let entity: PositionDecrease = {
    id: `${chainId}-${orderKey}`,
    orderKey: orderKey,
    positionKey: eventData.getBytes32Item("positionKey")!,
    account: eventData.getAddressItemString("account")!,
    marketAddress: eventData.getAddressItemString("market")!,
    collateralTokenAddress: eventData.getAddressItemString("collateralToken")!,
    collateralTokenPriceMin: eventData.getUintItem("collateralTokenPrice.min")!,
    collateralTokenPriceMax: eventData.getUintItem("collateralTokenPrice.max")!,
    sizeInUsd: eventData.getUintItem("sizeInUsd")!,
    sizeInTokens: eventData.getUintItem("sizeInTokens")!,
    collateralAmount: eventData.getUintItem("collateralAmount")!,
    sizeDeltaUsd: eventData.getUintItem("sizeDeltaUsd")!,
    sizeDeltaInTokens: eventData.getUintItem("sizeDeltaInTokens")!,
    collateralDeltaAmount: eventData.getUintItem("collateralDeltaAmount")!,
    borrowingFactor: eventData.getUintItem("borrowingFactor")!,
    priceImpactDiffUsd: eventData.getUintItem("priceImpactDiffUsd")!,
    priceImpactUsd: eventData.getIntItem("priceImpactUsd")!,
    executionPrice: eventData.getUintItem("executionPrice")!,
    longTokenFundingAmountPerSize: eventData.getIntItem("longTokenFundingAmountPerSize")!,
    shortTokenFundingAmountPerSize: eventData.getIntItem("shortTokenFundingAmountPerSize")!,
    priceImpactAmount: eventData.getIntItem("priceImpactAmount")!,
    basePnlUsd: eventData.getIntItem("basePnlUsd")!,
    orderType: eventData.getUintItem("orderType")!,
    isLong: eventData.getBoolItem("isLong"),
    transaction_id: transaction.id,
  };

  context.PositionDecrease.set(entity);

  return entity;
}
