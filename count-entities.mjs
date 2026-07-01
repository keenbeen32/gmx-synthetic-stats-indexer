// Count total records per entity in the deployed subgraph via id-cursor pagination.
// Run: node count-entities.mjs
const URL = "https://api.goldsky.com/api/public/project_cmgptuc4qhclc01rh9s4q554a/subgraphs/synthetics-arbitrum-stats/master-260605170830-1049f5c/gn";

const plurals = [
  "affiliateRewardUpdates","orders","positionIncreases","positionDecreases","positionFeesInfos",
  "claimableCollaterals","claimableCollateralGroups","swapInfos","swapFeesInfos","collectedMarketFeesInfos",
  "userGmTokensBalanceChanges","latestUserGmTokensBalanceChangeRefs","tradeActions","tokenPrices",
  "claimCollateralActions","claimActions","claimRefs","poolAmountUpdates","claimableFundingFeeInfos",
  "transactions","marketInfos","depositRefs","volumeInfos","swapVolumeInfos","positionVolumeInfos",
  "users","userStats","swapFeesInfoWithPeriods","positionFeesInfoWithPeriods","liquidityProviderIncentivesStats",
  "incentivesStats","liquidityProviderInfos","sellUSDGs","userGlpGmMigrationStats","glpGmMigrationStats",
  "userTradingIncentivesStats","tradingIncentivesStats","distributions",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
      const j = await res.json();
      if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 120));
      return j.data;
    } catch (e) {
      if (attempt === 5) throw e;
      await sleep(500 * (attempt + 1));
    }
  }
}

async function countEntity(field) {
  let last = "";
  let total = 0;
  for (;;) {
    const q = `{ ${field}(first: 1000, orderBy: id, orderDirection: asc, where: { id_gt: ${JSON.stringify(last)} }) { id } }`;
    const data = await gql(q);
    const rows = data[field];
    total += rows.length;
    if (rows.length < 1000) break;
    last = rows[rows.length - 1].id;
    await sleep(30);
  }
  return total;
}

const results = {};
let grand = 0;
for (const field of plurals) {
  try {
    const n = await countEntity(field);
    results[field] = n;
    grand += n;
    console.log(String(n).padStart(12), field);
  } catch (e) {
    console.log("       ERROR".padStart(12), field, "-", e.message);
  }
}
console.log("".padStart(12, "-"));
console.log(String(grand).padStart(12), "TOTAL");
