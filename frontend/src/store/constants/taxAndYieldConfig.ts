export const UBS_PENSION_FUND_BASE_YIELD = 0.0125;

// Conservative yearly adjustment to avoid hardcoded single-year behavior.
export const TAX_RATE_YEAR_STEP = 0.0015;

export const MAX_ALLOCATION_TOLERANCE_CHF = 0.01;

export function getUbsPensionFundYieldForMaturity(
  maturityYear: number | null,
  currentYear = new Date().getFullYear(),
): number {
  if (!maturityYear) return UBS_PENSION_FUND_BASE_YIELD;
  const yearDelta = maturityYear - currentYear;
  // Keep yield in a realistic conservative corridor.
  const shifted = UBS_PENSION_FUND_BASE_YIELD + yearDelta * 0.0004;
  return Math.max(0.005, Math.min(0.03, shifted));
}

export function getTaxRateAtMaturity(
  baseTaxRatePercent: number,
  maturityYear: number | null,
  currentYear = new Date().getFullYear(),
): number {
  if (!Number.isFinite(baseTaxRatePercent)) return 0;
  if (!maturityYear) return Math.max(0, baseTaxRatePercent);
  const yearDelta = maturityYear - currentYear;
  const adjusted = baseTaxRatePercent + yearDelta * TAX_RATE_YEAR_STEP * 100;
  return Math.max(0, Math.min(45, adjusted));
}
