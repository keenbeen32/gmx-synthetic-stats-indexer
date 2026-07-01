import { describe, it, expect } from "vitest";
import { createTestIndexer, TestHelpers } from "envio";

// Build the numeric-keyed `eventData` tuple the same way HyperIndex decodes it.
type Pair<T> = { 0: string; 1: T };
function group<T>(items: [string, T][] = []): { 0: Pair<T>[]; 1: Pair<T[]>[] } {
  return { 0: items.map(([k, v]) => ({ 0: k, 1: v })), 1: [] };
}
function makeEventData(opts: {
  address?: [string, string][];
  uint?: [string, bigint][];
  int?: [string, bigint][];
  bool?: [string, boolean][];
  bytes32?: [string, string][];
  bytes?: [string, string][];
  string?: [string, string][];
}) {
  return {
    0: group(opts.address),
    1: group(opts.uint),
    2: group(opts.int),
    3: group(opts.bool),
    4: group(opts.bytes32),
    5: group(opts.bytes),
    6: group(opts.string),
  };
}

const HASH = "0x0000000000000000000000000000000000000000000000000000000000000abc";

describe("EventLog1 dispatch", () => {
  it("OraclePriceUpdate creates a TokenPrice", async () => {
    const indexer = createTestIndexer();
    const token = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

    const event = {
      contract: "EventEmitter" as const,
      event: "EventLog1" as const,
      params: {
        msgSender: TestHelpers.Addresses.defaultAddress,
        eventName: "OraclePriceUpdate",
        eventNameHash: "OraclePriceUpdate",
        topic1: HASH,
        eventData: makeEventData({
          address: [["token", token]],
          uint: [
            ["minPrice", 100n],
            ["maxPrice", 200n],
            ["timestamp", 1700000000n],
            ["priceSourceType", 2n],
          ],
        }),
      },
    };

    await indexer.process({ chains: { 42161: { simulate: [event as any] } } });

    const tokenPrice = await indexer.TokenPrice.get(`42161-${token}`);
    expect(tokenPrice).toBeDefined();
    expect(tokenPrice!.minPrice).toBe(100n);
    expect(tokenPrice!.maxPrice).toBe(200n);
  });

  it("MarketCreated creates a MarketInfo", async () => {
    const indexer = createTestIndexer();
    const marketToken = "0x70d95587d40a2caf56bd97485ab3eec10bee6336";
    const indexToken = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
    const longToken = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
    const shortToken = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

    const event = {
      contract: "EventEmitter" as const,
      event: "EventLog1" as const,
      params: {
        msgSender: TestHelpers.Addresses.defaultAddress,
        eventName: "MarketCreated",
        eventNameHash: "MarketCreated",
        topic1: HASH,
        eventData: makeEventData({
          address: [
            ["marketToken", marketToken],
            ["indexToken", indexToken],
            ["longToken", longToken],
            ["shortToken", shortToken],
          ],
        }),
      },
    };

    await indexer.process({ chains: { 42161: { simulate: [event as any] } } });

    const market = await indexer.MarketInfo.get(`42161-${marketToken}`);
    expect(market).toBeDefined();
    expect(market!.indexToken).toBe(indexToken);
    expect(market!.longToken).toBe(longToken);
    expect(market!.shortToken).toBe(shortToken);
    expect(market!.marketTokensSupply).toBe(0n);
  });
});

describe("EventLog2 dispatch", () => {
  it("OrderCreated creates an Order and a TradeAction", async () => {
    const indexer = createTestIndexer();
    const orderKey = "0x0000000000000000000000000000000000000000000000000000000000000111";
    const account = "0xc91cc0d42a48bce63c4223c630daecf364e451c9";
    const market = "0x70d95587d40a2caf56bd97485ab3eec10bee6336";
    const collateral = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

    const event = {
      contract: "EventEmitter" as const,
      event: "EventLog2" as const,
      params: {
        msgSender: TestHelpers.Addresses.defaultAddress,
        eventName: "OrderCreated",
        eventNameHash: "OrderCreated",
        topic1: HASH,
        topic2: HASH,
        eventData: makeEventData({
          address: [
            ["account", account],
            ["receiver", account],
            ["callbackContract", "0x0000000000000000000000000000000000000000"],
            ["market", market],
            ["initialCollateralToken", collateral],
          ],
          uint: [
            ["sizeDeltaUsd", 1000n],
            ["initialCollateralDeltaAmount", 500n],
            ["triggerPrice", 0n],
            ["acceptablePrice", 0n],
            ["callbakGasLimit", 0n],
            ["minOutputAmount", 0n],
            ["executionFee", 1n],
            ["orderType", 2n], // MarketIncrease
          ],
          bool: [
            ["isLong", true],
            ["shouldUnwrapNativeToken", false],
            ["isFrozen", false],
          ],
          bytes32: [["key", orderKey]],
        }),
      },
      block: { number: 200000000, timestamp: 1700000000, hash: HASH },
      transaction: { hash: HASH, transactionIndex: 0, from: account, to: market },
    };

    await indexer.process({ chains: { 42161: { simulate: [event as any] } } });

    const order = await indexer.Order.get(`42161-${orderKey}`);
    expect(order).toBeDefined();
    expect(order!.account).toBe(account);
    expect(order!.marketAddress).toBe(market);
    expect(order!.orderType).toBe(2n);
    expect(order!.status).toBe("Created");
    expect(order!.isLong).toBe(true);
  });
});
