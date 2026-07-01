// Ported from gmx-subgraph/synthetics-stats/src/entities/incentives/liquidityIncentives.ts
import type {
  EvmOnEventContext,
  UserGlpGmMigrationStat,
  LiquidityProviderIncentivesStat,
  IncentivesStat,
  LiquidityProviderInfo,
  GlpGmMigrationStat,
} from "envio";
import type { Mutable } from "../../utils/types";
import { EventData } from "../../utils/eventData";
import { periodToSeconds, timestampToPeriodStart } from "../../utils/time";
import { getMarketInfo } from "../markets";
import { convertAmountToUsd, convertUsdToAmount } from "../prices";
import { ZERO } from "../../utils/number";
import { MarketPoolValueUpdatedEventData } from "../../utils/eventData/MarketPoolValueUpdatedEventData";

type GlvOrMarketType = LiquidityProviderInfo["type"];

const SECONDS_IN_WEEK = periodToSeconds("1w");
const ARB_PRECISION = 10n ** 18n;

const INCENTIVES_START_TIMESTAMP = 1699401600; // 2023-11-08 00:00:00

const GLP_GM_MIGRATION_DECREASE_THRESHOLD_IN_ARB = 100_000_000n * ARB_PRECISION; // 100m ARB
const GLP_GM_MIGRATION_CAP_THRESHOLD_IN_ARB = 200_000_000n * ARB_PRECISION; // 200m ARB

const MAX_FEE_BASIS_POINTS_FOR_REBATE = 25n;
const MAX_FEE_BASIS_POINTS_FOR_REBATE_REDUCED = 10n;

export async function saveLiquidityProviderInfo(
  account: string,
  glvOrMarketAddress: string,
  type: GlvOrMarketType,
  tokensDelta: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let entity = await _getLiquidityProviderInfo(account, glvOrMarketAddress, type, chainId, context);
  entity.tokensBalance = entity.tokensBalance + tokensDelta;

  context.LiquidityProviderInfo.set(entity);
}

export async function saveLiquidityProviderIncentivesStat(
  account: string,
  glvOrMarketAddress: string,
  type: GlvOrMarketType,
  period: string,
  marketTokenBalanceDelta: bigint,
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  if (!_incentivesActive(timestamp)) {
    return;
  }

  let entity = await _getOrCreateLiquidityProviderIncentivesStat(
    account,
    glvOrMarketAddress,
    type,
    period,
    timestamp,
    chainId,
    context
  );

  if (entity.updatedTimestamp == 0) {
    // new entity was created
    let liquidityProviderInfo = await _getLiquidityProviderInfo(account, glvOrMarketAddress, type, chainId, context);

    // interpolate cumulative time x tokensBalance starting from the beginning of the period
    let timeInSeconds = BigInt(timestamp - entity.timestamp);
    entity.cumulativeTimeByTokensBalance = liquidityProviderInfo.tokensBalance * timeInSeconds;
    entity.lastTokensBalance = liquidityProviderInfo.tokensBalance + marketTokenBalanceDelta;
  } else {
    let timeInSeconds = BigInt(timestamp - entity.updatedTimestamp);
    entity.cumulativeTimeByTokensBalance =
      entity.cumulativeTimeByTokensBalance + entity.lastTokensBalance * timeInSeconds;
    entity.lastTokensBalance = entity.lastTokensBalance + marketTokenBalanceDelta;
  }

  let endTimestamp = entity.timestamp + SECONDS_IN_WEEK;
  let extrapolatedTimeByMarketTokensBalance = entity.lastTokensBalance * BigInt(endTimestamp - timestamp);
  entity.weightedAverageTokensBalance =
    (entity.cumulativeTimeByTokensBalance + extrapolatedTimeByMarketTokensBalance) / BigInt(SECONDS_IN_WEEK);
  entity.updatedTimestamp = timestamp;

  context.LiquidityProviderIncentivesStat.set(entity);
}

export async function saveMarketIncentivesStat(
  eventData: EventData,
  blockTimestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  if (!_incentivesActive(blockTimestamp)) {
    return;
  }

  // tracks cumulative product of time and market tokens supply
  // to calculate weighted average supply for the period

  let data = new MarketPoolValueUpdatedEventData(eventData);

  let marketAddress = data.market;
  let entity = await _getOrCreateIncentivesStat(marketAddress, "Market", blockTimestamp, chainId, context);

  if (entity.updatedTimestamp == 0) {
    // new entity was created
    let marketInfo = await getMarketInfo(marketAddress, chainId, context);
    let lastTokensSupply =
      marketInfo.marketTokensSupplyFromPoolUpdated == null
        ? marketInfo.marketTokensSupply
        : marketInfo.marketTokensSupplyFromPoolUpdated;
    // entity.timestamp = timestamp of the start of the week (from wed)
    let timeInSeconds = BigInt(blockTimestamp - entity.timestamp);
    entity.cumulativeTimeByTokensSupply = lastTokensSupply * timeInSeconds;
  } else {
    let timeInSeconds = BigInt(blockTimestamp - entity.updatedTimestamp);
    entity.cumulativeTimeByTokensSupply =
      entity.cumulativeTimeByTokensSupply + entity.lastTokensSupply * timeInSeconds;
  }

  entity.lastTokensSupply = data.marketTokensSupply;
  entity.updatedTimestamp = blockTimestamp;

  let endTimestamp = entity.timestamp + SECONDS_IN_WEEK;
  let extrapolatedTimeByMarketTokensSupply = entity.lastTokensSupply * BigInt(endTimestamp - blockTimestamp);
  entity.weightedAverageTokensSupply =
    (entity.cumulativeTimeByTokensSupply + extrapolatedTimeByMarketTokensSupply) / BigInt(SECONDS_IN_WEEK);

  context.IncentivesStat.set(entity);
}

async function _getMaxFeeBasisPointsForRebate(
  eligibleDiffInArb: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<bigint> {
  let globalEntity = await _getOrCreateGlpGmMigrationStat(chainId, context);
  let eligibleRedemptionInArb = globalEntity.eligibleRedemptionInArb;

  let nextEligibleRedemptionInArb = eligibleRedemptionInArb + eligibleDiffInArb;
  if (!(eligibleRedemptionInArb > GLP_GM_MIGRATION_DECREASE_THRESHOLD_IN_ARB)) {
    if (!(nextEligibleRedemptionInArb > GLP_GM_MIGRATION_DECREASE_THRESHOLD_IN_ARB)) {
      return MAX_FEE_BASIS_POINTS_FOR_REBATE;
    }

    return (
      ((GLP_GM_MIGRATION_DECREASE_THRESHOLD_IN_ARB - eligibleRedemptionInArb) * MAX_FEE_BASIS_POINTS_FOR_REBATE +
        (nextEligibleRedemptionInArb - GLP_GM_MIGRATION_DECREASE_THRESHOLD_IN_ARB) *
          MAX_FEE_BASIS_POINTS_FOR_REBATE_REDUCED) /
      eligibleDiffInArb
    );
  }

  return MAX_FEE_BASIS_POINTS_FOR_REBATE_REDUCED;
}

export async function saveUserGlpGmMigrationStatGlpData(
  account: string,
  timestamp: number,
  usdgAmount: bigint,
  feeBasisPoints: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  if (!_incentivesActive(timestamp)) {
    return;
  }

  let entity = await _getOrCreateUserGlpGmMigrationStatGlpData(account, timestamp, chainId, context);
  let usdAmount = usdgAmount * 10n ** 12n;
  let eligibleDiff = await _getCappedEligibleRedemptionDiff(
    entity.glpRedemptionUsd,
    entity.glpRedemptionUsd + usdAmount,
    entity.gmDepositUsd,
    chainId,
    context
  );

  let maxFeeBasisPointsForRebate = await _getMaxFeeBasisPointsForRebate(eligibleDiff.inArb, chainId, context);
  if (feeBasisPoints > maxFeeBasisPointsForRebate) {
    feeBasisPoints = maxFeeBasisPointsForRebate;
  }

  entity.glpRedemptionUsd = entity.glpRedemptionUsd + usdAmount;
  entity.glpRedemptionFeeBpsByUsd = entity.glpRedemptionFeeBpsByUsd + usdAmount * feeBasisPoints;
  entity.glpRedemptionWeightedAverageFeeBps = Number(entity.glpRedemptionFeeBpsByUsd / entity.glpRedemptionUsd);

  if (eligibleDiff.inArb > ZERO) {
    entity.eligibleRedemptionInArb = entity.eligibleRedemptionInArb + eligibleDiff.inArb;
    entity.eligibleRedemptionUsd = entity.eligibleRedemptionUsd + eligibleDiff.usd;
    entity.eligibleUpdatedTimestamp = timestamp;
  }
  context.UserGlpGmMigrationStat.set(entity);

  await _saveGlpGmMigrationStat(eligibleDiff, chainId, context);
}

export async function saveUserGlpGmMigrationStatGmData(
  account: string,
  timestamp: number,
  depositUsd: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  if (!_incentivesActive(timestamp)) {
    return;
  }

  let entity = await _getOrCreateUserGlpGmMigrationStatGlpData(account, timestamp, chainId, context);
  let eligibleDiff = await _getCappedEligibleRedemptionDiff(
    entity.gmDepositUsd,
    entity.gmDepositUsd + depositUsd,
    entity.glpRedemptionUsd,
    chainId,
    context
  );

  entity.gmDepositUsd = entity.gmDepositUsd + depositUsd;
  if (eligibleDiff.inArb > ZERO) {
    entity.eligibleRedemptionInArb = entity.eligibleRedemptionInArb + eligibleDiff.inArb;
    entity.eligibleRedemptionUsd = entity.eligibleRedemptionUsd + eligibleDiff.usd;
    entity.eligibleUpdatedTimestamp = timestamp;
  }

  context.UserGlpGmMigrationStat.set(entity);

  await _saveGlpGmMigrationStat(eligibleDiff, chainId, context);
}

function _getArbTokenAddress(): string {
  return "0x912ce59144191c1204e64559fe8253a0e49e6548";
}

function _incentivesActive(timestamp: number): boolean {
  return timestamp > INCENTIVES_START_TIMESTAMP;
}

class EligibleRedemptionDiffResult {
  constructor(public usd: bigint, public inArb: bigint) {}
}

async function _getCappedEligibleRedemptionDiff(
  usdBefore: bigint,
  usdAfter: bigint,
  otherUsd: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<EligibleRedemptionDiffResult> {
  let entity = await _getOrCreateGlpGmMigrationStat(chainId, context);

  if (entity.eligibleRedemptionInArb > GLP_GM_MIGRATION_CAP_THRESHOLD_IN_ARB) {
    return new EligibleRedemptionDiffResult(ZERO, ZERO);
  }

  let minBefore = usdBefore < otherUsd ? usdBefore : otherUsd;
  let minAfter = usdAfter < otherUsd ? usdAfter : otherUsd;
  let diffUsd = minAfter - minBefore;
  let diffInArb = await convertUsdToAmount(_getArbTokenAddress(), diffUsd, chainId, context);

  if (entity.eligibleRedemptionInArb + diffInArb > GLP_GM_MIGRATION_CAP_THRESHOLD_IN_ARB) {
    diffInArb = GLP_GM_MIGRATION_CAP_THRESHOLD_IN_ARB - entity.eligibleRedemptionInArb;
    diffUsd = await convertAmountToUsd(_getArbTokenAddress(), diffInArb, chainId, context);
  }

  return new EligibleRedemptionDiffResult(diffUsd, diffInArb);
}

async function _saveGlpGmMigrationStat(
  diff: EligibleRedemptionDiffResult,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  if (diff.usd == ZERO) {
    return;
  }

  let entity = await _getOrCreateGlpGmMigrationStat(chainId, context);
  entity.eligibleRedemptionUsd = entity.eligibleRedemptionUsd + diff.usd;
  entity.eligibleRedemptionInArb = entity.eligibleRedemptionInArb + diff.inArb;
  context.GlpGmMigrationStat.set(entity);
}

async function _getOrCreateGlpGmMigrationStat(
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<GlpGmMigrationStat>> {
  let id = `${chainId}-total`;
  let entity = await context.GlpGmMigrationStat.get(id);
  if (entity == null) {
    return {
      id,
      eligibleRedemptionUsd: ZERO,
      eligibleRedemptionInArb: ZERO,
    };
  }
  return { ...entity };
}

async function _getOrCreateUserGlpGmMigrationStatGlpData(
  account: string,
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<UserGlpGmMigrationStat>> {
  let period = "1w";
  let startTimestamp = timestampToPeriodStart(timestamp, period);
  let id = `${chainId}-${account}:${period}:${startTimestamp.toString()}`;
  let entity = await context.UserGlpGmMigrationStat.get(id);

  if (entity == null) {
    return {
      id,
      period: period,
      account: account,
      timestamp: startTimestamp,
      glpRedemptionUsd: ZERO,
      glpRedemptionFeeBpsByUsd: ZERO,
      glpRedemptionWeightedAverageFeeBps: 0,
      gmDepositUsd: ZERO,
      eligibleRedemptionInArb: ZERO,
      eligibleRedemptionUsd: ZERO,
      eligibleUpdatedTimestamp: 0,
    };
  }

  return { ...entity };
}

async function _getOrCreateLiquidityProviderIncentivesStat(
  account: string,
  glvOrMarketAddress: string,
  type: GlvOrMarketType,
  period: string,
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<LiquidityProviderIncentivesStat>> {
  let startTimestamp = timestampToPeriodStart(timestamp, period);
  let id = `${chainId}-${account}:${glvOrMarketAddress}:${period}:${startTimestamp.toString()}`;
  let entity = await context.LiquidityProviderIncentivesStat.get(id);
  if (entity == null) {
    return {
      id,
      timestamp: startTimestamp,
      period: period,
      account: account,
      glvOrMarketAddress: glvOrMarketAddress,
      type: type,
      updatedTimestamp: 0,
      lastTokensBalance: ZERO,
      cumulativeTimeByTokensBalance: ZERO,
      weightedAverageTokensBalance: ZERO,
    };
  }

  return { ...entity };
}

async function _getOrCreateIncentivesStat(
  glvOrMarketAddress: string,
  type: GlvOrMarketType,
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<IncentivesStat>> {
  let period = "1w";
  let startTimestamp = timestampToPeriodStart(timestamp, period);
  let id = `${chainId}-${glvOrMarketAddress}:${period}:${startTimestamp.toString()}`;
  let entity = await context.IncentivesStat.get(id);

  if (entity == null) {
    return {
      id,
      timestamp: startTimestamp,
      period: period,
      glvOrMarketAddress: glvOrMarketAddress,
      type: type,
      updatedTimestamp: 0,
      lastTokensSupply: ZERO,
      cumulativeTimeByTokensSupply: ZERO,
      weightedAverageTokensSupply: ZERO,
    };
  }

  return { ...entity };
}

async function _getLiquidityProviderInfo(
  account: string,
  glvOrMarketAddress: string,
  type: GlvOrMarketType,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<LiquidityProviderInfo>> {
  let id = `${chainId}-${account}:${glvOrMarketAddress}`;
  let entity = await context.LiquidityProviderInfo.get(id);

  if (entity == null) {
    return {
      id,
      tokensBalance: ZERO,
      account: account,
      glvOrMarketAddress: glvOrMarketAddress,
      type: type,
    };
  }

  return { ...entity };
}
