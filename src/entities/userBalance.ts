// Ported from gmx-subgraph/synthetics-stats/src/entities/userBalance.ts
import type {
  EvmOnEventContext,
  LatestUserGmTokensBalanceChangeRef,
  Transaction,
  UserGmTokensBalanceChange,
} from "envio";
import type { Mutable } from "../utils/types";
import { getOrCreateCollectedMarketFees } from "./fees";

const ZERO = 0n;
const ONE = 1n;

export async function saveUserGmTokensBalanceChange(
  account: string,
  marketAddress: string,
  value: bigint,
  transaction: Transaction,
  transactionLogIndex: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let prevEntity = await getLatestUserGmTokensBalanceChange(account, marketAddress, chainId, context);
  let isDeposit = value > ZERO;
  let entity = await _createUserGmTokensBalanceChange(
    account,
    marketAddress,
    transaction,
    transactionLogIndex,
    isDeposit ? "in" : "out",
    chainId,
    context
  );
  let totalFees = await context.CollectedMarketFeesInfo.get(`${chainId}-${marketAddress}:total`);
  let prevBalance = prevEntity ? prevEntity.tokensBalance : ZERO;
  let prevCumulativeIncome = prevEntity ? prevEntity.cumulativeIncome : ZERO;

  let income = await calcIncomeForEntity(prevEntity, isDeposit, chainId, context);

  entity.tokensBalance = prevBalance + value;
  entity.cumulativeIncome = prevCumulativeIncome + income;
  entity.index = prevEntity ? prevEntity.index + ONE : ZERO;

  if (totalFees) {
    entity.cumulativeFeeUsdPerGmToken = isDeposit
      ? // We need to get `cumulativeFeeUsdPerGmToken` value at the time before a deposit or withdrawal occured.
        // In case of deposits `Transfer` event is emitted inside *execution* transaction *after* `SwapFeesInfo` event.
        // And in case of withdrawals `Transfer` event is emitted inside *creation* transaction *before* `SwapFeesInfo` is emitted inside subsequent *execution* transaction
        totalFees.prevCumulativeFeeUsdPerGmToken
      : totalFees.cumulativeFeeUsdPerGmToken;
  }

  context.UserGmTokensBalanceChange.set(entity);

  saveLatestUserGmTokensBalanceChange(entity, chainId, context);
}

async function getLatestUserGmTokensBalanceChange(
  account: string,
  marketAddress: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<UserGmTokensBalanceChange | undefined> {
  let id = `${chainId}-${account}:${marketAddress}`;
  let latestRef = await context.LatestUserGmTokensBalanceChangeRef.get(id);

  if (!latestRef) return undefined;

  let latestId = latestRef.latestUserGmTokensBalanceChange_id;

  if (!latestId) {
    context.log.warn(`LatestUserGmTokensBalanceChangeRef.latestUserGmTokensBalanceChange is null: ${id}`);
    throw new Error("LatestUserGmTokensBalanceChangeRef.latestUserGmTokensBalanceChange is null");
  }

  return await context.UserGmTokensBalanceChange.get(latestId);
}

function saveLatestUserGmTokensBalanceChange(
  change: UserGmTokensBalanceChange,
  chainId: number,
  context: EvmOnEventContext
): void {
  let id = `${chainId}-${change.account}:${change.marketAddress}`;
  let latestRef: LatestUserGmTokensBalanceChangeRef = {
    id,
    latestUserGmTokensBalanceChange_id: change.id,
  };
  context.LatestUserGmTokensBalanceChangeRef.set(latestRef);
}

async function calcIncomeForEntity(
  entity: UserGmTokensBalanceChange | undefined,
  isDeposit: boolean,
  chainId: number,
  context: EvmOnEventContext
): Promise<bigint> {
  if (!entity) return ZERO;
  if (entity.tokensBalance == ZERO) return ZERO;

  let currentFees = await getOrCreateCollectedMarketFees(entity.marketAddress, 0, "total", chainId, context);
  let latestCumulativeFeePerGm = isDeposit
    ? currentFees.prevCumulativeFeeUsdPerGmToken
    : currentFees.cumulativeFeeUsdPerGmToken;
  let feeUsdPerGmToken = latestCumulativeFeePerGm - entity.cumulativeFeeUsdPerGmToken;

  return (feeUsdPerGmToken * entity.tokensBalance) / 10n ** 18n;
}

async function _createUserGmTokensBalanceChange(
  account: string,
  marketAddress: string,
  transaction: Transaction,
  transactionLogIndex: number,
  postfix: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<UserGmTokensBalanceChange>> {
  let id = `${chainId}-${account}:${marketAddress}:${transaction.hash}:${transactionLogIndex.toString()}:${postfix}`;
  let entity = await context.UserGmTokensBalanceChange.get(id);

  if (entity) {
    context.log.warn(`UserGmTokensBalanceChange already exists: ${entity.id}`);
    throw new Error("UserGmTokensBalanceChange already exists");
  }

  return {
    id,
    account: account,
    marketAddress: marketAddress,
    index: ZERO,
    tokensBalance: ZERO,
    timestamp: transaction.timestamp,
    cumulativeIncome: ZERO,
    cumulativeFeeUsdPerGmToken: ZERO,
  };
}
