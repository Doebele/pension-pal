export type RetirementPhase = "aufbau" | "ausgleich" | "finalcheck" | "bezug";

export type ContributionLimitInput = {
  hasPensionFund: boolean;
  netIncomeChf?: number;
  limitWithPensionFund?: number;
  limitWithoutPensionFundCap?: number;
};

export type SmartContributionInput = {
  accountBalances: number[];
  plannedContributionChf: number;
  limitInput: ContributionLimitInput;
};

export type SmartContributionResult = {
  recommendedAccountIndex: number;
  recommendedReason: string;
  maxAllowedContributionChf: number;
  limitViolation: boolean;
  deviationPercent: number;
  balanceWarning: boolean;
};

export type PayoutCalendarEntry = {
  accountLabel: "A" | "B" | "C";
  plannedYear: number;
};

export type PayoutCoordinationInput = {
  payoutCalendar: PayoutCalendarEntry[];
  plannedPkWithdrawalYears: number[];
  plannedPartnerWithdrawalYears: number[];
};

export type PayoutCoordinationWarning = {
  year: number;
  message: string;
  severity: "warning" | "error";
};

const sanitizeNumber = (value: number): number => (Number.isFinite(value) ? value : 0);

export const getRetirementPhase = (yearsToRetirement: number): RetirementPhase => {
  if (yearsToRetirement >= 8 && yearsToRetirement <= 10) return "aufbau";
  if (yearsToRetirement >= 1 && yearsToRetirement <= 7) return "ausgleich";
  if (yearsToRetirement > 0 && yearsToRetirement < 1) return "finalcheck";
  return "bezug";
};

export const getContributionLimit = (input: ContributionLimitInput): number => {
  const withPkLimit = input.limitWithPensionFund ?? 7258;
  const withoutPkCap = input.limitWithoutPensionFundCap ?? 36288;
  if (input.hasPensionFund) return withPkLimit;
  const netIncome = sanitizeNumber(input.netIncomeChf ?? 0);
  return Math.min(withoutPkCap, netIncome * 0.2);
};

export const getBalanceDeviationPercent = (balances: number[]): number => {
  const validBalances = balances.map(sanitizeNumber).filter((value) => value >= 0);
  if (validBalances.length < 2) return 0;
  const min = Math.min(...validBalances);
  const max = Math.max(...validBalances);
  if (max === 0) return 0;
  return ((max - min) / max) * 100;
};

export const getSmartContributionRecommendation = (
  input: SmartContributionInput,
): SmartContributionResult => {
  const normalized = input.accountBalances.map(sanitizeNumber);
  const maxAllowedContributionChf = getContributionLimit(input.limitInput);
  const plannedContributionChf = sanitizeNumber(input.plannedContributionChf);

  let recommendedAccountIndex = 0;
  let smallestBalance = Number.POSITIVE_INFINITY;
  normalized.forEach((balance, index) => {
    if (balance < smallestBalance) {
      smallestBalance = balance;
      recommendedAccountIndex = index;
    }
  });

  const deviationPercent = getBalanceDeviationPercent(normalized);

  return {
    recommendedAccountIndex,
    recommendedReason: "Buchung auf das aktuell kleinste Konto, um die 3 Konten zu glätten.",
    maxAllowedContributionChf,
    limitViolation: plannedContributionChf > maxAllowedContributionChf,
    deviationPercent,
    balanceWarning: deviationPercent > 15,
  };
};

export const getPayoutCoordinationWarnings = (
  input: PayoutCoordinationInput,
): PayoutCoordinationWarning[] => {
  const warnings: PayoutCoordinationWarning[] = [];
  const payoutYears = new Set(input.payoutCalendar.map((entry) => entry.plannedYear));
  for (const year of input.plannedPkWithdrawalYears) {
    if (payoutYears.has(year)) {
      warnings.push({
        year,
        severity: "warning",
        message: `PK-Bezug im selben Steuerjahr (${year}) wie ein 3a-Bezug geplant.`,
      });
    }
  }
  for (const year of input.plannedPartnerWithdrawalYears) {
    if (payoutYears.has(year)) {
      warnings.push({
        year,
        severity: "warning",
        message: `Partnerbezug im selben Steuerjahr (${year}) wie ein 3a-Bezug geplant.`,
      });
    }
  }
  return warnings;
};

