export type CompletionRate = {
  filled: number;
  total: number;
  percent: number;
};

export function calculateCompletionRate(values: Array<unknown>): CompletionRate {
  const total = values.length;
  if (total === 0) return { filled: 0, total: 0, percent: 0 };
  const filled = values.filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "boolean") return true;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }).length;
  const percent = Math.round((filled / total) * 100);
  return { filled, total, percent };
}
