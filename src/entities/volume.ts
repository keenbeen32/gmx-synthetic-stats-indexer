// Ported from gmx-subgraph/synthetics-stats/src/entities/volume.ts
import type { EvmOnEventContext, PositionVolumeInfo, SwapVolumeInfo, VolumeInfo } from "envio";
import type { Mutable } from "../utils/types";
import { timestampToPeriodStart } from "../utils/time";
import { getMarketInfo } from "./markets";
import { ZERO } from "../utils/number";

export async function saveVolumeInfo(
  type: string,
  timestamp: number,
  volume: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let hourlyVolumeInfo = await getOrCreateVolumeInfo(timestamp, "1h", chainId, context);
  let dailyVolumeInfo = await getOrCreateVolumeInfo(timestamp, "1d", chainId, context);
  let totalVolumeInfo = await getOrCreateVolumeInfo(timestamp, "total", chainId, context);

  hourlyVolumeInfo.volumeUsd = hourlyVolumeInfo.volumeUsd + volume;
  dailyVolumeInfo.volumeUsd = dailyVolumeInfo.volumeUsd + volume;
  totalVolumeInfo.volumeUsd = totalVolumeInfo.volumeUsd + volume;

  if (type == "swap") {
    hourlyVolumeInfo.swapVolumeUsd = hourlyVolumeInfo.swapVolumeUsd + volume;
    dailyVolumeInfo.swapVolumeUsd = dailyVolumeInfo.swapVolumeUsd + volume;
    totalVolumeInfo.swapVolumeUsd = totalVolumeInfo.swapVolumeUsd + volume;
  }

  if (type == "deposit") {
    hourlyVolumeInfo.depositVolumeUsd = hourlyVolumeInfo.depositVolumeUsd + volume;
    dailyVolumeInfo.depositVolumeUsd = dailyVolumeInfo.depositVolumeUsd + volume;
    totalVolumeInfo.depositVolumeUsd = totalVolumeInfo.depositVolumeUsd + volume;
  }

  if (type == "withdrawal") {
    hourlyVolumeInfo.withdrawalVolumeUsd = hourlyVolumeInfo.withdrawalVolumeUsd + volume;
    dailyVolumeInfo.withdrawalVolumeUsd = dailyVolumeInfo.withdrawalVolumeUsd + volume;
    totalVolumeInfo.withdrawalVolumeUsd = totalVolumeInfo.withdrawalVolumeUsd + volume;
  }

  if (type == "margin") {
    hourlyVolumeInfo.marginVolumeUsd = hourlyVolumeInfo.marginVolumeUsd + volume;
    dailyVolumeInfo.marginVolumeUsd = dailyVolumeInfo.marginVolumeUsd + volume;
    totalVolumeInfo.marginVolumeUsd = totalVolumeInfo.marginVolumeUsd + volume;
  }

  context.VolumeInfo.set(hourlyVolumeInfo);
  context.VolumeInfo.set(dailyVolumeInfo);
  context.VolumeInfo.set(totalVolumeInfo);
}

async function getOrCreateVolumeInfo(
  timestamp: number,
  period: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<VolumeInfo>> {
  let timestampGroup = timestampToPeriodStart(timestamp, period);
  let volumeId = period;
  if (period != "total") {
    volumeId = volumeId + ":" + timestampGroup.toString();
  }
  let id = `${chainId}-${volumeId}`;
  let volumeInfo = await context.VolumeInfo.get(id);

  if (volumeInfo == null) {
    return {
      id,
      period: period,
      volumeUsd: ZERO,
      swapVolumeUsd: ZERO,
      marginVolumeUsd: ZERO,
      depositVolumeUsd: ZERO,
      withdrawalVolumeUsd: ZERO,
      timestamp: timestampGroup,
    };
  }
  return { ...volumeInfo };
}

export async function saveSwapVolumeInfo(
  timestamp: number,
  tokenIn: string,
  tokenOut: string,
  volumeUsd: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let hourlyVolumeInfo = await getOrCreateSwapVolumeInfo(timestamp, tokenIn, tokenOut, "1h", chainId, context);
  let dailyVolumeInfo = await getOrCreateSwapVolumeInfo(timestamp, tokenIn, tokenOut, "1d", chainId, context);
  let totalVolumeInfo = await getOrCreateSwapVolumeInfo(timestamp, tokenIn, tokenOut, "total", chainId, context);

  hourlyVolumeInfo.volumeUsd = hourlyVolumeInfo.volumeUsd + volumeUsd;
  dailyVolumeInfo.volumeUsd = dailyVolumeInfo.volumeUsd + volumeUsd;
  totalVolumeInfo.volumeUsd = totalVolumeInfo.volumeUsd + volumeUsd;

  context.SwapVolumeInfo.set(hourlyVolumeInfo);
  context.SwapVolumeInfo.set(dailyVolumeInfo);
  context.SwapVolumeInfo.set(totalVolumeInfo);
}

async function getOrCreateSwapVolumeInfo(
  timestamp: number,
  tokenIn: string,
  tokenOut: string,
  period: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<SwapVolumeInfo>> {
  let timestampGroup = timestampToPeriodStart(timestamp, period);

  let rawId = getVolumeInfoId(tokenIn, tokenOut) + ":" + period;
  if (period != "total") {
    rawId = rawId + ":" + timestampGroup.toString();
  }
  let id = `${chainId}-${rawId}`;
  let volumeInfo = await context.SwapVolumeInfo.get(id);

  if (volumeInfo == null) {
    return {
      id,
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      timestamp: timestampGroup,
      period: period,
      volumeUsd: ZERO,
    };
  }
  return { ...volumeInfo };
}

export async function savePositionVolumeInfo(
  timestamp: number,
  collateralToken: string,
  marketToken: string,
  sizeInUsd: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let marketInfo = await getMarketInfo(marketToken, chainId, context);
  let hourlyVolumeInfo = await getOrCreatePositionVolumeInfo(
    timestamp,
    collateralToken,
    marketInfo.indexToken,
    "1h",
    chainId,
    context
  );
  let dailyVolumeInfo = await getOrCreatePositionVolumeInfo(
    timestamp,
    collateralToken,
    marketInfo.indexToken,
    "1d",
    chainId,
    context
  );
  let totalVolumeInfo = await getOrCreatePositionVolumeInfo(
    timestamp,
    collateralToken,
    marketInfo.indexToken,
    "total",
    chainId,
    context
  );

  hourlyVolumeInfo.volumeUsd = hourlyVolumeInfo.volumeUsd + sizeInUsd;
  dailyVolumeInfo.volumeUsd = dailyVolumeInfo.volumeUsd + sizeInUsd;
  totalVolumeInfo.volumeUsd = totalVolumeInfo.volumeUsd + sizeInUsd;

  context.PositionVolumeInfo.set(hourlyVolumeInfo);
  context.PositionVolumeInfo.set(dailyVolumeInfo);
  context.PositionVolumeInfo.set(totalVolumeInfo);
}

async function getOrCreatePositionVolumeInfo(
  timestamp: number,
  collateralToken: string,
  indexToken: string,
  period: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<PositionVolumeInfo>> {
  let timestampGroup = timestampToPeriodStart(timestamp, period);
  let rawId = getVolumeInfoId(collateralToken, indexToken) + ":" + period;
  if (period != "total") {
    rawId = rawId + ":" + timestampGroup.toString();
  }
  let id = `${chainId}-${rawId}`;
  let volumeInfo = await context.PositionVolumeInfo.get(id);

  if (volumeInfo == null) {
    return {
      id,
      collateralToken: collateralToken,
      indexToken: indexToken,
      timestamp: timestampGroup,
      period: period,
      volumeUsd: ZERO,
    };
  }
  return { ...volumeInfo };
}

function getVolumeInfoId(tokenA: string, tokenB: string): string {
  return tokenA + ":" + tokenB;
}
