/*
 * EventEmitter dispatchers — migrated from gmx-subgraph/synthetics-stats/src/mapping.ts.
 *
 * The generic EventLog / EventLog1 / EventLog2 events are decoded and dispatched
 * on `eventName`, mirroring the subgraph. The per-network handler wrappers
 * (handleEventLog1Arbitrum ... Megaeth) collapse into a single dispatcher keyed
 * by event.chainId. Dynamic MarketToken / GlvToken contracts are registered via
 * contractRegister (replacing MarketTokenTemplate.create / GlvTokenTemplate.create).
 */
import { indexer } from "envio";
import type { EvmOnEventContext, EvmContractRegisterContext } from "envio";

import { EventData, type RawEventData } from "../utils/eventData";
import { getMarketPoolValueFromContract } from "../contracts/getMarketPoolValueFromContract";
import { getMarketTokensSupplyFromContract } from "../contracts/getMarketTokensSupplyFromContract";
import {
  saveClaimableFundingFeeInfo as handleClaimableFundingUpdated,
  handleCollateralClaimAction,
  isFundingFeeSettleOrder,
  saveClaimActionOnOrderCancelled,
  saveClaimActionOnOrderCreated,
  saveClaimActionOnOrderExecuted,
} from "../entities/claims";
import { getIdFromEvent, getOrCreateTransaction } from "../entities/common";
import {
  getSwapActionByFeeType,
  handlePositionImpactPoolDistributed,
  saveCollectedMarketFees,
  savePositionFeesInfo,
  savePositionFeesInfoWithPeriod,
  saveSwapFeesInfo,
  saveSwapFeesInfoWithPeriod,
} from "../entities/fees";
import {
  saveMarketIncentivesStat,
  saveUserGlpGmMigrationStatGmData,
} from "../entities/incentives/liquidityIncentives";
import { saveTradingIncentivesStat } from "../entities/incentives/tradingIncentives";
import {
  getMarketInfo,
  saveMarketInfo,
  saveMarketInfoMarketTokensSupplyFromPoolUpdated,
} from "../entities/markets";
import {
  orderTypes,
  saveOrder,
  saveOrderCancelledState,
  saveOrderCollateralAutoUpdate,
  saveOrderExecutedState,
  saveOrderFrozenState,
  saveOrderSizeDeltaAutoUpdate,
  saveOrderUpdate,
} from "../entities/orders";
import { savePositionDecrease, savePositionIncrease } from "../entities/positions";
import {
  handleClaimableCollateralUpdated,
  handleCollateralClaimed,
  handleSetClaimableCollateralFactorForAccount,
  handleSetClaimableCollateralFactorForTime,
} from "../entities/priceImpactRebate";
import { getTokenPrice, handleOraclePriceUpdate } from "../entities/prices";
import { handleSwapInfo as saveSwapInfo } from "../entities/swaps";
import {
  saveOrderCancelledTradeAction,
  saveOrderCreatedTradeAction,
  saveOrderFrozenTradeAction,
  saveOrderUpdatedTradeAction,
  savePositionDecreaseExecutedTradeAction,
  savePositionIncreaseExecutedTradeAction,
  saveSwapExecutedTradeAction,
} from "../entities/trades";
import { saveUserStat } from "../entities/user";
import { saveUserGmTokensBalanceChange } from "../entities/userBalance";
import { savePositionVolumeInfo, saveSwapVolumeInfo, saveVolumeInfo } from "../entities/volume";

// Structural shape of the generic EventLog/1/2 events (only the fields the
// dispatchers use). Concrete event types from both EventEmitter and
// EventEmitterOld are assignable to this.
type AnyEventLog = {
  readonly chainId: number;
  readonly logIndex: number;
  readonly srcAddress: string;
  readonly block: { readonly number: number; readonly timestamp: number; readonly hash: string };
  readonly transaction: {
    readonly hash: string;
    readonly transactionIndex: number;
    readonly from?: string;
    readonly to?: string;
  };
  readonly params: { readonly eventName: string; readonly eventData: RawEventData };
};

function isDepositOrWithdrawalAction(action: string): boolean {
  return action == "deposit" || action == "withdrawal";
}

// ----------------------------- EventLog -----------------------------

async function dispatchEventLog(event: AnyEventLog, context: EvmOnEventContext): Promise<void> {
  let eventName = event.params.eventName;
  let eventData = new EventData(event.params.eventData);

  if (eventName == "DepositExecuted") {
    await handleDepositExecuted(event, eventData, context);
    return;
  }
}

// ----------------------------- EventLog1 -----------------------------

async function dispatchEventLog1(event: AnyEventLog, context: EvmOnEventContext): Promise<void> {
  let chainId = event.chainId;
  let eventName = event.params.eventName;
  let eventData = new EventData(event.params.eventData);
  let eventId = getIdFromEvent(event);

  if (eventName == "MarketCreated") {
    await saveMarketInfo(eventData, chainId, context);
    // MarketToken contract registered in contractRegister
    return;
  }

  if (eventName == "GlvCreated") {
    // GlvToken contract registered in contractRegister
    return;
  }

  if (eventName == "DepositCreated") {
    await handleDepositCreated(event, eventData, context);
    return;
  }

  if (eventName == "WithdrawalCreated") {
    let transaction = await getOrCreateTransaction(event, context);
    let account = eventData.getAddressItemString("account")!;
    await saveUserStat("withdrawal", account, transaction.timestamp, chainId, context);
    return;
  }

  if (eventName == "OrderExecuted") {
    let transaction = await getOrCreateTransaction(event, context);
    let order = await saveOrderExecutedState(eventData, transaction, chainId, context);

    if (order == null) {
      return;
    }

    if (order.orderType == orderTypes.get("MarketSwap") || order.orderType == orderTypes.get("LimitSwap")) {
      await saveSwapExecutedTradeAction(eventId, order, transaction, chainId, context);
    } else if (
      order.orderType == orderTypes.get("MarketIncrease") ||
      order.orderType == orderTypes.get("LimitIncrease") ||
      order.orderType == orderTypes.get("StopIncrease")
    ) {
      await savePositionIncreaseExecutedTradeAction(eventId, order, transaction, chainId, context);
    } else if (
      order.orderType == orderTypes.get("MarketDecrease") ||
      order.orderType == orderTypes.get("LimitDecrease") ||
      order.orderType == orderTypes.get("StopLossDecrease") ||
      order.orderType == orderTypes.get("Liquidation")
    ) {
      await savePositionDecreaseExecutedTradeAction(eventId, order, transaction, chainId, context);
    }
    return;
  }

  if (eventName == "OrderCancelled") {
    let transaction = await getOrCreateTransaction(event, context);
    let order = await saveOrderCancelledState(eventData, transaction, chainId, context);
    if (order !== null) {
      await saveOrderCancelledTradeAction(
        eventId,
        order,
        order.cancelledReason as string,
        order.cancelledReasonBytes as string,
        transaction,
        chainId,
        context
      );
    }

    return;
  }

  if (eventName == "OrderUpdated") {
    let transaction = await getOrCreateTransaction(event, context);
    let order = await saveOrderUpdate(eventData, chainId, context);
    if (order !== null) {
      await saveOrderUpdatedTradeAction(eventId, order, transaction, chainId, context);
    }

    return;
  }

  if (eventName == "OrderFrozen") {
    let transaction = await getOrCreateTransaction(event, context);
    let order = await saveOrderFrozenState(eventData, chainId, context);

    if (order == null) {
      return;
    }

    await saveOrderFrozenTradeAction(
      eventId,
      order,
      order.frozenReason as string,
      order.frozenReasonBytes as string,
      transaction,
      chainId,
      context
    );
    return;
  }

  if (eventName == "OrderSizeDeltaAutoUpdated") {
    await saveOrderSizeDeltaAutoUpdate(eventData, chainId, context);
    return;
  }

  if (eventName == "OrderCollateralDeltaAmountAutoUpdated") {
    await saveOrderCollateralAutoUpdate(eventData, chainId, context);
    return;
  }

  if (eventName == "SwapInfo") {
    let transaction = await getOrCreateTransaction(event, context);
    let tokenIn = eventData.getAddressItemString("tokenIn")!;
    let tokenOut = eventData.getAddressItemString("tokenOut")!;
    let amountIn = eventData.getUintItem("amountIn")!;
    let tokenInPrice = eventData.getUintItem("tokenInPrice")!;
    let volumeUsd = amountIn * tokenInPrice;
    let receiver = eventData.getAddressItemString("receiver")!;

    saveSwapInfo(eventData, transaction, chainId, context);
    await saveSwapVolumeInfo(transaction.timestamp, tokenIn, tokenOut, volumeUsd, chainId, context);

    let orderKey = eventData.getBytes32Item("orderKey")!;
    if (orderKey != "0x0000000000000000000000000000000000000000000000000000000000000000") {
      await saveUserStat("swap", receiver, transaction.timestamp, chainId, context);
    }
    return;
  }

  if (eventName == "SwapFeesCollected") {
    let transaction = await getOrCreateTransaction(event, context);
    let swapFeesInfo = saveSwapFeesInfo(eventData, eventId, transaction, context);
    let tokenPrice = eventData.getUintItem("tokenPrice")!;
    let feeReceiverAmount = eventData.getUintItem("feeReceiverAmount")!;
    let feeAmountForPool = eventData.getUintItem("feeAmountForPool")!;
    let amountAfterFees = eventData.getUintItem("amountAfterFees")!;
    let action = getSwapActionByFeeType(swapFeesInfo.swapFeeType);
    let totalAmountIn = amountAfterFees + feeAmountForPool + feeReceiverAmount;
    let volumeUsd = totalAmountIn * tokenPrice;
    let poolValue = await getMarketPoolValueFromContract(swapFeesInfo.marketAddress, chainId, transaction, context);
    // only deposits and withdrawals affect marketTokensSupply, for others we may use cached value
    let marketTokensSupply = isDepositOrWithdrawalAction(action)
      ? await getMarketTokensSupplyFromContract(swapFeesInfo.marketAddress, chainId, transaction.blockNumber, context)
      : (await getMarketInfo(swapFeesInfo.marketAddress, chainId, context)).marketTokensSupply;

    await saveCollectedMarketFees(
      transaction,
      swapFeesInfo.marketAddress,
      poolValue,
      swapFeesInfo.feeUsdForPool,
      marketTokensSupply,
      chainId,
      context
    );
    await saveVolumeInfo(action, transaction.timestamp, volumeUsd, chainId, context);
    await saveSwapFeesInfoWithPeriod(feeAmountForPool, feeReceiverAmount, tokenPrice, transaction.timestamp, chainId, context);
    return;
  }

  // Only for liquidations if remaining collateral is not sufficient to pay the fees
  if (eventName == "PositionFeesInfo") {
    let transaction = await getOrCreateTransaction(event, context);
    savePositionFeesInfo(eventData, "PositionFeesInfo", transaction, chainId, context);
    return;
  }

  if (eventName == "PositionFeesCollected") {
    let transaction = await getOrCreateTransaction(event, context);
    let positionFeeAmount = eventData.getUintItem("positionFeeAmount")!;
    let positionFeeAmountForPool = eventData.getUintItem("positionFeeAmountForPool")!;
    let collateralTokenPriceMin = eventData.getUintItem("collateralTokenPrice.min")!;
    let liquidationFeeAmount = eventData.getUintItem("liquidationFeeAmount")!;
    let borrowingFeeUsd = eventData.getUintItem("borrowingFeeUsd")!;
    let positionFeesInfo = savePositionFeesInfo(eventData, "PositionFeesCollected", transaction, chainId, context);
    let poolValue = await getMarketPoolValueFromContract(positionFeesInfo.marketAddress, chainId, transaction, context);
    let marketInfo = await getMarketInfo(positionFeesInfo.marketAddress, chainId, context);

    await saveCollectedMarketFees(
      transaction,
      positionFeesInfo.marketAddress,
      poolValue,
      positionFeesInfo.feeUsdForPool,
      marketInfo.marketTokensSupply,
      chainId,
      context
    );
    await savePositionFeesInfoWithPeriod(
      positionFeeAmount,
      positionFeeAmountForPool,
      liquidationFeeAmount,
      borrowingFeeUsd,
      collateralTokenPriceMin,
      transaction.timestamp,
      chainId,
      context
    );

    await saveTradingIncentivesStat(
      eventData.getAddressItemString("trader")!,
      event.block.timestamp,
      positionFeeAmount,
      collateralTokenPriceMin,
      chainId,
      context
    );
    return;
  }

  if (eventName == "PositionIncrease") {
    let transaction = await getOrCreateTransaction(event, context);
    let collateralToken = eventData.getAddressItemString("collateralToken")!;
    let marketToken = eventData.getAddressItemString("market")!;
    let sizeDeltaUsd = eventData.getUintItem("sizeDeltaUsd")!;
    let account = eventData.getAddressItemString("account")!;

    savePositionIncrease(eventData, transaction, chainId, context);
    await saveVolumeInfo("margin", transaction.timestamp, sizeDeltaUsd, chainId, context);
    await savePositionVolumeInfo(transaction.timestamp, collateralToken, marketToken, sizeDeltaUsd, chainId, context);
    await saveUserStat("margin", account, transaction.timestamp, chainId, context);
    return;
  }

  if (eventName == "PositionDecrease") {
    let transaction = await getOrCreateTransaction(event, context);
    let collateralToken = eventData.getAddressItemString("collateralToken")!;
    let marketToken = eventData.getAddressItemString("market")!;
    let sizeDeltaUsd = eventData.getUintItem("sizeDeltaUsd")!;
    let account = eventData.getAddressItemString("account")!;

    savePositionDecrease(eventData, transaction, chainId, context);
    await saveVolumeInfo("margin", transaction.timestamp, sizeDeltaUsd, chainId, context);
    await savePositionVolumeInfo(transaction.timestamp, collateralToken, marketToken, sizeDeltaUsd, chainId, context);
    await saveUserStat("margin", account, transaction.timestamp, chainId, context);
    return;
  }

  if (eventName == "FundingFeesClaimed") {
    let transaction = await getOrCreateTransaction(event, context);
    await handleCollateralClaimAction("ClaimFunding", eventData, transaction, chainId, context);
    return;
  }

  if (eventName == "CollateralClaimed") {
    let transaction = await getOrCreateTransaction(event, context);
    await handleCollateralClaimAction("ClaimPriceImpact", eventData, transaction, chainId, context);
    await handleCollateralClaimed(eventData, chainId, context);
    return;
  }

  if (eventName == "ClaimableFundingUpdated") {
    let transaction = await getOrCreateTransaction(event, context);
    await handleClaimableFundingUpdated(eventData, transaction, chainId, context);
    return;
  }

  if (eventName == "MarketPoolValueUpdated") {
    // `saveMarketIncentivesStat` should be called before `MarketPoolInfo` entity is updated
    await saveMarketIncentivesStat(eventData, event.block.timestamp, chainId, context);
    await saveMarketInfoMarketTokensSupplyFromPoolUpdated(
      eventData.getAddressItemString("market")!,
      eventData.getUintItemOrNull("marketTokensSupply"),
      chainId,
      context
    );
    return;
  }

  if (eventName == "PositionImpactPoolDistributed") {
    let transaction = await getOrCreateTransaction(event, context);
    await handlePositionImpactPoolDistributed(eventData, transaction, chainId, context);
    return;
  }

  if (eventName == "OraclePriceUpdate") {
    await handleOraclePriceUpdate(eventData, chainId, context);
    return;
  }

  if (eventName == "ClaimableCollateralUpdated") {
    await handleClaimableCollateralUpdated(eventData, chainId, context);
    return;
  }
}

// ----------------------------- EventLog2 -----------------------------

async function dispatchEventLog2(event: AnyEventLog, context: EvmOnEventContext): Promise<void> {
  let chainId = event.chainId;
  let eventName = event.params.eventName;
  let eventData = new EventData(event.params.eventData);
  let eventId = getIdFromEvent(event);

  if (eventName == "OrderCreated") {
    let transaction = await getOrCreateTransaction(event, context);
    let order = await saveOrder(eventData, transaction, chainId, context);
    if (isFundingFeeSettleOrder(order)) {
      await saveClaimActionOnOrderCreated(transaction, eventData, chainId, context);
    } else {
      await saveOrderCreatedTradeAction(eventId, order, transaction, chainId, context);
    }
    return;
  }

  if (eventName == "SetClaimableCollateralFactorForTime") {
    await handleSetClaimableCollateralFactorForTime(eventData, chainId, context);
    return;
  }

  if (eventName == "SetClaimableCollateralFactorForAccount") {
    await handleSetClaimableCollateralFactorForAccount(eventData, chainId, context);
    return;
  }

  if (eventName == "DepositCreated") {
    await handleDepositCreated(event, eventData, context);
    return;
  }

  if (eventName == "DepositExecuted") {
    await handleDepositExecuted(event, eventData, context);
    return;
  }

  if (eventName == "WithdrawalCreated") {
    let transaction = await getOrCreateTransaction(event, context);
    let account = eventData.getAddressItemString("account")!;
    await saveUserStat("withdrawal", account, transaction.timestamp, chainId, context);
    return;
  }

  if (eventName == "OrderExecuted") {
    let transaction = await getOrCreateTransaction(event, context);
    let order = await saveOrderExecutedState(eventData, transaction, chainId, context);

    if (order == null) {
      return;
    }

    if (order.orderType == orderTypes.get("MarketSwap") || order.orderType == orderTypes.get("LimitSwap")) {
      await saveSwapExecutedTradeAction(eventId, order, transaction, chainId, context);
    } else if (
      order.orderType == orderTypes.get("MarketIncrease") ||
      order.orderType == orderTypes.get("LimitIncrease") ||
      order.orderType == orderTypes.get("StopIncrease")
    ) {
      await savePositionIncreaseExecutedTradeAction(eventId, order, transaction, chainId, context);
    } else if (
      order.orderType == orderTypes.get("MarketDecrease") ||
      order.orderType == orderTypes.get("LimitDecrease") ||
      order.orderType == orderTypes.get("StopLossDecrease") ||
      order.orderType == orderTypes.get("Liquidation")
    ) {
      if (await context.ClaimRef.get(order.id)) {
        await saveClaimActionOnOrderExecuted(transaction, eventData, chainId, context);
      } else {
        await savePositionDecreaseExecutedTradeAction(eventId, order, transaction, chainId, context);
      }
    }
    return;
  }

  if (eventName == "OrderCancelled") {
    let transaction = await getOrCreateTransaction(event, context);
    let order = await saveOrderCancelledState(eventData, transaction, chainId, context);
    if (order !== null) {
      if (await context.ClaimRef.get(order.id)) {
        await saveClaimActionOnOrderCancelled(transaction, eventData, chainId, context);
      } else {
        await saveOrderCancelledTradeAction(
          eventId,
          order,
          order.cancelledReason as string,
          order.cancelledReasonBytes as string,
          transaction,
          chainId,
          context
        );
      }
    }

    return;
  }

  if (eventName == "OrderUpdated") {
    let transaction = await getOrCreateTransaction(event, context);
    let order = await saveOrderUpdate(eventData, chainId, context);
    if (order !== null) {
      await saveOrderUpdatedTradeAction(eventId, order, transaction, chainId, context);
    }

    return;
  }

  if (eventName == "OrderFrozen") {
    let transaction = await getOrCreateTransaction(event, context);
    let order = await saveOrderFrozenState(eventData, chainId, context);

    if (order == null) {
      return;
    }

    await saveOrderFrozenTradeAction(
      eventId,
      order,
      order.frozenReason as string,
      order.frozenReasonBytes as string,
      transaction,
      chainId,
      context
    );
    return;
  }
}

// ----------------------------- shared deposit helpers -----------------------------

async function handleDepositCreated(event: AnyEventLog, eventData: EventData, context: EvmOnEventContext): Promise<void> {
  let chainId = event.chainId;
  let transaction = await getOrCreateTransaction(event, context);
  let account = eventData.getAddressItemString("account")!;
  await saveUserStat("deposit", account, transaction.timestamp, chainId, context);

  let key = eventData.getBytes32Item("key")!;
  context.DepositRef.set({
    id: `${chainId}-${key}`,
    marketAddress: eventData.getAddressItemString("market")!,
    // old DepositCreated event does not contain "account"
    account: eventData.getAddressItemString("account")!,
  });
}

async function handleDepositExecuted(event: AnyEventLog, eventData: EventData, context: EvmOnEventContext): Promise<void> {
  let chainId = event.chainId;
  let key = eventData.getBytes32Item("key")!;
  let depositRef = (await context.DepositRef.get(`${chainId}-${key}`))!;
  let marketInfo = (await context.MarketInfo.get(`${chainId}-${depositRef.marketAddress}`))!;

  let longTokenAmount = eventData.getUintItem("longTokenAmount")!;
  let longTokenPrice = await getTokenPrice(marketInfo.longToken, chainId, context);

  let shortTokenAmount = eventData.getUintItem("shortTokenAmount")!;
  let shortTokenPrice = await getTokenPrice(marketInfo.shortToken, chainId, context);

  let depositUsd = longTokenAmount * longTokenPrice + shortTokenAmount * shortTokenPrice;
  await saveUserGlpGmMigrationStatGmData(depositRef.account, event.block.timestamp, depositUsd, chainId, context);
}

// ----------------------------- contractRegister (templates) -----------------------------

function registerTemplatesEventLog1(event: AnyEventLog, context: EvmContractRegisterContext): void {
  let eventName = event.params.eventName;
  let eventData = new EventData(event.params.eventData);

  if (eventName == "MarketCreated") {
    let marketToken = eventData.getAddressItem("marketToken");
    if (marketToken) {
      context.chain.MarketToken.add(marketToken as `0x${string}`);
    }
    return;
  }

  if (eventName == "GlvCreated") {
    let glvToken = eventData.getAddressItem("glvToken");
    if (!glvToken) {
      // for fuji
      glvToken = eventData.getAddressItem("glv");
    }
    if (glvToken) {
      context.chain.GlvToken.add(glvToken as `0x${string}`);
    }
    return;
  }
}

// ----------------------------- registrations -----------------------------
// Registered for both the current EventEmitter and the legacy EventEmitterOld
// (fuji / arbitrum-goerli), which share the same ABI and dispatch logic.

indexer.onEvent({ contract: "EventEmitter", event: "EventLog" }, async ({ event, context }) => {
  await dispatchEventLog(event, context);
});
indexer.contractRegister({ contract: "EventEmitter", event: "EventLog1" }, async ({ event, context }) => {
  registerTemplatesEventLog1(event, context);
});
indexer.onEvent({ contract: "EventEmitter", event: "EventLog1" }, async ({ event, context }) => {
  await dispatchEventLog1(event, context);
});
indexer.onEvent({ contract: "EventEmitter", event: "EventLog2" }, async ({ event, context }) => {
  await dispatchEventLog2(event, context);
});

indexer.onEvent({ contract: "EventEmitterOld", event: "EventLog" }, async ({ event, context }) => {
  await dispatchEventLog(event, context);
});
indexer.contractRegister({ contract: "EventEmitterOld", event: "EventLog1" }, async ({ event, context }) => {
  registerTemplatesEventLog1(event, context);
});
indexer.onEvent({ contract: "EventEmitterOld", event: "EventLog1" }, async ({ event, context }) => {
  await dispatchEventLog1(event, context);
});
indexer.onEvent({ contract: "EventEmitterOld", event: "EventLog2" }, async ({ event, context }) => {
  await dispatchEventLog2(event, context);
});
