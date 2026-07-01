// viem public clients per chain, used by Effect-API contract calls.
// RPC urls come from env (recommended: archive nodes for historical eth_call),
// with public fallbacks so the indexer runs out-of-the-box.

import { createPublicClient, http, type PublicClient } from "viem";

const rpcUrlByChainId: Record<number, string> = {
  42161: process.env.RPC_URL_42161 ?? "https://arb1.arbitrum.io/rpc",
  43114: process.env.RPC_URL_43114 ?? "https://api.avax.network/ext/bc/C/rpc",
  43113: process.env.RPC_URL_43113 ?? "https://api.avax-test.network/ext/bc/C/rpc",
  421613: process.env.RPC_URL_421613 ?? "https://goerli-rollup.arbitrum.io/rpc",
  3637: process.env.RPC_URL_3637 ?? "https://rpc.botanixlabs.com",
  4326: process.env.RPC_URL_4326 ?? "https://mainnet.megaeth.com/rpc",
};

/**
 * Effect rate limit. OFF by default: we rely on viem JSON-RPC batching to
 * coalesce the parallel preload calls into a few requests. A per-call rate
 * limit would serialize calls and defeat batching, so only enable it (via
 * RPC_RATE_LIMIT=<calls per second>) if your RPC still 429s with batching on.
 */
export function effectRateLimit(): false | { calls: number; per: "second" } {
  const v = process.env.RPC_RATE_LIMIT;
  if (v && Number(v) > 0) {
    return { calls: Number(v), per: "second" };
  }
  return false;
}

// Max JSON-RPC calls coalesced into one HTTP request (tune with RPC_BATCH_SIZE).
const BATCH_SIZE = Number(process.env.RPC_BATCH_SIZE ?? 50);

const clients = new Map<number, PublicClient>();

export function getClient(chainId: number): PublicClient {
  let client = clients.get(chainId);
  if (!client) {
    const url = rpcUrlByChainId[chainId];
    if (!url) {
      throw new Error(`No RPC url configured for chain ${chainId}`);
    }
    client = createPublicClient({
      transport: http(url, {
        // Coalesce concurrent eth_calls (made during Envio's preload phase) into
        // a single JSON-RPC batch request — the main defense against 429s.
        batch: { batchSize: BATCH_SIZE, wait: 20 },
        // Bounded retries so a throttled call fails fast instead of hanging.
        retryCount: 3,
        retryDelay: 200,
        timeout: 5_000,
      }),
    });
    clients.set(chainId, client);
  }
  return client;
}
