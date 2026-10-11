export type TaxBracket = {
  incomeMin: number;
  incomeMax: number;
  taxRate: number;
};

export type TaxModel = {
  kanton: {
    code: string;
    name: string;
  };
  progressionTable: TaxBracket[];
  lumpSum?: {
    enabled: boolean;
    rate: number | null;
  };
  metadata: {
    version: string;
    validFromYear: number;
    source: string;
    archivedVersions?: string[];
  };
};

const taxModelFiles = import.meta.glob("../config/taxModels/*.json");

const DEFAULT_TAX_MODEL: TaxModel = {
  kanton: { code: "ZH", name: "Zuerich" },
  progressionTable: [
    { incomeMin: 0, incomeMax: 25000, taxRate: 1.8 },
    { incomeMin: 25000, incomeMax: 50000, taxRate: 3.1 },
    { incomeMin: 50000, incomeMax: 80000, taxRate: 4.5 },
    { incomeMin: 80000, incomeMax: 120000, taxRate: 6.0 },
    { incomeMin: 120000, incomeMax: 180000, taxRate: 7.3 },
    { incomeMin: 180000, incomeMax: 999999999, taxRate: 8.0 },
  ],
  lumpSum: { enabled: false, rate: null },
  metadata: {
    version: "fallback",
    validFromYear: 2025,
    source: "Fallback default model",
    archivedVersions: [],
  },
};

function isValidTaxModel(raw: unknown): raw is TaxModel {
  if (!raw || typeof raw !== "object") return false;
  const value = raw as Record<string, unknown>;
  if (!value.kanton || typeof value.kanton !== "object") return false;
  const kanton = value.kanton as Record<string, unknown>;
  if (typeof kanton.code !== "string" || typeof kanton.name !== "string") return false;
  if (!Array.isArray(value.progressionTable) || value.progressionTable.length === 0) return false;
  const progressionOk = value.progressionTable.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const bracket = entry as Record<string, unknown>;
    return (
      typeof bracket.incomeMin === "number" &&
      typeof bracket.incomeMax === "number" &&
      typeof bracket.taxRate === "number"
    );
  });
  if (!progressionOk) return false;
  if (!value.metadata || typeof value.metadata !== "object") return false;
  const metadata = value.metadata as Record<string, unknown>;
  return (
    typeof metadata.version === "string" &&
    typeof metadata.validFromYear === "number" &&
    typeof metadata.source === "string"
  );
}

export async function loadTaxModel(cantonCode: string): Promise<TaxModel> {
  const code = (cantonCode || "").trim().toUpperCase();
  const filePath = `../config/taxModels/${code}.json`;
  const importer = taxModelFiles[filePath];
  if (!importer) return DEFAULT_TAX_MODEL;

  try {
    const loaded = (await importer()) as { default?: unknown } | unknown;
    const candidate =
      loaded && typeof loaded === "object" && "default" in loaded
        ? (loaded as { default?: unknown }).default
        : loaded;
    if (isValidTaxModel(candidate)) return candidate;
    return DEFAULT_TAX_MODEL;
  } catch {
    return DEFAULT_TAX_MODEL;
  }
}

export function estimateTaxRateForIncome(model: TaxModel, annualIncome: number): number {
  const income = Number.isFinite(annualIncome) ? annualIncome : 0;
  const bracket =
    model.progressionTable.find((entry) => income >= entry.incomeMin && income < entry.incomeMax) ||
    model.progressionTable[model.progressionTable.length - 1];
  return bracket?.taxRate ?? 0;
}

export function getAvailableTaxModelCantons(): string[] {
  return Object.keys(taxModelFiles)
    .map((path) => path.split("/").pop()?.replace(".json", "") || "")
    .filter(Boolean)
    .sort();
}
