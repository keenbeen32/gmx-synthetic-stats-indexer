// Ported from gmx-subgraph/synthetics-stats/src/entities/priceImpactRebate.ts
//
// The subgraph stored ClaimableCollateralGroup.claimables as a manual id array.
// Envio requires entity arrays to be @derivedFrom, so each ClaimableCollateral
// now carries claimableCollateralGroup_id and the group's `claimables` is derived.
// `handleSetClaimableCollateralFactorForTime` iterates via getWhere instead of
// the stored id list.
import type { EvmOnEventContext, ClaimableCollateral, ClaimableCollateralGroup } from "envio";
import type { Mutable } from "../utils/types";
import { EventData } from "../utils/eventData";
import { ClaimableCollateralUpdatedEventData } from "../utils/eventData/ClaimableCollateralUpdatedEventData";
import { CollateralClaimedEventData } from "../utils/eventData/CollateralClaimedEventData";
import { SetClaimableCollateralFactorForTimeEventData } from "../utils/eventData/SetClaimableCollateralFactorForTime";
import { SetClaimableCollateralFactorForAccountEventData } from "../utils/eventData/SetClaimableCollateralFactorForAccount";

export async function handleClaimableCollateralUpdated(
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let data = new ClaimableCollateralUpdatedEventData(eventData);
  let entity = await getOrCreateClaimableCollateral(data.account, data.market, data.token, data.timeKey, chainId, context);
  let groupEntity = await getOrCreateClaimableCollateralGroup(data.market, data.token, data.timeKey, chainId, context);

  entity.value = data.nextValue;
  entity.factorByTime = groupEntity.factor;
  // replaces the manual `claimables.push(entity.id)` — derived via this relation
  entity.claimableCollateralGroup_id = groupEntity.id;

  context.ClaimableCollateral.set(entity);
  context.ClaimableCollateralGroup.set(groupEntity);
}

export async function handleSetClaimableCollateralFactorForTime(
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let data = new SetClaimableCollateralFactorForTimeEventData(eventData);

  let entity = await getOrCreateClaimableCollateralGroup(data.market, data.token, data.timeKey, chainId, context);

  entity.factor = data.factor;

  let claimables = await context.ClaimableCollateral.getWhere({
    claimableCollateralGroup_id: { _eq: entity.id },
  });

  for (let i = 0; i < claimables.length; i++) {
    let claimable = claimables[i]!;
    context.ClaimableCollateral.set({ ...claimable, factorByTime: data.factor });
  }

  context.ClaimableCollateralGroup.set(entity);
}

export async function handleSetClaimableCollateralFactorForAccount(
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let data = new SetClaimableCollateralFactorForAccountEventData(eventData);

  let entity = await getOrCreateClaimableCollateral(data.account, data.market, data.token, data.timeKey, chainId, context);

  entity.factor = data.factor;

  context.ClaimableCollateral.set(entity);
}

export async function handleCollateralClaimed(
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let data = new CollateralClaimedEventData(eventData);

  let entity = await getOrCreateClaimableCollateral(data.account, data.market, data.token, data.timeKey, chainId, context);
  entity.claimed = true;
  context.ClaimableCollateral.set(entity);
}

async function getOrCreateClaimableCollateral(
  account: string,
  market: string,
  token: string,
  timeKey: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<ClaimableCollateral>> {
  let id = `${chainId}-${account}:${market}:${token}:${timeKey}`;

  let entity = await context.ClaimableCollateral.get(id);

  if (entity == null) {
    return {
      id,
      account: account,
      marketAddress: market,
      tokenAddress: token,
      timeKey: timeKey,
      value: 0n,
      claimed: false,
      factor: 0n,
      factorByTime: 0n,
      claimableCollateralGroup_id: undefined,
    };
  }

  return { ...entity };
}

async function getOrCreateClaimableCollateralGroup(
  market: string,
  token: string,
  timeKey: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<ClaimableCollateralGroup>> {
  let id = `${chainId}-${market}:${token}:${timeKey.toString()}`;
  let entity = await context.ClaimableCollateralGroup.get(id);

  if (entity == null) {
    return {
      id,
      marketAddress: market,
      tokenAddress: token,
      timeKey: timeKey,
      factor: 0n,
    };
  }

  return { ...entity };
}
