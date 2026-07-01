// Ported from gmx-subgraph/synthetics-stats/src/entities/claims.ts
import type {
  EvmOnEventContext,
  ClaimAction,
  ClaimCollateralAction,
  ClaimableFundingFeeInfo,
  Order,
  Transaction,
} from "envio";
import type { Mutable } from "../utils/types";
import { EventData } from "../utils/eventData";
import { orderTypes } from "./orders";
import { CollateralClaimedEventData } from "../utils/eventData/CollateralClaimedEventData";
import { getTokenPrice } from "./prices";

const ZERO = 0n;
const ONE = 1n;

type ClaimActionType = ClaimAction["eventName"];

export async function saveClaimActionOnOrderCreated(
  transaction: Transaction,
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let orderId = eventData.getBytes32Item("key")!;

  let claimAction = await getOrCreateClaimAction("SettleFundingFeeCreated", eventData, transaction, chainId, context);

  let marketAddress = eventData.getAddressItemString("market")!;
  let marketAddresses = claimAction.marketAddresses.slice();
  marketAddresses.push(marketAddress);
  claimAction.marketAddresses = marketAddresses;

  let isLongOrders = (claimAction.isLongOrders as boolean[]).slice();
  isLongOrders.push(eventData.getBoolItem("isLong"));
  claimAction.isLongOrders = isLongOrders;

  context.ClaimAction.set(claimAction);

  await createClaimRefIfNotExists(orderId, chainId, context);
}

export async function saveClaimActionOnOrderCancelled(
  transaction: Transaction,
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let claimAction = await getOrCreateClaimAction("SettleFundingFeeCancelled", eventData, transaction, chainId, context);

  let orderId = eventData.getBytes32Item("key")!;
  let order = await context.Order.get(`${chainId}-${orderId}`);

  if (!order) throw new Error("Order not found");

  let marketAddresses = claimAction.marketAddresses.slice();
  marketAddresses.push(order.marketAddress);
  claimAction.marketAddresses = marketAddresses;

  let isLongOrders = (claimAction.isLongOrders as boolean[]).slice();
  isLongOrders.push(order.isLong);
  claimAction.isLongOrders = isLongOrders;

  context.ClaimAction.set(claimAction);
}

export async function saveClaimActionOnOrderExecuted(
  transaction: Transaction,
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let claimAction = await getOrCreateClaimAction("SettleFundingFeeExecuted", eventData, transaction, chainId, context);
  let orderId = eventData.getBytes32Item("key")!;
  let order = await context.Order.get(`${chainId}-${orderId}`);

  if (!order) throw new Error("Order not found");

  let account = eventData.getAddressItemString("account")!;
  let claimableFundingFeeInfoId = transaction.id + ":" + account;
  let claimableFundingFeeInfo = await context.ClaimableFundingFeeInfo.get(claimableFundingFeeInfoId);

  // if position has no pending funding fees ClaimableFundingUpdated is not emitted
  if (!claimableFundingFeeInfo) {
    return;
  }

  let sourceTokenAddresses = claimableFundingFeeInfo.tokenAddresses;

  let targetTokenAddresses = claimAction.tokenAddresses.slice();
  let tokenPrices = claimAction.tokenPrices.slice();
  for (let i = 0; i < sourceTokenAddresses.length; i++) {
    let sourceTokenAddress = sourceTokenAddresses[i]!;
    targetTokenAddresses.push(sourceTokenAddress);

    let tokenPrice = await getTokenPrice(sourceTokenAddress, chainId, context);
    tokenPrices.push(tokenPrice);
  }
  claimAction.tokenAddresses = targetTokenAddresses;
  claimAction.tokenPrices = tokenPrices;

  let sourceAmounts = claimableFundingFeeInfo.amounts;
  let targetAmounts = claimAction.amounts.slice();

  for (let i = 0; i < sourceAmounts.length; i++) {
    let sourceAmount = sourceAmounts[i]!;
    targetAmounts.push(sourceAmount);
  }

  claimAction.amounts = targetAmounts;

  let tokensCount = claimableFundingFeeInfo.tokenAddresses.length;
  let marketAddresses = claimAction.marketAddresses.slice();
  let isLongOrders = (claimAction.isLongOrders as boolean[]).slice();

  for (let i = 0; i < tokensCount; i++) {
    marketAddresses.push(order.marketAddress);
    isLongOrders.push(order.isLong);
  }

  claimAction.marketAddresses = marketAddresses;
  claimAction.isLongOrders = isLongOrders;

  context.ClaimAction.set(claimAction);
}

export async function handleCollateralClaimAction(
  eventName: ClaimActionType,
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let data = new CollateralClaimedEventData(eventData);
  let claimCollateralAction = await getOrCreateClaimCollateralAction(eventName, eventData, transaction, chainId, context);
  let claimAction = await getOrCreateClaimAction(eventName, eventData, transaction, chainId, context);

  let tokenPrice = await getTokenPrice(data.token, chainId, context);

  addFieldsToCollateralLikeClaimAction(claimAction, data, tokenPrice);
  addFieldsToCollateralLikeClaimAction(claimCollateralAction, data, tokenPrice);

  context.ClaimCollateralAction.set(claimCollateralAction);
  context.ClaimAction.set(claimAction);
}

export async function saveClaimableFundingFeeInfo(
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<ClaimableFundingFeeInfo> {
  let account = eventData.getAddressItemString("account")!;
  let id = transaction.id + ":" + account;
  let existing = await context.ClaimableFundingFeeInfo.get(id);

  let entity: Mutable<ClaimableFundingFeeInfo>;
  if (!existing) {
    entity = {
      id,
      amounts: [],
      marketAddresses: [],
      tokenAddresses: [],
    };
  } else {
    entity = { ...existing };
  }

  let marketAddresses = entity.marketAddresses.slice();
  marketAddresses.push(eventData.getAddressItemString("market")!);
  entity.marketAddresses = marketAddresses;

  let tokenAddresses = entity.tokenAddresses.slice();
  tokenAddresses.push(eventData.getAddressItemString("token")!);
  entity.tokenAddresses = tokenAddresses;

  let amounts = entity.amounts.slice();
  amounts.push(eventData.getUintItem("delta")!);
  entity.amounts = amounts;

  context.ClaimableFundingFeeInfo.set(entity);

  return entity;
}

function addFieldsToCollateralLikeClaimAction(
  claimAction: Mutable<ClaimCollateralAction>,
  eventData: CollateralClaimedEventData,
  tokenPrice: bigint
): void {
  let marketAddresses = claimAction.marketAddresses.slice();
  marketAddresses.push(eventData.market);
  claimAction.marketAddresses = marketAddresses;

  let tokenAddresses = claimAction.tokenAddresses.slice();
  tokenAddresses.push(eventData.token);
  claimAction.tokenAddresses = tokenAddresses;

  let tokenPrices = claimAction.tokenPrices.slice();
  tokenPrices.push(tokenPrice);
  claimAction.tokenPrices = tokenPrices;

  let amounts = claimAction.amounts.slice();
  amounts.push(eventData.amount);
  claimAction.amounts = amounts;
}

async function getOrCreateClaimCollateralAction(
  eventName: ClaimActionType,
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<ClaimCollateralAction>> {
  let account = eventData.getAddressItemString("account")!;
  let id = transaction.id + ":" + account + ":" + eventName;
  let entity = await context.ClaimCollateralAction.get(id);

  if (!entity) {
    return {
      id,
      marketAddresses: [],
      tokenAddresses: [],
      tokenPrices: [],
      amounts: [],
      eventName: eventName,
      account: account,
      transaction_id: transaction.id,
    };
  }

  return { ...entity };
}

async function getOrCreateClaimAction(
  eventName: ClaimActionType,
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<ClaimAction>> {
  let account = eventData.getAddressItemString("account")!;
  let id = transaction.id + ":" + account + ":" + eventName;
  let entity = await context.ClaimAction.get(id);

  if (!entity) {
    return {
      id,
      marketAddresses: [],
      tokenAddresses: [],
      tokenPrices: [],
      amounts: [],
      isLongOrders: [],
      eventName: eventName,
      account: account,
      transaction_id: transaction.id,
    };
  }

  return { ...entity };
}

export function isFundingFeeSettleOrder(order: Order): boolean {
  return (
    order.initialCollateralDeltaAmount == ONE &&
    order.sizeDeltaUsd == ZERO &&
    order.orderType == orderTypes.get("MarketDecrease")
  );
}

async function createClaimRefIfNotExists(
  orderId: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let id = `${chainId}-${orderId}`;
  if (!(await context.ClaimRef.get(id))) {
    context.ClaimRef.set({ id });
  }
}
