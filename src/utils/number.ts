// Ported from gmx-subgraph/synthetics-stats/src/utils/number.ts
// AssemblyScript BigInt -> JS bigint.

export const ZERO = 0n;
export const ONE = 1n;

export function expandDecimals(n: bigint, decimals: number): bigint {
  return n * 10n ** BigInt(decimals);
}
