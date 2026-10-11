import React from "react";
import type { LumpSumAdjustmentReason } from "../types/financialModels";
import { MAX_ALLOCATION_TOLERANCE_CHF } from "../store/constants/taxAndYieldConfig";

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type Params = {
  netLumpSumLimitChf: number;
  initialDepositPensionChf: number;
  initialMutualFundsChf: number;
  initialDirectPayoutChf: number;
};

export function useLumpSumAllocation({
  netLumpSumLimitChf,
  initialDepositPensionChf,
  initialMutualFundsChf,
  initialDirectPayoutChf,
}: Params) {
  const limit = Math.max(0, round2(netLumpSumLimitChf));
  const [depositPensionChf, setDepositPensionChf] = React.useState(
    clamp(round2(initialDepositPensionChf), 0, limit),
  );
  const [mutualFundsChf, setMutualFundsChf] = React.useState(
    clamp(round2(initialMutualFundsChf), 0, limit),
  );
  const [directPayoutChf, setDirectPayoutChf] = React.useState(
    clamp(round2(initialDirectPayoutChf), 0, limit),
  );
  const [adjustmentReason, setAdjustmentReason] = React.useState<LumpSumAdjustmentReason>("none");

  const normalizeTotals = React.useCallback(
    (nextDeposit: number, nextMutual: number, nextDirect: number) => {
      const safeDeposit = clamp(round2(nextDeposit), 0, limit);
      const safeMutual = clamp(round2(nextMutual), 0, limit);
      const safeDirect = clamp(round2(nextDirect), 0, limit);
      const sum = safeDeposit + safeMutual + safeDirect;
      if (sum <= limit + MAX_ALLOCATION_TOLERANCE_CHF) {
        return { deposit: safeDeposit, mutual: safeMutual, direct: safeDirect };
      }
      const overflow = sum - limit;
      // reduce direct first, then mutual, then deposit.
      const directReduced = Math.max(0, safeDirect - overflow);
      const remainingOverflow1 = Math.max(0, overflow - (safeDirect - directReduced));
      const mutualReduced = Math.max(0, safeMutual - remainingOverflow1);
      const remainingOverflow2 = Math.max(0, remainingOverflow1 - (safeMutual - mutualReduced));
      const depositReduced = Math.max(0, safeDeposit - remainingOverflow2);
      return {
        deposit: round2(depositReduced),
        mutual: round2(mutualReduced),
        direct: round2(directReduced),
      };
    },
    [limit],
  );

  React.useEffect(() => {
    const normalized = normalizeTotals(
      depositPensionChf,
      mutualFundsChf,
      directPayoutChf,
    );
    if (
      Math.abs(normalized.deposit - depositPensionChf) > MAX_ALLOCATION_TOLERANCE_CHF
      || Math.abs(normalized.mutual - mutualFundsChf) > MAX_ALLOCATION_TOLERANCE_CHF
      || Math.abs(normalized.direct - directPayoutChf) > MAX_ALLOCATION_TOLERANCE_CHF
    ) {
      setDepositPensionChf(normalized.deposit);
      setMutualFundsChf(normalized.mutual);
      setDirectPayoutChf(normalized.direct);
      setAdjustmentReason("direct_payout_clamped");
    }
  }, [depositPensionChf, directPayoutChf, mutualFundsChf, normalizeTotals]);

  const onChangeMutualFunds = (value: number) => {
    const nextMutual = clamp(round2(value), 0, limit);
    const remaining = Math.max(0, limit - nextMutual);
    const nextDeposit = Math.min(depositPensionChf, remaining);
    const nextDirect = round2(Math.max(0, remaining - nextDeposit));
    setMutualFundsChf(nextMutual);
    setDepositPensionChf(round2(nextDeposit));
    setDirectPayoutChf(nextDirect);
    setAdjustmentReason("mutual_funds_clamped");
  };

  const onChangeDepositPension = (value: number) => {
    const nextDeposit = clamp(round2(value), 0, limit);
    const remaining = Math.max(0, limit - nextDeposit);
    const nextMutual = Math.min(mutualFundsChf, remaining);
    const nextDirect = round2(Math.max(0, remaining - nextMutual));
    setDepositPensionChf(nextDeposit);
    setMutualFundsChf(round2(nextMutual));
    setDirectPayoutChf(nextDirect);
    setAdjustmentReason("deposit_clamped");
  };

  const onChangeDirectPayout = (value: number) => {
    const nextDirect = clamp(round2(value), 0, limit);
    const remaining = Math.max(0, limit - nextDirect);
    const nextMutual = Math.min(mutualFundsChf, remaining);
    const nextDeposit = round2(Math.max(0, remaining - nextMutual));
    setDirectPayoutChf(nextDirect);
    setMutualFundsChf(round2(nextMutual));
    setDepositPensionChf(nextDeposit);
    setAdjustmentReason("direct_payout_clamped");
  };

  return {
    limit,
    depositPensionChf,
    mutualFundsChf,
    directPayoutChf,
    adjustmentReason,
    onChangeMutualFunds,
    onChangeDepositPension,
    onChangeDirectPayout,
  };
}
