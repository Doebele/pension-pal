export type CurrencyCode = "CHF" | "EUR" | "USD" | "GBP";

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ["CHF", "EUR", "USD", "GBP"];

export type FxRateMap = Record<CurrencyCode, number>;

// Mock exchange rates -> CHF per 1 unit of foreign currency.
export const DEFAULT_FX_RATES: FxRateMap = {
  CHF: 1,
  EUR: 0.96,
  USD: 0.89,
  GBP: 1.12,
};

export const round2 = (value: number) => Math.round(value * 100) / 100;

export const convertToChf = (amount: number, currency: CurrencyCode, rates: FxRateMap) =>
  round2(amount * (rates[currency] ?? 1));
