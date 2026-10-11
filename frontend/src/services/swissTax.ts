export const CANTON_WITHDRAWAL_TAX_RATES: Record<string, number> = {
  AG: 6.6,
  AI: 5.3,
  AR: 5.9,
  BE: 7.8,
  BL: 7.2,
  BS: 8.1,
  FR: 7.4,
  GE: 9.2,
  GL: 6.1,
  GR: 5.8,
  JU: 7.6,
  LU: 6.9,
  NE: 8.3,
  NW: 5.5,
  OW: 5.4,
  SG: 6.7,
  SH: 6.4,
  SO: 6.8,
  SZ: 5.2,
  TG: 6.5,
  TI: 7.9,
  UR: 5.7,
  VD: 8.8,
  VS: 7.1,
  ZG: 5.1,
  ZH: 8.0,
};

export const CANTON_OPTIONS = Object.keys(CANTON_WITHDRAWAL_TAX_RATES).sort();

export function getWithdrawalTaxRateForCanton(canton: string): number | null {
  const key = canton.trim().toUpperCase();
  if (!key) return null;
  return CANTON_WITHDRAWAL_TAX_RATES[key] ?? null;
}

