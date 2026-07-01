// Ported from gmx-subgraph/synthetics-stats/src/entities/fees.ts
import type {
  EvmOnEventContext,
  CollectedMarketFeesInfo,
  PositionFeesInfo,
  PositionFeesInfoWithPeriod,
  SwapFeesInfo,
  SwapFeesInfoWithPeriod,
  Transaction,
} from "envio";
import type { Mutable } from "../utils/types";
import { getMarketPoolValueFromContract } from "../contracts/getMarketPoolValueFromContract";
import { getMarketTokensSupplyFromContract } from "../contracts/getMarketTokensSupplyFromContract";
import { EventData } from "../utils/eventData";
import { PositionImpactPoolDistributedEventData } from "../utils/eventData/PositionImpactPoolDistributedEventData";
import { timestampToPeriodStart } from "../utils/time";
import { getTokenPrice } from "./prices";

export const swapFeeTypes = new Map<string, string>();

const ZERO = 0n;

swapFeeTypes.set("SWAP_FEE_TYPE", "0x7ad0b6f464d338ea140ff9ef891b4a69cf89f107060a105c31bb985d9e532214");
swapFeeTypes.set("DEPOSIT_FEE_TYPE", "0x39226eb4fed85317aa310fa53f734c7af59274c49325ab568f9c4592250e8cc5");
swapFeeTypes.set("WITHDRAWAL_FEE_TYPE", "0xda1ac8fcb4f900f8ab7c364d553e5b6b8bdc58f74160df840be80995056f3838");
swapFeeTypes.set("ATOMIC_SWAP_FEE_TYPE", "0x0715366437cc1f9a874eb5c6cd8111dcbea3677598c568f8b8d013d6c4380688");

export function getSwapActionByFeeType(swapFeeType: string): string {
  if (swapFeeType == swapFeeTypes.get("SWAP_FEE_TYPE") || swapFeeType == swapFeeTypes.get("ATOMIC_SWAP_FEE_TYPE")) {
    return "swap";
  }

  if (swapFeeType == swapFeeTypes.get("DEPOSIT_FEE_TYPE")) {
    return "deposit";
  }

  if (swapFeeType == swapFeeTypes.get("WITHDRAWAL_FEE_TYPE")) {
    return "withdrawal";
  }

  throw new Error("Unknown swap fee type: " + swapFeeType);
}

function updateCollectedFeesFractions(
  poolValue: bigint,
  feesEntity: Mutable<CollectedMarketFeesInfo>,
  totalFeesEntity: CollectedMarketFeesInfo,
  feeUsdForPool: bigint,
  marketTokensSupply: bigint,
  prevCumulativeFeeUsdPerGmToken: bigint
): void {
  feesEntity.feeUsdPerPoolValue = getUpdatedFeeUsdPerPoolValue(feesEntity, feeUsdForPool, poolValue);
  feesEntity.cumulativeFeeUsdPerPoolValue = totalFeesEntity.feeUsdPerPoolValue;

  feesEntity.feeUsdPerGmToken = getUpdatedFeeUsdPerGmToken(feesEntity, feeUsdForPool, marketTokensSupply);
  feesEntity.prevCumulativeFeeUsdPerGmToken = prevCumulativeFeeUsdPerGmToken;
  feesEntity.cumulativeFeeUsdPerGmToken = totalFeesEntity.feeUsdPerGmToken;
}

export function saveSwapFeesInfo(
  eventData: EventData,
  eventId: string,
  transaction: Transaction,
  context: EvmOnEventContext
): SwapFeesInfo {
  let tokenPrice = eventData.getUintItem("tokenPrice")!;
  let swapFeeType = eventData.getBytes32Item("swapFeeType");

  let swapFeeTypeValue = "";
  if (swapFeeType != null) {
    swapFeeTypeValue = swapFeeType;
  } else {
    let action = eventData.getStringItem("action");

    if (action == "deposit") {
      swapFeeTypeValue = swapFeeTypes.get("DEPOSIT_FEE_TYPE")!;
    } else if (action == "withdrawal") {
      swapFeeTypeValue = swapFeeTypes.get("WITHDRAWAL_FEE_TYPE")!;
    } else if (action == "swap") {
      swapFeeTypeValue = swapFeeTypes.get("SWAP_FEE_TYPE")!;
    }
  }

  let swapFeesInfo: SwapFeesInfo = {
    id: eventId,
    marketAddress: eventData.getAddressItemString("market")!,
    tokenAddress: eventData.getAddressItemString("token")!,
    swapFeeType: swapFeeTypeValue,
    tokenPrice: tokenPrice,
    feeReceiverAmount: eventData.getUintItem("feeReceiverAmount")!,
    feeUsdForPool: eventData.getUintItem("feeAmountForPool")! * tokenPrice,
    transaction_id: transaction.id,
  };

  context.SwapFeesInfo.set(swapFeesInfo);

  return swapFeesInfo;
}

export function savePositionFeesInfo(
  eventData: EventData,
  eventName: string,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): PositionFeesInfo {
  let orderKey = eventData.getBytes32Item("orderKey")!;

  let id = `${chainId}-${orderKey}:${eventName}`;

  let collateralTokenPriceMin = eventData.getUintItem("collateralTokenPrice.min")!;

  let feesInfo: PositionFeesInfo = {
    id,
    orderKey: orderKey,
    eventName: eventName,
    marketAddress: eventData.getAddressItemString("market")!,
    collateralTokenAddress: eventData.getAddressItemString("collateralToken")!,
    trader: eventData.getAddressItemString("trader")!,
    affiliate: eventData.getAddressItemString("affiliate")!,
    collateralTokenPriceMin: collateralTokenPriceMin,
    collateralTokenPriceMax: eventData.getUintItem("collateralTokenPrice.max")!,
    positionFeeAmount: eventData.getUintItem("positionFeeAmount")!,
    borrowingFeeAmount: eventData.getUintItem("borrowingFeeAmount")!,
    fundingFeeAmount: eventData.getUintItem("fundingFeeAmount")!,
    liquidationFeeAmount: eventData.getUintItemOrNull("liquidationFeeAmount") ?? undefined,
    feeUsdForPool: eventData.getUintItem("feeAmountForPool")! * collateralTokenPriceMin,
    totalRebateAmount: eventData.getUintItem("totalRebateAmount")!,
    totalRebateFactor: eventData.getUintItem("totalRebateFactor")!,
    traderDiscountAmount: eventData.getUintItem("traderDiscountAmount")!,
    affiliateRewardAmount: eventData.getUintItem("affiliateRewardAmount")!,
    transaction_id: transaction.id,
  };

  context.PositionFeesInfo.set(feesInfo);

  return feesInfo;
}

export async function getOrCreateCollectedMarketFees(
  marketAddress: string,
  timestamp: number,
  period: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<CollectedMarketFeesInfo>> {
  let timestampGroup = timestampToPeriodStart(timestamp, period);

  let rawId = marketAddress + ":" + period;

  if (period != "total") {
    rawId = rawId + ":" + timestampGroup.toString();
  }

  let id = `${chainId}-${rawId}`;
  let collectedFees = await context.CollectedMarketFeesInfo.get(id);

  if (collectedFees == null) {
    return {
      id,
      marketAddress: marketAddress,
      period: period,
      timestampGroup: timestampGroup,
      feeUsdForPool: ZERO,
      cummulativeFeeUsdForPool: ZERO,
      feeUsdPerPoolValue: ZERO,
      cumulativeFeeUsdPerPoolValue: ZERO,
      feeUsdPerGmToken: ZERO,
      cumulativeFeeUsdPerGmToken: ZERO,
      prevCumulativeFeeUsdPerGmToken: ZERO,
    };
  }

  return { ...collectedFees };
}

export async function saveSwapFeesInfoWithPeriod(
  feeAmountForPool: bigint,
  feeReceiverAmount: bigint,
  tokenPrice: bigint,
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let dailyTimestampGroup = timestampToPeriodStart(timestamp, "1d");
  let dailyId = dailyTimestampGroup.toString();

  let dailyFees = await getOrCreateSwapFeesInfoWithPeriod(dailyId, "1d", chainId, context);
  let totalFees = await getOrCreateSwapFeesInfoWithPeriod("total", "total", chainId, context);

  let feeUsdForPool = feeAmountForPool * tokenPrice;
  let feeReceiverUsd = feeReceiverAmount * tokenPrice;

  dailyFees.totalFeeUsdForPool = dailyFees.totalFeeUsdForPool + feeUsdForPool;
  dailyFees.totalFeeReceiverUsd = dailyFees.totalFeeReceiverUsd + feeReceiverUsd;
  totalFees.totalFeeUsdForPool = totalFees.totalFeeUsdForPool + feeUsdForPool;
  totalFees.totalFeeReceiverUsd = totalFees.totalFeeReceiverUsd + feeReceiverUsd;

  context.SwapFeesInfoWithPeriod.set(dailyFees);
  context.SwapFeesInfoWithPeriod.set(totalFees);
}

export async function savePositionFeesInfoWithPeriod(
  positionFeeAmount: bigint,
  positionFeeAmountForPool: bigint,
  liquidationFeeAmount: bigint,
  borrowingFeeUsd: bigint,
  tokenPrice: bigint,
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let dailyTimestampGroup = timestampToPeriodStart(timestamp, "1d");
  let dailyId = dailyTimestampGroup.toString();

  let dailyFees = await getOrCreatePositionFeesInfoWithPeriod(dailyId, "1d", chainId, context);
  let totalFees = await getOrCreatePositionFeesInfoWithPeriod("total", "total", chainId, context);

  let positionFeeUsd = positionFeeAmount * tokenPrice;
  let positionFeeUsdForPool = positionFeeAmountForPool * tokenPrice;

  let liquidationFeeUsd = liquidationFeeAmount * tokenPrice;

  dailyFees.totalBorrowingFeeUsd = dailyFees.totalBorrowingFeeUsd + borrowingFeeUsd;
  dailyFees.totalPositionFeeAmount = dailyFees.totalPositionFeeAmount + positionFeeAmount;
  dailyFees.totalPositionFeeUsd = dailyFees.totalPositionFeeUsd + positionFeeUsd;
  dailyFees.totalPositionFeeAmountForPool = dailyFees.totalPositionFeeAmountForPool + positionFeeAmountForPool;
  dailyFees.totalPositionFeeUsdForPool = dailyFees.totalPositionFeeUsdForPool + positionFeeUsdForPool;

  dailyFees.totalLiquidationFeeAmount = dailyFees.totalLiquidationFeeAmount + liquidationFeeAmount;
  dailyFees.totalLiquidationFeeUsd = dailyFees.totalLiquidationFeeUsd + liquidationFeeUsd;

  totalFees.totalBorrowingFeeUsd = totalFees.totalBorrowingFeeUsd + borrowingFeeUsd;
  totalFees.totalPositionFeeAmount = totalFees.totalPositionFeeAmount + positionFeeAmount;
  totalFees.totalPositionFeeUsd = totalFees.totalPositionFeeUsd + positionFeeUsd;
  totalFees.totalPositionFeeAmountForPool = totalFees.totalPositionFeeAmountForPool + positionFeeAmountForPool;
  totalFees.totalPositionFeeUsdForPool = totalFees.totalPositionFeeUsdForPool + positionFeeUsdForPool;

  totalFees.totalLiquidationFeeAmount = totalFees.totalLiquidationFeeAmount + liquidationFeeAmount;
  totalFees.totalLiquidationFeeUsd = totalFees.totalLiquidationFeeUsd + liquidationFeeUsd;

  context.PositionFeesInfoWithPeriod.set(dailyFees);
  context.PositionFeesInfoWithPeriod.set(totalFees);
}

async function getOrCreateSwapFeesInfoWithPeriod(
  rawId: string,
  period: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<SwapFeesInfoWithPeriod>> {
  let id = `${chainId}-${rawId}`;
  let feeInfo = await context.SwapFeesInfoWithPeriod.get(id);

  if (feeInfo == null) {
    return {
      id,
      period: period,
      totalFeeUsdForPool: ZERO,
      totalFeeReceiverUsd: ZERO,
    };
  }

  return { ...feeInfo };
}

async function getOrCreatePositionFeesInfoWithPeriod(
  rawId: string,
  period: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<PositionFeesInfoWithPeriod>> {
  let id = `${chainId}-${rawId}`;
  let feeInfo = await context.PositionFeesInfoWithPeriod.get(id);

  if (feeInfo == null) {
    return {
      id,
      period: period,
      totalBorrowingFeeUsd: ZERO,
      totalPositionFeeAmount: ZERO,
      totalPositionFeeUsd: ZERO,
      totalPositionFeeAmountForPool: ZERO,
      totalPositionFeeUsdForPool: ZERO,
      totalLiquidationFeeAmount: ZERO,
      totalLiquidationFeeUsd: ZERO,
    };
  }

  return { ...feeInfo };
}

export async function saveCollectedMarketFees(
  transaction: Transaction,
  marketAddress: string,
  poolValue: bigint,
  feeUsdForPool: bigint,
  marketTokensSupply: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  // total should always come first, as its cumulativeFeeUsdPerPoolValue is used in pending fees iteration
  let totalFees = await getOrCreateCollectedMarketFees(marketAddress, transaction.timestamp, "total", chainId, context);
  totalFees.cummulativeFeeUsdForPool = totalFees.cummulativeFeeUsdForPool + feeUsdForPool;

  let prevCumulativeFeeUsdPerGmToken = totalFees.cumulativeFeeUsdPerGmToken;

  updateCollectedFeesFractions(
    poolValue,
    totalFees,
    totalFees,
    feeUsdForPool,
    marketTokensSupply,
    prevCumulativeFeeUsdPerGmToken
  );

  totalFees.feeUsdForPool = totalFees.feeUsdForPool + feeUsdForPool;
  context.CollectedMarketFeesInfo.set(totalFees);

  let feesFor1hPeriod = await getOrCreateCollectedMarketFees(marketAddress, transaction.timestamp, "1h", chainId, context);

  updateCollectedFeesFractions(
    poolValue,
    feesFor1hPeriod,
    totalFees,
    feeUsdForPool,
    marketTokensSupply,
    prevCumulativeFeeUsdPerGmToken
  );

  feesFor1hPeriod.cummulativeFeeUsdForPool = totalFees.cummulativeFeeUsdForPool;
  feesFor1hPeriod.feeUsdForPool = feesFor1hPeriod.feeUsdForPool + feeUsdForPool;
  context.CollectedMarketFeesInfo.set(feesFor1hPeriod);

  let feesFor1dPeriod = await getOrCreateCollectedMarketFees(marketAddress, transaction.timestamp, "1d", chainId, context);

  updateCollectedFeesFractions(
    poolValue,
    feesFor1dPeriod,
    totalFees,
    feeUsdForPool,
    marketTokensSupply,
    prevCumulativeFeeUsdPerGmToken
  );

  feesFor1dPeriod.cummulativeFeeUsdForPool = totalFees.cummulativeFeeUsdForPool;
  feesFor1dPeriod.feeUsdForPool = feesFor1dPeriod.feeUsdForPool + feeUsdForPool;
  context.CollectedMarketFeesInfo.set(feesFor1dPeriod);
}

export async function handlePositionImpactPoolDistributed(
  eventData: EventData,
  transaction: Transaction,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let data = new PositionImpactPoolDistributedEventData(eventData);
  let marketInfo = await context.MarketInfo.get(`${chainId}-${data.market}`);

  if (!marketInfo) {
    context.log.warn(`Market not found: ${data.market}`);
    throw new Error("Market not found");
  }

  let indexToken = marketInfo.indexToken;
  let tokenPrice = await getTokenPrice(indexToken, chainId, context);
  let amountUsd = data.distributionAmount * tokenPrice;
  let poolValue = await getMarketPoolValueFromContract(data.market, chainId, transaction, context);
  let marketTokensSupply = await getMarketTokensSupplyFromContract(
    data.market,
    chainId,
    transaction.blockNumber,
    context
  );

  await saveCollectedMarketFees(transaction, data.market, poolValue, amountUsd, marketTokensSupply, chainId, context);
}

function getUpdatedFeeUsdPerPoolValue(feeInfo: CollectedMarketFeesInfo, fee: bigint, poolValue: bigint): bigint {
  if (poolValue == ZERO) {
    return ZERO;
  }

  return feeInfo.feeUsdPerPoolValue + (fee * 10n ** 30n) / poolValue;
}

function getUpdatedFeeUsdPerGmToken(
  feeInfo: CollectedMarketFeesInfo,
  fee: bigint,
  marketTokensSupply: bigint
): bigint {
  if (marketTokensSupply == ZERO) {
    return ZERO;
  }

  return feeInfo.feeUsdPerGmToken + (fee * 10n ** 18n) / marketTokensSupply;
}
