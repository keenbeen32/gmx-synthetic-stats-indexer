// Ported from gmx-subgraph/synthetics-stats/src/entities/prices.ts
import type { EvmOnEventContext, TokenPrice } from "envio";
import { EventData } from "../utils/eventData";
import { OraclePriceUpdateEventData } from "../utils/eventData/OraclePriceUpdateEventData";
import { ZERO } from "../utils/number";

function tokenPriceId(chainId: number, tokenAddress: string): string {
  return `${chainId}-${tokenAddress}`;
}

export async function handleOraclePriceUpdate(
  eventData: EventData,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let event = new OraclePriceUpdateEventData(eventData);
  let tokenPrice = await getOrCreateTokenPrice(event.token, chainId, context);

  context.TokenPrice.set({
    ...tokenPrice,
    minPrice: event.minPrice,
    maxPrice: event.maxPrice,
  });
}

async function getOrCreateTokenPrice(
  tokenAddress: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<TokenPrice> {
  let id = tokenPriceId(chainId, tokenAddress);
  let tokenPrice = await context.TokenPrice.get(id);
  if (tokenPrice) {
    return tokenPrice;
  }
  return { id, minPrice: ZERO, maxPrice: ZERO };
}

export async function getTokenPrice(
  tokenAddress: string,
  chainId: number,
  context: EvmOnEventContext,
  useMax: boolean = false
): Promise<bigint> {
  let priceRef = await context.TokenPrice.get(tokenPriceId(chainId, tokenAddress));
  if (!priceRef) {
    return ZERO;
  }
  return useMax ? priceRef.maxPrice : priceRef.minPrice;
}

export async function convertUsdToAmount(
  tokenAddress: string,
  usd: bigint,
  chainId: number,
  context: EvmOnEventContext,
  useMax: boolean = true
): Promise<bigint> {
  let price = await getTokenPrice(tokenAddress, chainId, context, useMax);
  if (price == ZERO) {
    return ZERO;
  }
  return usd / price;
}

export async function convertAmountToUsd(
  tokenAddress: string,
  amount: bigint,
  chainId: number,
  context: EvmOnEventContext,
  useMax: boolean = false
): Promise<bigint> {
  let price = await getTokenPrice(tokenAddress, chainId, context, useMax);
  return amount * price;
}
