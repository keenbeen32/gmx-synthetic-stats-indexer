// Ported from gmx-subgraph/synthetics-stats/src/entities/user.ts
import type { EvmOnEventContext, User, UserStat } from "envio";
import type { Mutable } from "../utils/types";
import { timestampToPeriodStart } from "../utils/time";

export async function saveUserStat(
  type: string,
  account: string,
  timestamp: number,
  chainId: number,
  context: EvmOnEventContext
): Promise<void> {
  let totalUserStats = await getOrCreateUserStat(timestamp, "total", chainId, context);
  let dailyUserStats = await getOrCreateUserStat(timestamp, "1d", chainId, context);

  let existing = await context.User.get(`${chainId}-${account}`);
  let userData: Mutable<User>;

  if (existing == null) {
    userData = {
      id: `${chainId}-${account}`,
      account: account,
      totalSwapCount: 0,
      totalPositionCount: 0,
      totalDepositCount: 0,
      totalWithdrawalCount: 0,
    };

    if (account) {
      totalUserStats.uniqueUsers += 1;
      dailyUserStats.uniqueUsers += 1;
    }
  } else {
    userData = { ...existing };
  }

  if (type === "swap") {
    totalUserStats.totalSwapCount += 1;
    dailyUserStats.totalSwapCount += 1;
    userData.totalSwapCount += 1;
  }

  if (type === "margin") {
    totalUserStats.totalPositionCount += 1;
    dailyUserStats.totalPositionCount += 1;
    userData.totalPositionCount += 1;
  }

  if (type === "deposit") {
    totalUserStats.totalDepositCount += 1;
    dailyUserStats.totalDepositCount += 1;
    userData.totalDepositCount += 1;
  }

  if (type === "withdrawal") {
    totalUserStats.totalWithdrawalCount += 1;
    dailyUserStats.totalWithdrawalCount += 1;
    userData.totalWithdrawalCount += 1;
  }

  context.UserStat.set(totalUserStats);
  context.UserStat.set(dailyUserStats);
  context.User.set(userData);
}

async function getOrCreateUserStat(
  timestamp: number,
  period: string,
  chainId: number,
  context: EvmOnEventContext
): Promise<Mutable<UserStat>> {
  let timestampGroup = timestampToPeriodStart(timestamp, period);
  let userId = period === "total" ? `${chainId}-total` : `${chainId}-${timestampGroup.toString()}`;
  let user = await context.UserStat.get(userId);

  if (user == null) {
    return {
      id: userId,
      period: period,
      totalPositionCount: 0,
      totalSwapCount: 0,
      totalDepositCount: 0,
      totalWithdrawalCount: 0,
      uniqueUsers: 0,
      timestamp: timestampGroup,
    };
  }
  return { ...user };
}
