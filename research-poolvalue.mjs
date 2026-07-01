// Research (throwaway): does MarketPoolValueUpdated.poolValue / .marketTokensSupply
// match what the subgraph's RPC calls return (Reader.getMarketTokenPrice with
// MAX_PNL_FACTOR_FOR_TRADERS, and MarketToken.totalSupply)?
//
// Run: node research-poolvalue.mjs
import { readFileSync } from "node:fs";
import { createPublicClient, http, decodeEventLog } from "viem";

const ABI_DIR = "../gmx-subgraph/synthetics-stats/abis";
const eeFull = JSON.parse(readFileSync(`${ABI_DIR}/EventEmitter.json`, "utf8"));
const eventEmitterAbi = Array.isArray(eeFull) ? eeFull : eeFull.abi;
const readerAbiFull = JSON.parse(readFileSync(`${ABI_DIR}/Reader.json`, "utf8"));
const readerAbi = Array.isArray(readerAbiFull) ? readerAbiFull : readerAbiFull.abi;
const eventLog1Item = eventEmitterAbi.find((x) => x.type === "event" && x.name === "EventLog1");

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const RPC = env.RPC_URL_42161;
const EVENT_EMITTER = "0xC8ee91A54287DB53897056e12D9819156D3822Fb";
const READER = "0x38d91ED96283d62182Fc6d990C24097A918a4d9b";
const DATA_STORE = "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8";
const TRADERS = "0xab15365d3aa743e766355e2557c230d8f943e195dc84d9b2b05928a07b635ee1";

const totalSupplyAbi = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
];

const client = createPublicClient({ transport: http(RPC, { retryCount: 8, retryDelay: 600, timeout: 25000 }) });

// Hard self-throttle so this coexists with a running indexer on the same RPC quota.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
async function throttle() {
  const wait = Math.max(0, 600 - (Date.now() - lastCall));
  if (wait) await sleep(wait);
  lastCall = Date.now();
}
async function rpcLogs(args) { await throttle(); return client.getLogs(args); }
async function rpcRead(args) { await throttle(); return client.readContract(args); }

function getItem(ed, section, key) {
  const items = ed?.[section]?.items ?? [];
  for (const it of items) if (it.key === key) return it.value;
  return undefined;
}
const lc = (x) => (typeof x === "string" ? x.toLowerCase() : x);
const pos = (b, li) => b * 1_000_000n + BigInt(li);

async function getLog1(name, fromBlock, toBlock) {
  const out = [];
  const CHUNK = 1000n;
  for (let s = fromBlock; s <= toBlock; s += CHUNK) {
    const e = s + CHUNK - 1n > toBlock ? toBlock : s + CHUNK - 1n;
    let logs;
    try {
      logs = await rpcLogs({ address: EVENT_EMITTER, event: eventLog1Item, args: { eventNameHash: name }, fromBlock: s, toBlock: e });
    } catch (err) {
      console.log(`  getLogs ${name} ${s}..${e} failed: ${err.shortMessage ?? err.message}`);
      continue;
    }
    for (const log of logs) {
      try {
        const dec = decodeEventLog({ abi: eventEmitterAbi, data: log.data, topics: log.topics });
        out.push({ log, ed: dec.args.eventData });
      } catch {}
    }
  }
  return out;
}

async function main() {
  await throttle();
  const latest = (await client.getBlockNumber()) - 10n;
  const SPAN = 4000n;
  const from = latest - SPAN;
  console.log(`Scanning Arbitrum blocks ${from}..${latest}\n`);

  const mpvu = await getLog1("MarketPoolValueUpdated", from, latest);
  const swapFees = await getLog1("SwapFeesCollected", from, latest);
  const posFees = await getLog1("PositionFeesCollected", from, latest);
  const impact = await getLog1("PositionImpactPoolDistributed", from, latest);

  const mpvuByTxMarket = new Map();
  for (const { log, ed } of mpvu) {
    const market = lc(getItem(ed, "addressItems", "market"));
    mpvuByTxMarket.set(`${lc(log.transactionHash)}-${market}`, {
      poolValue: getItem(ed, "intItems", "poolValue"),
      supply: getItem(ed, "uintItems", "marketTokensSupply"),
      actionType: lc(getItem(ed, "bytes32Items", "actionType")),
    });
  }

  const feeEvents = [];
  for (const [name, arr] of [["SwapFeesCollected", swapFees], ["PositionFeesCollected", posFees], ["PositionImpactPoolDistributed", impact]]) {
    for (const { log, ed } of arr) {
      feeEvents.push({ name, market: lc(getItem(ed, "addressItems", "market")), block: log.blockNumber, logIndex: log.logIndex, tx: lc(log.transactionHash), pos: pos(log.blockNumber, log.logIndex) });
    }
  }

  console.log(`MarketPoolValueUpdated: ${mpvu.length} | fee events: ${feeEvents.length}`);
  const matched = feeEvents.filter((fe) => mpvuByTxMarket.has(`${fe.tx}-${fe.market}`));
  console.log(`Coverage: ${matched.length}/${feeEvents.length} fee events have a same-tx+same-market MarketPoolValueUpdated`);

  const atCount = new Map();
  for (const v of mpvuByTxMarket.values()) atCount.set(v.actionType, (atCount.get(v.actionType) ?? 0) + 1);
  console.log(`actionType distribution (MarketPoolValueUpdated):`);
  for (const [at, c] of atCount) console.log(`    ${at} -> ${c}${at === TRADERS ? " (== MAX_PNL_FACTOR_FOR_TRADERS)" : ""}`);

  const marketCache = new Map();
  async function getMarket(m, block) {
    if (marketCache.has(m)) return marketCache.get(m);
    const r = await rpcRead({ address: READER, abi: readerAbi, functionName: "getMarket", args: [DATA_STORE, m], blockNumber: block });
    const out = { marketToken: r.marketToken, indexToken: r.indexToken, longToken: r.longToken, shortToken: r.shortToken };
    marketCache.set(m, out);
    return out;
  }

  // one oracle fetch per sample block window, reused for all 3 tokens
  async function pricesAt(tokens, block, p) {
    const logs = await getLog1("OraclePriceUpdate", block - 60n, block);
    const best = {};
    for (const { log, ed } of logs) {
      const tok = lc(getItem(ed, "addressItems", "token"));
      if (!tokens.includes(tok)) continue;
      if (pos(log.blockNumber, log.logIndex) > p) continue;
      best[tok] = { min: getItem(ed, "uintItems", "minPrice"), max: getItem(ed, "uintItems", "maxPrice") };
    }
    return best;
  }

  const sample = matched.slice(0, 4);
  console.log(`\n=== Comparing ${sample.length} matched samples (subgraph RPC method vs emitted event) ===\n`);
  for (const fe of sample) {
    const ev = mpvuByTxMarket.get(`${fe.tx}-${fe.market}`);
    try {
      const mkt = await getMarket(fe.market, fe.block);
      const tokens = [lc(mkt.indexToken), lc(mkt.longToken), lc(mkt.shortToken)];
      const px = await pricesAt(tokens, fe.block, fe.pos);
      const ip = px[lc(mkt.indexToken)], lp = px[lc(mkt.longToken)], sp = px[lc(mkt.shortToken)];
      if (!ip || !lp || !sp) { console.log(`- ${fe.name} blk ${fe.block}: missing oracle price (skip)`); continue; }
      const res = await rpcRead({
        address: READER, abi: readerAbi, functionName: "getMarketTokenPrice",
        args: [DATA_STORE, mkt, { min: ip.min, max: ip.max }, { min: lp.min, max: lp.max }, { min: sp.min, max: sp.max }, TRADERS, true],
        blockNumber: fe.block,
      });
      const poolValueRpc = res[1].poolValue;
      const supplyRpc = await rpcRead({ address: mkt.marketToken, abi: totalSupplyAbi, functionName: "totalSupply", blockNumber: fe.block });
      const pvDiff = poolValueRpc - ev.poolValue;
      const pvRel = ev.poolValue !== 0n ? Number((pvDiff * 10000000n) / ev.poolValue) / 100000 : 0;
      const supDiff = supplyRpc - ev.supply;
      console.log(`- ${fe.name} blk ${fe.block} mkt ${fe.market}`);
      console.log(`    actionType ${ev.actionType}${ev.actionType === TRADERS ? " (TRADERS)" : " (NOT traders)"}`);
      console.log(`    poolValue rpc=${poolValueRpc}`);
      console.log(`              evt=${ev.poolValue}  diff=${pvDiff} (${pvRel}%) ${pvDiff === 0n ? "EXACT" : ""}`);
      console.log(`    supply    rpc=${supplyRpc}`);
      console.log(`              evt=${ev.supply}  diff=${supDiff} ${supDiff === 0n ? "EXACT" : ""}`);
    } catch (e) {
      console.log(`- ${fe.name} blk ${fe.block}: error ${e.shortMessage ?? e.message}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
