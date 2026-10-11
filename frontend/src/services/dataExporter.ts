import type { ExportCSVData } from "../types/exportTypes";
import { convertRowsToCsv } from "../utils/csvConverter";

type UnknownRecord = Record<string, unknown>;

const DEFAULT_EXPORT_VERSION = "1.0" as const;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseLocaleNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .replace(/[\s']/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDateTimeLabel(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
}

export function buildExportCsvData(
  profileData: Record<string, unknown>,
  projectId: string | null,
): ExportCSVData {
  const personal = asRecord(profileData.personal);
  const propertyDetails = asRecord(personal.property_details);
  const pensionFund = asRecord(profileData.pension_fund);
  const thirdPillar = asRecord(profileData.third_pillar);
  const ahv = asRecord(profileData.ahv);
  const severance = asRecord(profileData.severance);
  const scenario = asRecord(profileData.scenario);
  const analysisState = asRecord(scenario.analysis_state);
  const investmentsRaw = Array.isArray(personal.investment_assets)
    ? asRecord(personal.investment_assets[0])
    : {};

  const etf = parseLocaleNumber(investmentsRaw.etf_chf) ?? 0;
  const stocks = parseLocaleNumber(investmentsRaw.stocks_chf) ?? 0;
  const savings = parseLocaleNumber(investmentsRaw.savings_plan_chf) ?? 0;
  const realEstateEtf = parseLocaleNumber(investmentsRaw.real_estate_etf_chf) ?? 0;
  const investmentPortfolioTotalChf = etf + stocks + savings + realEstateEtf;
  const cashTotal = Array.isArray(personal.cash_assets)
    ? personal.cash_assets.reduce((sum, entry) => {
      const row = asRecord(entry);
      return sum + (parseLocaleNumber(row.amount_chf) ?? parseLocaleNumber(row.amount) ?? 0);
    }, 0)
    : 0;

  const exportPayload: ExportCSVData = {
    timestamp: isoDateTimeLabel(new Date()),
    projectId,
    exportVersion: DEFAULT_EXPORT_VERSION,
    birthDate: toString(personal.date_of_birth) || null,
    gender: (toString(personal.gender) as ExportCSVData["gender"]) || "",
    civilStatus: toString(personal.marital_status),
    livingSituation: toString(propertyDetails.living_situation),
    taxDomicileCanton: toString(propertyDetails.tax_domicile_canton).toUpperCase(),
    firstPillarExpectedPension: parseLocaleNumber(ahv.expected_annual_pension),
    firstPillarContributionYears: parseLocaleNumber(ahv.contribution_years),
    secondPillarGuthaben: parseLocaleNumber(pensionFund.current_oldage_capital),
    secondPillarProvider: toString(pensionFund.provider),
    thirdPillar3aAccounts: parseLocaleNumber(thirdPillar.account_count),
    thirdPillar3aRate: parseLocaleNumber(thirdPillar.expected_return_percent),
    thirdPillar3bPortfolioValue: parseLocaleNumber(thirdPillar.capital_3b),
    capitalNeedPercent: parseLocaleNumber(analysisState.capitalNeedPercent),
    totalAssetValue: investmentPortfolioTotalChf + cashTotal,
    severanceAmountChf: parseLocaleNumber(severance.amount),
    investmentPortfolioTotalChf,
    profilePayloadJson: JSON.stringify(profileData),
  };

  return exportPayload;
}

export function exportAllDataAsCsv(
  profileData: Record<string, unknown>,
  projectId: string | null,
): { csvContent: string; data: ExportCSVData; fileName: string } {
  const data = buildExportCsvData(profileData, projectId);
  const csvContent = convertRowsToCsv([data]);
  const dateLabel = data.timestamp.replace(/[: ]/g, "-");
  return {
    csvContent,
    data,
    fileName: `pensionpal-export-${dateLabel}.csv`,
  };
}
