# Migration Plan — GMX `synthetics-stats` subgraph → Envio HyperIndex

Source of truth (never modified): `../gmx-subgraph/synthetics-stats/`
Target: this directory (`synthetics-stats-hyperindex/`), scaffolded with `envio init contract-import local` (envio **3.2.1**, V3 API).

This document is the Phase 2 deliverable: a component-by-component mapping plus flagged gaps and their workarounds. No migration code is written in this phase.

---

## 0. Envio version specifics discovered from the generated boilerplate

The installed CLI is **3.2.1**, whose API differs from the older `migrate-from-subgraph` skill examples (`Contract.Event.handler`). The authoritative API for this project (from `node_modules/envio/index.d.ts` + `.envio/types.d.ts`):

- Handler registration: `indexer.onEvent({ contract, event }, async ({ event, context }) => { … })`
- Dynamic contract registration: `indexer.contractRegister({ contract, event }, ({ event, context }) => { context.chain.<ContractName>.add(addr) })`
- Entity ops on `context`: `await context.X.get(id)`, `await context.X.getOrThrow(id)`, `await context.X.getWhere({ field: { _eq } })`, `await context.X.getOrCreate(entity)`, `context.X.set(entity)` (synchronous), `context.X.deleteUnsafe(id)`.
- External calls: `createEffect({ name, input, output, cache, rateLimit }, async ({ input, context }) => …)` consumed via `await context.effect(eff, input)`.
- Event object: `event.chainId`, `event.srcAddress` (≙ subgraph `event.address`), `event.logIndex`, `event.block.{number,timestamp,hash}` (numbers, not BigInt), `event.transaction.{hash,transactionIndex,from,to}` (require `field_selection`), `event.params.*`.
- `BigDecimal` imported from `envio` (this subgraph uses only `BigInt` math → JS `bigint`, no BigDecimal needed).

### Decoded `eventData` shape (the central decode)
The generic `EventLog`/`EventLog1`/`EventLog2` tuple decodes to a **numeric-keyed object** (confirmed in `.envio/types.d.ts`):

```
eventData[0] = addressItems  = { 0: items, 1: arrayItems }   // item value: string (Address)
eventData[1] = uintItems     = { 0: items, 1: arrayItems }   // item value: bigint
eventData[2] = intItems      = { 0: items, 1: arrayItems }   // item value: bigint (may be negative)
eventData[3] = boolItems     = { 0: items, 1: arrayItems }   // item value: boolean
eventData[4] = bytes32Items  = { 0: items, 1: arrayItems }   // item value: string (hex)
eventData[5] = bytesItems    = { 0: items, 1: arrayItems }   // item value: string (hex)
eventData[6] = stringItems   = { 0: items, 1: arrayItems }   // item value: string
// each `items`/`arrayItems` element is { 0: key, 1: value }
```

The subgraph's `src/utils/eventData.ts` `EventData` class is ported 1:1 against this shape.

---

## 1. Manifest mapping (`subgraph-*.yaml` → `config.yaml`)

One multichain `config.yaml` (top-level `chains:` keyed by numeric id). Global `contracts:` define events/handlers; chain sections list addresses + `start_block`.

Networks → chain ids:

| Subgraph network | chain id | EventEmitter | Extra contracts |
|---|---|---|---|
| arbitrum-one | 42161 | `0xC8ee91A54287DB53897056e12D9819156D3822Fb` @107737756 | Vault, GlpManager, BatchSender, BatchSenderNew |
| avalanche | 43114 | `0xDb17B211c34240B014ab6d61d4A31FA0C0e20c26` @32162455 | BatchSender, BatchSender2 |
| arbitrum-goerli | 421613 | `0x2fbE45fCb58B7106CF0a3Be9225D5Ed5A1004cc4` @23368123 | EventEmitterOld |
| fuji | 43113 | `0xc67D98AC5803aFD776958622CeEE332A0B2CabB9` @23600000 | EventEmitterOld, (zero-addr BatchSender — omit) |
| botanix-mainnet | 3637 *(confirm)* | `0xAf2E131d483cedE068e21a9228aD91E623a989C2` @117907 | — |
| megaeth-mainnet | *(confirm at impl)* | `0xAf2E131d483cedE068e21a9228aD91E623a989C2` @5661063 | — |

- **EventEmitterOld** (fuji/goerli): same 3 events as EventEmitter → register handlers under a second contract name `EventEmitterOld` reusing the same handler bodies.
- **`field_selection.transaction_fields`**: `hash`, `transactionIndex`, `from`, `to` (needed by `getOrCreateTransaction` + `SellUSDG`).
- Chains not on Envio HyperSync (botanix, megaeth, possibly goerli) need a `rpc_url` per chain (env var) — flagged.

## 2. Schema mapping (`schema.graphql`, 38 entities)

Copy verbatim, then: remove `@entity` / `@entity(immutable: true)`; `Bytes` → `String`; keep `BigInt`, `Int`, `Boolean`, `ID`, enums (`OrderStatus`, `ClaimActionType`, `GlvOrMarketType`), and scalar arrays (`[String!]`, `[BigInt!]`, `[Boolean!]` — supported by Envio).

**Gap — entity array without `@derivedFrom`:** `ClaimableCollateralGroup.claimables: [ClaimableCollateral!]!` is a manually-managed id list in the subgraph. Envio rejects entity arrays unless `@derivedFrom`. **Workaround:** add `claimableCollateralGroup: ClaimableCollateralGroup` to `ClaimableCollateral`, and make `claimables: [ClaimableCollateral!]! @derivedFrom(field: "claimableCollateralGroup")`. Handlers set `claimableCollateralGroup_id` on each `ClaimableCollateral`; `handleSetClaimableCollateralFactorForTime` replaces array iteration with `await context.ClaimableCollateral.getWhere({ claimableCollateralGroup_id: { _eq } })`.

Entity reference fields (`Transaction!`, etc.) become `_id`-suffixed string fields in generated types (e.g. `createdTxn_id`).

## 3. Handler / dispatch mapping (`src/mapping.ts`)

| Subgraph | HyperIndex |
|---|---|
| `handleEventLog` / `handleEventLog1` / `handleEventLog2` (dispatch on `eventName`) | `indexer.onEvent({contract:"EventEmitter", event:"EventLog{,1,2}"}, …)` each decoding `eventData` and `switch`-ing on `event.params.eventName`, mirroring `mapping.ts` exactly. |
| per-network wrappers `handleEventLog1Arbitrum…Megaeth` | collapsed: one handler; `network` derived from `event.chainId` via a `chainIdToNetwork` map. |
| `MarketTokenTemplate.create()` on `MarketCreated`; `GlvTokenTemplate.create()` on `GlvCreated` | `indexer.contractRegister({contract:"EventEmitter",event:"EventLog1"}, …)` decoding eventName and calling `context.chain.MarketToken.add(...)` / `context.chain.GlvToken.add(...)`. Dynamic contracts have **no address** in config. |
| `handleMarketTokenTransfer` / `handleGlvTokenTransfer` (templates) | `indexer.onEvent({contract:"MarketToken"/"GlvToken", event:"Transfer"}, …)`. |
| `handleSellUSDG` (Vault), `handleRemoveLiquidity` (GlpManager), `handleBatchSend` (BatchSender) | static contracts in config; handlers ported 1:1. |

## 4. Contract-call mapping (`.bind()` → Effect API)

| Subgraph | HyperIndex |
|---|---|
| `getMarketPoolValueFromContract` → `Reader.try_getMarketTokenPrice(...).value1.poolValue` (revert→ZERO; block-gated per network) | Effect `getMarketPoolValue` using viem `readContract` against the Reader ABI. Handler reads `MarketInfo` + 3 `TokenPrice` entities and passes plain values as input; effect returns `poolValue` (bigint via `S.bigint`), `try/catch`→`0n`. |
| `getMarketTokensSupplyFromContract` → `MarketToken.totalSupply()` | Effect `getMarketTokensSupply` (viem `readContract` totalSupply). |
| `readerConfigs.ts` (network→reader/dataStore/blockNumber) | ported, re-keyed by chain id; reader/dataStore addresses unchanged. |
| RPC access | viem `createPublicClient` per chain from `process.env.ENVIO_RPC_URL_<chainId>` → added to `.env.example`. |

`src/config/markets.ts` (hardcoded market fallback map) ported as-is (used by `entities/markets.ts` `getMarketInfo`).

## 5. Cross-cutting: multichain ID prefixing (flagged)

All 6 chains share **one** Envio database, but subgraph ids are not chain-scoped. Constant ids (`SELL_USDG_ID="last"`, `GlpGmMigrationStat="total"`, `UserStat` total/per-timestamp, period aggregates) **collide across chains**. **Decision:** prefix every entity id with `${chainId}-`, applied uniformly in id construction *and* every cross-entity `.get()`/`getWhere` lookup. Helper functions (`getOrCreateTransaction`, `getIdFromEvent`, all `entities/*` id builders) take `chainId` and prefix. `_id` foreign keys reference already-prefixed ids, so they stay consistent.

## 6. Other equivalences / gaps

- `@entity(immutable: true)` (11 entities): Envio has no immutable flag → ordinary entities; immutability preserved by writing each id once (matches subgraph behavior).
- `store.get`/`load` → `await context.X.get`; `.save()` → `context.X.set`; updates via spread (entities are read-only).
- `ClaimRef`/`DepositRef` routing lookups → `await context.ClaimRef.get(id)` etc.
- `SellUSDG`→`RemoveLiquidity` logIndex correlation → ported as get/set; relies on per-chain ordered processing (preserved within a chain).
- AssemblyScript types: `BigInt`→`bigint`; `i32`/`u8`→`number`; `BigInt.fromI32(0)`→`0n`; `.toI32()` drops (already numbers); `Address.toHexString()`→ value already a (lowercased) hex string, `.toLowerCase()` applied where the subgraph lowercased, for id parity.

## 7. File-by-file order (Phase 3, codegen after each)

1. `schema.graphql` → codegen
2. `config.yaml` (6 chains, all contracts, dynamic addressless, field_selection) → codegen
3. helpers: `utils/number.ts`, `utils/time.ts`, `utils/eventData.ts`, `utils/eventData/*` (7), `entities/common.ts`
4. effects: `contracts/readerConfigs.ts`, `config/markets.ts`, `effects/getMarketPoolValue.ts`, `effects/getMarketTokensSupply.ts`
5. entity modules: `markets, prices, orders, positions, swaps, fees, trades, user, userBalance, volume, distributions, claims, priceImpactRebate, incentives/liquidityIncentives, incentives/tradingIncentives`
6. dispatchers + static handlers in `src/handlers/` (EventLog/1/2 + contractRegister; MarketToken/GlvToken Transfer; Vault/GlpManager/BatchSender)
7. `.env.example` sweep

Each step gate: `pnpm envio codegen` → `pnpm tsc --noEmit` → vitest where feasible → checklist tick.
