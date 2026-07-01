# Disabled contract-call effects — known data limitations

To make historical sync fast and cheap, the two on-chain contract-call effects are
**disabled** (skipped entirely; a default value is returned by the wrapper, the
effect is never called and nothing wrong is written to the effect cache).

| Effect | Gated by flag (set to re-enable) | Default returned |
|---|---|---|
| `getMarketPoolValue` (Reader.getMarketTokenPrice) | `POOL_VALUE_EFFECT_ENABLED` in `src/contracts/getMarketPoolValueFromContract.ts` | `0n` |
| `getMarketTokensSupply` (MarketToken.totalSupply) | `TOTAL_SUPPLY_EFFECT_ENABLED` in `src/contracts/getMarketTokensSupplyFromContract.ts` | `0n` |

Re-enable by flipping the relevant flag back to `true`.

---

## 1. `getMarketPoolValue` disabled → `poolValue` treated as `0`

`poolValue` is **write-only** in the indexer (nothing reads these fields back), so the
blast radius is small and contained to `CollectedMarketFeesInfo`:

**Wrong (all periods — `total`, `1h`, `1d`):**
- `CollectedMarketFeesInfo.feeUsdPerPoolValue` → **`0`**
- `CollectedMarketFeesInfo.cumulativeFeeUsdPerPoolValue` → **`0`**

**Unaffected:** everything else on `CollectedMarketFeesInfo` and every other entity.

## 2. `getMarketTokensSupply` disabled → `marketTokensSupply` treated as `0`

`getUpdatedFeeUsdPerGmToken` returns `0` when supply is `0` (it divides by supply), so a
`0` supply **resets** the cumulative GM-token fee metric. The RPC supply is only used for
**deposit/withdrawal** fee events and **PositionImpactPoolDistributed** (other fee events
already use the cached, event-tracked `MarketInfo.marketTokensSupply`). Because the metric
is a single running sum per market, a reset on those events corrupts the whole series.

**Wrong (all periods):**
- `CollectedMarketFeesInfo.feeUsdPerGmToken`
- `CollectedMarketFeesInfo.cumulativeFeeUsdPerGmToken`
- `CollectedMarketFeesInfo.prevCumulativeFeeUsdPerGmToken`

**Wrong (downstream, derived from the above):**
- `UserGmTokensBalanceChange.cumulativeFeeUsdPerGmToken`
- `UserGmTokensBalanceChange.cumulativeIncome`

**Unaffected:** raw fee totals (`feeUsdForPool`, `cummulativeFeeUsdForPool`), all order/
trade/position/swap/volume/price/claim/incentives entities, and `MarketInfo.marketTokensSupply`
itself (that is tracked from `Transfer` + `MarketPoolValueUpdated` events, not this RPC).

---

## Why not skip historically and backfill at head?
Both affected metrics are **cumulative running sums** (path-dependent on every historical
call), and the `1h`/`1d` rows are immutable per-bucket snapshots. So the head-state value
depends on every historical call — you cannot skip historically and recover correct values
at the chain head.

## Less-wrong alternative (not implemented)
`getMarketTokensSupply` could return the cached `MarketInfo.marketTokensSupply` instead of
`0` (still zero RPC) — that keeps the GM-token fee / LP-income fields close to correct
(only intra-transaction staleness differs). Kept as `0` here for a clean, clearly-wrong
known state. `poolValue` has no cheap event-derived equivalent (see prior research).
