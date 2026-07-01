## Envio Indexer

*Please refer to the [documentation website](https://docs.envio.dev) for a thorough guide on all [Envio](https://envio.dev) indexer features*

### ⚠️ Known limitation: disabled contract-call effects

To keep historical sync fast and RPC-cheap, the two on-chain contract-call effects
(`getMarketPoolValue` and `getMarketTokensSupply`) are **currently disabled** (returning
`0`). This makes a specific set of fields incorrect (`0` / reset):

- `CollectedMarketFeesInfo`: `feeUsdPerPoolValue`, `cumulativeFeeUsdPerPoolValue`,
  `feeUsdPerGmToken`, `cumulativeFeeUsdPerGmToken`, `prevCumulativeFeeUsdPerGmToken`
- `UserGmTokensBalanceChange`: `cumulativeFeeUsdPerGmToken`, `cumulativeIncome`

All other entities/fields match the source subgraph. Full details and how to re-enable
(flip `POOL_VALUE_EFFECT_ENABLED` / `TOTAL_SUPPLY_EFFECT_ENABLED` to `true`) are in
[EFFECTS_DISABLED.md](./EFFECTS_DISABLED.md).

### Run

```bash
pnpm dev
```

Visit http://localhost:8080 to see the GraphQL Playground, local password is `testing`.

### Generate files from `config.yaml` or `schema.graphql`

```bash
pnpm codegen
```

### Pre-requisites

- [Node.js v22+ (v24 recommended)](https://nodejs.org/en/download/current)
- [pnpm (use v8 or newer)](https://pnpm.io/installation)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/)
