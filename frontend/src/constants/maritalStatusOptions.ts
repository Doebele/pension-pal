import type { MaritalStatusValue } from "../types/personalDataTypes";

export const MARITAL_STATUS_OPTIONS: Array<{ value: MaritalStatusValue; label: string }> = [
  { value: "single", label: "Unverheiratet" },
  { value: "married", label: "Verheiratet" },
  { value: "divorced", label: "Geschieden" },
  { value: "widowed", label: "Witwer/Witwe" },
  { value: "concubinage", label: "Konkubinat" },
];

export const SHOW_MARRIAGE_FIELDS_FOR = new Set<MaritalStatusValue>([
  "married",
  "divorced",
  "widowed",
  "concubinage",
]);
