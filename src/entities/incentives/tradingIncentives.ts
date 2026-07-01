// Ported from gmx-subgraph/synthetics-stats/src/entities/incentives/tradingIncentives.ts
import type { EvmOnEventContext, TradingIncentivesStat, UserTradingIncentivesStat } from "envio";
import type { Mutable } from "../../utils/types";
import { periodToSeconds, timestampToPeriodStart } from "../../utils/time";
import { ZERO, expandDecimals } from "../../utils/number";
import { convertAmountToUsd, convertUsdToAmount } from "../prices";

const SECONDS_IN_WEEK = periodToSeconds("1w");

const INCENTIVES_START_TIMESTAMP = 1700006400; // 2023-11-15 00:00:00

const REBATE_PERCENT = 7500n;

function _getRebatesCapForEpoch(timestamp: number): bigint {
  // no caps
  return expandDecimals(100_000_000n, 18);
}

function _getEpochIndexSinceIncentivesStart(timestamp: number): number {
  return Math.floor((timestamp - INCENTIVES_START_TIMESTAMP) / SECONDS_IN_WEEK);
}

function _incentivesActive(timestamp: number): boolean {
  return timestamp > INCENTIVES_START_TIMESTAMP;
}

function _getArbTokenAddress(): string {
  return "0x912ce59144191c1204e64559fe8253a0e49e6548";
}

class CappedPositionFeesResult {
  constructor(public usd: bigint, public inArb: bigint) {}
}

async function _getEligibleFees(
  positionFeesUsd: bigint,
  positionFeesInArb: bigint,
  globalEligibleFeesInArb: bigint,
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<CappedPositionFeesResult> {
  let REBATES_CAP_FOR_EPOCH_IN_ARB = _getRebatesCapForEpoch(timestamp);

  let eligibleFeesUsd = (positionFeesUsd * REBATE_PERCENT) / 10000n;
  let eligibleFeesInArb = (positionFeesInArb * REBATE_PERCENT) / 10000n;

  if (globalEligibleFeesInArb + eligibleFeesInArb > REBATES_CAP_FOR_EPOCH_IN_ARB) {
    eligibleFeesInArb = REBATES_CAP_FOR_EPOCH_IN_ARB - globalEligibleFeesInArb;
    eligibleFeesUsd = await convertAmountToUsd(_getArbTokenAddress(), eligibleFeesInArb, chainId, context);
  }

  return new CappedPositionFeesResult(eligibleFeesUsd, eligibleFeesInArb);
}

export async function saveTradingIncentivesStat(
  account: string,
  timestamp: number,
  feesAmount: bigint,
  collateralTokenPrice: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  if (!_incentivesActive(timestamp)) {
    return;
  }

  let positionFeesUsd = feesAmount * collateralTokenPrice;
  let positionFeesInArb = await convertUsdToAmount(_getArbTokenAddress(), positionFeesUsd, chainId, context);
  let globalEntity = await _getOrCreateTradingIncentivesStat(timestamp, chainId, context);
  let eligibleFees = await _getEligibleFees(
    positionFeesUsd,
    positionFeesInArb,
    globalEntity.eligibleFeesInArb,
    timestamp,
    chainId,
    context
  );

  globalEntity.positionFeesUsd = globalEntity.positionFeesUsd + positionFeesUsd;
  globalEntity.positionFeesInArb = globalEntity.positionFeesInArb + positionFeesInArb;
  if (eligibleFees.inArb > ZERO) {
    globalEntity.eligibleFeesUsd = globalEntity.eligibleFeesUsd + eligibleFees.usd;
    globalEntity.eligibleFeesInArb = globalEntity.eligibleFeesInArb + eligibleFees.inArb;
  }
  context.TradingIncentivesStat.set(globalEntity);

  let userEntity = await _getOrCreateUserTradingIncentivesStat(account, timestamp, chainId, context);
  userEntity.positionFeesUsd = userEntity.positionFeesUsd + positionFeesUsd;
  userEntity.positionFeesInArb = userEntity.positionFeesInArb + positionFeesInArb;
  if (eligibleFees.inArb > ZERO) {
    userEntity.eligibleFeesInArb = userEntity.eligibleFeesInArb + eligibleFees.inArb;
    userEntity.eligibleFeesUsd = userEntity.eligibleFeesUsd + eligibleFees.usd;
    userEntity.eligibleUpdatedTimestamp = timestamp;
  }
  context.UserTradingIncentivesStat.set(userEntity);
}

async function _getOrCreateUserTradingIncentivesStat(
  account: string,
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<UserTradingIncentivesStat>> {
  let period = "1w";
  let startTimestamp = timestampToPeriodStart(timestamp, period);
  let id = `${chainId}-${account}:${period}:${startTimestamp.toString()}`;
  let entity = await context.UserTradingIncentivesStat.get(id);
  if (entity == null) {
    return {
      id,
      period: period,
      timestamp: startTimestamp,
      account: account,
      positionFeesUsd: ZERO,
      positionFeesInArb: ZERO,
      eligibleFeesInArb: ZERO,
      eligibleFeesUsd: ZERO,
      eligibleUpdatedTimestamp: 0,
    };
  }
  return { ...entity };
}

async function _getOrCreateTradingIncentivesStat(
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<TradingIncentivesStat>> {
  let period = "1w";
  let startTimestamp = timestampToPeriodStart(timestamp, period);
  let id = `${chainId}-${period}:${startTimestamp.toString()}`;
  let entity = await context.TradingIncentivesStat.get(id);
  if (entity == null) {
    return {
      id,
      period: period,
      timestamp: startTimestamp,
      positionFeesUsd: ZERO,
      positionFeesInArb: ZERO,
      eligibleFeesInArb: ZERO,
      eligibleFeesUsd: ZERO,
      rebatesCapInArb: _getRebatesCapForEpoch(timestamp),
    };
  }
  return { ...entity };
}
