// Ported from gmx-subgraph/synthetics-stats/src/entities/trades.ts
import type { EvmOnEventContext, Order, TradeAction, Transaction } from "envio";
import type { Mutable } from "../utils/types";
import { stripChainPrefix } from "./common";
import { getMarketInfo } from "./markets";
import { orderTypes } from "./orders";
import { getSwapInfoId } from "./swaps";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function saveOrderCreatedTradeAction(
  eventId: string,
  order: Order,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<TradeAction> {
  let tradeAction = getTradeActionFromOrder(eventId, order, chainId);

  tradeAction.eventName = "OrderCreated";
  tradeAction.transaction_id = transaction.id;
  tradeAction.timestamp = transaction.timestamp;

  context.TradeAction.set(tradeAction);

  return tradeAction;
}

export async function saveOrderCancelledTradeAction(
  eventId: string,
  order: Order,
  reason: string,
  reasonBytes: string,
  tranaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<TradeAction> {
  let tradeAction = getTradeActionFromOrder(eventId, order, chainId);

  tradeAction.eventName = "OrderCancelled";
  tradeAction.reason = reason;
  tradeAction.reasonBytes = reasonBytes;
  tradeAction.transaction_id = tranaction.id;
  tradeAction.timestamp = tranaction.timestamp;

  context.TradeAction.set(tradeAction);

  return tradeAction;
}

export async function saveOrderExecutedTradeAction(
  eventId: string,
  order: Order,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<TradeAction> {
  let tradeAction = getTradeActionFromOrder(eventId, order, chainId);

  tradeAction.eventName = "OrderExecuted";
  tradeAction.transaction_id = transaction.id;
  tradeAction.timestamp = transaction.timestamp;

  context.TradeAction.set(tradeAction);

  return tradeAction;
}

export async function saveOrderUpdatedTradeAction(
  eventId: string,
  order: Order,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<TradeAction> {
  let tradeAction = getTradeActionFromOrder(eventId, order, chainId);

  tradeAction.eventName = "OrderUpdated";
  tradeAction.transaction_id = transaction.id;
  tradeAction.timestamp = transaction.timestamp;

  context.TradeAction.set(tradeAction);

  return tradeAction;
}

export async function saveOrderFrozenTradeAction(
  eventId: string,
  order: Order,
  reason: string,
  reasonBytes: string,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<TradeAction> {
  let tradeAction = getTradeActionFromOrder(eventId, order, chainId);

  if (order.marketAddress != ZERO_ADDRESS) {
    let marketInfo = await getMarketInfo(order.marketAddress!, chainId, context);
    let tokenPrice = (await context.TokenPrice.get(`${chainId}-${marketInfo.indexToken}`))!;
    tradeAction.indexTokenPriceMin = tokenPrice.minPrice;
    tradeAction.indexTokenPriceMax = tokenPrice.maxPrice;
  }

  tradeAction.eventName = "OrderFrozen";
  tradeAction.reason = reason;
  tradeAction.reasonBytes = reasonBytes;
  tradeAction.transaction_id = transaction.id;
  tradeAction.timestamp = transaction.timestamp;

  context.TradeAction.set(tradeAction);

  return tradeAction;
}

export async function saveSwapExecutedTradeAction(
  eventId: string,
  order: Order,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let tradeAction = getTradeActionFromOrder(eventId, order, chainId);

  let orderKey = stripChainPrefix(chainId, order.id);
  let swapPath = order.swapPath;

  let swapInfo = null;
  if (swapPath.length > 0) {
    let lastSwapAddress = swapPath[swapPath.length - 1]!;
    let swapInfoId = `${chainId}-${getSwapInfoId(orderKey, lastSwapAddress, transaction)}`;
    swapInfo = await context.SwapInfo.get(swapInfoId);
  }

  tradeAction.eventName = "OrderExecuted";

  tradeAction.orderKey = orderKey;
  tradeAction.orderType = order.orderType;

  if (swapInfo != null) {
    tradeAction.executionAmountOut = swapInfo.amountOut;
  } else {
    tradeAction.executionAmountOut = 0n;
  }
  tradeAction.transaction_id = transaction.id;
  tradeAction.timestamp = transaction.timestamp;

  context.TradeAction.set(tradeAction);
}

export async function savePositionIncreaseExecutedTradeAction(
  eventId: string,
  order: Order,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<TradeAction> {
  let tradeAction = getTradeActionFromOrder(eventId, order, chainId);
  let positionIncrease = await context.PositionIncrease.get(order.id);
  let marketInfo = await getMarketInfo(order.marketAddress!, chainId, context);
  let tokenPrice = (await context.TokenPrice.get(`${chainId}-${marketInfo.indexToken}`))!;

  if (positionIncrease == null) {
    throw new Error("PositionIncrease not found " + order.id);
  }

  let positionFeesInfo = await context.PositionFeesInfo.get(order.id + ":" + "PositionFeesCollected");
  if (positionFeesInfo == null) {
    context.log.warn(`PositionFeesInfo not found ${order.id}`);
    throw new Error("PositionFeesInfo not found " + order.id);
  }

  tradeAction.indexTokenPriceMin = tokenPrice.minPrice;
  tradeAction.indexTokenPriceMax = tokenPrice.maxPrice;

  tradeAction.eventName = "OrderExecuted";

  tradeAction.orderKey = stripChainPrefix(chainId, order.id);
  tradeAction.orderType = order.orderType;

  tradeAction.initialCollateralDeltaAmount = positionIncrease.collateralDeltaAmount;
  tradeAction.sizeDeltaUsd = positionIncrease.sizeDeltaUsd;

  tradeAction.executionPrice = positionIncrease.executionPrice;
  tradeAction.priceImpactUsd = positionIncrease.priceImpactUsd;

  tradeAction.collateralTokenPriceMin = positionFeesInfo.collateralTokenPriceMin;
  tradeAction.collateralTokenPriceMax = positionFeesInfo.collateralTokenPriceMax;

  tradeAction.positionFeeAmount = positionFeesInfo.positionFeeAmount;
  tradeAction.borrowingFeeAmount = positionFeesInfo.borrowingFeeAmount;
  tradeAction.fundingFeeAmount = positionFeesInfo.fundingFeeAmount;

  tradeAction.transaction_id = transaction.id;
  tradeAction.timestamp = transaction.timestamp;

  context.TradeAction.set(tradeAction);

  return tradeAction;
}

export async function savePositionDecreaseExecutedTradeAction(
  eventId: string,
  order: Order,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let tradeAction = getTradeActionFromOrder(eventId, order, chainId);
  let positionDecrease = await context.PositionDecrease.get(order.id);
  let positionFeesInfo = null;
  let marketInfo = await getMarketInfo(order.marketAddress!, chainId, context);
  let tokenPrice = (await context.TokenPrice.get(`${chainId}-${marketInfo.indexToken}`))!;

  tradeAction.indexTokenPriceMin = tokenPrice.minPrice;
  tradeAction.indexTokenPriceMax = tokenPrice.maxPrice;

  if (positionDecrease == null) {
    throw new Error("PositionDecrease not found " + order.id);
  }

  let isLiquidation = order.orderType == orderTypes.get("Liquidation");

  if (isLiquidation) {
    positionFeesInfo = await context.PositionFeesInfo.get(order.id + ":" + "PositionFeesInfo");
  }

  if (positionFeesInfo == null) {
    positionFeesInfo = await context.PositionFeesInfo.get(order.id + ":" + "PositionFeesCollected");
  }

  if (positionFeesInfo == null) {
    context.log.warn(`PositionFeesInfo not found ${order.id}`);
    throw new Error("PositionFeesInfo not found " + order.id);
  }

  tradeAction.eventName = "OrderExecuted";

  tradeAction.orderKey = stripChainPrefix(chainId, order.id);
  tradeAction.orderType = order.orderType;

  tradeAction.executionPrice = positionDecrease.executionPrice;

  tradeAction.initialCollateralDeltaAmount = positionDecrease.collateralDeltaAmount;
  tradeAction.sizeDeltaUsd = positionDecrease.sizeDeltaUsd;

  tradeAction.collateralTokenPriceMin = positionFeesInfo.collateralTokenPriceMin;
  tradeAction.collateralTokenPriceMax = positionFeesInfo.collateralTokenPriceMax;

  tradeAction.priceImpactDiffUsd = positionDecrease.priceImpactDiffUsd;
  tradeAction.priceImpactAmount = positionDecrease.priceImpactAmount;
  tradeAction.priceImpactUsd = positionDecrease.priceImpactUsd;

  tradeAction.positionFeeAmount = positionFeesInfo.positionFeeAmount;
  tradeAction.borrowingFeeAmount = positionFeesInfo.borrowingFeeAmount;
  tradeAction.fundingFeeAmount = positionFeesInfo.fundingFeeAmount;
  tradeAction.liquidationFeeAmount = positionFeesInfo.liquidationFeeAmount;

  tradeAction.basePnlUsd = positionDecrease.basePnlUsd;
  tradeAction.pnlUsd =
    positionDecrease.basePnlUsd -
    (positionFeesInfo.positionFeeAmount +
      positionFeesInfo.borrowingFeeAmount +
      positionFeesInfo.fundingFeeAmount) *
      positionFeesInfo.collateralTokenPriceMax +
    positionDecrease.priceImpactUsd;

  tradeAction.transaction_id = transaction.id;
  tradeAction.timestamp = transaction.timestamp;

  context.TradeAction.set(tradeAction);
}

export function getTradeActionFromOrder(
  eventId: string,
  order: Order,
  chainId: number
): Mutable<TradeAction> {
  return {
    id: eventId,
    eventName: "",
    orderKey: stripChainPrefix(chainId, order.id),
    orderType: order.orderType,
    account: order.account,
    marketAddress: order.marketAddress,
    swapPath: order.swapPath,
    initialCollateralTokenAddress: order.initialCollateralTokenAddress,
    initialCollateralDeltaAmount: order.initialCollateralDeltaAmount,
    sizeDeltaUsd: order.sizeDeltaUsd,
    triggerPrice: order.triggerPrice,
    acceptablePrice: order.acceptablePrice,
    executionPrice: undefined,
    collateralTokenPriceMin: undefined,
    collateralTokenPriceMax: undefined,
    indexTokenPriceMin: undefined,
    indexTokenPriceMax: undefined,
    priceImpactDiffUsd: undefined,
    priceImpactUsd: undefined,
    priceImpactAmount: undefined,
    positionFeeAmount: undefined,
    liquidationFeeAmount: undefined,
    borrowingFeeAmount: undefined,
    fundingFeeAmount: undefined,
    pnlUsd: undefined,
    basePnlUsd: undefined,
    isLong: order.isLong,
    minOutputAmount: order.minOutputAmount,
    executionAmountOut: undefined,
    shouldUnwrapNativeToken: order.shouldUnwrapNativeToken,
    reason: undefined,
    reasonBytes: undefined,
    timestamp: 0,
    transaction_id: "",
  };
}
