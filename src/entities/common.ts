// Ported from gmx-subgraph/synthetics-stats/src/entities/common.ts
//
// All entity ids are prefixed with `${chainId}-` because the 6 chains share a
// single Envio database (the subgraph used one deployment per chain).

import type { EvmOnEventContext, Transaction } from "envio";

// Minimal structural shape of the events used by these helpers.
export type CommonEvent = {
  readonly chainId: number;
  readonly logIndex: number;
  readonly block: { readonly number: number; readonly timestamp: number };
  readonly transaction: {
    readonly hash: string;
    readonly transactionIndex: number;
    readonly from?: string;
    readonly to?: string;
  };
};

export function transactionId(chainId: number, hash: string): string {
  return `${chainId}-${hash}`;
}

// Recover the raw (un-prefixed) id for storing in data fields that the subgraph
// kept un-prefixed (e.g. TradeAction.orderKey = order.id). Entity ids and `_id`
// foreign keys stay prefixed.
export function stripChainPrefix(chainId: number, id: string): string {
  return id.slice(`${chainId}-`.length);
}

export function getIdFromEvent(event: CommonEvent): string {
  return `${event.chainId}-${event.transaction.hash}:${event.logIndex}`;
}

export async function getOrCreateTransaction(
  event: CommonEvent,
  context: EvmOnEventContext
): Promise<Transaction> {
  let id = transactionId(event.chainId, event.transaction.hash);
  let entity = await context.Transaction.get(id);

  if (entity == null) {
    entity = {
      id,
      hash: event.transaction.hash,
      timestamp: event.block.timestamp,
      blockNumber: event.block.number,
      transactionIndex: event.transaction.transactionIndex,
      from: event.transaction.from == null ? "" : event.transaction.from,
      to: event.transaction.to == null ? "" : event.transaction.to,
    };
    context.Transaction.set(entity);
  }

  return entity;
}
