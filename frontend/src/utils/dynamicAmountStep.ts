export function getDynamicAmountStep(value: number): number {
  const absInt = Math.abs(Math.trunc(value));
  const digits = absInt === 0 ? 2 : String(absInt).length;
  if (digits <= 2) return 1;
  if (digits === 3) return 10;
  if (digits === 4) return 100;
  if (digits === 5) return 1000;
  if (digits === 6) return 10000;
  return 100000;
}
