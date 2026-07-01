// Ported from gmx-subgraph/synthetics-stats/src/entities/markets.ts
import type { EvmOnEventContext, MarketInfo } from "envio";
import { marketConfigs } from "../config/markets";
import { EventData } from "../utils/eventData";
import { ZERO } from "../utils/number";

function marketInfoId(chainId: number, marketAddress: string): string {
  return `${chainId}-${marketAddress}`;
}

export async function saveMarketInfo(
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<MarketInfo> {
  let marketToken = eventData.getAddressItemString("marketToken")!;
  let marketInfo: MarketInfo = {
    id: marketInfoId(chainId, marketToken),
    marketToken: marketToken,
    indexToken: eventData.getAddressItemString("indexToken")!,
    longToken: eventData.getAddressItemString("longToken")!,
    shortToken: eventData.getAddressItemString("shortToken")!,
    marketTokensSupply: ZERO,
    marketTokensSupplyFromPoolUpdated: undefined,
  };
  context.MarketInfo.set(marketInfo);

  return marketInfo;
}

export async function getMarketInfo(
  marketAddress: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<MarketInfo> {
  let id = marketInfoId(chainId, marketAddress);
  let entity = await context.MarketInfo.get(id);

  if (!entity) {
    let marketConfig = marketConfigs.get(marketAddress);

    if (marketConfig) {
      entity = {
        id,
        marketToken: marketConfig.marketToken,
        indexToken: marketConfig.indexToken,
        longToken: marketConfig.longToken,
        shortToken: marketConfig.shortToken,
        marketTokensSupply: ZERO,
        marketTokensSupplyFromPoolUpdated: undefined,
      };
      context.MarketInfo.set(entity);
    } else {
      context.log.error(`MarketInfo not found ${marketAddress}`);
      throw new Error("MarketInfo not found");
    }
  }

  return entity;
}

export async function saveMarketInfoTokensSupply(
  marketAddress: string,
  value: bigint,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let marketInfo = await getMarketInfo(marketAddress, chainId, context);
  context.MarketInfo.set({
    ...marketInfo,
    marketTokensSupply: marketInfo.marketTokensSupply + value,
  });
}

export async function saveMarketInfoMarketTokensSupplyFromPoolUpdated(
  marketAddress: string,
  value: bigint | null,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  if (value != null) {
    let marketInfo = await getMarketInfo(marketAddress, chainId, context);
    context.MarketInfo.set({
      ...marketInfo,
      marketTokensSupplyFromPoolUpdated: value,
    });
  }
}
