import { useTranslation } from "react-i18next";
import React, { useEffect, useMemo, useState } from "react";
import { CardLayout, CardId, CardStatus } from "../components/dashboard/CardLayout";
import {
  PersonalDataCard,
} from "../components/cards/PersonalDataCard";
import type {
  AdditionalProperty,
  LivingSituation,
  MaritalStatusValue,
  ProfileGender,
} from "../types/personalDataTypes";
import { AssetsOverviewCard } from "../components/cards/AssetsOverviewCard";
import { PensionFundCard, PensionFundSnapshot } from "../components/cards/PensionFundCard";
import { ThirdPillarCard, ThirdPillarState } from "../components/cards/ThirdPillarCard";
import {
  LifeInsuranceTile,
  LifeInsuranceState,
  LifeImportFieldId,
  LifeImportMapping,
  LifeImportPreview,
} from "../components/cards/LifeInsuranceTile";
import { SeveranceCard, SeveranceState } from "../components/cards/SeveranceCard";
import { AhvCard, AhvState } from "../components/cards/AhvCard";
import { AhvContributionRow } from "../components/cards/AhvContributionTable";
import { CashAssetsState, CashAssetRow } from "../components/cards/CashAssetsCard";
import { InvestmentAssetsState } from "../components/cards/InvestmentAssetsCard";
import { SwissLocation, findSwissLocationByZip } from "../components/locationSearch";
import { GlobalImportZone } from "../components/import/GlobalImportZone";
import {
  SelectTargetField,
  ImportPreview,
  TargetCardOption,
} from "../components/import/SelectTargetField";
import { useToast } from "../components/notifications/useToast";
import { useNavigationLock } from "../context/NavigationLockContext";
import { api } from "../services/api";
import { convertToChf, DEFAULT_FX_RATES } from "../services/fxRates";
import { getWithdrawalTaxRateForCanton } from "../services/swissTax";
import { useUserProfile } from "../hooks/useUserProfile";
import { calculateCompletionRate } from "../utils/completion";
import { ahvHistoryStats as ahvHistory, ahvTiming, estimateAhvAnnualPension } from "../services/ahvEstimate";
import { legalAhvReferenceAge } from "../services/payoutPlanning";

const BIRTHDATE_DRAFT_KEY = "spc_birth_date_draft";
const PILLAR3_TAB_QUERY_KEY = "pillar3_tab";
type Pillar3TabId = "portfolio" | "motionEttlin3a";
type NavigationOriginLabel = string | null;

const readPillar3TabFromUrl = (): Pillar3TabId => {
  if (typeof window === "undefined") return "portfolio";
  const value = new URLSearchParams(window.location.search).get(PILLAR3_TAB_QUERY_KEY);
  return value === "motionEttlin3a" ? "motionEttlin3a" : "portfolio";
};

const writePillar3TabToUrl = (tab: Pillar3TabId) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (tab === "portfolio") {
    url.searchParams.delete(PILLAR3_TAB_QUERY_KEY);
  } else {
    url.searchParams.set(PILLAR3_TAB_QUERY_KEY, tab);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
};

const normalizeCashAccountType = (value: string | undefined): string => {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "bank";
  if (["konto", "bankkonto", "bank", "account", "checking", "savings"].includes(normalized)) return "bank";
  if (["cash", "bar", "bargeld"].includes(normalized)) return "cash";
  if (["depot", "wertschriftendepot", "brokerage"].includes(normalized)) return "depot";
  if (["3a", "säule 3a", "saeule 3a", "pillar3a"].includes(normalized)) return "pillar3a";
  if (["freizügigkeit", "freizuegigkeit", "vested_benefits"].includes(normalized)) return "vested_benefits";
  if (["bank", "cash", "depot", "pillar3a", "vested_benefits", "other"].includes(normalized)) return normalized;
  return "other";
};

const isLikelyAhvImportFile = (filename: string): boolean => {
  const normalized = filename.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("ahv")
    || normalized.includes("ik-auszug")
    || normalized.includes("ik_auszug")
    || normalized.includes("ik auszug")
    || normalized.includes("beitragsjahre")
    || (normalized.includes("jahre") && (normalized.includes("betrag") || normalized.includes("beitrag")))
    || (normalized.includes("rente") && normalized.includes("monat"))
    || normalized.includes("1-saeule")
    || normalized.includes("erste-saeule")
  );
};

const isLikelyLifeInsuranceImportFile = (filename: string): boolean => {
  const normalized = filename.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("versicherung")
    || normalized.includes("lebensversicherung")
    || normalized.includes("policy")
    || normalized.includes("police")
    || normalized.includes("ergo")
    // whole words only: "life"/"lv" also occur inside names like "Silvia" or "lifestyle"
    || /(^|[^a-z])(life|lv)([^a-z]|$)/.test(normalized)
  );
};

type AhvImportFieldId =
  | "year"
  | "annual_income_chf"
  | "contribution_total_chf"
  | "age_end_of_year"
  | "ahv_rent_share_chf";

type AhvImportMapping = {
  source_field_id: AhvImportFieldId;
  source_label: string;
  target_field_id: AhvImportFieldId;
  target_label: string;
  confidence: number;
};

const AHV_IMPORT_TARGET_LABELS: Record<AhvImportFieldId, string> = {
  year: "Jahr",
  annual_income_chf: "Jahreseinkommen (CHF)",
  contribution_total_chf: "Total (CHF)",
  age_end_of_year: "Alter",
  ahv_rent_share_chf: "AHV Rente Anteil",
};

const mapAhvFieldIdToRowKey = (
  fieldId: AhvImportFieldId,
): Exclude<keyof AhvContributionRow, "source"> => {
  if (fieldId === "year") return "year";
  if (fieldId === "annual_income_chf") return "annualIncomeChf";
  if (fieldId === "contribution_total_chf") return "contributionTotalChf";
  if (fieldId === "age_end_of_year") return "ageEndOfYear";
  return "ahvRentShareChf";
};

const applyAhvMappingToRows = (
  rows: AhvContributionRow[],
  mappings: AhvImportMapping[],
): AhvContributionRow[] =>
  rows.map((row) => {
    const nextRow: AhvContributionRow = {
      year: "",
      annualIncomeChf: "",
      contributionTotalChf: "",
      ageEndOfYear: "",
      ahvRentShareChf: "",
      source: row.source || "pdf",
    };
    mappings.forEach((mapping) => {
      const sourceKey = mapAhvFieldIdToRowKey(mapping.source_field_id);
      const targetKey = mapAhvFieldIdToRowKey(mapping.target_field_id);
      nextRow[targetKey] = row[sourceKey];
    });
    return nextRow;
  });

type DashboardProps = {
  selectedCardId?: CardId;
  onSelectedCardChange?: (cardId: CardId) => void;
};

const IMPORT_TARGET_OPTIONS: TargetCardOption[] = [
  {
    id: "personal",
    label: "Persönliche Angaben",
    fields: [
      { id: "livingSituation", label: "Wohnsituation" },
      { id: "rentMonthlyChf", label: "Monatliche Miete (CHF)" },
      { id: "rentYearlyChf", label: "Jährliche Miete (CHF)" },
      { id: "estimatedMarketValue", label: "Schätzwert" },
      { id: "mortgageAmount", label: "Hypothek" },
      { id: "landAreaSqm", label: "Grundstücksgrösse" },
    ],
  },
  {
    id: "bvg",
    label: "2. Säule / BVG Pensionskasse",
    fields: [
      { id: "currentOldageCapital", label: "Aktueller Kontostand" },
      { id: "provider", label: "Arbeitgeber / Provider" },
      { id: "bvgInsuredSalary", label: "Versicherter Lohn" },
    ],
  },
  {
    id: "assets",
    label: "Vermögensübersicht",
    fields: [
      { id: "accountBalanceChf", label: "Kontoguthaben" },
      { id: "cashReserveChf", label: "Cash Reserve" },
      { id: "etfChf", label: "ETF" },
      { id: "stocksChf", label: "Aktien" },
      { id: "savingsPlanChf", label: "Sparpläne" },
      { id: "realEstateEtfChf", label: "Immobilien-ETF" },
    ],
  },
  {
    id: "ahv",
    label: "1. Säule / AHV",
    fields: [
      { id: "estimatedAverageAnnualIncome", label: "Ø Jahreseinkommen" },
      { id: "referenceAge", label: "Eintrittsalter" },
    ],
  },
  {
    id: "lifeInsurance",
    label: "Lebensversicherung",
    fields: [
      { id: "insurer", label: "Versicherer" },
      { id: "policyNumber", label: "Versicherungsnummer" },
      { id: "insuredName", label: "Versichertenname" },
      { id: "capitalSumChf", label: "Kapitalsumme" },
      { id: "annualRentPaymentChf", label: "Jährliche Rentenzahlung" },
      { id: "annualPremium", label: "Jährliche Prämie" },
      { id: "monthlyPremium", label: "Monatliche Prämie" },
      { id: "sumAtDeath", label: "Todesfallkapital" },
      { id: "surrenderValue", label: "Rückkaufswert" },
      { id: "maturityDate", label: "Ablaufdatum" },
      { id: "entryAge", label: "Eintrittsalter" },
    ],
  },
  {
    id: "severance",
    label: "Abfindung",
    fields: [
      { id: "amountChf", label: "Abfindungsbetrag (CHF)" },
      { id: "usagePurpose", label: "Verwendungszweck" },
      { id: "planDurationYears", label: "Plan-Laufzeit (Jahre)" },
    ],
  },
];

export const Dashboard: React.FC<DashboardProps> = ({
  selectedCardId,
  onSelectedCardChange,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { withLock } = useNavigationLock();
  const { data: profileData, loading: profileLoading, error: profileError, refresh } = useUserProfile();
  const [birthDate, setBirthDate] = useState("");
  const [profileGender, setProfileGender] = useState<ProfileGender>("");
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatusValue | "">("");
  const [marriageYear, setMarriageYear] = useState("");
  const [divorceYear, setDivorceYear] = useState("");
  const [taxDomicileCanton, setTaxDomicileCanton] = useState("");
  const [livingSituation, setLivingSituation] = useState<LivingSituation>("");
  const [rentMonthlyChf, setRentMonthlyChf] = useState("");
  const [rentYearlyChf, setRentYearlyChf] = useState("");
  const [additionalProperties, setAdditionalProperties] = useState<AdditionalProperty[]>([]);
  const [pensionFund, setPensionFund] = useState<PensionFundSnapshot>({
    provider: "BVG Pensionskasse der UBS",
    asOfDate: "28.02.2026",

    annualSalary: "145'000.00",
    insuredSalaryTotal: "127'350.00",
    bvgInsuredSalary: "64'260.00",

    currentOldageCapital: "786'254.50",
    bvgOldageCapital: "229'161.60",
    vestedBenefitsTotal: "789'180.80",
    maxBuyinTotal: "537'843.60",
    wefAvailable: "393'127.00",

    coordinationDeduction: "26'460.00",
    insuredSalaryRentenplan: "118'540.00",
    insuredSalaryBonusplan: "8'810.00",
    maxBuyinRentenplan: "505'165.10",
    maxBuyinBonusplan: "32'678.50",
  });
  const [property, setProperty] = useState({
    name: "",
    canton: "",
    cantonCode: "",
    municipality: "",
    municipalityId: "",
    zipCode: "",
    estimatedMarketValue: "",
    mortgageAmount: "",
    landAreaSqm: "",
    buildingVolumeCubicM: "",
    imputedRentPerYear: "",
    usage: "owner_occupied" as "owner_occupied" | "rented_out" | "mixed",
  });
  const [thirdPillar, setThirdPillar] = useState<ThirdPillarState>({
    provider: "",
    securitiesChf: "",
    realEstateEquityChf: "",
    monthlySavingsChf: "0",
    expectedReturnPercent: "4",
    accountCount: 1,
    accounts: [
      {
        balanceChf: "",
        expectedReturnPercent: "4",
        yearsToPayout: "10",
      },
    ],
    withdrawalTaxRatePercent: "6",
    taxModel: "flat_placeholder",
    taxCanton: "",
  });
  const [lifeInsurance, setLifeInsurance] = useState<LifeInsuranceState>({
    insuranceType: "gemischt",
    insurer: "",
    policyNumber: "",
    insuredName: "",
    capitalSumChf: "",
    annualRentPaymentChf: "",
    monthlyPremium: "",
    sumAtDeath: "",
    entryAge: "",
    surrenderValue: "",
    annualPremium: "",
    maturityDate: "",
    maturityYear: "",
    monthlyPensionAtRetirement: "",
    capitalPayoutAtMaturity: "",
    currency: "CHF",
  });
  const [severance, setSeverance] = useState<SeveranceState>({
    clientName: "",
    amountChf: "",
    isGrossAmount: true,
    severanceType: "fixed",
    providerPreset: "general",
    formulaModel: "tenure_salary_days",
    employmentStartDate: "",
    employmentEndDate: "",
    startCalculationDay: "",
    startCalculationMonth: "",
    startCalculationYear: "",
    lastAnnualSalaryChf: "",
    formulaDayFactor: "30",
    formulaMonthFactor: "2",
    employer: "",
    payoutYear: String(new Date().getFullYear()),
    maturityMonth: "",
    maturityYear: String(new Date().getFullYear()),
    allocationPensionChf: "0",
    allocationMutualFundsChf: "0",
    allocationDirectPayoutChf: "0",
    usagePurpose: "pillar2",
    etfRiskLevel: "medium",
    ubsProductType: "mixed_fund",
    annualFeePercent: "0.45",
    planDurationYears: "10",
    returnScenarioAdjustment: "0",
  });
  const [ahv, setAhv] = useState<AhvState>({
    referenceAge: "65",
    estimatedAverageAnnualIncome: "",
    contributionEstimate: "",
    expectedAnnualPension: "",
    contributionYears: "",
    earlyRetirementYears: "",
    lateRetirementYears: "",
  });
  const [ahvContributionRows, setAhvContributionRows] = useState<AhvContributionRow[]>([]);
  const [ahvContributionIssues, setAhvContributionIssues] = useState<string[]>([]);
  const [lifeImportPreview, setLifeImportPreview] = useState<LifeImportPreview | null>(null);
  const [ahvImportPreview, setAhvImportPreview] = useState<{
    rawRows: AhvContributionRow[];
    rows: AhvContributionRow[];
    issues: string[];
    metadata?: {
      rows_detected?: number;
      computed_average_income_chf?: number | null;
      computed_total_contributions_chf?: number | null;
      average_income_reference_chf?: number | null;
      total_accumulated_reference_chf?: number | null;
      latest_monthly_rent_reference_chf?: number | null;
      difference_table?: Array<{ label?: string; delta_monthly_chf?: number | null }>;
    };
    mappingSuggestions: AhvImportMapping[];
  } | null>(null);
  const [cashAssets, setCashAssets] = useState<CashAssetsState>({
    rows: [],
  });
  const [investmentAssets, setInvestmentAssets] = useState<InvestmentAssetsState>({
    etfChf: "",
    stocksChf: "",
    savingsPlanChf: "",
    realEstateEtfChf: "",
  });
  const [zipLookupStatus, setZipLookupStatus] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [importStatus, setImportStatus] = useState("");
  const [activeImportPreview, setActiveImportPreview] = useState<{
    sourceCardId: CardId;
    preview: ImportPreview;
  } | null>(null);
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  const [cardDetailsState, setCardDetailsState] = useState<{
    bvg: boolean;
    lifeInsurance: boolean;
  }>({
    bvg: false,
    lifeInsurance: false,
  });
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [wizardActiveCard, setWizardActiveCard] = useState<CardId>("personal");
  const [lastPersistedBirthDate, setLastPersistedBirthDate] = useState("");
  const [pillar3PreferredTab, setPillar3PreferredTab] = useState<Pillar3TabId>(() =>
    readPillar3TabFromUrl(),
  );
  const [pillar3ScrollToTabHeaderSignal, setPillar3ScrollToTabHeaderSignal] = useState(0);
  const [pillar3NavigationOriginLabel, setPillar3NavigationOriginLabel] =
    useState<NavigationOriginLabel>(null);

  useEffect(() => {
    if (!selectedCardId) return;
    setWizardActiveCard((prev) => (prev === selectedCardId ? prev : selectedCardId));
  }, [selectedCardId]);

  useEffect(() => {
    const syncFromUrl = () => setPillar3PreferredTab(readPillar3TabFromUrl());
    window.addEventListener("popstate", syncFromUrl);
    window.addEventListener("hashchange", syncFromUrl);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.removeEventListener("hashchange", syncFromUrl);
    };
  }, []);

  const handlePillar3TabChange = React.useCallback((tab: Pillar3TabId) => {
    setPillar3PreferredTab(tab);
    writePillar3TabToUrl(tab);
    if (tab === "portfolio") {
      setPillar3NavigationOriginLabel(null);
    }
  }, []);

  const createCashRow = React.useCallback((partial?: Partial<CashAssetRow>): CashAssetRow => {
    const amount = partial?.amount || "";
    const normalizedAmount = Number(amount.replace(/['\s]/g, "").replace(",", "."));
    const normalizedAmountString =
      Number.isFinite(normalizedAmount) && normalizedAmount > 0
        ? String(normalizedAmount)
        : amount;
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      accountName: partial?.accountName || "Importiert",
      ...partial,
      accountType: normalizeCashAccountType(partial?.accountType),
      amount: normalizedAmountString,
      currency: partial?.currency || "CHF",
      source: partial?.source || "manual",
    };
  }, []);

  useEffect(() => {
    const draft = localStorage.getItem(BIRTHDATE_DRAFT_KEY);
    if (draft) {
      setBirthDate(draft);
    }
  }, []);

  const toInput = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    return String(value);
  };

  const parseMaybeNumber = (input: string): number | null => {
    if (!input) return null;
    const cleaned = input.replace(/['\s]/g, "");
    const num = Number(cleaned.replace(",", "."));
    return Number.isNaN(num) ? null : num;
  };

  const profileAgeYears = useMemo(() => {
    if (!birthDate) return null;
    const parsed = new Date(birthDate);
    if (Number.isNaN(parsed.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - parsed.getFullYear();
    if (
      now.getMonth() < parsed.getMonth()
      || (now.getMonth() === parsed.getMonth() && now.getDate() < parsed.getDate())
    ) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }, [birthDate]);

  const ahvHistoryOptions = useMemo(() => {
    const birthYear = birthDate ? new Date(birthDate).getFullYear() || null : null;
    return { birthYear, statutoryAge: legalAhvReferenceAge(profileGender, birthYear) };
  }, [birthDate, profileGender]);
  // AHV-Bezug wie in der Bezugsplanung: aus dem geplanten Pensionsalter (Vorbezug max. 2, Aufschub max. 5 Jahre)
  const ahvPlannedTiming = useMemo(
    () => ahvTiming(parseMaybeNumber(ahv.referenceAge) ?? ahvHistoryOptions.statutoryAge, ahvHistoryOptions.statutoryAge),
    [ahv.referenceAge, ahvHistoryOptions],
  );
  const ahvHistoryStats = useMemo(() => ahvHistory(ahvContributionRows, ahvHistoryOptions), [ahvContributionRows, ahvHistoryOptions]);

  const expectedAhvAnnualPension = useMemo(() => estimateAhvAnnualPension({
    averageIncome: ahvHistoryStats.averageIncome ?? parseMaybeNumber(ahv.estimatedAverageAnnualIncome) ?? 0,
    contributionYears: ahvHistoryStats.hasDetailedHistory
      ? ahvHistoryStats.contributionYears
      : (parseMaybeNumber(ahv.contributionYears) ?? 0),
    plannedAge: parseMaybeNumber(ahv.referenceAge) ?? ahvHistoryOptions.statutoryAge,
    referenceAge: ahvHistoryOptions.statutoryAge,
    gender: profileGender,
  }), [ahv, ahvHistoryStats, ahvHistoryOptions, profileGender]);

  const retirementAgeOptions = useMemo(() => {
    const legalMinByGender = profileGender === "female" ? 58 : 58;
    const minByProfile = profileAgeYears !== null ? Math.max(58, profileAgeYears) : 58;
    const minAge = Math.min(70, Math.max(legalMinByGender, minByProfile));
    const options: number[] = [];
    for (let age = minAge; age <= 70; age += 1) {
      options.push(age);
    }
    return options.length > 0 ? options : [70];
  }, [profileAgeYears, profileGender]);

  const ahvViewData = useMemo<AhvState>(() => {
    const contributionEstimateValue = ahvHistoryStats.averageContribution !== null
      ? String(Math.round(ahvHistoryStats.averageContribution))
      : ahv.contributionEstimate;
    return {
      ...ahv,
      contributionEstimate: contributionEstimateValue,
      expectedAnnualPension: String(expectedAhvAnnualPension),
      earlyRetirementYears: String(ahvPlannedTiming.earlyYears),
      lateRetirementYears: String(ahvPlannedTiming.lateYears),
      estimatedAverageAnnualIncome:
        ahvHistoryStats.averageIncome !== null
          ? String(Math.round(ahvHistoryStats.averageIncome))
          : ahv.estimatedAverageAnnualIncome,
    };
  }, [ahv, ahvHistoryStats, expectedAhvAnnualPension, ahvPlannedTiming]);

  const buildPersonalPayload = (snapshot: {
    birthDateValue: string;
    genderValue: ProfileGender;
    maritalStatusValue: MaritalStatusValue | "";
    marriageYearValue: string;
    divorceYearValue: string;
    taxDomicileCantonValue: string;
    livingSituationValue: LivingSituation;
    rentMonthlyValue: string;
    rentYearlyValue: string;
    propertyValue: typeof property;
    additionalPropertiesValue: AdditionalProperty[];
  }) => {
    const parsedMarriageYear = snapshot.marriageYearValue.trim()
      ? Number(snapshot.marriageYearValue.trim())
      : null;
    const parsedDivorceYear = snapshot.divorceYearValue.trim()
      ? Number(snapshot.divorceYearValue.trim())
      : null;
    const referenceMaritalYear = snapshot.maritalStatusValue === "divorced"
      ? parsedDivorceYear
      : parsedMarriageYear;
    return {
      date_of_birth: snapshot.birthDateValue || null,
      gender:
        snapshot.genderValue === "male"
        || snapshot.genderValue === "female"
        || snapshot.genderValue === "other"
          ? snapshot.genderValue
          : null,
      marital_status: snapshot.maritalStatusValue || null,
      marital_status_year:
        snapshot.maritalStatusValue
        && snapshot.maritalStatusValue !== "single"
        && Number.isFinite(referenceMaritalYear)
          ? referenceMaritalYear
          : null,
      has_property:
        snapshot.livingSituationValue === "own"
          ? true
          : snapshot.livingSituationValue === "rent"
          ? false
          : null,
      property_details: {
        living_situation: snapshot.livingSituationValue || null,
        tax_domicile_canton: snapshot.taxDomicileCantonValue || null,
        marriage_year:
          snapshot.maritalStatusValue
          && snapshot.maritalStatusValue !== "single"
          && Number.isFinite(parsedMarriageYear)
            ? parsedMarriageYear
            : null,
        divorce_year:
          snapshot.maritalStatusValue === "divorced"
          && Number.isFinite(parsedDivorceYear)
            ? parsedDivorceYear
            : null,
        rent_monthly_chf:
          snapshot.livingSituationValue === "rent"
            ? (parseMaybeNumber(snapshot.rentMonthlyValue) ?? null)
            : null,
        rent_yearly_chf:
          snapshot.livingSituationValue === "rent"
            ? (parseMaybeNumber(snapshot.rentYearlyValue) ?? null)
            : null,
        primary_property:
          snapshot.livingSituationValue === "own"
            ? {
                name: snapshot.propertyValue.name || null,
                usage: snapshot.propertyValue.usage || null,
                estimated_market_value_chf: parseMaybeNumber(snapshot.propertyValue.estimatedMarketValue),
                mortgage_amount_chf: parseMaybeNumber(snapshot.propertyValue.mortgageAmount),
                land_area_sqm: parseMaybeNumber(snapshot.propertyValue.landAreaSqm),
              }
            : null,
        additional_properties:
          snapshot.livingSituationValue === "own"
            ? snapshot.additionalPropertiesValue.map((entry) => ({
                label: entry.label || null,
                is_rental_unit: entry.isRentalUnit,
                monthly_rental_income_chf: entry.isRentalUnit
                  ? (parseMaybeNumber(entry.monthlyRentalIncomeChf) ?? null)
                  : null,
                estimated_market_value_chf: parseMaybeNumber(entry.estimatedMarketValueChf),
                mortgage_amount_chf: parseMaybeNumber(entry.mortgageAmountChf),
              }))
            : [],
      },
    };
  };

  const importLifeInsurancePolicy = async (file: File) => {
    try {
      const res = (await api.importLifeInsurancePolicy(file)) as Record<string, unknown>;
      const parsedFields = Array.isArray(res.fields) ? res.fields as Array<Record<string, unknown>> : [];
      const issues = Array.isArray(res.issues)
        ? (res.issues as Array<Record<string, unknown>>)
            .map((issue) => toInput(issue.message))
            .filter(Boolean)
        : [];
      const mappingSuggestions: LifeImportMapping[] = Array.isArray(res.field_mapping_suggestions)
        ? (res.field_mapping_suggestions as Array<Record<string, unknown>>)
            .map((item) => {
              const source = toInput(item.source_field_id) as LifeImportFieldId;
              const target = toInput(item.target_field_id) as LifeImportFieldId;
              if (!source || !target) return null;
              return {
                source_field_id: source,
                source_label: toInput(item.source_label),
                target_field_id: target,
                target_label: toInput(item.target_label),
                confidence: typeof item.confidence === "number" ? item.confidence : Number(item.confidence || 0),
              };
            })
            .filter((item): item is LifeImportMapping => item !== null)
        : [];
      const lifeFields = parsedFields
        .map((field) => ({
          id: toInput(field.id) as LifeImportFieldId,
          label: toInput(field.label),
          value: toInput(field.value),
          confidence_score:
            typeof field.confidence_score === "number"
              ? field.confidence_score
              : Number(field.confidence_score || 0),
          priority: toInput(field.priority) === "secondary" ? "secondary" as const : "essential" as const,
          source_pattern: toInput(field.source_pattern),
        }))
        .filter((field) => Boolean(field.id));
      setLifeImportPreview({
        fields: lifeFields,
        issues,
        metadata:
          res.import_metadata && typeof res.import_metadata === "object"
            ? (res.import_metadata as Record<string, unknown>)
            : undefined,
        mappingSuggestions,
      });
      setWizardActiveCard("lifeInsurance");
      showToast({
        kind: "success",
        title: t("dashboard.toasts.lvAnalyzed"),
        message: `${lifeFields.filter((field) => field.value).length} Felder erkannt. Vorschau prüfen und übernehmen.`,
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("dashboard.toasts.lvImportFailed"),
        message: error instanceof Error ? error.message : t("dashboard.toasts.importNotPossible"),
      });
    }
  };

  const changeLifeImportMapping = (
    sourceFieldId: LifeImportFieldId,
    targetFieldId: LifeImportFieldId,
  ) => {
    setLifeImportPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mappingSuggestions: prev.mappingSuggestions.map((mapping) =>
          mapping.source_field_id === sourceFieldId
            ? { ...mapping, target_field_id: targetFieldId }
            : mapping,
        ),
      };
    });
  };

  const acceptLifeImportPreview = (payload?: {
    valuesBySource?: Partial<Record<LifeImportFieldId, string>>;
    autoApplyBySource?: Partial<Record<LifeImportFieldId, boolean>>;
  }) => {
    if (!lifeImportPreview) return;
    const seen = new Set<LifeImportFieldId>();
    const hasDuplicates = lifeImportPreview.mappingSuggestions.some((mapping) => {
      if (seen.has(mapping.target_field_id)) return true;
      seen.add(mapping.target_field_id);
      return false;
    });
    if (hasDuplicates) {
      showToast({
        kind: "warn",
        title: t("dashboard.toasts.mappingIncomplete"),
        message: t("dashboard.toasts.removeDuplicates"),
      });
      return;
    }
    const sourceByFieldId = new Map(
      lifeImportPreview.fields.map((field) => [
        field.id,
        payload?.valuesBySource?.[field.id] ?? field.value,
      ]),
    );
    const next: Partial<LifeInsuranceState> = {};
    for (const mapping of lifeImportPreview.mappingSuggestions) {
      const autoApply = payload?.autoApplyBySource?.[mapping.source_field_id] ?? true;
      if (!autoApply) continue;
      const sourceValue = sourceByFieldId.get(mapping.source_field_id) || "";
      if (!sourceValue) continue;
      if (mapping.target_field_id === "insurer") next.insurer = sourceValue;
      if (mapping.target_field_id === "policyNumber") next.policyNumber = sourceValue;
      if (mapping.target_field_id === "insuredName") next.insuredName = sourceValue;
      if (mapping.target_field_id === "currency" && ["CHF", "EUR", "USD", "GBP"].includes(sourceValue)) {
        next.currency = sourceValue as LifeInsuranceState["currency"];
      }
      if (mapping.target_field_id === "capitalPayoutAtMaturity") {
        next.capitalPayoutAtMaturity = sourceValue;
        next.capitalSumChf = sourceValue;
      }
      if (mapping.target_field_id === "annualPensionChf") {
        const yearly = Number(sourceValue);
        next.annualRentPaymentChf = sourceValue;
        if (Number.isFinite(yearly) && yearly > 0) next.monthlyPensionAtRetirement = String(Math.round(yearly / 12));
      }
      if (mapping.target_field_id === "annualPremium") next.annualPremium = sourceValue;
      if (mapping.target_field_id === "monthlyPremium") next.monthlyPremium = sourceValue;
      if (mapping.target_field_id === "surrenderValue") next.surrenderValue = sourceValue;
      if (mapping.target_field_id === "sumAtDeath") next.sumAtDeath = sourceValue;
      if (mapping.target_field_id === "maturityDate") next.maturityDate = sourceValue;
    }
    setLifeInsurance((prev) => ({ ...prev, ...next }));
    setLifeImportPreview(null);
    showToast({
      kind: "success",
      title: t("dashboard.toasts.lvAccepted"),
      message: t("dashboard.toasts.lvAcceptedMessage"),
    });
  };

  const discardLifeImportPreview = () => {
    setLifeImportPreview(null);
  };

  const applyMappedValue = async (targetCardId: string, targetFieldId: string, value: string) => {
    if (targetCardId === "personal") {
      if (targetFieldId === "livingSituation") {
        const nextLivingSituation: LivingSituation =
          value === "own" || value === "rent" ? value : livingSituation;
        setLivingSituation(nextLivingSituation);
        await withLock(async () => {
          await api.savePersonal(
buildPersonalPayload({
              birthDateValue: birthDate,
              genderValue: profileGender,
              maritalStatusValue: maritalStatus,
              marriageYearValue: marriageYear,
              divorceYearValue: divorceYear,
              taxDomicileCantonValue: taxDomicileCanton,
              livingSituationValue: nextLivingSituation,
              rentMonthlyValue: rentMonthlyChf,
              rentYearlyValue: rentYearlyChf,
              propertyValue: property,
              additionalPropertiesValue: additionalProperties,
            }),
          );
          await refresh();
        }, 250);
        return;
      }

      if (targetFieldId === "rentMonthlyChf" || targetFieldId === "rentYearlyChf") {
        const nextRentMonthly = targetFieldId === "rentMonthlyChf" ? value : rentMonthlyChf;
        const nextRentYearly = targetFieldId === "rentYearlyChf" ? value : rentYearlyChf;
        setLivingSituation("rent");
        if (targetFieldId === "rentMonthlyChf") setRentMonthlyChf(value);
        if (targetFieldId === "rentYearlyChf") setRentYearlyChf(value);
        await withLock(async () => {
          await api.savePersonal(
            buildPersonalPayload({
              birthDateValue: birthDate,
              genderValue: profileGender,
              maritalStatusValue: maritalStatus,
              marriageYearValue: marriageYear,
              divorceYearValue: divorceYear,
              taxDomicileCantonValue: taxDomicileCanton,
              livingSituationValue: "rent",
              rentMonthlyValue: nextRentMonthly,
              rentYearlyValue: nextRentYearly,
              propertyValue: property,
              additionalPropertiesValue: additionalProperties,
            }),
          );
          await refresh();
        }, 250);
        return;
      }

      const propertyFieldIds = new Set([
        "estimatedMarketValue",
        "mortgageAmount",
        "landAreaSqm",
        "name",
        "canton",
        "cantonCode",
        "municipality",
        "municipalityId",
        "zipCode",
        "buildingVolumeCubicM",
        "imputedRentPerYear",
        "usage",
      ]);
      if (propertyFieldIds.has(targetFieldId)) {
        const nextProperty = {
          ...property,
          [targetFieldId]: value,
        } as typeof property;
        handlePropertyChange(
          targetFieldId as
            | "estimatedMarketValue"
            | "mortgageAmount"
            | "landAreaSqm"
            | "name"
            | "canton"
            | "cantonCode"
            | "municipality"
            | "municipalityId"
            | "zipCode"
            | "buildingVolumeCubicM"
            | "imputedRentPerYear"
            | "usage",
          value,
        );
        setLivingSituation("own");
        await withLock(async () => {
          await api.savePersonal(
            buildPersonalPayload({
              birthDateValue: birthDate,
              genderValue: profileGender,
              maritalStatusValue: maritalStatus,
              marriageYearValue: marriageYear,
              divorceYearValue: divorceYear,
              taxDomicileCantonValue: taxDomicileCanton,
              livingSituationValue: "own",
              rentMonthlyValue: rentMonthlyChf,
              rentYearlyValue: rentYearlyChf,
              propertyValue: nextProperty,
              additionalPropertiesValue: additionalProperties,
            }),
          );
          await refresh();
        }, 250);
      }
      return;
    }
    if (targetCardId === "bvg") {
      const nextPensionFund = { ...pensionFund, [targetFieldId]: value };
      setPensionFund(nextPensionFund);
      await savePensionWithSnapshot(nextPensionFund);
      return;
    }
    if (targetCardId === "ahv") {
      const nextAhv = { ...ahv, [targetFieldId]: value };
      setAhv(nextAhv);
      await saveAhvWithSnapshot(nextAhv, ahvContributionRows);
      return;
    }
    if (targetCardId === "lifeInsurance") {
      const nextLifeInsurance = { ...lifeInsurance, [targetFieldId]: value };
      setLifeInsurance(nextLifeInsurance);
      await saveLifeInsuranceWithSnapshot(nextLifeInsurance);
      return;
    }
    if (targetCardId === "severance") {
      const nextSeverance = { ...severance, [targetFieldId]: value } as SeveranceState;
      setSeverance(nextSeverance);
      await saveSeveranceWithSnapshot(nextSeverance);
      return;
    }
    if (targetCardId === "assets") {
      if (targetFieldId === "accountBalanceChf" || targetFieldId === "cashReserveChf") {
        const nextRows = [
          ...cashAssets.rows,
          createCashRow({
            accountName: targetFieldId === "cashReserveChf" ? "Bargeldreserve (Import)" : "Konto (Import)",
            accountType: targetFieldId === "cashReserveChf" ? "cash" : "bank",
            amount: value,
            currency: "CHF",
            source: "import",
          }),
        ];
        setCashAssets({ rows: nextRows });
        await saveUserAssetsWithSnapshot(nextRows, investmentAssets, "import");
        return;
      }
      const nextInvestment = { ...investmentAssets, [targetFieldId]: value };
      setInvestmentAssets(nextInvestment);
      await saveUserAssetsWithSnapshot(cashAssets.rows, nextInvestment, "import");
    }
  };

  const processNextPendingImport = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    try {
      setIsProcessingImport(true);
      setImportStatus(`Importiere ${file.name}...`);
      if (isLikelyAhvImportFile(file.name)) {
        setWizardActiveCard("ahv");
        await importAhvContributions(file);
        setImportStatus(files.length > 1 ? t("upload.filesReady", { count: files.length - 1 }) : "");
        return;
      }
      if (isLikelyLifeInsuranceImportFile(file.name)) {
        setWizardActiveCard("lifeInsurance");
        await importLifeInsurancePolicy(file);
        setImportStatus(files.length > 1 ? t("upload.filesReady", { count: files.length - 1 }) : "");
        return;
      }
      const lowerFileName = file.name.toLowerCase();
      const importCardHint = lowerFileName.endsWith(".csv") ? "assets" : "lifeInsurance";
      const res = (await api.importDocument(file, importCardHint)) as Record<string, any>;
      const docType = toInput(res.document_type);
      const extracted = Array.isArray(res.extracted_fields) ? res.extracted_fields : [];
      const shouldFallbackToAhvImport =
        isLikelyAhvImportFile(file.name)
        || docType === "ahv"
        || docType === "ahv_contributions";

      if (shouldFallbackToAhvImport && extracted.length === 0) {
        setWizardActiveCard("ahv");
        await importAhvContributions(file);
        setImportStatus(files.length > 1 ? t("upload.filesReady", { count: files.length - 1 }) : "");
        return;
      }
      if (docType === "life_insurance") {
        // Recognised by its content: same parser and review drawer as a file named like a policy
        setWizardActiveCard("lifeInsurance");
        await importLifeInsurancePolicy(file);
        setImportStatus(files.length > 1 ? t("upload.filesReady", { count: files.length - 1 }) : "");
        return;
      }
      setActiveImportPreview({
        sourceCardId: docType === "asset_csv" ? "assets" : "lifeInsurance",
        preview: {
          filename: toInput(res.filename) || file.name,
          documentType: docType || "generic_pdf",
          fields: extracted.map((field: Record<string, unknown>) => ({
            id: toInput(field.id),
            label: toInput(field.label),
            value: toInput(field.value),
            confidenceScore:
              typeof field.confidence_score === "number"
                ? field.confidence_score
                : Number(field.confidence_score || 0),
            group:
              docType === "pension_fund"
                ? "bvg"
                : docType === "life_insurance"
                ? "life_insurance"
                : "generic",
            priority: toInput(field.priority) === "secondary" ? "secondary" : "essential",
            status:
              (typeof field.confidence_score === "number"
                ? field.confidence_score
                : Number(field.confidence_score || 0)) >= 0.5
                ? "ok"
                : "to_review",
            sourcePattern: toInput(field.source_pattern),
          })),
        },
      });
      setImportStatus(files.length > 1 ? t("upload.filesReady", { count: files.length - 1 }) : "");
      showToast({
        kind: extracted.length > 0 ? "success" : "warn",
        title: extracted.length > 0 ? t("dashboard.toasts.importSuccess") : t("dashboard.toasts.importUncertain"),
        message:
          extracted.length > 0
            ? t("dashboard.toasts.previewAvailable")
            : t("dashboard.toasts.mapManually"),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Import fehlgeschlagen.";
      setImportStatus("");
      showToast({
        kind: "error",
        title: t("dashboard.toasts.importFailed"),
        message,
      });
    } finally {
      setIsProcessingImport(false);
    }
  };

  const handleQueueFiles = (files: File[]) => {
    setPendingFiles((prev) => {
      const next = [...prev, ...files];
      setImportStatus(`${next.length} Dateien bereit`);
      return next;
    });
  };

  const persistBirthDate = React.useCallback(async (nextBirthDate: string, withProfileRefresh = false) => {
    await withLock(async () => {
      await api.savePersonal({
        date_of_birth: nextBirthDate || null,
      });
      localStorage.removeItem(BIRTHDATE_DRAFT_KEY);
      setLastPersistedBirthDate(nextBirthDate);
      if (withProfileRefresh) {
        await refresh();
      }
    }, 250);
  }, [refresh, withLock]);

  const savePersonal = async () => {
    await withLock(async () => {
      const shouldPersistProperty = livingSituation === "own";
      await api.savePersonal(
        buildPersonalPayload({
          birthDateValue: birthDate,
          genderValue: profileGender,
          maritalStatusValue: maritalStatus,
          marriageYearValue: marriageYear,
          divorceYearValue: divorceYear,
          taxDomicileCantonValue: taxDomicileCanton,
          livingSituationValue: livingSituation,
          rentMonthlyValue: rentMonthlyChf,
          rentYearlyValue: rentYearlyChf,
          propertyValue: property,
          additionalPropertiesValue: additionalProperties,
        }),
      );
      await api.saveProperty({
        name:
          shouldPersistProperty
            ? (property.name || "Haupteigentum")
            : "Haupteigentum",
        canton: shouldPersistProperty ? (property.canton || null) : null,
        municipality: shouldPersistProperty ? (property.municipality || null) : null,
        canton_code: shouldPersistProperty ? (property.cantonCode || null) : null,
        municipality_id: shouldPersistProperty ? (property.municipalityId || null) : null,
        location:
          shouldPersistProperty && property.cantonCode && property.municipalityId
            ? {
                canton_code: property.cantonCode,
                municipality_id: property.municipalityId,
              }
            : null,
        zip_code: shouldPersistProperty ? (property.zipCode || null) : null,
        estimated_market_value: shouldPersistProperty ? parseNumber(property.estimatedMarketValue) : null,
        mortgage_amount: shouldPersistProperty ? parseNumber(property.mortgageAmount) : null,
        land_area_sqm: shouldPersistProperty ? parseNumber(property.landAreaSqm) : null,
        building_volume_cubic_m: shouldPersistProperty ? parseNumber(property.buildingVolumeCubicM) : null,
        imputed_rent_per_year: shouldPersistProperty ? parseNumber(property.imputedRentPerYear) : null,
        usage: shouldPersistProperty ? property.usage : null,
      });
      localStorage.removeItem(BIRTHDATE_DRAFT_KEY);
      setLastPersistedBirthDate(birthDate);
      await refresh();
    }, 250);
  };

  useEffect(() => {
    if (!profileHydrated) return;
    if (birthDate === lastPersistedBirthDate) return;
    const timer = window.setTimeout(() => {
      void persistBirthDate(birthDate, false);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [birthDate, lastPersistedBirthDate, persistBirthDate, profileHydrated]);

  useEffect(() => {
    const minimumAge = retirementAgeOptions[0];
    const currentReferenceAge = Number(ahv.referenceAge || 0);
    if (!Number.isFinite(currentReferenceAge) || currentReferenceAge < minimumAge) {
      setAhv((prev) => ({ ...prev, referenceAge: String(minimumAge) }));
    }
  }, [retirementAgeOptions, ahv.referenceAge]);

  useEffect(() => {
    if (!profileHydrated) return;
    const flushDraft = () => {
      if (birthDate === lastPersistedBirthDate) return;
      void persistBirthDate(birthDate, false);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushDraft();
      }
    };
    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushDraft);
    return () => {
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushDraft);
    };
  }, [birthDate, lastPersistedBirthDate, persistBirthDate, profileHydrated]);

  const parseNumber = (value: string): number | null => {
    if (!value) return null;
    const cleaned = value.replace(/['\s]/g, "");
    const num = Number(cleaned.replace(",", "."));
    return Number.isNaN(num) ? null : num;
  };

  const savePensionWithSnapshot = async (snapshot: PensionFundSnapshot) => {
    await withLock(async () => {
      await api.savePensionFund({
        provider: snapshot.provider,
        as_of_date: snapshot.asOfDate || null,
        annual_salary: parseNumber(snapshot.annualSalary),
        insured_salary_total: parseNumber(snapshot.insuredSalaryTotal),
        bvg_insured_salary: parseNumber(snapshot.bvgInsuredSalary),
        current_oldage_capital: parseNumber(snapshot.currentOldageCapital),
        bvg_oldage_capital: parseNumber(snapshot.bvgOldageCapital),
        vested_benefits_total: parseNumber(snapshot.vestedBenefitsTotal),
        max_buyin_total: parseNumber(snapshot.maxBuyinTotal),
        wef_available: parseNumber(snapshot.wefAvailable),
        coordination_deduction: parseNumber(snapshot.coordinationDeduction),
        insured_salary_rentenplan: parseNumber(snapshot.insuredSalaryRentenplan),
        insured_salary_bonusplan: parseNumber(snapshot.insuredSalaryBonusplan),
        max_buyin_rentenplan: parseNumber(snapshot.maxBuyinRentenplan),
        max_buyin_bonusplan: parseNumber(snapshot.maxBuyinBonusplan),
      });
      await refresh();
    }, 250);
  };
  const savePension = async () => savePensionWithSnapshot(pensionFund);

  const savePropertyWithSnapshot = async (snapshot: typeof property) => {
    await withLock(async () => {
      await api.saveProperty({
        name: snapshot.name,
        canton: snapshot.canton || null,
        municipality: snapshot.municipality || null,
        canton_code: snapshot.cantonCode || null,
        municipality_id: snapshot.municipalityId || null,
        location:
          snapshot.cantonCode && snapshot.municipalityId
            ? {
                canton_code: snapshot.cantonCode,
                municipality_id: snapshot.municipalityId,
              }
            : null,
        zip_code: snapshot.zipCode || null,
        estimated_market_value: parseNumber(snapshot.estimatedMarketValue),
        mortgage_amount: parseNumber(snapshot.mortgageAmount),
        land_area_sqm: parseNumber(snapshot.landAreaSqm),
        building_volume_cubic_m: parseNumber(snapshot.buildingVolumeCubicM),
        imputed_rent_per_year: parseNumber(snapshot.imputedRentPerYear),
        usage: snapshot.usage,
      });
      await refresh();
    }, 250);
  };
  const saveProperty = async () => savePropertyWithSnapshot(property);

  const saveThirdPillar = async () => {
    const total3aBalance = thirdPillar.accounts
      .slice(0, thirdPillar.accountCount)
      .reduce((sum, account) => sum + (parseNumber(account.balanceChf) || 0), 0);
    await withLock(async () => {
      await api.saveThirdPillar({
        provider: thirdPillar.provider || null,
        capital_3a: total3aBalance,
        annual_contribution_3a: (parseNumber(thirdPillar.monthlySavingsChf) || 0) * 12,
        capital_3b: parseNumber(lifeInsurance.surrenderValue),
        annual_contribution_3b: null,
        expected_return_percent: parseNumber(thirdPillar.expectedReturnPercent),
        securities_chf: parseNumber(thirdPillar.securitiesChf),
        real_estate_equity_chf: parseNumber(thirdPillar.realEstateEquityChf),
        monthly_savings_chf: parseNumber(thirdPillar.monthlySavingsChf),
        account_count: thirdPillar.accountCount,
        accounts_json: thirdPillar.accounts
          .slice(0, thirdPillar.accountCount)
          .map((account, index) => ({
            account_index: index + 1,
            balance_chf: parseNumber(account.balanceChf),
            expected_return_percent: parseNumber(account.expectedReturnPercent),
            years_to_payout: parseNumber(account.yearsToPayout),
          })),
        withdrawal_tax_rate_percent: parseNumber(thirdPillar.withdrawalTaxRatePercent),
        tax_model: thirdPillar.taxModel,
        tax_canton: thirdPillar.taxCanton || null,
      });
      await refresh();
    }, 250);
  };

  const saveUserAssetsWithSnapshot = async (
    cashRowsSnapshot: CashAssetRow[],
    investmentSnapshot: InvestmentAssetsState,
    source: "manual" | "import" = "manual",
  ) => {
    await withLock(async () => {
      await api.saveUserAssets({
        cash_assets: cashRowsSnapshot.map((row) => ({
          account_name: row.accountName || "",
          account_type: normalizeCashAccountType(row.accountType),
          amount: parseNumber(row.amount) || 0,
          currency: row.currency,
          amount_chf: convertToChf(
            parseNumber(row.amount) || 0,
            row.currency,
            DEFAULT_FX_RATES,
          ),
          source: row.source || source,
        })),
        investment_assets: {
          etf_chf: parseNumber(investmentSnapshot.etfChf) || 0,
          stocks_chf: parseNumber(investmentSnapshot.stocksChf) || 0,
          savings_plan_chf: parseNumber(investmentSnapshot.savingsPlanChf) || 0,
          real_estate_etf_chf: parseNumber(investmentSnapshot.realEstateEtfChf) || 0,
          source,
        },
      });
      await refresh();
    }, 250);
  };

  const saveUserAssets = async () => {
    await saveUserAssetsWithSnapshot(cashAssets.rows, investmentAssets, "manual");
  };

  const saveSeveranceWithSnapshot = async (snapshot: SeveranceState) => {
    const parseDate = (raw: string) => {
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const startDate = parseDate(snapshot.employmentStartDate);
    const endDate = parseDate(snapshot.employmentEndDate);
    const tenureYears = startDate && endDate && endDate.getTime() >= startDate.getTime()
      ? (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      : null;
    const formulaAmount = (() => {
      if (snapshot.severanceType !== "formula") return null;
      const salary = parseNumber(snapshot.lastAnnualSalaryChf) ?? 0;
      if (snapshot.formulaModel === "reference_age_formula") {
        const parsedBirthDate = birthDate ? new Date(birthDate) : null;
        if (!parsedBirthDate || Number.isNaN(parsedBirthDate.getTime())) return 0;
        const startDay = Math.max(1, Math.min(31, Number(snapshot.startCalculationDay || 0)));
        const startMonth = Math.max(1, Math.min(12, Number(snapshot.startCalculationMonth || 0)));
        const startYear = Number(snapshot.startCalculationYear || 0);
        if (!startDay || !startMonth || !startYear) return 0;
        const referenceAge = profileGender === "female" ? 64 : 65;
        const referenceDate = new Date(
          parsedBirthDate.getFullYear() + referenceAge,
          parsedBirthDate.getMonth(),
          parsedBirthDate.getDate(),
        );
        const startDateForCalc = new Date(startYear, startMonth - 1, startDay);
        let months = (referenceDate.getFullYear() - startDateForCalc.getFullYear()) * 12
          + (referenceDate.getMonth() - startDateForCalc.getMonth());
        if (referenceDate.getDate() < startDateForCalc.getDate()) {
          months -= 1;
        }
        months = Math.max(0, months);
        const part1 = months * ((0.15 * salary) / 12);
        const part2 = months * 2450;
        return part1 + part2;
      }
      if (!salary || !tenureYears || tenureYears <= 0) return 0;
      if (snapshot.formulaModel === "or339b_months") {
        const monthFactor = Math.max(2, Math.min(8, parseNumber(snapshot.formulaMonthFactor) || 2));
        return (salary / 12) * monthFactor;
      }
      const dayFactor = Math.max(1, Math.min(60, parseNumber(snapshot.formulaDayFactor) || 30));
      return salary * tenureYears * (dayFactor / 360);
    })();
    const parsedBirthDate = birthDate ? new Date(birthDate) : null;
    const startDayForPayload = Math.max(1, Math.min(31, Number(snapshot.startCalculationDay || 0)));
    const startMonthForPayload = Math.max(1, Math.min(12, Number(snapshot.startCalculationMonth || 0)));
    const startYearForPayload = Number(snapshot.startCalculationYear || 0);
    const referenceAgeForPayload = profileGender === "female" ? 64 : 65;
    const referenceDateForPayload = parsedBirthDate && !Number.isNaN(parsedBirthDate.getTime())
      ? new Date(parsedBirthDate.getFullYear() + referenceAgeForPayload, parsedBirthDate.getMonth(), parsedBirthDate.getDate())
      : null;
    const startDateForPayload = startDayForPayload && startMonthForPayload && startYearForPayload
      ? new Date(startYearForPayload, startMonthForPayload - 1, startDayForPayload)
      : null;
    const monthsUntilReferenceAge = referenceDateForPayload && startDateForPayload
      ? Math.max(
        0,
        (referenceDateForPayload.getFullYear() - startDateForPayload.getFullYear()) * 12
          + (referenceDateForPayload.getMonth() - startDateForPayload.getMonth())
          - (referenceDateForPayload.getDate() < startDateForPayload.getDate() ? 1 : 0),
      )
      : null;
    const formulaPart1Chf = snapshot.formulaModel === "reference_age_formula" && monthsUntilReferenceAge !== null
      ? monthsUntilReferenceAge * ((0.15 * (parseNumber(snapshot.lastAnnualSalaryChf) || 0)) / 12)
      : null;
    const formulaPart2Chf = snapshot.formulaModel === "reference_age_formula" && monthsUntilReferenceAge !== null
      ? monthsUntilReferenceAge * 2450
      : null;
    const amount = snapshot.severanceType === "formula"
      ? Math.max(0, formulaAmount ?? 0)
      : (parseNumber(snapshot.amountChf) ?? 0);
    const cantonBase = getWithdrawalTaxRateForCanton(taxDomicileCanton || "") ?? 7.2;
    const progression = amount <= 50_000
      ? 0.2
      : amount <= 100_000
      ? 0.8
      : amount <= 200_000
      ? 1.8
      : amount <= 500_000
      ? 3.1
      : 4.4;
    const taxRatePercent = Math.max(0, Math.min(30, cantonBase + progression));
    const taxAmountChf = snapshot.isGrossAmount ? (amount * taxRatePercent) / 100 : 0;
    const netAmountChf = snapshot.isGrossAmount ? Math.max(0, amount - taxAmountChf) : amount;
    const planDurationYears = snapshot.planDurationYears ? Number(snapshot.planDurationYears) : null;
    const estimatedReturnPercent = Number(snapshot.returnScenarioAdjustment || 0);
    const maturityMonth = snapshot.maturityMonth ? Number(snapshot.maturityMonth) : null;
    const maturityYear = snapshot.maturityYear ? Number(snapshot.maturityYear) : null;
    const payoutYear = maturityYear || (snapshot.payoutYear ? Number(snapshot.payoutYear) : null);
    await withLock(async () => {
      await api.saveSeverance({
        client_name: snapshot.clientName || null,
        amount,
        is_gross_amount: snapshot.isGrossAmount,
        employer: snapshot.employer || null,
        canton_code: taxDomicileCanton || null,
        payout_year: payoutYear,
        tax_rate_percent: taxRatePercent,
        tax_amount_chf: taxAmountChf,
        net_amount_chf: netAmountChf,
        severance_type: snapshot.severanceType,
        provider_preset: snapshot.providerPreset,
        formula_model: snapshot.formulaModel,
        formula_v2_enabled: snapshot.formulaModel === "reference_age_formula",
        start_calculation_day: 1,
        start_calculation_month: maturityMonth || startMonthForPayload || null,
        start_calculation_year: maturityYear || startYearForPayload || null,
        employment_start_date: snapshot.employmentStartDate || null,
        employment_end_date: snapshot.employmentEndDate || null,
        last_annual_salary_chf: parseNumber(snapshot.lastAnnualSalaryChf) || null,
        formula_day_factor: parseNumber(snapshot.formulaDayFactor) || null,
        formula_month_factor: parseNumber(snapshot.formulaMonthFactor) || null,
        months_until_reference_age: monthsUntilReferenceAge,
        formula_part1_chf: formulaPart1Chf,
        formula_part2_chf: formulaPart2Chf,
        calculated_abfindung_chf: snapshot.severanceType === "formula" ? amount : null,
        formula_used:
          snapshot.severanceType === "fixed"
            ? "Pauschal"
            : snapshot.formulaModel === "reference_age_formula"
              ? "Referenzalter-Formel"
              : snapshot.formulaModel === "or339b_months"
                ? "OR-339b-Monatslohn"
                : "UBS-58+",
        computed_tenure_years: tenureYears,
        gender_context: profileGender || null,
        usage_purpose: snapshot.usagePurpose,
        etf_risk_level: snapshot.etfRiskLevel,
        ubs_product_type: snapshot.ubsProductType,
        estimated_return_percent: estimatedReturnPercent,
        plan_duration_years: planDurationYears,
        allocation_bvg_buyin: parseNumber(snapshot.allocationPensionChf) || 0,
        allocation_pillar3a: parseNumber(snapshot.allocationMutualFundsChf) || 0,
        allocation_private_3b: parseNumber(snapshot.allocationDirectPayoutChf) || 0,
      });
      await refresh();
    }, 250);
  };
  const saveSeverance = async () => saveSeveranceWithSnapshot(severance);

  const saveLifeInsuranceWithSnapshot = async (snapshot: LifeInsuranceState) => {
    const annualRent = parseNumber(snapshot.annualRentPaymentChf);
    const monthlyFromAnnual =
      annualRent !== null ? annualRent / 12 : parseNumber(snapshot.monthlyPensionAtRetirement);
    const monthlyPremium = parseNumber(snapshot.monthlyPremium);
    const annualPremiumFromMonthly =
      monthlyPremium !== null ? monthlyPremium * 12 : parseNumber(snapshot.annualPremium);
    const maturityDateYear = snapshot.maturityDate.match(/\d{4}/)?.[0] || "";
    const currency = snapshot.currency || "CHF";
    const toChf = (value: number | null) => {
      if (value === null) return null;
      return convertToChf(value, currency, DEFAULT_FX_RATES);
    };
    await withLock(async () => {
      await api.saveLifeInsurance({
        insurance_type: snapshot.insuranceType,
        insurer: snapshot.insurer || null,
        policy_number: snapshot.policyNumber || null,
        insured_name: snapshot.insuredName || null,
        currency,
        surrender_value: toChf(parseNumber(snapshot.surrenderValue)),
        annual_premium: toChf(annualPremiumFromMonthly),
        monthly_premium: toChf(monthlyPremium),
        sum_at_death: toChf(parseNumber(snapshot.sumAtDeath)),
        entry_age: snapshot.entryAge ? Number(snapshot.entryAge) : null,
        maturity_date: snapshot.maturityDate || null,
        maturity_year: snapshot.maturityYear ? Number(snapshot.maturityYear) : null,
        monthly_pension_at_retirement: toChf(monthlyFromAnnual),
        capital_payout_at_maturity:
          toChf(parseNumber(snapshot.capitalSumChf) ?? parseNumber(snapshot.capitalPayoutAtMaturity)),
        ...(snapshot.maturityYear
          ? {}
          : {
              maturity_year: maturityDateYear ? Number(maturityDateYear) : null,
            }),
      });
      await refresh();
    }, 250);
  };
  const saveLifeInsurance = async () => saveLifeInsuranceWithSnapshot(lifeInsurance);

  const saveAhvWithSnapshot = async (snapshot: AhvState, rowsSnapshot: AhvContributionRow[]) => {
    // Gleiche Rechnung wie die Anzeige in der Karte (services/ahvEstimate): gespeichert wird, was man sieht
    const history = ahvHistory(rowsSnapshot, ahvHistoryOptions);
    const estimatedIncomeUsed = history.averageIncome ?? parseNumber(snapshot.estimatedAverageAnnualIncome);
    const contributionEstimateUsed = history.averageContribution ?? parseNumber(snapshot.contributionEstimate);
    const contributionYearsUsed = history.hasDetailedHistory
      ? history.contributionYears
      : parseNumber(snapshot.contributionYears);
    const expectedAnnualUsed = estimateAhvAnnualPension({
      averageIncome: estimatedIncomeUsed ?? 0,
      contributionYears: contributionYearsUsed ?? 0,
      plannedAge: snapshot.referenceAge ? Number(snapshot.referenceAge) : ahvHistoryOptions.statutoryAge,
      referenceAge: ahvHistoryOptions.statutoryAge,
      gender: profileGender,
    });
    const timing = ahvTiming(
      snapshot.referenceAge ? Number(snapshot.referenceAge) : ahvHistoryOptions.statutoryAge,
      ahvHistoryOptions.statutoryAge,
    );

    const contribRes = (await withLock(async () => {
      await api.saveAhv({
        reference_age: snapshot.referenceAge ? Number(snapshot.referenceAge) : null,
        estimated_average_income_chf: estimatedIncomeUsed,
        contribution_estimate_chf: contributionEstimateUsed,
        expected_annual_pension: expectedAnnualUsed,
        contribution_years: contributionYearsUsed,
        early_retirement_years: timing.earlyYears,
        late_retirement_years: timing.lateYears,
      });
      const response = await api.saveAhvContributions({
        rows: rowsSnapshot
          .filter((row) => row.year.trim())
          .map((row) => ({
            year: Number(row.year),
            annual_income_chf: parseNumber(row.annualIncomeChf),
            contribution_total_chf: parseNumber(row.contributionTotalChf),
            age_end_of_year: row.ageEndOfYear ? Number(row.ageEndOfYear) : null,
            ahv_rent_share_chf: parseNumber(row.ahvRentShareChf),
            source: row.source || "manual",
          })),
      });
      await refresh();
      return response;
    }, 250)) as Record<string, unknown>;
    const issues = Array.isArray(contribRes.issues) ? contribRes.issues : [];
    setAhvContributionIssues(
      issues.map((issue) => toInput((issue as Record<string, unknown>).message)).filter(Boolean),
    );
  };
  const saveAhv = async () => saveAhvWithSnapshot(ahv, ahvContributionRows);

  const importAhvContributions = async (file: File) => {
    try {
      const res = (await api.importAhvContributions(file)) as Record<string, unknown>;
      const rows = Array.isArray(res.rows) ? res.rows : [];
      const normalizedRows = rows.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          year: toInput(item.year),
          annualIncomeChf: toInput(item.annual_income_chf),
          contributionTotalChf: toInput(item.contribution_total_chf),
          ageEndOfYear: toInput(item.age_end_of_year),
          ahvRentShareChf: toInput(item.ahv_rent_share_chf),
          source: (toInput(item.source) as "manual" | "xlsx" | "pdf") || "pdf",
        };
      });
      const issues = Array.isArray(res.issues) ? res.issues : [];
      const normalizedIssues = issues
        .map((issue) => toInput((issue as Record<string, unknown>).message))
        .filter(Boolean);
      const mappingSuggestions: AhvImportMapping[] = Array.isArray(res.field_mapping_suggestions)
        ? (res.field_mapping_suggestions as Array<Record<string, unknown>>)
            .map((item) => {
              const source = toInput(item.source_field_id) as AhvImportFieldId;
              const target = toInput(item.target_field_id) as AhvImportFieldId;
              const confidence = typeof item.confidence === "number"
                ? item.confidence
                : Number(item.confidence || 0);
              if (!source || !target) return null;
              if (!(source in AHV_IMPORT_TARGET_LABELS) || !(target in AHV_IMPORT_TARGET_LABELS)) return null;
              return {
                source_field_id: source,
                source_label: toInput(item.source_label) || AHV_IMPORT_TARGET_LABELS[source],
                target_field_id: target,
                target_label: toInput(item.target_label) || AHV_IMPORT_TARGET_LABELS[target],
                confidence,
              };
            })
            .filter((item): item is AhvImportMapping => item !== null)
        : [
            {
              source_field_id: "year",
              source_label: AHV_IMPORT_TARGET_LABELS.year,
              target_field_id: "year",
              target_label: AHV_IMPORT_TARGET_LABELS.year,
              confidence: 1,
            },
            {
              source_field_id: "annual_income_chf",
              source_label: AHV_IMPORT_TARGET_LABELS.annual_income_chf,
              target_field_id: "annual_income_chf",
              target_label: AHV_IMPORT_TARGET_LABELS.annual_income_chf,
              confidence: 1,
            },
            {
              source_field_id: "contribution_total_chf",
              source_label: AHV_IMPORT_TARGET_LABELS.contribution_total_chf,
              target_field_id: "contribution_total_chf",
              target_label: AHV_IMPORT_TARGET_LABELS.contribution_total_chf,
              confidence: 1,
            },
            {
              source_field_id: "age_end_of_year",
              source_label: AHV_IMPORT_TARGET_LABELS.age_end_of_year,
              target_field_id: "age_end_of_year",
              target_label: AHV_IMPORT_TARGET_LABELS.age_end_of_year,
              confidence: 1,
            },
            {
              source_field_id: "ahv_rent_share_chf",
              source_label: AHV_IMPORT_TARGET_LABELS.ahv_rent_share_chf,
              target_field_id: "ahv_rent_share_chf",
              target_label: AHV_IMPORT_TARGET_LABELS.ahv_rent_share_chf,
              confidence: 1,
            },
          ];
      setAhvImportPreview({
        rawRows: normalizedRows,
        rows: applyAhvMappingToRows(normalizedRows, mappingSuggestions),
        issues: normalizedIssues,
        metadata:
          res.import_metadata && typeof res.import_metadata === "object"
            ? (res.import_metadata as {
                rows_detected?: number;
                computed_average_income_chf?: number | null;
                computed_total_contributions_chf?: number | null;
                average_income_reference_chf?: number | null;
                total_accumulated_reference_chf?: number | null;
                latest_monthly_rent_reference_chf?: number | null;
                difference_table?: Array<{ label?: string; delta_monthly_chf?: number | null }>;
              })
            : undefined,
        mappingSuggestions,
      });
      showToast({
        kind: "success",
        title: t("dashboard.toasts.ahvAnalyzed"),
        message: `${rows.length} Zeilen erkannt. Bitte Vorschlag prüfen und übernehmen.`,
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("dashboard.toasts.ahvImportFailed"),
        message: error instanceof Error ? error.message : t("dashboard.toasts.importNotPossible"),
      });
    }
  };

  const acceptAhvImportPreview = async () => {
    if (!ahvImportPreview) return;
    const seenTargets = new Set<AhvImportFieldId>();
    const hasDuplicateTargets = ahvImportPreview.mappingSuggestions.some((mapping) => {
      if (seenTargets.has(mapping.target_field_id)) return true;
      seenTargets.add(mapping.target_field_id);
      return false;
    });
    if (hasDuplicateTargets) {
      showToast({
        kind: "warn",
        title: t("dashboard.toasts.mappingIncomplete"),
        message: t("dashboard.toasts.removeDuplicatesBeforeAccept"),
      });
      return;
    }
    const acceptedRows = ahvImportPreview.rows;
    setAhvContributionRows(acceptedRows);
    setAhvContributionIssues(ahvImportPreview.issues);
    setAhvImportPreview(null);
    // Sofort speichern: sonst sähen Analyse und Cockpit die übernommene Geschichte erst nach einem Kartenwechsel
    await saveAhvWithSnapshot(ahv, acceptedRows);
    showToast({
      kind: "success",
      title: t("dashboard.toasts.ahvAccepted"),
      message: t("dashboard.toasts.ahvAcceptedMessage"),
    });
  };

  const discardAhvImportPreview = () => {
    if (!ahvImportPreview) return;
    setAhvImportPreview(null);
    showToast({
      kind: "warn",
      title: t("dashboard.toasts.ahvDiscarded"),
      message: t("dashboard.toasts.ahvDiscardedMessage"),
    });
  };

  const changeAhvImportMapping = (
    sourceFieldId: AhvImportFieldId,
    targetFieldId: AhvImportFieldId,
  ) => {
    setAhvImportPreview((prev) => {
      if (!prev) return prev;
      const nextMappings = prev.mappingSuggestions.map((mapping) =>
        mapping.source_field_id === sourceFieldId
          ? {
              ...mapping,
              target_field_id: targetFieldId,
              target_label: AHV_IMPORT_TARGET_LABELS[targetFieldId],
            }
          : mapping,
      );
      return {
        ...prev,
        mappingSuggestions: nextMappings,
        rows: applyAhvMappingToRows(prev.rawRows, nextMappings),
      };
    });
  };

  const handlePropertyChange = (field: keyof typeof property, value: string) => {
    setProperty((prev) => ({ ...prev, [field]: value }));
  };

  const applyLocationSelection = (location: SwissLocation, statusMessage?: string) => {
    setProperty((prev) => ({
      ...prev,
      zipCode: location.zip,
      municipality: location.municipality,
      municipalityId: location.id,
      canton: location.canton,
      cantonCode: location.canton,
    }));

    const rate = getWithdrawalTaxRateForCanton(location.canton);
    setThirdPillar((prev) => ({
      ...prev,
      taxCanton: location.canton,
      withdrawalTaxRatePercent:
        rate !== null ? String(rate) : prev.withdrawalTaxRatePercent,
    }));

    if (statusMessage) {
      setZipLookupStatus(statusMessage);
    }
  };

  const handleZipCodeChange = async (value: string) => {
    handlePropertyChange("zipCode", value);
    setZipLookupStatus("");
    if (!/^\d{4}$/.test(value.trim())) return;

    setZipLookupStatus(t("dashboard.zipChecking"));
    const result = findSwissLocationByZip(value);
    if (!result) {
      setZipLookupStatus(t("dashboard.zipNotFound"));
      return;
    }
    applyLocationSelection(result, `Automatisch erkannt: ${result.municipality} (${result.canton})`);
  };

  useEffect(() => {
    if (profileHydrated || !profileData) return;
    const res = profileData;
    const persistedBirthDate = toInput(res.personal?.date_of_birth);
    setLastPersistedBirthDate(persistedBirthDate);

    if (persistedBirthDate) {
      setBirthDate(persistedBirthDate);
      localStorage.removeItem(BIRTHDATE_DRAFT_KEY);
    }
    const hydratedGender = toInput(res.personal?.gender);
    if (hydratedGender === "male" || hydratedGender === "female" || hydratedGender === "other") {
      setProfileGender(hydratedGender);
    }
    const hydratedMaritalStatus = toInput(res.personal?.marital_status);
    if (
      hydratedMaritalStatus === "single"
      || hydratedMaritalStatus === "married"
      || hydratedMaritalStatus === "divorced"
      || hydratedMaritalStatus === "widowed"
      || hydratedMaritalStatus === "concubinage"
    ) {
      setMaritalStatus(hydratedMaritalStatus);
    }
    if (res.personal?.marital_status_year !== null && res.personal?.marital_status_year !== undefined) {
      setMarriageYear(toInput(res.personal.marital_status_year));
    }
    const propertyDetails = (res.personal?.property_details ?? {}) as Record<string, unknown>;
    const hydratedTaxDomicile = toInput(propertyDetails.tax_domicile_canton).toUpperCase();
    if (hydratedTaxDomicile) {
      setTaxDomicileCanton(hydratedTaxDomicile);
    }
    const hydratedLivingSituation = toInput(propertyDetails.living_situation);
    if (hydratedLivingSituation === "rent" || hydratedLivingSituation === "own") {
      setLivingSituation(hydratedLivingSituation as LivingSituation);
    }
    setRentMonthlyChf(toInput(propertyDetails.rent_monthly_chf));
    setRentYearlyChf(toInput(propertyDetails.rent_yearly_chf));
    if (propertyDetails.marriage_year !== null && propertyDetails.marriage_year !== undefined) {
      setMarriageYear(toInput(propertyDetails.marriage_year));
    }
    if (propertyDetails.divorce_year !== null && propertyDetails.divorce_year !== undefined) {
      setDivorceYear(toInput(propertyDetails.divorce_year));
    }
    const hydratedAdditional = Array.isArray(propertyDetails.additional_properties)
      ? (propertyDetails.additional_properties as Array<Record<string, unknown>>)
      : [];
    setAdditionalProperties(
      hydratedAdditional.map((entry, idx) => ({
        id: `hydrated-${idx}-${toInput(entry.label) || "obj"}`,
        label: toInput(entry.label),
        isRentalUnit: Boolean(entry.is_rental_unit),
        monthlyRentalIncomeChf: toInput(entry.monthly_rental_income_chf),
        estimatedMarketValueChf: toInput(entry.estimated_market_value_chf),
        mortgageAmountChf: toInput(entry.mortgage_amount_chf),
      })),
    );
    const primaryProperty = (propertyDetails.primary_property ?? {}) as Record<string, unknown>;
    if (!res.property && Object.keys(primaryProperty).length > 0) {
      setProperty((prev) => ({
        ...prev,
        name: toInput(primaryProperty.name),
        estimatedMarketValue: toInput(primaryProperty.estimated_market_value_chf),
        mortgageAmount: toInput(primaryProperty.mortgage_amount_chf),
        landAreaSqm: toInput(primaryProperty.land_area_sqm),
        usage:
          (toInput(primaryProperty.usage) as "owner_occupied" | "rented_out" | "mixed")
          || prev.usage,
      }));
    }
    if (Array.isArray(res.personal?.cash_assets)) {
      setCashAssets({
        rows: res.personal.cash_assets.map((row: Record<string, unknown>, index: number) =>
          createCashRow({
            id: toInput(row.id) || `cash-${index}`,
            accountName: toInput(row.account_name) || "Konto",
            accountType: normalizeCashAccountType(toInput(row.account_type)),
            amount: toInput(row.amount),
            currency: (toInput(row.currency) as CashAssetRow["currency"]) || "CHF",
            source: toInput(row.source) === "import" ? "import" : "manual",
          }),
        ),
      });
    }
    if (Array.isArray(res.personal?.investment_assets) && res.personal.investment_assets[0]) {
      const inv = res.personal.investment_assets[0] as Record<string, unknown>;
      setInvestmentAssets((prev) => ({
        ...prev,
        etfChf: toInput(inv.etf_chf),
        stocksChf: toInput(inv.stocks_chf),
        savingsPlanChf: toInput(inv.savings_plan_chf),
        realEstateEtfChf: toInput(inv.real_estate_etf_chf),
      }));
    }
    if (res.pension_fund) {
      setPensionFund((prev) => ({
        ...prev,
        provider: toInput(res.pension_fund.provider) || prev.provider,
        asOfDate: toInput(res.pension_fund.as_of_date),
        annualSalary: toInput(res.pension_fund.annual_salary),
        insuredSalaryTotal: toInput(res.pension_fund.insured_salary_total),
        bvgInsuredSalary: toInput(res.pension_fund.bvg_insured_salary),
        currentOldageCapital: toInput(res.pension_fund.current_oldage_capital),
        bvgOldageCapital: toInput(res.pension_fund.bvg_oldage_capital),
        vestedBenefitsTotal: toInput(res.pension_fund.vested_benefits_total),
        maxBuyinTotal: toInput(res.pension_fund.max_buyin_total),
        wefAvailable: toInput(res.pension_fund.wef_available),
        coordinationDeduction: toInput(res.pension_fund.coordination_deduction),
        insuredSalaryRentenplan: toInput(res.pension_fund.insured_salary_rentenplan),
        insuredSalaryBonusplan: toInput(res.pension_fund.insured_salary_bonusplan),
        maxBuyinRentenplan: toInput(res.pension_fund.max_buyin_rentenplan),
        maxBuyinBonusplan: toInput(res.pension_fund.max_buyin_bonusplan),
      }));
    }
    if (res.property) {
      const detectedCanton = toInput(res.property.canton).toUpperCase();
      setProperty((prev) => ({
        ...prev,
        name: toInput(res.property.name) || toInput(primaryProperty.name) || prev.name,
        canton: detectedCanton || prev.canton,
        cantonCode: toInput(res.property.canton_code) || detectedCanton || prev.cantonCode,
        municipality: toInput(res.property.municipality) || prev.municipality,
        municipalityId: toInput(res.property.municipality_id) || prev.municipalityId,
        zipCode: toInput(res.property.zip_code) || prev.zipCode,
        estimatedMarketValue:
          toInput(res.property.estimated_market_value)
          || toInput(primaryProperty.estimated_market_value_chf)
          || prev.estimatedMarketValue,
        mortgageAmount:
          toInput(res.property.mortgage_amount)
          || toInput(primaryProperty.mortgage_amount_chf)
          || prev.mortgageAmount,
        landAreaSqm:
          toInput(res.property.land_area_sqm)
          || toInput(primaryProperty.land_area_sqm)
          || prev.landAreaSqm,
        buildingVolumeCubicM: toInput(res.property.building_volume_cubic_m) || prev.buildingVolumeCubicM,
        imputedRentPerYear: toInput(res.property.imputed_rent_per_year) || prev.imputedRentPerYear,
        usage: (res.property.usage as "owner_occupied" | "rented_out" | "mixed") || prev.usage,
      }));
      if (!hydratedTaxDomicile && detectedCanton) {
        setTaxDomicileCanton(detectedCanton);
      }
      const rate = getWithdrawalTaxRateForCanton(detectedCanton);
      if (detectedCanton) {
        setThirdPillar((prev) => ({
          ...prev,
          taxCanton: detectedCanton,
          withdrawalTaxRatePercent:
            rate !== null ? String(rate) : prev.withdrawalTaxRatePercent,
        }));
      }
    }
    if (res.third_pillar) {
      const annualContribution3a = Number(res.third_pillar.annual_contribution_3a ?? 0);
      const accountJson = Array.isArray(res.third_pillar.accounts_json)
        ? (res.third_pillar.accounts_json as Array<Record<string, unknown>>)
        : [];
      const hydratedAccounts = accountJson
        .slice(0, 3)
        .map((item) => ({
          balanceChf: toInput(item.balance_chf),
          expectedReturnPercent: toInput(item.expected_return_percent) || "4",
          yearsToPayout: toInput(item.years_to_payout) || "10",
        }));
      setThirdPillar((prev) => ({
        ...prev,
        provider: toInput(res.third_pillar.provider),
        accountCount: Number(res.third_pillar.account_count) || prev.accountCount || 1,
        accounts: hydratedAccounts.length > 0 ? hydratedAccounts : [
          {
            balanceChf: toInput(res.third_pillar.capital_3a),
            expectedReturnPercent:
              toInput(res.third_pillar.expected_return_percent) ||
              prev.accounts[0]?.expectedReturnPercent ||
              prev.expectedReturnPercent,
            yearsToPayout: prev.accounts[0]?.yearsToPayout || "10",
          },
          prev.accounts[1] || {
            balanceChf: "",
            expectedReturnPercent: prev.expectedReturnPercent,
            yearsToPayout: "10",
          },
          prev.accounts[2] || {
            balanceChf: "",
            expectedReturnPercent: prev.expectedReturnPercent,
            yearsToPayout: "10",
          },
        ],
        monthlySavingsChf:
          toInput(res.third_pillar.monthly_savings_chf) ||
          (annualContribution3a > 0
            ? String(Math.round(annualContribution3a / 12))
            : prev.monthlySavingsChf),
        expectedReturnPercent: toInput(res.third_pillar.expected_return_percent),
        securitiesChf: toInput(res.third_pillar.securities_chf),
        realEstateEquityChf: toInput(res.third_pillar.real_estate_equity_chf),
        withdrawalTaxRatePercent:
          toInput(res.third_pillar.withdrawal_tax_rate_percent) || prev.withdrawalTaxRatePercent,
        taxModel:
          (toInput(res.third_pillar.tax_model) as ThirdPillarState["taxModel"]) || prev.taxModel,
        taxCanton: toInput(res.third_pillar.tax_canton) || prev.taxCanton,
      }));
    }
    if (res.life_insurance) {
      const monthly = Number(res.life_insurance.monthly_pension_at_retirement ?? 0);
      setLifeInsurance((prev) => ({
        ...prev,
        insuranceType:
          (res.life_insurance.insurance_type as "renten" | "kapital" | "gemischt") || prev.insuranceType,
        insurer: toInput(res.life_insurance.insurer),
        policyNumber: toInput(res.life_insurance.policy_number),
        insuredName: toInput(res.life_insurance.insured_name),
        currency:
          (toInput(res.life_insurance.currency) as LifeInsuranceState["currency"])
          || prev.currency,
        capitalSumChf:
          toInput(res.life_insurance.capital_payout_at_maturity) || prev.capitalSumChf,
        annualRentPaymentChf:
          monthly > 0 ? String(Math.round(monthly * 12)) : prev.annualRentPaymentChf,
        monthlyPremium: toInput(res.life_insurance.monthly_premium),
        sumAtDeath: toInput(res.life_insurance.sum_at_death),
        entryAge: toInput(res.life_insurance.entry_age),
        surrenderValue: toInput(res.life_insurance.surrender_value),
        annualPremium: toInput(res.life_insurance.annual_premium),
        maturityDate: toInput(res.life_insurance.maturity_date),
        maturityYear: toInput(res.life_insurance.maturity_year),
        monthlyPensionAtRetirement: toInput(res.life_insurance.monthly_pension_at_retirement),
        capitalPayoutAtMaturity: toInput(res.life_insurance.capital_payout_at_maturity),
      }));
    }
    if (res.severance) {
      setSeverance((prev) => ({
        ...prev,
        clientName: toInput(res.severance.client_name),
        amountChf: toInput(res.severance.amount),
        isGrossAmount: Boolean(res.severance.is_gross_amount ?? prev.isGrossAmount),
        severanceType:
          (toInput(res.severance.severance_type) as SeveranceState["severanceType"])
          || prev.severanceType,
        providerPreset:
          (toInput(res.severance.provider_preset) as SeveranceState["providerPreset"])
          || prev.providerPreset,
        formulaModel:
          (toInput(res.severance.formula_model) as SeveranceState["formulaModel"])
          || prev.formulaModel,
        startCalculationDay: toInput(res.severance.start_calculation_day),
        employmentStartDate: toInput(res.severance.employment_start_date),
        employmentEndDate: toInput(res.severance.employment_end_date),
        startCalculationMonth: toInput(res.severance.start_calculation_month),
        startCalculationYear: toInput(res.severance.start_calculation_year),
        maturityMonth: toInput(res.severance.start_calculation_month),
        maturityYear: toInput(res.severance.start_calculation_year) || toInput(res.severance.payout_year),
        lastAnnualSalaryChf: toInput(res.severance.last_annual_salary_chf),
        formulaDayFactor: toInput(res.severance.formula_day_factor) || prev.formulaDayFactor,
        formulaMonthFactor: toInput(res.severance.formula_month_factor) || prev.formulaMonthFactor,
        employer: toInput(res.severance.employer),
        payoutYear: toInput(res.severance.payout_year) || prev.payoutYear,
        usagePurpose:
          (toInput(res.severance.usage_purpose) as SeveranceState["usagePurpose"])
          || prev.usagePurpose,
        etfRiskLevel:
          (toInput(res.severance.etf_risk_level) as SeveranceState["etfRiskLevel"])
          || prev.etfRiskLevel,
        ubsProductType:
          (toInput(res.severance.ubs_product_type) as SeveranceState["ubsProductType"])
          || prev.ubsProductType,
        annualFeePercent: prev.annualFeePercent,
        planDurationYears: toInput(res.severance.plan_duration_years) || prev.planDurationYears,
        returnScenarioAdjustment: toInput(res.severance.estimated_return_percent) || prev.returnScenarioAdjustment,
        allocationPensionChf: toInput(res.severance.allocation_bvg_buyin) || prev.allocationPensionChf,
        allocationMutualFundsChf: toInput(res.severance.allocation_pillar3a) || prev.allocationMutualFundsChf,
        allocationDirectPayoutChf: toInput(res.severance.allocation_private_3b) || prev.allocationDirectPayoutChf,
      }));
    }
    if (res.ahv) {
      setAhv((prev) => ({
        ...prev,
        referenceAge: toInput(res.ahv.reference_age) || prev.referenceAge,
        estimatedAverageAnnualIncome: toInput(res.ahv.estimated_average_income_chf),
        contributionEstimate: toInput(res.ahv.contribution_estimate_chf),
        expectedAnnualPension: toInput(res.ahv.expected_annual_pension),
        contributionYears: toInput(res.ahv.contribution_years),
        earlyRetirementYears: toInput(res.ahv.early_retirement_years),
        lateRetirementYears: toInput(res.ahv.late_retirement_years),
      }));
      if (Array.isArray(res.ahv.contribution_rows)) {
        setAhvContributionRows(
          res.ahv.contribution_rows.map((row: Record<string, unknown>) => ({
            year: toInput(row.year),
            annualIncomeChf: toInput(row.annual_income_chf),
            contributionTotalChf: toInput(row.contribution_total_chf),
            ageEndOfYear: toInput(row.age_end_of_year),
            ahvRentShareChf: toInput(row.ahv_rent_share_chf),
            source: (toInput(row.source) as "manual" | "xlsx" | "pdf") || "manual",
          })),
        );
      }
    }
    setProfileHydrated(true);
  }, [createCashRow, profileData, profileHydrated]);

  useEffect(() => {
    if (activeImportPreview || isProcessingImport || pendingFiles.length === 0) return;
    const [first, ...rest] = pendingFiles;
    setPendingFiles(rest);
    void processNextPendingImport([first, ...rest]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles, activeImportPreview, isProcessingImport]);

  const statusByCard: Record<CardId, CardStatus> = {
    personal:
      birthDate
      && profileGender
      && maritalStatus
      && taxDomicileCanton
      && livingSituation
      && (livingSituation !== "rent" || Boolean(rentMonthlyChf.trim()))
      && (
        livingSituation !== "own"
        || additionalProperties.every(
          (entry) => !entry.isRentalUnit || Boolean(entry.monthlyRentalIncomeChf.trim()),
        )
      )
      && (
        maritalStatus === "single"
        || !["married", "divorced", "widowed", "concubinage"].includes(maritalStatus)
        || Boolean(marriageYear.trim())
      )
      && (maritalStatus !== "divorced" || Boolean(divorceYear.trim()))
        ? "ok"
        : "missing",
    ahv: ahv.referenceAge && ahv.estimatedAverageAnnualIncome ? "ok" : "missing",
    bvg: pensionFund.annualSalary && pensionFund.currentOldageCapital ? "ok" : "missing",
    pillar3:
      thirdPillar.accounts.slice(0, thirdPillar.accountCount).some((a) => a.balanceChf) ? "ok" : "missing",
    lifeInsurance:
      lifeInsurance.insurer && (lifeInsurance.monthlyPensionAtRetirement || lifeInsurance.capitalPayoutAtMaturity)
        ? "ok"
        : "missing",
    severance:
      (severance.severanceType === "fixed"
        ? Boolean(severance.amountChf)
        : severance.formulaModel === "reference_age_formula"
          ? Boolean(
            birthDate
            && severance.startCalculationDay
            && severance.startCalculationMonth
            && severance.startCalculationYear
            && severance.lastAnnualSalaryChf,
          )
          : Boolean(
            severance.employmentStartDate
            && severance.employmentEndDate
            && severance.lastAnnualSalaryChf,
          ))
      && severance.usagePurpose
      && severance.planDurationYears
        ? "ok"
        : "missing",
    assets:
      cashAssets.rows.length > 0
      || investmentAssets.etfChf
      || investmentAssets.stocksChf
      || investmentAssets.savingsPlanChf
      || investmentAssets.realEstateEtfChf
        ? "ok"
        : "missing",
  };

  const completionByCard = {
    personal: calculateCompletionRate([
      birthDate,
      profileGender,
      maritalStatus,
      taxDomicileCanton,
      livingSituation,
      ...(livingSituation === "rent" ? [rentMonthlyChf] : []),
      ...(livingSituation === "own"
        ? additionalProperties
            .filter((entry) => entry.isRentalUnit)
            .map((entry) => entry.monthlyRentalIncomeChf)
        : []),
      ...(maritalStatus === "single" ? [] : [marriageYear]),
      ...(maritalStatus === "divorced" ? [divorceYear] : []),
    ]),
    ahv: calculateCompletionRate([
      ahv.referenceAge,
      ahv.estimatedAverageAnnualIncome,
      ahv.contributionYears,
    ]),
    bvg: calculateCompletionRate([
      pensionFund.provider,
      pensionFund.annualSalary,
      pensionFund.currentOldageCapital,
      pensionFund.bvgOldageCapital,
    ]),
    pillar3: calculateCompletionRate([
      thirdPillar.accounts[0]?.balanceChf || "",
      thirdPillar.monthlySavingsChf,
      thirdPillar.taxCanton,
    ]),
    lifeInsurance: calculateCompletionRate([
      lifeInsurance.insurer,
      lifeInsurance.capitalSumChf,
      lifeInsurance.annualRentPaymentChf,
      lifeInsurance.entryAge,
    ]),
    severance: calculateCompletionRate([
      ...(severance.severanceType === "fixed"
        ? [severance.amountChf]
        : severance.formulaModel === "reference_age_formula"
          ? [
            birthDate,
            severance.startCalculationDay,
            severance.startCalculationMonth,
            severance.startCalculationYear,
            severance.lastAnnualSalaryChf,
          ]
          : [severance.employmentStartDate, severance.employmentEndDate, severance.lastAnnualSalaryChf]),
      severance.usagePurpose,
      severance.planDurationYears,
    ]),
    assets: calculateCompletionRate([
      ...cashAssets.rows.map((row) => row.amount),
      investmentAssets.etfChf,
      investmentAssets.stocksChf,
      investmentAssets.savingsPlanChf,
      investmentAssets.realEstateEtfChf,
    ]),
  };

  if (profileLoading && !profileHydrated) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-700 bg-surface">
        <p className="text-base text-slate-300">Profil wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-light text-neutral-50">{t("dashboard.title")}</h1>
          <p className="text-sm text-neutral-400">
            {t("dashboard.subtitle")}
          </p>
        </div>
      </header>

      {profileError && (
        <div className="rounded-md border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
          {t("dashboard.profileLoadError")}
        </div>
      )}

      {activeImportPreview && (
        <div className="fixed inset-0 z-50 transition-opacity duration-300">
          <button
            type="button"
            aria-label={t("dashboard.closeImportAria")}
            className="absolute inset-0 bg-slate-950/70"
            onClick={() => {
              setActiveImportPreview(null);
              setImportStatus(
                pendingFiles.length > 0 ? t("upload.filesReady", { count: pendingFiles.length }) : "",
              );
            }}
          />
          <div className="absolute inset-x-3 bottom-3 top-16 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
                <div>
                  <p className="text-base font-semibold text-slate-100">{t("dashboard.importMappingTitle")}</p>
                  <p className="text-xs text-slate-400">{t("dashboard.importMappingSubtitle")}</p>
                </div>
                <button
                  type="button"
                  className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                  onClick={() => {
                    setActiveImportPreview(null);
                    setImportStatus(
                      pendingFiles.length > 0 ? t("upload.filesReady", { count: pendingFiles.length }) : "",
                    );
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <SelectTargetField
                  preview={activeImportPreview.preview}
                  defaultCardId={activeImportPreview.sourceCardId}
                  cardOptions={IMPORT_TARGET_OPTIONS}
                  onCancel={() => {
                    setActiveImportPreview(null);
                    setImportStatus(
                      pendingFiles.length > 0 ? t("upload.filesReady", { count: pendingFiles.length }) : "",
                    );
                  }}
                  onConfirm={async ({
                    targetCardId,
                    targetFieldId,
                    values,
                    sourceFieldIds,
                    pendingReviewFieldIds,
                    includeSecondary,
                  }) => {
                    if (values.length === 0) {
                      showToast({
                        kind: "warn",
                        title: t("dashboard.toasts.checkOnly"),
                        message: t("dashboard.toasts.checkOnlyMessage"),
                      });
                      setActiveImportPreview(null);
                      return;
                    }
                    const merged = values.length <= 1 ? (values[0] || "") : values.join(" | ");
                    await applyMappedValue(targetCardId, targetFieldId, merged);
                    setActiveImportPreview(null);
                    showToast({
                      kind: "success",
                      title: t("dashboard.toasts.valueInserted"),
                      message: t("dashboard.toasts.valueInsertedMessage", { count: sourceFieldIds.length, target: `${targetCardId}.${targetFieldId}` }),
                    });
                    if (!includeSecondary && pendingReviewFieldIds.length > 0) {
                      showToast({
                        kind: "warn",
                        title: t("dashboard.toasts.secondaryOpen"),
                        message: t("dashboard.toasts.secondaryOpenMessage", { count: pendingReviewFieldIds.length }),
                      });
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 xl:min-h-0">
        <CardLayout
          statusByCard={statusByCard}
          completionByCard={completionByCard}
          activeCard={wizardActiveCard}
          mainFooter={
            <GlobalImportZone
              pendingCount={pendingFiles.length + (activeImportPreview ? 1 : 0)}
              statusLabel={importStatus}
              onFilesQueued={handleQueueFiles}
              onError={(message) =>
                showToast({
                  kind: "error",
                  title: t("dashboard.toasts.fileInvalid"),
                  message,
                })
              }
            />
          }
          onActiveChange={async (prev, next) => {
            setWizardActiveCard(next);
            if (next !== "pillar3") {
              setPillar3NavigationOriginLabel(null);
            }
            if (onSelectedCardChange) {
              onSelectedCardChange(next);
            }
            if (prev === "personal") await savePersonal();
            if (prev === "ahv") await saveAhv();
            if (prev === "bvg") await savePension();
            if (prev === "pillar3") await saveThirdPillar();
            if (prev === "lifeInsurance") await saveLifeInsurance();
            if (prev === "severance") await saveSeverance();
            if (prev === "assets") await saveUserAssets();
          }}
        personalCard={(isActive) => (
          <PersonalDataCard
            birthDate={birthDate}
            gender={profileGender}
            onBirthDateChange={(value) => {
              setBirthDate(value);
              localStorage.setItem(BIRTHDATE_DRAFT_KEY, value);
            }}
            onGenderChange={setProfileGender}
            maritalStatus={maritalStatus}
            marriageYear={marriageYear}
            divorceYear={divorceYear}
            taxDomicileCanton={taxDomicileCanton}
            onMaritalStatusChange={(value) => {
              setMaritalStatus(value);
              if (value === "single") {
                setMarriageYear("");
                setDivorceYear("");
              }
              if (value !== "divorced") {
                setDivorceYear("");
              }
            }}
            onMarriageYearChange={setMarriageYear}
            onDivorceYearChange={setDivorceYear}
            onTaxDomicileCantonChange={setTaxDomicileCanton}
            livingSituation={livingSituation}
            onLivingSituationChange={(value) => {
              setLivingSituation(value);
              if (value === "rent") {
                setAdditionalProperties([]);
              }
              if (value === "own") {
                setRentMonthlyChf("");
                setRentYearlyChf("");
              }
            }}
            rentMonthlyChf={rentMonthlyChf}
            rentYearlyChf={rentYearlyChf}
            onRentMonthlyChfChange={setRentMonthlyChf}
            onRentYearlyChfChange={setRentYearlyChf}
            primaryProperty={{
              name: property.name,
              estimatedMarketValue: property.estimatedMarketValue,
              mortgageAmount: property.mortgageAmount,
              landAreaSqm: property.landAreaSqm,
              usage: property.usage,
            }}
            onPrimaryPropertyChange={(field, value) => {
              if (field === "usage") {
                handlePropertyChange("usage", value as "owner_occupied" | "rented_out" | "mixed");
                return;
              }
              const mapping: Record<string, keyof typeof property> = {
                name: "name",
                estimatedMarketValue: "estimatedMarketValue",
                mortgageAmount: "mortgageAmount",
                landAreaSqm: "landAreaSqm",
              };
              handlePropertyChange(mapping[field], value);
            }}
            additionalProperties={additionalProperties}
            onAddAdditionalProperty={() =>
              setAdditionalProperties((prev) => [
                ...prev,
                {
                  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                  label: "",
                  isRentalUnit: false,
                  monthlyRentalIncomeChf: "",
                  estimatedMarketValueChf: "",
                  mortgageAmountChf: "",
                },
              ])
            }
            onRemoveAdditionalProperty={(id) =>
              setAdditionalProperties((prev) => prev.filter((entry) => entry.id !== id))
            }
            onAdditionalPropertyChange={(id, field, value) =>
              setAdditionalProperties((prev) =>
                prev.map((entry) =>
                  entry.id === id ? { ...entry, [field]: value } : entry,
                ),
              )
            }
            isActive={isActive}
            onSave={savePersonal}
          />
        )}
        ahvCard={(isActive) => (
          <AhvCard
            data={ahvViewData}
            profileAge={profileAgeYears}
            retirementAgeOptions={retirementAgeOptions}
            hasDetailedContributionHistory={ahvHistoryStats.hasDetailedHistory}
            historyContributionYears={ahvHistoryStats.contributionYears}
            contributionRows={ahvContributionRows}
            contributionIssues={ahvContributionIssues}
            onContributionRowsChange={setAhvContributionRows}
            onImportContributions={importAhvContributions}
            importPreview={ahvImportPreview}
            onChangeImportPreviewRow={(index, nextRow) => {
              setAhvImportPreview((prev) => {
                if (!prev) return prev;
                const rows = [...prev.rows];
                rows[index] = nextRow;
                return { ...prev, rows };
              });
            }}
            onAcceptImportPreview={acceptAhvImportPreview}
            onDiscardImportPreview={discardAhvImportPreview}
            onChangeImportMapping={changeAhvImportMapping}
            isActive={isActive}
            onChange={(field, value) => setAhv((prev) => ({ ...prev, [field]: value }))}
            onSave={saveAhv}
          />
        )}
        bvgCard={(isActive) => (
          <PensionFundCard
            data={pensionFund}
            isActive={isActive}
            onChange={(field, value) => setPensionFund((prev) => ({ ...prev, [field]: value }))}
            onSave={savePension}
            detailsOpen={cardDetailsState.bvg}
            onDetailsToggle={(open) =>
              setCardDetailsState((prev) => ({ ...prev, bvg: open }))
            }
          />
        )}
        pillar3Card={(isActive) => (
          <ThirdPillarCard
            data={thirdPillar}
            isActive={isActive}
            onChange={(field, value) => setThirdPillar((prev) => ({ ...prev, [field]: value }))}
            onSave={saveThirdPillar}
            initialTab={pillar3PreferredTab}
            onTabChange={handlePillar3TabChange}
            scrollToTabsTrigger={pillar3ScrollToTabHeaderSignal}
            navigationContextLabel={pillar3NavigationOriginLabel}
            motionEttlinContext={{
              birthDate,
              referenceAge: ahv.referenceAge,
              accountBalances: thirdPillar.accounts.slice(0, 3).map((account) => account.balanceChf),
              monthlyContributionChf: thirdPillar.monthlySavingsChf,
            }}
          />
        )}
        lifeInsuranceCard={(isActive) => (
          <LifeInsuranceTile
            data={lifeInsurance}
            isActive={isActive}
            onChange={(field, value) => setLifeInsurance((prev) => ({ ...prev, [field]: value }))}
            onSave={saveLifeInsurance}
            onImportPolicy={importLifeInsurancePolicy}
            importPreview={lifeImportPreview}
            onAcceptImportPreview={acceptLifeImportPreview}
            onDiscardImportPreview={discardLifeImportPreview}
            onChangeImportMapping={changeLifeImportMapping}
            detailsOpen={cardDetailsState.lifeInsurance}
            onDetailsToggle={(open) =>
              setCardDetailsState((prev) => ({ ...prev, lifeInsurance: open }))
            }
          />
        )}
        severanceCard={(isActive) => (
          <SeveranceCard
            data={severance}
            taxDomicileCanton={taxDomicileCanton}
            profileGender={profileGender}
            profileBirthDate={birthDate}
            isActive={isActive}
            onChange={(field, value) =>
              setSeverance((prev) => ({ ...prev, [field]: value }))
            }
            onSave={saveSeverance}
          />
        )}
        assetsCard={(isActive) => (
          <AssetsOverviewCard
            cashData={cashAssets}
            investmentData={investmentAssets}
            isActive={isActive}
            onCashChange={(rows) => setCashAssets({ rows })}
            onInvestmentChange={(field, value) => setInvestmentAssets((prev) => ({ ...prev, [field]: value }))}
            onSave={saveUserAssets}
          />
        )}
        />
      </div>
    </div>
  );
};

