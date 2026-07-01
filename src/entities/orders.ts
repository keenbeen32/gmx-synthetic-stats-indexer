// Ported from gmx-subgraph/synthetics-stats/src/entities/orders.ts
import type { EvmOnEventContext, Order, Transaction } from "envio";
import { EventData } from "../utils/eventData";

export const orderTypes = new Map<string, bigint>();

orderTypes.set("MarketSwap", 0n);
orderTypes.set("LimitSwap", 1n);
orderTypes.set("MarketIncrease", 2n);
orderTypes.set("LimitIncrease", 3n);
orderTypes.set("MarketDecrease", 4n);
orderTypes.set("LimitDecrease", 5n);
orderTypes.set("StopLossDecrease", 6n);
orderTypes.set("Liquidation", 7n);
orderTypes.set("StopIncrease", 8n);

export async function saveOrder(
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<Order> {
  let key = eventData.getBytes32Item("key")!;

  let isFrozen = eventData.getBoolItem("isFrozen");

  let order: Order = {
    id: `${chainId}-${key}`,
    account: eventData.getAddressItemString("account")!,
    receiver: eventData.getAddressItemString("receiver")!,
    callbackContract: eventData.getAddressItemString("callbackContract")!,
    marketAddress: eventData.getAddressItemString("market")!,
    swapPath: eventData.getAddressArrayItemString("swapPath") ?? [],
    initialCollateralTokenAddress: eventData.getAddressItemString("initialCollateralToken")!,
    sizeDeltaUsd: eventData.getUintItem("sizeDeltaUsd")!,
    initialCollateralDeltaAmount: eventData.getUintItem("initialCollateralDeltaAmount")!,
    triggerPrice: eventData.getUintItem("triggerPrice")!,
    acceptablePrice: eventData.getUintItem("acceptablePrice")!,
    callbackGasLimit: eventData.getUintItem("callbakGasLimit")!,
    minOutputAmount: eventData.getUintItem("minOutputAmount")!,
    executionFee: eventData.getUintItem("executionFee")!,
    updatedAtBlock: BigInt(transaction.blockNumber),
    orderType: eventData.getUintItem("orderType")!,
    isLong: eventData.getBoolItem("isLong"),
    shouldUnwrapNativeToken: eventData.getBoolItem("shouldUnwrapNativeToken"),
    status: isFrozen ? "Frozen" : "Created",
    cancelledReason: undefined,
    cancelledReasonBytes: undefined,
    frozenReason: undefined,
    frozenReasonBytes: undefined,
    createdTxn_id: transaction.id,
    cancelledTxn_id: undefined,
    executedTxn_id: undefined,
  };

  context.Order.set(order);

  return order;
}

export async function saveOrderCancelledState(
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<Order | null> {
  let key = eventData.getBytes32Item("key")!;

  let order = await context.Order.get(`${chainId}-${key}`);

  if (order == null) {
    return null;
  }

  let updated: Order = {
    ...order,
    status: "Cancelled",
    cancelledReason: eventData.getStringItem("reason")!,
    cancelledReasonBytes: eventData.getBytesItem("reasonBytes")!,
    cancelledTxn_id: transaction.id,
  };

  context.Order.set(updated);

  return updated;
}

export async function saveOrderExecutedState(
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<Order | null> {
  let key = eventData.getBytes32Item("key")!;

  let order = await context.Order.get(`${chainId}-${key}`);

  if (order == null) {
    return null;
  }

  let updated: Order = {
    ...order,
    status: "Executed",
    executedTxn_id: transaction.id,
  };

  context.Order.set(updated);

  return updated;
}

export async function saveOrderFrozenState(
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<Order | null> {
  let key = eventData.getBytes32Item("key")!;

  let order = await context.Order.get(`${chainId}-${key}`);

  if (order == null) {
    return null;
  }

  let updated: Order = {
    ...order,
    status: "Frozen",
    frozenReason: eventData.getStringItem("reason")!,
    frozenReasonBytes: eventData.getBytesItem("reasonBytes")!,
  };

  context.Order.set(updated);

  return updated;
}

export async function saveOrderUpdate(
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<Order | null> {
  let key = eventData.getBytes32Item("key")!;

  let order = await context.Order.get(`${chainId}-${key}`);

  if (order == null) {
    return null;
  }

  let updated: Order = {
    ...order,
    sizeDeltaUsd: eventData.getUintItem("sizeDeltaUsd")!,
    triggerPrice: eventData.getUintItem("triggerPrice")!,
    acceptablePrice: eventData.getUintItem("acceptablePrice")!,
    minOutputAmount: eventData.getUintItem("minOutputAmount")!,
  };

  context.Order.set(updated);

  return updated;
}

export async function saveOrderSizeDeltaAutoUpdate(
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<Order | null> {
  let key = eventData.getBytes32Item("key")!;

  let order = await context.Order.get(`${chainId}-${key}`);

  if (order == null) {
    return null;
  }

  let updated: Order = {
    ...order,
    sizeDeltaUsd: eventData.getUintItem("nextSizeDeltaUsd")!,
  };

  context.Order.set(updated);

  return updated;
}

export async function saveOrderCollateralAutoUpdate(
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<Order | null> {
  let key = eventData.getBytes32Item("key")!;

  let order = await context.Order.get(`${chainId}-${key}`);

  if (order == null) {
    return null;
  }

  let updated: Order = {
    ...order,
    initialCollateralDeltaAmount: eventData.getUintItem("nextCollateralDeltaAmount")!,
  };

  context.Order.set(updated);

  return updated;
}
