export type LumpSumAllocationModel = {
  grossLumpSumChf: number;
  taxRatePercent: number;
  netLumpSumLimitChf: number;
  depositPensionChf: number;
  mutualFundsChf: number;
  directPayoutChf: number;
  maturityMonth: number | null;
  maturityYear: number | null;
};

export type LumpSumField = "depositPension" | "mutualFunds" | "directPayout";

export type LumpSumAdjustmentReason =
  | "none"
  | "mutual_funds_clamped"
  | "deposit_clamped"
  | "direct_payout_clamped";
