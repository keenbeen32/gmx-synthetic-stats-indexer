// Ported from gmx-subgraph/synthetics-stats/src/contracts/getMarketPoolValueFromContract.ts
// Reader.getMarketTokenPrice(...) via the Effect API (viem readContract at the event's block).
// Returns poolValue (output struct field), or 0n if the call reverts (matches subgraph fallback).
 
import { createEffect, S } from "envio";
import { getClient, effectRateLimit } from "./client";
import { getReaderContractConfigByChainId } from "../contracts/readerConfigs";

const MAX_PNL_FACTOR_FOR_TRADERS =
  "0xab15365d3aa743e766355e2557c230d8f943e195dc84d9b2b05928a07b635ee1" as `0x${string}`;

const READER_ABI = [
  {
    type: "function",
    name: "getMarketTokenPrice",
    stateMutability: "view",
    inputs: [
      { name: "dataStore", type: "address" },
      {
        name: "market",
        type: "tuple",
        components: [
          { name: "marketToken", type: "address" },
          { name: "indexToken", type: "address" },
          { name: "longToken", type: "address" },
          { name: "shortToken", type: "address" },
        ],
      },
      {
        name: "indexTokenPrice",
        type: "tuple",
        components: [
          { name: "min", type: "uint256" },
          { name: "max", type: "uint256" },
        ],
      },
      {
        name: "longTokenPrice",
        type: "tuple",
        components: [
          { name: "min", type: "uint256" },
          { name: "max", type: "uint256" },
        ],
      },
      {
        name: "shortTokenPrice",
        type: "tuple",
        components: [
          { name: "min", type: "uint256" },
          { name: "max", type: "uint256" },
        ],
      },
      { name: "pnlFactorType", type: "bytes32" },
      { name: "maximize", type: "bool" },
    ],
    outputs: [
      { name: "", type: "int256" },
      {
        name: "",
        type: "tuple",
        components: [
          { name: "poolValue", type: "int256" },
          { name: "longPnl", type: "int256" },
          { name: "shortPnl", type: "int256" },
          { name: "netPnl", type: "int256" },
          { name: "longTokenAmount", type: "uint256" },
          { name: "shortTokenAmount", type: "uint256" },
          { name: "longTokenUsd", type: "uint256" },
          { name: "shortTokenUsd", type: "uint256" },
          { name: "totalBorrowingFees", type: "uint256" },
          { name: "borrowingFeePoolFactor", type: "uint256" },
          { name: "impactPoolAmount", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export const getMarketPoolValue = createEffect(
  {
    name: "getMarketPoolValue",
    input: {
      chainId: S.number,
      blockNumber: S.number,
      marketToken: S.string,
      indexToken: S.string,
      longToken: S.string,
      shortToken: S.string,
      indexTokenPriceMin: S.bigint,
      indexTokenPriceMax: S.bigint,
      longTokenPriceMin: S.bigint,
      longTokenPriceMax: S.bigint,
      shortTokenPriceMin: S.bigint,
      shortTokenPriceMax: S.bigint,
    },
    output: S.bigint,
    cache: true,
    rateLimit: effectRateLimit(),
  },
  async ({ input }): Promise<bigint> => {
    const config = getReaderContractConfigByChainId(input.chainId);
    const client = getClient(input.chainId);

    // IMPORTANT: never catch/return a fallback here. Whatever this effect returns
    // is written to the effect cache, so a transient RPC failure that returned a
    // default would poison the cache permanently. Instead we let it throw; the
    // caller (getMarketPoolValueFromContract) catches and substitutes the fallback
    // so the indexer keeps running WITHOUT caching a wrong value.
    const result = (await client.readContract({
      address: config.readerContractAddress as `0x${string}`,
      abi: READER_ABI,
      functionName: "getMarketTokenPrice",
      args: [
        config.dataStoreAddress as `0x${string}`,
        {
          marketToken: input.marketToken as `0x${string}`,
          indexToken: input.indexToken as `0x${string}`,
          longToken: input.longToken as `0x${string}`,
          shortToken: input.shortToken as `0x${string}`,
        },
        { min: input.indexTokenPriceMin, max: input.indexTokenPriceMax },
        { min: input.longTokenPriceMin, max: input.longTokenPriceMax },
        { min: input.shortTokenPriceMin, max: input.shortTokenPriceMax },
        MAX_PNL_FACTOR_FOR_TRADERS,
        true,
      ],
      blockNumber: BigInt(input.blockNumber),
    })) as readonly [bigint, { poolValue: bigint }];

    return result[1].poolValue;
  }
);
