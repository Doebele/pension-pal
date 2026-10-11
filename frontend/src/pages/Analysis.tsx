import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
  Rectangle,
  Customized,
  Legend,
} from "recharts";
import { HomeUser, SidebarCollapse, SidebarExpand, WarningTriangle, Xmark } from "iconoir-react";
import { ApiError, api } from "../services/api";
import { useTaxModel } from "../hooks/useTaxModel";
import { ChartErrorBoundary } from "../components/common/ChartErrorBoundary";
import { AnalysisInputs } from "../components/AnalysisInputs";
import { AutoSaveManager } from "../components/AutoSaveManager";
import {
  PayoutPlanningSection,
  buildPayoutInput,
  type PayoutPart,
  type PayoutPlanSettings,
} from "../components/analysis/PayoutPlanningSection";
import { CockpitBoard, type CockpitCard } from "../components/analysis/CockpitBoard";
import { medianWealth, retireeIncomeMonthly } from "../services/swissMedians";
import {
  AHV_EARLY_REDUCTION_PER_YEAR,
  AHV_LATE_INCREASE_PER_YEAR,
  BVG_EARLY_REDUCTION_PER_YEAR,
  BVG_LATE_INCREASE_PER_YEAR,
  bvgBuyInAtRetirement,
  buyInBlocksCapital,
  legalAhvReferenceAge,
  simulatePayoutPlan,
  unreducedAhvFromCard,
  type BvgBuyIn,
  type PayoutPlanResult,
} from "../services/payoutPlanning";
import {
  MSCI_WORLD_RETURN_DEFAULT_PERCENT,
  MSCI_WORLD_RETURN_MAX_PERCENT,
  MSCI_WORLD_RETURN_MIN_PERCENT,
  UBS_BVG_RETURN_DEFAULT_PERCENT,
} from "../constants/marketBenchmarks";
import { scenarioReducer, type ScenarioState } from "../store/slices/scenarioSlice";
import analysisLayoutConfigJson from "../config/analysisLayoutConfig.json";
import {
  estimateTaxRateForIncome,
  getAvailableTaxModelCantons,
  type TaxBracket,
} from "../services/taxModel";
import { getDynamicAmountStep } from "../utils/dynamicAmountStep";
import { useTranslation } from "react-i18next";
import { CHART_CATEGORICAL, useChartThemeColors } from "../constants/chartColors";
import "../../styles/analysis-grid.css";
import { NotchedRange } from "../components/common/NotchedRange";
import { ahvUnreducedAnnualPension } from "../services/ahvEstimate";

const COLORS = {
  ahv: CHART_CATEGORICAL[0],
  bvg: CHART_CATEGORICAL[1],
  pillar3a: CHART_CATEGORICAL[2],
  life: CHART_CATEGORICAL[3],
  privat: CHART_CATEGORICAL[4],
  tax: CHART_CATEGORICAL[5],
};
const BVG_CONVERSION_RATE_PERCENT = 6.8;

const INCOME_LEGEND_ITEMS = [
  { dataKey: "ahv", color: COLORS.ahv, nameKey: "pillars.ahv" },
  { dataKey: "bvg", color: COLORS.bvg, nameKey: "pillars.bvg" },
  { dataKey: "pillar3a", color: COLORS.pillar3a, nameKey: "pillars.pillar3a" },
  { dataKey: "life", color: COLORS.life, nameKey: "pillars.life" },
  { dataKey: "privat", color: COLORS.privat, nameKey: "pillars.privat" },
  { dataKey: "tax", color: COLORS.tax, nameKey: "pillars.tax" },
] as const;
const COMPARISON_LEGEND_ITEMS = [
  { key: "ahv", color: COLORS.ahv, nameKey: "pillars.ahv" },
  { key: "bvg", color: COLORS.bvg, nameKey: "pillars.bvg" },
  { key: "pillar3a", color: COLORS.pillar3a, nameKey: "pillars.pillar3a" },
  { key: "life", color: COLORS.life, nameKey: "pillars.life" },
  { key: "privat", color: COLORS.privat, nameKey: "pillars.privat" },
  { key: "gap", color: "#fbbf24", nameKey: "pillars.gap" },
  { key: "tax", color: COLORS.tax, nameKey: "pillars.taxLoad" },
] as const;

const TOP_10_CANTONS = ["ZH", "BE", "VD", "AG", "SG", "GE", "LU", "TI", "VS", "FR"] as const;
const CANTON_NAME_BY_CODE: Record<string, string> = {
  AG: "Aargau",
  AI: "Appenzell Innerrhoden",
  AR: "Appenzell Ausserrhoden",
  BE: "Bern",
  BL: "Basel-Landschaft",
  BS: "Basel-Stadt",
  FR: "Fribourg",
  GE: "Geneve",
  GL: "Glarus",
  GR: "Graubünden",
  JU: "Jura",
  LU: "Luzern",
  NE: "Neuchatel",
  NW: "Nidwalden",
  OW: "Obwalden",
  SG: "St. Gallen",
  SH: "Schaffhausen",
  SO: "Solothurn",
  SZ: "Schwyz",
  TG: "Thurgau",
  TI: "Ticino",
  UR: "Uri",
  VD: "Vaud",
  VS: "Valais",
  ZG: "Zug",
  ZH: "Zuerich",
};
const analysisLayoutConfig = analysisLayoutConfigJson.layout;
const sliderConfigById = Object.fromEntries(
  analysisLayoutConfig.leftColumn.sliders.map((slider) => [slider.id, slider]),
);
const retirementSliderConfig = sliderConfigById.retirementAge;
const currentAgeSliderConfig = sliderConfigById.currentAgeEstimate;
const inflationSliderConfig = sliderConfigById.inflation;
const taxAdjustmentConfig = analysisLayoutConfig.middleColumn.taxAdjustment;
const stressTestConfig = analysisLayoutConfig.middleColumn.stressTestToggle;
const compensationConfig = analysisLayoutConfig.compensationAnalysis;
const capitalNeedSliderConfig = compensationConfig?.capitalNeedSlider;
const topSectionColumnsClass =
  analysisLayoutConfig.topSectionColumns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";

const formatMonthlyAmount = (value: number): string =>
  `CHF ${Math.round(value).toLocaleString("de-CH")}/M`;
const formatChf = (value: number): string => `CHF ${value.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatIncomeRange = (entry: TaxBracket): string => {
  if (entry.incomeMax >= 999999999) {
    return `ab CHF ${Math.round(entry.incomeMin).toLocaleString("de-CH")}`;
  }
  return `CHF ${Math.round(entry.incomeMin).toLocaleString("de-CH")} - CHF ${Math.round(entry.incomeMax).toLocaleString("de-CH")}`;
};

type LabelTooltipProps = {
  label: string;
  tooltip: string;
};

const LabelTooltip: React.FC<LabelTooltipProps> = ({ label, tooltip }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={tooltip}
        className="cursor-help decoration-dotted underline-offset-2 hover:underline focus-visible:underline"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {label}
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-6 left-1/2 z-40 w-64 -translate-x-1/2 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-2xs font-normal leading-snug text-slate-200 shadow-xl"
        >
          {tooltip}
        </span>
      )}
    </span>
  );
};

type IncomeTooltipPayload = {
  value?: unknown;
  name?: string;
  dataKey?: unknown;
  payload?: Record<string, unknown>;
};

type IncomeTooltipProps = {
  active?: boolean;
  payload?: IncomeTooltipPayload[];
  label?: number;
};

type BarSegmentShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  radius?: number | [number, number, number, number];
  fill?: string;
};

type BarBounds = {
  x: number;
  width: number;
  top: number;
  bottom: number;
};

const IncomeDistributionTooltip: React.FC<IncomeTooltipProps> = ({ active, payload, label }) => {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;

  const segments = [
    { dataKey: "ahv", name: t("pillars.ahv"), color: COLORS.ahv },
    { dataKey: "bvg", name: t("pillars.bvg"), color: COLORS.bvg },
    { dataKey: "pillar3a", name: t("pillars.pillar3a"), color: COLORS.pillar3a },
    { dataKey: "life", name: t("pillars.life"), color: COLORS.life },
    { dataKey: "privat", name: t("pillars.privat"), color: COLORS.privat },
    { dataKey: "tax", name: t("pillars.tax"), color: COLORS.tax },
  ] as const;

  const data = payload[0]?.payload ?? {};
  const totalNet = segments
    .filter((segment) => segment.dataKey !== "tax")
    .reduce((sum, segment) => {
      const value = data[segment.dataKey];
      return sum + (typeof value === "number" ? value : Number(value ?? 0));
    }, 0);
  const totalGross = typeof data.totalGross === "number" ? data.totalGross : Number(data.totalGross ?? totalNet);
  const taxAbsolute = typeof data.tax === "number" ? data.tax : Number(data.tax ?? 0);
  const taxPercent = totalGross > 0 ? (taxAbsolute / totalGross) * 100 : 0;
  const calendarYear = typeof data.calendarYear === "number" ? data.calendarYear : Number(data.calendarYear ?? 0);
  const ahvReductionPercent = typeof data.ahvReductionPercent === "number"
    ? data.ahvReductionPercent
    : Number(data.ahvReductionPercent ?? 0);
  const remainingPrivateWealth = typeof data.remainingPrivateWealth === "number"
    ? data.remainingPrivateWealth
    : Number(data.remainingPrivateWealth ?? 0);

  const total = totalNet;

  return (
    <div className="chart-tooltip-detailed">
      <p className="mb-2 text-xs text-slate-400">
        {t("analysisPage.yearAge", { year: calendarYear, age: label })}
      </p>
      <div className="space-y-1">
        {segments.map((segment) => {
          const value = data[segment.dataKey];
          const numericValue = typeof value === "number" ? value : Number(value ?? 0);
          if (numericValue <= 0) return null;
          const annualValue = numericValue * 12;
          const segmentSharePercent = totalGross > 0 ? (numericValue / totalGross) * 100 : 0;
          return (
            <div key={segment.dataKey} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: segment.color }} />
                <span className="text-xs text-slate-300">{segment.name}</span>
              </div>
              <span className="text-xs font-medium" style={{ color: segment.color }}>
                {formatMonthlyAmount(numericValue)} · CHF {Math.round(annualValue).toLocaleString("de-CH")} p.a. · {segmentSharePercent.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
      <div className="my-2 border-t border-slate-600" />
      {taxAbsolute > 0 && (
        <div className="mb-2 rounded border border-rose-500/30 bg-rose-900/20 px-2 py-1 text-2xs text-rose-100">
          {t("analysisPage.taxPa", { amount: Math.round(taxAbsolute * 12).toLocaleString("de-CH"), percent: taxPercent.toFixed(2) })}
        </div>
      )}
      <div className="mb-2 rounded border border-slate-700 bg-surface-2 px-2 py-1 text-2xs text-slate-200">
        {t("analysisPage.ahvReductionInScenario", { value: ahvReductionPercent > 0 ? `${ahvReductionPercent.toFixed(1)}%` : t("analysisPage.noReduction") })}
      </div>
      <div className="mb-2 rounded border border-slate-700 bg-surface-2 px-2 py-1 text-2xs text-slate-200">
        {t("analysisPage.remainingWealth", { amount: Math.round(remainingPrivateWealth).toLocaleString("de-CH") })}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200">{t("analysisPage.totalNetIncome")}</span>
        <span className="text-sm font-bold text-slate-50">
          {formatMonthlyAmount(total)} · CHF {Math.round(total * 12).toLocaleString("de-CH")} p.a.
        </span>
      </div>
    </div>
  );
};

const ComparisonTooltip: React.FC<IncomeTooltipProps> = ({ active, payload }) => {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload ?? {};
  const group = String(data.group || "");
  const age = Number(data.age ?? 0);
  const year = Number(data.calendarYear ?? 0);
  const pensionTotal = Number(data.pensionTotal ?? 0);
  const capitalTotal = Number(data.capitalTotal ?? 0);
  const gapAbs = Number(data.gapAbs ?? 0);
  const gapLabel = String(data.gapLabel || "");

  const segments = [
    { dataKey: "ahv", name: t("pillars.ahv"), color: COLORS.ahv },
    { dataKey: "bvg", name: t("pillars.bvg"), color: COLORS.bvg },
    { dataKey: "pillar3a", name: t("pillars.pillar3a"), color: COLORS.pillar3a },
    { dataKey: "life", name: t("pillars.life"), color: COLORS.life },
    { dataKey: "privat", name: t("pillars.privat"), color: COLORS.privat },
    { dataKey: "capitalBase", name: t("pillars.capitalBase"), color: COLORS.bvg },
    { dataKey: "taxLoad", name: t("pillars.taxLoad"), color: COLORS.tax },
    { dataKey: "gap", name: t("pillars.gap"), color: "#fbbf24" },
  ] as const;

  return (
    <div className="chart-tooltip-detailed">
      <p className="mb-2 text-xs text-slate-400">
        {t("analysisPage.yearAge", { year, age })}
      </p>
      <p className="mb-2 text-xs font-semibold text-slate-100">{group}</p>
      <div className="space-y-1">
        {segments.map((segment) => {
          const value = Number(data[segment.dataKey] ?? 0);
          if (value <= 0) return null;
          return (
            <div key={segment.dataKey} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: segment.color }} />
                <span className="text-xs text-slate-300">{segment.name}</span>
              </div>
              <span className="text-xs font-medium" style={{ color: segment.color }}>
                {formatChf(value)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="my-2 border-t border-slate-600" />
      <div className="rounded border border-slate-700 bg-surface-2 px-2 py-1 text-2xs text-slate-200">
        {t("analysisPage.pensionVsCapital", { pension: formatChf(pensionTotal), capital: formatChf(capitalTotal) })}
      </div>
      <div className="mt-2 rounded border border-amber-500/30 bg-amber-900/20 px-2 py-1 text-2xs text-amber-100">
        {gapLabel}: {formatChf(gapAbs)}
      </div>
    </div>
  );
};

type PensionByAge = {
  age: number;
  calendarYear: number;
  ahv: number;
  bvg: number;
  pillar3a: number;
  life: number;
  privat: number;
  tax: number;
  taxPercent: number;
  totalGross: number;
  totalNet: number;
  annualGross: number;
  annualNet: number;
  annualTax: number;
  ahvRetirementFactor: number;
  ahvReductionPercent: number;
  remainingPrivateWealth: number;
  total: number;
};

type BvgLinePoint = { age: number; standard: number; reduced: number };
type ScenarioId = "baseline" | "early" | "late" | "inflation_shock" | "divorce";
type WealthComparisonPoint = {
  age: number;
  planWealth?: number; // angelegtes Vermögen laut Bezugsplanung (heutige Franken)
  capitalWealth?: number; // gleicher Plan mit 100 % PK-Kapitalbezug
  pensionWealth?: number; // gleicher Plan mit 100 % PK-Rente
  medianWealth?: number; // Median freies Vermögen nach Alter (LUSTAT), bis 74
};

/** Monatlich verfügbar ab AHV-Beginn (heutige Franken, vor Einkommenssteuer) */
const monthlyFromAhvStart = (result: PayoutPlanResult) => {
  const row = result.years.find((y) => y.ahv > 0) ?? result.years[0];
  return row ? (row.ahv + row.bvgPension + row.lifePension + row.capitalDraw) / row.deflator / 12 : 0;
};

type CockpitTab = "scenario" | "severance" | "pillars" | "investment" | "needs";
const COCKPIT_STORAGE_KEY = "pensionpal-cockpit-v1";
const readCockpitPrefs = (): { open: boolean; tab: CockpitTab } => {
  try {
    const raw = JSON.parse(localStorage.getItem(COCKPIT_STORAGE_KEY) || "{}");
    return { open: raw.open !== false, tab: raw.tab ?? "scenario" };
  } catch {
    return { open: true, tab: "scenario" };
  }
};

/** layout "classic": bisherige Auswertung; "cockpit": Ergebnisse im Inhalt, Eingaben in der Sidebar */
export const Analysis: React.FC<{ layout?: "classic" | "cockpit" }> = ({ layout = "classic" }) => {
  const [cockpitOpen, setCockpitOpenState] = useState(() => readCockpitPrefs().open);
  const [cockpitTab, setCockpitTabState] = useState<CockpitTab>(() => readCockpitPrefs().tab);
  const saveCockpitPrefs = (open: boolean, tab: CockpitTab) => {
    try { localStorage.setItem(COCKPIT_STORAGE_KEY, JSON.stringify({ open, tab })); } catch { /* nur Komfort */ }
  };
  const setCockpitOpen = (open: boolean) => { setCockpitOpenState(open); saveCockpitPrefs(open, cockpitTab); };
  const setCockpitTab = (tab: CockpitTab) => { setCockpitTabState(tab); saveCockpitPrefs(cockpitOpen, tab); };
  const { t } = useTranslation();
  const chartThemeColors = useChartThemeColors();
  const [scenario, setScenario] = useState<ScenarioId>("baseline");
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [hoveredComparisonBarIndex, setHoveredComparisonBarIndex] = useState<number | null>(null);
  const barBoundsRef = useRef<Record<number, BarBounds>>({});
  const comparisonBarBoundsRef = useRef<Record<number, BarBounds>>({});
  const [retirementAge, setRetirementAge] = useState(Number(retirementSliderConfig?.default ?? 64));
  const [targetAge, setTargetAge] = useState(90);
  // Bezugsplanung (Rente/Kapital, 3a-Staffelung, 3b); null = noch aus dem Profil zu füllen
  const [payoutPlan, setPayoutPlan] = useState<PayoutPlanSettings | null>(null);
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const birthYear = birthDate?.getFullYear() ?? null;
  const [taxRateAdjustment, setTaxRateAdjustment] = useState(0);
  const [selectedCanton, setSelectedCanton] = useState("");
  const [inflation, setInflation] = useState(Number(inflationSliderConfig?.default ?? 2.5));
  const [bvgRepaymentPerYear, setBvgRepaymentPerYear] = useState(0);
  const [lineData, setLineData] = useState<BvgLinePoint[]>([]);
  const [netRatio, setNetRatio] = useState<number | null>(null);
  const [monthlyRentLoss, setMonthlyRentLoss] = useState<number | null>(null);
  const [calcError, setCalcError] = useState<string>("");
  const [validationStatus, setValidationStatus] = useState<"passed" | "warning" | "error">("passed");
  const [validationIssues, setValidationIssues] = useState<Array<Record<string, unknown>>>([]);
  const [divorceAge, setDivorceAge] = useState(45);
  const [scenarioFeedback, setScenarioFeedback] = useState("");
  const [currentAgeEstimate, setCurrentAgeEstimate] = useState(
    currentAgeSliderConfig?.default === "current"
      ? 45
      : Number(currentAgeSliderConfig?.default ?? 45),
  );
  const [initialPrivateCapital, setInitialPrivateCapital] = useState(300000);
  const [lumpSumCapital, setLumpSumCapital] = useState(500000);
  const [lumpSumGrossAmount, setLumpSumGrossAmount] = useState(500000);
  const [lumpSumMaturityMonth, setLumpSumMaturityMonth] = useState<number | null>(null);
  const [lumpSumMaturityYear, setLumpSumMaturityYear] = useState<number | null>(null);
  const [lumpSumBaseTaxRate, setLumpSumBaseTaxRate] = useState(7.2);
  const [, setAllocationAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [allocationAutoSaveEnabled, setAllocationAutoSaveEnabled] = useState(false);
  const [scenarioState, dispatchScenario] = React.useReducer(scenarioReducer, {
    pensionDeposit: 0,
    savingsAmount: 0,
    payoutDirect: 0,
    returnPensionFund: UBS_BVG_RETURN_DEFAULT_PERCENT,
    returnSavingsPortf: MSCI_WORLD_RETURN_DEFAULT_PERCENT,
    lastUpdateTimestamp: "",
  } satisfies ScenarioState);
  const [investmentReturnPercent, setInvestmentReturnPercent] = useState(4);
  const [showTaxBurden, setShowTaxBurden] = useState(true);
  const [showStressTestChart, setShowStressTestChart] = useState(Boolean(stressTestConfig?.default));
  const [capitalNeedPercent, setCapitalNeedPercent] = useState(
    Number(capitalNeedSliderConfig?.default ?? 75),
  );
  const [capitalResetPulse, setCapitalResetPulse] = useState(false);
  const [showCompensationBars, setShowCompensationBars] = useState(false);
  const [secondPillarAnnualIncome, setSecondPillarAnnualIncome] = useState(0);
  const [inputMonthlyAhv, setInputMonthlyAhv] = useState(2400);
  const [inputMonthlyBvg, setInputMonthlyBvg] = useState(4000);
  const [inputMonthlyPillar3a, setInputMonthlyPillar3a] = useState(800);
  const [inputMonthlyLife, setInputMonthlyLife] = useState(250);
  const [inputMonthlyPrivat, setInputMonthlyPrivat] = useState(500);
  const [profileGender, setProfileGender] = useState<"male" | "female">("male");

  const availableCantons = useMemo(() => getAvailableTaxModelCantons(), []);
  const cantonOptions = useMemo(() => {
    const top = TOP_10_CANTONS.filter((code) => availableCantons.includes(code));
    const rest = availableCantons.filter((code) => !top.includes(code as (typeof TOP_10_CANTONS)[number]));
    return [...top, ...rest];
  }, [availableCantons]);
  const taxModelCanton = selectedCanton || cantonOptions[0] || "ZH";

  // Gesetzliches AHV-Referenzalter (AHV 21), nicht das geplante Pensionsalter aus der AHV-Karte
  const ahvReferenceAge = legalAhvReferenceAge(profileGender, birthYear);
  const statutoryAhvAge = ahvReferenceAge;
  const retirementDeltaYears = retirementAge - statutoryAhvAge;
  const ahvRetirementFactor = useMemo(() => {
    if (retirementDeltaYears < 0) {
      return Math.max(0.5, 1 + retirementDeltaYears * AHV_EARLY_REDUCTION_PER_YEAR);
    }
    return Math.min(1.31, 1 + retirementDeltaYears * AHV_LATE_INCREASE_PER_YEAR);
  }, [retirementDeltaYears]);
  const bvgRetirementFactor = useMemo(() => {
    if (retirementDeltaYears < 0) {
      return Math.max(0.6, 1 + retirementDeltaYears * BVG_EARLY_REDUCTION_PER_YEAR);
    }
    return Math.min(1.25, 1 + retirementDeltaYears * BVG_LATE_INCREASE_PER_YEAR);
  }, [retirementDeltaYears]);
  // Einkauf aus der Abfindung: fliesst bei Fälligkeit (Monat/Jahr der Abfindung) in die Pensionskasse
  // und wird bis zur Pensionierung mit dem Zins der Kasse verzinst; ohne Fälligkeit ab heute.
  const bvgBuyIn = useMemo<BvgBuyIn>(() => {
    const now = new Date();
    const payment = lumpSumMaturityYear ? new Date(lumpSumMaturityYear, (lumpSumMaturityMonth ?? 1) - 1, 1) : now;
    const paidAt = payment > now ? payment : now;
    // Alter bei Einzahlung taggenau aus dem Geburtsdatum (Pensionierung = Geburtstag im Pensionsalter)
    const paidAtAge = birthDate
      ? (paidAt.getTime() - birthDate.getTime()) / (365.25 * 24 * 3600 * 1000)
      : currentAgeEstimate + (paidAt.getTime() - now.getTime()) / (365.25 * 24 * 3600 * 1000);
    return { amount: scenarioState.pensionDeposit, paidAtAge, ratePercent: scenarioState.returnPensionFund };
  }, [scenarioState.pensionDeposit, scenarioState.returnPensionFund, lumpSumMaturityYear, lumpSumMaturityMonth, currentAgeEstimate, birthDate]);
  const buyInYears = Math.max(0, retirementAge - bvgBuyIn.paidAtAge);
  const projectedAdditionalBvgCapital = useMemo(
    () => bvgBuyInAtRetirement(bvgBuyIn, retirementAge),
    [bvgBuyIn, retirementAge],
  );
  const projectedAdditionalBvgGain = useMemo(
    () => Math.max(0, projectedAdditionalBvgCapital - scenarioState.pensionDeposit),
    [projectedAdditionalBvgCapital, scenarioState.pensionDeposit],
  );
  const additionalBvgMonthlyAtRetirement = useMemo(
    () => Math.max(0, (projectedAdditionalBvgCapital * (BVG_CONVERSION_RATE_PERCENT / 100)) / 12),
    [projectedAdditionalBvgCapital],
  );

  const computeGrossByAge = React.useCallback((age: number) => {
    const divorceReduction = scenario === "divorce" ? 0.5 : 1;
    const inflationDecay = Math.pow(1 + inflation / 100, Math.max(0, age - retirementAge));
    const bvgBaseMonthly = inputMonthlyBvg + additionalBvgMonthlyAtRetirement;
    return {
      ahv: Math.round((inputMonthlyAhv * ahvRetirementFactor) / inflationDecay),
      bvg: Math.round((bvgBaseMonthly * bvgRetirementFactor * divorceReduction) / inflationDecay),
      pillar3a: Math.round(inputMonthlyPillar3a / inflationDecay),
      life: Math.round(inputMonthlyLife / inflationDecay),
      privat: Math.round(inputMonthlyPrivat / inflationDecay),
    };
  }, [
    inflation,
    inputMonthlyAhv,
    inputMonthlyBvg,
    inputMonthlyLife,
    inputMonthlyPillar3a,
    inputMonthlyPrivat,
    additionalBvgMonthlyAtRetirement,
    ahvRetirementFactor,
    bvgRetirementFactor,
    retirementAge,
    scenario,
  ]);

  const grossReference = useMemo(() => {
    const gross = computeGrossByAge(retirementAge);
    return gross.ahv + gross.bvg + gross.pillar3a + gross.life + gross.privat;
  }, [computeGrossByAge, retirementAge]);
  const annualIncomeEstimate = grossReference * 12;
  const recordBarBounds = React.useCallback((props: BarSegmentShapeProps) => {
    const { x = 0, y = 0, width = 0, height = 0, index } = props;
    if (typeof index !== "number" || width <= 0 || height <= 0) return;
    const top = y;
    const bottom = y + height;
    const existing = barBoundsRef.current[index];
    if (!existing) {
      barBoundsRef.current[index] = { x, width, top, bottom };
      return;
    }
    barBoundsRef.current[index] = {
      x,
      width,
      top: Math.min(existing.top, top),
      bottom: Math.max(existing.bottom, bottom),
    };
  }, []);

  // recharts types `shape` props as unknown
  const renderIncomeBarSegment = React.useCallback((raw: unknown) => {
    const props = raw as BarSegmentShapeProps;
    recordBarBounds(props);
    return <Rectangle {...props} />;
  }, [recordBarBounds]);
  const recordComparisonBarBounds = React.useCallback((props: BarSegmentShapeProps) => {
    const { x = 0, y = 0, width = 0, height = 0, index } = props;
    if (typeof index !== "number" || width <= 0 || height <= 0) return;
    const top = y;
    const bottom = y + height;
    const existing = comparisonBarBoundsRef.current[index];
    if (!existing) {
      comparisonBarBoundsRef.current[index] = { x, width, top, bottom };
      return;
    }
    comparisonBarBoundsRef.current[index] = {
      x,
      width,
      top: Math.min(existing.top, top),
      bottom: Math.max(existing.bottom, bottom),
    };
  }, []);
  const renderComparisonBarSegment = React.useCallback((raw: unknown) => {
    const props = raw as BarSegmentShapeProps;
    recordComparisonBarBounds(props);
    return <Rectangle {...props} />;
  }, [recordComparisonBarBounds]);

  const { data: taxModel, loading: taxModelLoading, error: taxModelError } = useTaxModel(taxModelCanton);
  const modelTaxRate = useMemo(
    () => (taxModel ? estimateTaxRateForIncome(taxModel, annualIncomeEstimate) : 8),
    [annualIncomeEstimate, taxModel],
  );
  const effectiveTaxRate = useMemo(
    () => Math.max(0, Number((modelTaxRate + taxRateAdjustment).toFixed(2))),
    [modelTaxRate, taxRateAdjustment],
  );
  const cantonDisplayName = useMemo(() => {
    const modelName = String(taxModel?.kanton?.name || "").trim();
    if (modelName) return modelName;
    return CANTON_NAME_BY_CODE[taxModelCanton] || taxModelCanton;
  }, [taxModel?.kanton?.name, taxModelCanton]);
  const cantonProgressionTooltip = useMemo(() => {
    const defaultTooltip = t("analysisConfig.taxCanton.defaultTooltip");
    if (!taxModel?.progressionTable?.length) return `${defaultTooltip} (${cantonDisplayName}).`;
    const currentBracket = taxModel.progressionTable.find(
      (entry) => annualIncomeEstimate >= entry.incomeMin && annualIncomeEstimate < entry.incomeMax,
    ) || taxModel.progressionTable[taxModel.progressionTable.length - 1];
    const currentBracketText = currentBracket
      ? `${formatIncomeRange(currentBracket)}: ${currentBracket.taxRate.toFixed(2)}%`
      : t("analysisConfig.taxCanton.noBracket");
    const compactOverview = taxModel.progressionTable
      .slice(0, 4)
      .map((entry) => `${formatIncomeRange(entry)} (${entry.taxRate.toFixed(1)}%)`)
      .join(" | ");
    return t("analysisConfig.taxCanton.summary", {
      canton: cantonDisplayName,
      income: annualIncomeEstimate.toLocaleString("de-CH"),
      bracket: currentBracketText,
      overview: compactOverview,
    });
  }, [annualIncomeEstimate, cantonDisplayName, t, taxModel?.progressionTable]);

  // Bezugsplanung: dieselbe Simulation wie in der Sektion, damit Einkommens- und Vermögensbild dazu passen
  const payoutResult = useMemo(() => (payoutPlan
    ? simulatePayoutPlan(buildPayoutInput(payoutPlan, {
      currentAge: currentAgeEstimate,
      retirementAge,
      targetAge,
      referenceAge: ahvReferenceAge,
      inflationPercent: inflation,
      canton: selectedCanton,
      ahvBaseAnnual: inputMonthlyAhv * 12,
      bvgBuyIn,
    }))
    : null), [payoutPlan, currentAgeEstimate, retirementAge, targetAge, ahvReferenceAge, inflation, selectedCanton, inputMonthlyAhv, ahvRetirementFactor, bvgBuyIn]);

  // Median der Pensionierten (verfügbares Einkommen, SILC 2018); bei Verheirateten abzüglich Einkommen Partner/in
  const payoutMarried = payoutPlan?.relationship === "married";
  const retireeMedianOwn = Math.max(
    0,
    retireeIncomeMonthly(payoutMarried) - (payoutMarried ? payoutPlan?.partnerMonthlyIncome ?? 0 : 0),
  );

  const barsByAge: PensionByAge[] = useMemo(() => {
    const startAge = Math.max(58, retirementAge);
    const endAge = Math.max(startAge, targetAge);
    const ages = Array.from({ length: endAge - startAge + 1 }, (_, i) => startAge + i);
    const realReturn = (investmentReturnPercent - inflation) / 100;
    let privateWealth = Math.max(0, initialPrivateCapital + lumpSumCapital);
    const annualPrivateWithdrawalBase = Math.max(0, inputMonthlyPrivat) * 12;
    const currentYear = new Date().getFullYear();
    const projectionStartYear = currentYear + (startAge - currentAgeEstimate);
    const ahvReductionPercent = ahvRetirementFactor < 1 ? (1 - ahvRetirementFactor) * 100 : 0;

    return ages.map((age, index) => {
      const planned = computeGrossByAge(age);
      const inflationDecay = Math.pow(1 + inflation / 100, Math.max(0, age - retirementAge));
      const plannedPrivateAnnual = Math.max(0, annualPrivateWithdrawalBase / inflationDecay);
      const privateAnnualPaid = Math.min(plannedPrivateAnnual, Math.max(0, privateWealth));
      let privateMonthlyPaid = Math.round(privateAnnualPaid / 12);
      privateWealth = Math.max(0, (privateWealth - privateAnnualPaid) * (1 + realReturn));
      // Mit Bezugsplanung: PK- und 3b-Rente sowie die Entnahme aus angelegtem Kapital (inkl. 3a,
      // PK-Kapital, 3b-Kapital) kommen aus dem Plan. Kaufkraft wie hier üblich auf das Pensionsjahr bezogen.
      const planRow = payoutResult?.years.find((y) => y.age === age);
      let gross = planned;
      if (planRow) {
        const toRetirementFrancs = Math.pow(1 + inflation / 100, retirementAge - currentAgeEstimate) / planRow.deflator / 12;
        const divorceReduction = scenario === "divorce" ? 0.5 : 1;
        gross = {
          ...planned,
          ahv: Math.round(planRow.ahv * toRetirementFrancs), // AHV frühestens ab 63, gekürzt nach Bezugsbeginn
          bvg: Math.round(planRow.bvgPension * toRetirementFrancs * divorceReduction),
          pillar3a: 0,
          life: Math.round(planRow.lifePension * toRetirementFrancs),
        };
        privateMonthlyPaid = Math.round(planRow.capitalDraw * toRetirementFrancs);
        privateWealth = Math.round(planRow.wealthEnd * toRetirementFrancs * 12);
      }

      const totalGross = gross.ahv + gross.bvg + gross.pillar3a + gross.life + privateMonthlyPaid;
      const tax = showTaxBurden ? Math.round(totalGross * (effectiveTaxRate / 100)) : 0;
      const totalNet = Math.max(0, totalGross - tax);
      const taxPercent = totalGross > 0 ? (tax / totalGross) * 100 : 0;
      const annualGross = totalGross * 12;
      const annualNet = totalNet * 12;
      const annualTax = tax * 12;
      return {
        age,
        calendarYear: projectionStartYear + index,
        ahv: gross.ahv,
        bvg: gross.bvg,
        pillar3a: gross.pillar3a,
        life: gross.life,
        privat: privateMonthlyPaid,
        tax,
        taxPercent,
        totalGross,
        totalNet,
        annualGross,
        annualNet,
        annualTax,
        ahvRetirementFactor,
        ahvReductionPercent,
        remainingPrivateWealth: Math.round(privateWealth),
        total: totalNet,
      };
    });
  }, [
    computeGrossByAge,
    effectiveTaxRate,
    inflation,
    initialPrivateCapital,
    inputMonthlyPrivat,
    investmentReturnPercent,
    lumpSumCapital,
    currentAgeEstimate,
    ahvRetirementFactor,
    retirementAge,
    showTaxBurden,
    targetAge,
    payoutResult,
    scenario,
  ]);
  useEffect(() => {
    barBoundsRef.current = {};
  }, [barsByAge]);
  const referenceAge = barsByAge.find((r) => r.age === retirementAge)
    ?? barsByAge.find((r) => r.age === 65)
    ?? {
      age: retirementAge,
      calendarYear:
        new Date().getFullYear()
        + (Math.max(58, retirementAge) - currentAgeEstimate),
      ahv: 0,
      bvg: 0,
      pillar3a: 0,
      life: 0,
      privat: 0,
      tax: 0,
      taxPercent: 0,
      totalGross: 0,
      totalNet: 0,
      remainingPrivateWealth: 0,
      annualGross: 0,
      annualNet: 0,
      annualTax: 0,
      ahvRetirementFactor,
      ahvReductionPercent: ahvRetirementFactor < 1 ? (1 - ahvRetirementFactor) * 100 : 0,
      total: 0,
    };
  const reductionRow = barsByAge.find((row) => row.ahvReductionPercent > 0) ?? null;
  const ahvReductionStartYear = reductionRow?.calendarYear ?? null;
  const ahvReductionStartAge = reductionRow?.age ?? null;
  const ahvReductionStableYear = reductionRow?.calendarYear ?? null;
  const pensionBreakdownAnnual = useMemo(
    () => ({
      basisRente: Math.max(0, referenceAge.ahv * 12),
      rentenanteil: Math.max(0, referenceAge.bvg * 12),
      zusatzleistungen: Math.max(0, referenceAge.pillar3a * 12),
      lebensversicherung: Math.max(0, referenceAge.life * 12),
      privatvermoegen: Math.max(0, referenceAge.privat * 12),
    }),
    [referenceAge],
  );
  const pensionBruttoAnnual = useMemo(
    () => pensionBreakdownAnnual.basisRente
      + pensionBreakdownAnnual.rentenanteil
      + pensionBreakdownAnnual.zusatzleistungen
      + pensionBreakdownAnnual.lebensversicherung
      + pensionBreakdownAnnual.privatvermoegen,
    [pensionBreakdownAnnual],
  );
  const steuerbelastungAnnual = useMemo(() => -Math.max(0, referenceAge.annualTax), [referenceAge.annualTax]);
  const capitalBaseIncome = useMemo(
    () => (secondPillarAnnualIncome > 0 ? secondPillarAnnualIncome : annualIncomeEstimate),
    [annualIncomeEstimate, secondPillarAnnualIncome],
  );
  const kapitalbedarfChf = useMemo(
    () => (capitalBaseIncome * Math.max(0, capitalNeedPercent)) / 100,
    [capitalBaseIncome, capitalNeedPercent],
  );
  const fehlbetragGesamt = useMemo(
    () => pensionBruttoAnnual + steuerbelastungAnnual - kapitalbedarfChf,
    [pensionBruttoAnnual, steuerbelastungAnnual, kapitalbedarfChf],
  );
  const capitalNeedWithTax = useMemo(
    () => kapitalbedarfChf + Math.abs(steuerbelastungAnnual),
    [kapitalbedarfChf, steuerbelastungAnnual],
  );
  const gapValue = useMemo(
    () => Math.abs(capitalNeedWithTax - pensionBruttoAnnual),
    [capitalNeedWithTax, pensionBruttoAnnual],
  );
  const gapLabel = useMemo(
    () => (capitalNeedWithTax > pensionBruttoAnnual ? t("analysisPage.underfunding") : t("analysisPage.surplus")),
    [capitalNeedWithTax, pensionBruttoAnnual],
  );
  const compensationChartData = useMemo(
    () => [
      {
        group: t("analysisPage.pensionIncomeGroup"),
        ahv: pensionBreakdownAnnual.basisRente,
        bvg: pensionBreakdownAnnual.rentenanteil,
        pillar3a: pensionBreakdownAnnual.zusatzleistungen,
        life: pensionBreakdownAnnual.lebensversicherung,
        privat: pensionBreakdownAnnual.privatvermoegen,
        gapBase: 0,
        gap: 0,
        capitalBase: 0,
        taxLoad: 0,
        pensionTotal: pensionBruttoAnnual,
        capitalTotal: capitalNeedWithTax,
        gapAbs: gapValue,
        gapLabel,
        age: referenceAge.age,
        calendarYear: referenceAge.calendarYear,
      },
      {
        group: t("analysisPage.gapGroup"),
        ahv: 0,
        bvg: 0,
        pillar3a: 0,
        life: 0,
        privat: 0,
        gapBase: Math.min(pensionBruttoAnnual, capitalNeedWithTax),
        gap: gapValue,
        capitalBase: 0,
        taxLoad: 0,
        pensionTotal: pensionBruttoAnnual,
        capitalTotal: capitalNeedWithTax,
        gapAbs: gapValue,
        gapLabel,
        age: referenceAge.age,
        calendarYear: referenceAge.calendarYear,
      },
      {
        group: t("analysisPage.capitalNeedGroup"),
        ahv: 0,
        bvg: 0,
        pillar3a: 0,
        life: 0,
        privat: 0,
        gapBase: 0,
        gap: 0,
        capitalBase: kapitalbedarfChf,
        taxLoad: Math.abs(steuerbelastungAnnual),
        pensionTotal: pensionBruttoAnnual,
        capitalTotal: capitalNeedWithTax,
        gapAbs: gapValue,
        gapLabel,
        age: referenceAge.age,
        calendarYear: referenceAge.calendarYear,
      },
    ],
    [
      capitalNeedWithTax,
      gapLabel,
      gapValue,
      kapitalbedarfChf,
      pensionBreakdownAnnual,
      pensionBruttoAnnual,
      referenceAge.age,
      referenceAge.calendarYear,
      steuerbelastungAnnual,
    ],
  );
  const taxInterimSummary = useMemo(
    () =>
      t("analysisConfig.taxInterimSummary", {
        tax: Math.round(referenceAge.annualTax).toLocaleString("de-CH"),
        rate: effectiveTaxRate.toFixed(2),
        income: annualIncomeEstimate.toLocaleString("de-CH"),
      }),
    [annualIncomeEstimate, effectiveTaxRate, referenceAge.annualTax, t],
  );
  useEffect(() => {
    comparisonBarBoundsRef.current = {};
  }, [compensationChartData]);

  useEffect(() => {
    if (cantonOptions.length === 0) return;
    if (!cantonOptions.includes(selectedCanton)) {
      setSelectedCanton(cantonOptions[0]);
    }
  }, [cantonOptions, selectedCanton]);

  useEffect(() => {
    let active = true;
    const loadSavedScenario = async () => {
      try {
        const state = (await api.fetchProfileState()) as Record<string, any>;
        const saved = Number(state?.scenario?.bvg_mortgage_repayment_amount_per_year ?? 0);
        if (active && Number.isFinite(saved)) {
          setBvgRepaymentPerYear(Math.max(0, Math.round(saved)));
        }
        const analysisState = state?.scenario?.analysis_state as Record<string, unknown> | undefined;
        if (active && analysisState && typeof analysisState === "object") {
          const savedScenario = analysisState.scenarioState as Record<string, unknown> | undefined;
          if (savedScenario) {
            dispatchScenario({
              type: "SET_ALL",
              payload: {
                pensionDeposit: Number(savedScenario.pensionDeposit ?? 0),
                savingsAmount: Number(savedScenario.savingsAmount ?? 0),
                payoutDirect: Number(savedScenario.payoutDirect ?? 0),
                returnPensionFund: Math.max(
                  1,
                  Math.min(13, Number(savedScenario.returnPensionFund ?? UBS_BVG_RETURN_DEFAULT_PERCENT)),
                ),
                returnSavingsPortf: Math.max(
                  MSCI_WORLD_RETURN_MIN_PERCENT,
                  Math.min(
                    MSCI_WORLD_RETURN_MAX_PERCENT,
                    Number(savedScenario.returnSavingsPortf ?? MSCI_WORLD_RETURN_DEFAULT_PERCENT),
                  ),
                ),
              },
            });
          }
          const savedRetirement = Number(analysisState.retirementAge ?? 0);
          if (Number.isFinite(savedRetirement) && savedRetirement >= 58 && savedRetirement <= 70) {
            setRetirementAge(Math.round(savedRetirement));
          }
          const savedMaxAge = Number(analysisState.targetAge ?? 0);
          if (Number.isFinite(savedMaxAge) && savedMaxAge >= 60 && savedMaxAge <= 110) {
            setTargetAge(Math.round(savedMaxAge));
          }
          const savedInflation = Number(analysisState.inflation ?? 0);
          if (Number.isFinite(savedInflation) && savedInflation >= 0 && savedInflation <= 15) {
            setInflation(savedInflation);
          }
          if (analysisState.payoutPlan && typeof analysisState.payoutPlan === "object") {
            setPayoutPlan(analysisState.payoutPlan as PayoutPlanSettings);
          }
          const savedCapitalNeed = Number(analysisState.capitalNeedPercent ?? 0);
          if (Number.isFinite(savedCapitalNeed) && savedCapitalNeed >= 40 && savedCapitalNeed <= 140) {
            setCapitalNeedPercent(savedCapitalNeed);
          }
        }
        const dateOfBirth = String(state?.personal?.date_of_birth || "");
        const hydratedGender = String(state?.personal?.gender || "").toLowerCase();
        if (active && (hydratedGender === "male" || hydratedGender === "female")) {
          setProfileGender(hydratedGender);
        }
        if (active && dateOfBirth) {
          const dob = new Date(dateOfBirth);
          if (!Number.isNaN(dob.getTime())) {
            setBirthDate(dob);
            const now = new Date();
            let ageEstimate = now.getFullYear() - dob.getFullYear();
            if (
              now.getMonth() < dob.getMonth()
              || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())
            ) {
              ageEstimate -= 1;
            }
            setCurrentAgeEstimate(Math.max(18, ageEstimate));
          }
        }
        const savedRetirementAge = Number(state?.ahv?.reference_age ?? 0);
        if (active && Number.isFinite(savedRetirementAge) && savedRetirementAge >= 58 && savedRetirementAge <= 70) {
          setRetirementAge(Math.round(savedRetirementAge));
        }
        // Ungekürzte AHV aus den gespeicherten Eckwerten der Karte (gleiche Formel, services/ahvEstimate);
        // nur ohne Beitragsjahre/Einkommen wird die gespeicherte Rente zurückgerechnet. Ohne AHV-Daten bleibt das Beispiel.
        const ahvYears = Number(state?.ahv?.contribution_years ?? NaN);
        const ahvIncome = Number(state?.ahv?.estimated_average_income_chf ?? NaN);
        const ahvAnnual = Number(state?.ahv?.expected_annual_pension ?? NaN);
        if (active && ((Number.isFinite(ahvYears) && Number.isFinite(ahvIncome)) || (Number.isFinite(ahvAnnual) && ahvAnnual >= 0))) {
          const planned = Number(state?.ahv?.reference_age ?? 0) || 65;
          const unreduced = Number.isFinite(ahvYears) && Number.isFinite(ahvIncome)
            ? ahvUnreducedAnnualPension({ averageIncome: ahvIncome, contributionYears: ahvYears, gender: hydratedGender })
            : unreducedAhvFromCard(
              ahvAnnual, planned, hydratedGender === "female" ? 64 : 65,
              Number(state?.ahv?.early_retirement_years ?? 0) || 0, Number(state?.ahv?.late_retirement_years ?? 0) || 0,
            );
          setInputMonthlyAhv(Math.round(unreduced / 12));
        }
        const bvgMonthlyDirect = Number(state?.pension_fund?.monthly_pension_projection ?? 0);
        const bvgCapital = Number(state?.pension_fund?.current_oldage_capital ?? 0);
        const bvgMonthlyFallback = bvgCapital > 0 ? (bvgCapital * 0.056) / 12 : 0;
        const bvgMonthly = bvgMonthlyDirect > 0 ? bvgMonthlyDirect : bvgMonthlyFallback;
        if (active && Number.isFinite(bvgMonthly) && bvgMonthly > 0) {
          setInputMonthlyBvg(Math.round(bvgMonthly));
        }
        const secondPillarIncomeCandidate = Math.max(
          0,
          Number(state?.pension_fund?.annual_salary ?? 0),
          Number(state?.pension_fund?.insured_salary_total ?? 0),
          Number(state?.pension_fund?.bvg_insured_salary ?? 0),
          Math.round(bvgMonthly * 12),
        );
        if (active && Number.isFinite(secondPillarIncomeCandidate) && secondPillarIncomeCandidate > 0) {
          setSecondPillarAnnualIncome(Math.round(secondPillarIncomeCandidate));
        }
        const thirdPillarMonthly = Number(state?.third_pillar?.monthly_pension_projection ?? state?.third_pillar?.monthly_savings_chf ?? 0);
        if (active && Number.isFinite(thirdPillarMonthly) && thirdPillarMonthly > 0) {
          setInputMonthlyPillar3a(Math.round(thirdPillarMonthly));
        }
        const lifeMonthly = Number(state?.life_insurance?.monthly_pension_at_retirement ?? 0);
        if (active && Number.isFinite(lifeMonthly) && lifeMonthly > 0) {
          setInputMonthlyLife(Math.round(lifeMonthly));
        }
        const privateAssetsMonthlyProxy = Number(state?.personal?.investment_assets?.[0]?.savings_plan_chf ?? 0);
        if (active && Number.isFinite(privateAssetsMonthlyProxy) && privateAssetsMonthlyProxy > 0) {
          setInputMonthlyPrivat(Math.round(privateAssetsMonthlyProxy));
        }
        const capital3a = Number(state?.third_pillar?.capital_3a ?? 0);
        if (active && Number.isFinite(capital3a) && capital3a > 0) {
          setInitialPrivateCapital(Math.round(capital3a));
        }
        const capitalPayout = Number(state?.life_insurance?.capital_payout_at_maturity ?? 0);
        if (active && Number.isFinite(capitalPayout) && capitalPayout > 0) {
          setLumpSumCapital(Math.round(capitalPayout));
        }
        const severanceAmount = Number(state?.severance?.amount ?? 0);
        if (active && Number.isFinite(severanceAmount) && severanceAmount > 0) {
          setLumpSumGrossAmount(Math.round(severanceAmount));
          setLumpSumCapital(Math.round(severanceAmount));
        }
        const severanceTaxRate = Number(state?.severance?.tax_rate_percent ?? 0);
        if (active && Number.isFinite(severanceTaxRate) && severanceTaxRate > 0) {
          setLumpSumBaseTaxRate(severanceTaxRate);
        }
        const severanceMaturityMonth = Number(state?.severance?.start_calculation_month ?? 0);
        if (active && Number.isFinite(severanceMaturityMonth) && severanceMaturityMonth >= 1 && severanceMaturityMonth <= 12) {
          setLumpSumMaturityMonth(Math.round(severanceMaturityMonth));
        }
        const severanceMaturityYear = Number(state?.severance?.start_calculation_year ?? state?.severance?.payout_year ?? 0);
        if (active && Number.isFinite(severanceMaturityYear) && severanceMaturityYear >= 1900) {
          setLumpSumMaturityYear(Math.round(severanceMaturityYear));
        }
        const allocationPension = Number(state?.severance?.allocation_bvg_buyin ?? 0);
        const allocationMutual = Number(state?.severance?.allocation_pillar3a ?? 0);
        const allocationDirect = Number(state?.severance?.allocation_private_3b ?? 0);
        const severanceEstimatedReturn = Number(state?.severance?.estimated_return_percent ?? UBS_BVG_RETURN_DEFAULT_PERCENT);
        if (
          active
          && !analysisState
          && Number.isFinite(allocationPension)
          && Number.isFinite(allocationMutual)
          && Number.isFinite(allocationDirect)
        ) {
          dispatchScenario({
            type: "SET_ALL",
            payload: {
              pensionDeposit: Math.max(0, allocationPension),
              savingsAmount: Math.max(0, allocationMutual),
              payoutDirect: Math.max(0, allocationDirect),
              returnPensionFund: Number.isFinite(severanceEstimatedReturn)
                ? Math.max(1, Math.min(13, severanceEstimatedReturn))
                : UBS_BVG_RETURN_DEFAULT_PERCENT,
            },
          });
        }
        const taxDomicileFromPersonal = String(
          state?.personal?.property_details?.tax_domicile_canton || "",
        ).toUpperCase();
        const profileCanton = String(state?.property?.canton || "").toUpperCase();
        const preferredCanton = taxDomicileFromPersonal || profileCanton;
        if (active && preferredCanton && availableCantons.includes(preferredCanton)) {
          setSelectedCanton(preferredCanton);
        }
      } catch {
        // Optional hydrate; first load works without persisted scenario.
      } finally {
        if (active) {
          setAllocationAutoSaveEnabled(true);
        }
      }
    };
    void loadSavedScenario();
    return () => {
      active = false;
    };
  }, [availableCantons]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setCalcError("");
        const calc = (await api.calculatePension({
          retirement_age: retirementAge,
          max_age: targetAge,
          tax_rate_percent: effectiveTaxRate,
          inflation_rate_percent: inflation,
          bvg_mortgage_repayment_amount_per_year: bvgRepaymentPerYear,
        })) as Record<string, any>;

        if (!active) return;
        const projection = Array.isArray(calc.line_projection) ? calc.line_projection : [];
        setLineData(
          projection.map((row: Record<string, unknown>) => ({
            age: Number(row.age ?? 0),
            standard: Number(row.standard_bvg_net_real ?? 0),
            reduced: Number(row.reduced_bvg_net_real ?? 0),
          })),
        );
        setNetRatio(Number(calc?.bvg?.netto_rentenverhaeltnis ?? 0));
        setMonthlyRentLoss(Number(calc?.bvg?.rent_loss_monthly ?? 0));
        setValidationStatus(
          (calc?.validation_status as "passed" | "warning" | "error") || "passed",
        );
        setValidationIssues(
          Array.isArray(calc?.validation_issues) ? (calc.validation_issues as Array<Record<string, unknown>>) : [],
        );

        await api.saveBvgRepaymentScenario({
          scenario_name: "baseline",
          bvg_mortgage_repayment_amount_per_year: bvgRepaymentPerYear,
          bvg_mortgage_repayment_total_amount: null,
        });
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError) {
          setCalcError(error.message);
          if (error.validationStatus) {
            setValidationStatus(error.validationStatus);
          } else {
            setValidationStatus("error");
          }
          setValidationIssues(error.issues || []);
        } else {
          setCalcError(error instanceof Error ? error.message : t("analysisPage.calcLoadError"));
          setValidationStatus("error");
          setValidationIssues([]);
        }
        setLineData([]);
        setNetRatio(null);
        setMonthlyRentLoss(null);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [bvgRepaymentPerYear, effectiveTaxRate, inflation, retirementAge, targetAge]);

  // Vermögensübersicht: derselbe Bezugsplan einmal mit 100 % Kapital, einmal mit 100 % Rente
  const wealthVariants = useMemo(() => {
    if (!payoutPlan) return null;
    const ctx = {
      currentAge: currentAgeEstimate,
      retirementAge,
      targetAge,
      referenceAge: ahvReferenceAge,
      inflationPercent: inflation,
      canton: selectedCanton,
      ahvBaseAnnual: inputMonthlyAhv * 12,
      bvgBuyIn,
    };
    return {
      capital: simulatePayoutPlan(buildPayoutInput({ ...payoutPlan, bvgCapitalSharePercent: 100 }, ctx)),
      pension: simulatePayoutPlan(buildPayoutInput({ ...payoutPlan, bvgCapitalSharePercent: 0 }, ctx)),
    };
  }, [payoutPlan, currentAgeEstimate, retirementAge, targetAge, ahvReferenceAge, inflation, selectedCanton, inputMonthlyAhv, bvgBuyIn]);

  const wealthComparisonData = useMemo<WealthComparisonPoint[]>(() => {
    if (!payoutResult || !wealthVariants) return [];
    const real = (result: PayoutPlanResult, age: number) => {
      const row = result.years.find((y) => y.age === age);
      return row ? Math.round(row.wealthEnd / row.deflator) : undefined;
    };
    const startAge = payoutResult.years[0]?.age ?? retirementAge;
    return Array.from({ length: Math.max(0, 100 - startAge + 1) }, (_, i) => startAge + i).map((age) => ({
      age,
      planWealth: real(payoutResult, age),
      capitalWealth: real(wealthVariants.capital, age),
      pensionWealth: real(wealthVariants.pension, age),
      medianWealth: medianWealth(age, payoutMarried) ?? undefined,
    }));
  }, [payoutResult, wealthVariants, retirementAge, payoutMarried]);

  useEffect(() => {
    // Keep downstream wealth simulation aligned with direct payout allocation.
    if (scenarioState.payoutDirect > 0) {
      setLumpSumCapital(Math.round(scenarioState.payoutDirect));
    }
  }, [scenarioState.payoutDirect]);

  const applyScenario = (id: ScenarioId) => {
    const changed: string[] = [];
    setScenario(id);
    if (id === "early") {
      setRetirementAge(62);
      setTargetAge(95);
      changed.push("Rentenalter: 62", "Berechnung bis 95");
    } else if (id === "late") {
      setRetirementAge(70);
      setTargetAge(100);
      changed.push("Rentenalter: 70", "Berechnung bis 100");
    } else if (id === "inflation_shock") {
      setInflation(5.5);
      changed.push("Inflation: 5.5%");
    } else if (id === "divorce") {
      setRetirementAge(65);
      setDivorceAge((prev) => prev || 45);
      changed.push("Scheidungsszenario: BVG-Kapitalteilung 50%");
    } else {
      setRetirementAge(Number(retirementSliderConfig?.default ?? 64));
      setInflation(Number(inflationSliderConfig?.default ?? 2.5));
      changed.push("Basiswerte gesetzt");
    }
    setScenarioFeedback(changed.join(" | "));
    window.setTimeout(() => setScenarioFeedback(""), 2200);
  };
  const resetCapitalNeedToDefault = () => {
    setCapitalNeedPercent(Number(capitalNeedSliderConfig?.default ?? 75));
    setCapitalResetPulse(true);
    window.setTimeout(() => setCapitalResetPulse(false), 350);
  };
  const netAvailableLimitChf = useMemo(
    () => Math.max(0, lumpSumGrossAmount * (1 - (lumpSumBaseTaxRate || effectiveTaxRate) / 100)),
    [effectiveTaxRate, lumpSumBaseTaxRate, lumpSumGrossAmount],
  );
  const maturityLabel = lumpSumMaturityMonth && lumpSumMaturityYear
    ? `${String(lumpSumMaturityMonth).padStart(2, "0")}.${lumpSumMaturityYear}`
    : lumpSumMaturityYear
    ? String(lumpSumMaturityYear)
    : t("analysisConfig.maturityNotSet");
  const applyAllocationWithLimit = React.useCallback((
    next: Partial<ScenarioState>,
    mode: "pension" | "savings" | "payout",
  ) => {
    const merged: ScenarioState = {
      ...scenarioState,
      ...next,
    };
    const safeSavings = Math.max(0, Math.min(merged.savingsAmount, netAvailableLimitChf));
    const remainingForPensionAndPayout = Math.max(0, netAvailableLimitChf - safeSavings);

    if (mode === "savings") {
      const pension = Math.round((remainingForPensionAndPayout / 2) * 100) / 100;
      const payout = Math.round((remainingForPensionAndPayout - pension) * 100) / 100;
      dispatchScenario({
        type: "SET_ALL",
        payload: {
          ...merged,
          savingsAmount: safeSavings,
          pensionDeposit: pension,
          payoutDirect: payout,
        },
      });
      return;
    }

    if (mode === "pension") {
      const safePension = Math.max(0, Math.min(merged.pensionDeposit, remainingForPensionAndPayout));
      const payout = Math.max(0, remainingForPensionAndPayout - safePension);
      dispatchScenario({
        type: "SET_ALL",
        payload: {
          ...merged,
          savingsAmount: safeSavings,
          pensionDeposit: safePension,
          payoutDirect: payout,
        },
      });
      return;
    }

    const safePayout = Math.max(0, Math.min(merged.payoutDirect, remainingForPensionAndPayout));
    const pension = Math.max(0, remainingForPensionAndPayout - safePayout);
    dispatchScenario({
      type: "SET_ALL",
      payload: {
        ...merged,
        savingsAmount: safeSavings,
        pensionDeposit: pension,
        payoutDirect: safePayout,
      },
    });
  }, [netAvailableLimitChf, scenarioState]);
  const analysisPersistState = useMemo(
    () => ({
      scenario,
      retirementAge,
      targetAge,
      payoutPlan,
      taxRateAdjustment,
      selectedCanton,
      inflation,
      bvgRepaymentPerYear,
      divorceAge,
      currentAgeEstimate,
      initialPrivateCapital,
      lumpSumCapital,
      lumpSumGrossAmount,
      lumpSumMaturityMonth,
      lumpSumMaturityYear,
      lumpSumBaseTaxRate,
      investmentReturnPercent,
      showTaxBurden,
      showStressTestChart,
      capitalNeedPercent,
      showCompensationBars,
      scenarioState,
    }),
    [
      scenario,
      retirementAge,
      targetAge,
      payoutPlan,
      taxRateAdjustment,
      selectedCanton,
      inflation,
      bvgRepaymentPerYear,
      divorceAge,
      currentAgeEstimate,
      initialPrivateCapital,
      lumpSumCapital,
      lumpSumGrossAmount,
      lumpSumMaturityMonth,
      lumpSumMaturityYear,
      lumpSumBaseTaxRate,
      investmentReturnPercent,
      showTaxBurden,
      showStressTestChart,
      capitalNeedPercent,
      showCompensationBars,
      scenarioState,
    ],
  );

  useEffect(() => {
    // Initial default: place full net amount into payout.
    if (!allocationAutoSaveEnabled) return;
    if (scenarioState.pensionDeposit > 0 || scenarioState.savingsAmount > 0 || scenarioState.payoutDirect > 0) return;
    dispatchScenario({
      type: "SET_ALL",
      payload: {
        pensionDeposit: 0,
        savingsAmount: 0,
        payoutDirect: netAvailableLimitChf,
      },
    });
  }, [
    allocationAutoSaveEnabled,
    netAvailableLimitChf,
    scenarioState.payoutDirect,
    scenarioState.pensionDeposit,
    scenarioState.savingsAmount,
  ]);

  const scenarioButtons = (
    <>
          <div className="seg-row">
            {(["baseline", "early", "late", "inflation_shock", "divorce"] as ScenarioId[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`seg-btn${scenario === id ? " active" : ""}`}
                onClick={() => applyScenario(id)}
              >
                {t(`analysisPage.scenarios.${id}`)}
              </button>
            ))}
          </div>
    </>
  );

  const scenarioFeedbackBox = (
    <>
        {scenarioFeedback && (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200">
            {scenarioFeedback}
          </p>
        )}
    </>
  );

  const baseSliders = (
    <>
          <div className="space-y-3 rounded-lg border border-slate-700 bg-surface-2 p-box">
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <LabelTooltip
                  label={t("analysisConfig.leftColumn.retirementAge.label")}
                  tooltip={t("analysisConfig.leftColumn.retirementAge.tooltip")}
                />
                <span className="text-slate-100">{retirementAge} {t("analysisConfig.ageUnit")}</span>
              </div>
              <NotchedRange
                min={Number(retirementSliderConfig?.min ?? 56)}
                max={Number(retirementSliderConfig?.max ?? 70)}
                value={retirementAge}
                onChange={(e) => setRetirementAge(Number(e.target.value))}
                title={t("analysisConfig.leftColumn.retirementAge.tooltip")}
              />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <LabelTooltip
                  label={t("analysisConfig.leftColumn.currentAgeEstimate.label")}
                  tooltip={t("analysisConfig.leftColumn.currentAgeEstimate.tooltip")}
                />
                <span className="text-slate-100">{currentAgeEstimate} {t("analysisConfig.ageUnit")}</span>
              </div>
              <NotchedRange
                min={Number(currentAgeSliderConfig?.min ?? 25)}
                max={Number(currentAgeSliderConfig?.max ?? 69)}
                value={currentAgeEstimate}
                onChange={(event) => setCurrentAgeEstimate(Number(event.target.value))}
                title={t("analysisConfig.leftColumn.currentAgeEstimate.tooltip")}
              />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <LabelTooltip
                  label={t("analysisConfig.leftColumn.inflation.label")}
                  tooltip={t("analysisConfig.leftColumn.inflation.tooltip")}
                />
                <span className="text-slate-100">{inflation.toFixed(1)}%</span>
              </div>
              <NotchedRange
                min={Number(inflationSliderConfig?.min ?? 0)}
                max={Number(inflationSliderConfig?.max ?? 10)}
                step={Number(inflationSliderConfig?.step ?? 0.1)}
                value={inflation}
                onChange={(e) => setInflation(Number(e.target.value))}
                title={t("analysisConfig.leftColumn.inflation.tooltip")}
              />
            </div>
          </div>
    </>
  );

  const taxControls = (
    <>
          <div className="space-y-3 rounded-lg border border-slate-700 bg-surface-2 p-box text-xs text-slate-200">
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <LabelTooltip
                  label={t("analysisConfig.taxProgression.title")}
                  tooltip={t("analysisConfig.taxProgression.tooltip")}
                />
                <span className="text-slate-100">{effectiveTaxRate.toFixed(2)}%</span>
              </div>
              <NotchedRange
                min={0}
                max={50}
                step={0.1}
                value={Math.max(0, Math.min(50, effectiveTaxRate))}
                disabled
                title={t("analysisConfig.taxProgression.tooltip")}
              />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <LabelTooltip
                  label={t("analysisConfig.taxAdjustment.label")}
                  tooltip={t("analysisConfig.taxAdjustment.tooltip")}
                />
                <span className="text-slate-100">
                  {taxRateAdjustment >= 0 ? "+" : ""}
                  {taxRateAdjustment.toFixed(1)}%
                </span>
              </div>
              <NotchedRange
                min={Number(taxAdjustmentConfig?.min ?? -50)}
                max={Number(taxAdjustmentConfig?.max ?? 50)}
                step={Number(taxAdjustmentConfig?.step ?? 0.5)}
                value={taxRateAdjustment}
                onChange={(event) => setTaxRateAdjustment(Number(event.target.value))}
                title={t("analysisConfig.taxAdjustment.tooltip")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-200">
                <input
                  type="checkbox"
                  className="mr-1 align-middle accent-indigo-400"
                  checked={showStressTestChart}
                  onChange={(event) => setShowStressTestChart(event.target.checked)}
                  title={t("analysisConfig.stressTest.tooltip")}
                />
                <LabelTooltip
                  label={t("analysisConfig.stressTest.label")}
                  tooltip={t("analysisConfig.stressTest.tooltip")}
                />
              </label>
              <label className="text-xs text-slate-200">
                <input
                  type="checkbox"
                  className="mr-1 align-middle accent-rose-500"
                  checked={showTaxBurden}
                  onChange={(event) => setShowTaxBurden(event.target.checked)}
                  aria-label={t("analysisConfig.taxBurdenSegment.aria")}
                  title={t("analysisConfig.taxBurdenSegment.tooltip")}
                />
                <LabelTooltip
                  label={t("analysisConfig.taxBurdenSegment.label")}
                  tooltip={t("analysisConfig.taxBurdenSegment.tooltip")}
                />
              </label>
            </div>
          </div>
    </>
  );

  const taxSummaryBox = (
    <>
          <div className="rounded-lg border border-slate-700 bg-surface-2 p-box text-xs text-slate-200 shadow-sm">
            <p className="mb-2 text-xs font-semibold text-indigo-200">
              {t("analysisConfig.rightColumn.title")}
            </p>
            <div className="space-y-2">
              <div>
                <LabelTooltip
                  label={t("analysisConfig.rightColumn.taxRate.label")}
                  tooltip={t("analysisConfig.rightColumn.taxRate.tooltip")}
                />
                : <span className="font-semibold">{effectiveTaxRate.toFixed(2)}%</span>
              </div>
              <div>
                <LabelTooltip
                  label={t("analysisConfig.rightColumn.cantonModel.label")}
                  tooltip={cantonProgressionTooltip}
                />
                : <span className="font-semibold">{cantonDisplayName}</span>
              </div>
              <div>
                <LabelTooltip
                  label={t("analysisConfig.rightColumn.modelIncome.label")}
                  tooltip={t("analysisConfig.rightColumn.modelIncome.tooltip")}
                />
                : <span className="font-semibold">CHF {annualIncomeEstimate.toLocaleString("de-CH")}</span>
              </div>
              <div className="rounded-md border border-slate-700 px-2 py-1 text-2xs text-slate-200">
                {taxInterimSummary}
              </div>
            </div>
          </div>
    </>
  );

  const taxModelStatus = (
    <>
        {taxModelLoading && <p className="text-2xs text-slate-400">{t("analysisConfig.taxModelLoading")}</p>}
        {taxModelError ? <p className="text-2xs text-amber-300">{t("analysisConfig.taxModelErrorPrefix", { error: taxModelError })}</p> : null}
    </>
  );

  const divorceInput = (
    <>
        {scenario === "divorce" && (
          <div className="max-w-sm">
            <label className="mb-1 block text-xs text-slate-300">{t("analysisPage.divorceAge")}</label>
            <input
              type="number"
              min={18}
              max={75}
              className="input-field"
              value={divorceAge}
              onChange={(event) => setDivorceAge(Number(event.target.value))}
            />
            <p className="mt-1 text-2xs text-slate-400">
              Modellannahme: BVG-Kapital wird ab Alter {divorceAge} hälftig geteilt (vereinfachtes CH-Modell).
            </p>
          </div>
        )}
    </>
  );

  const validationMessages = (
    <>
        {validationStatus === "warning" && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Validierung mit Warnungen abgeschlossen.
            {validationIssues.length > 0 && (
              <span className="ml-1">
                {t("analysisPage.firstSignal", { message: String(validationIssues[0]?.message || validationIssues[0]?.code || t("analysisPage.checkInputs")) })}
              </span>
            )}
          </div>
        )}
        {validationStatus === "error" && !calcError && (
          <div className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            Validierung fehlgeschlagen. Bitte Eingabedaten prüfen.
          </div>
        )}
        {calcError && <p className="text-xs text-rose-400">{calcError}</p>}
    </>
  );

  const allocationInputs = (
    <>
      <AnalysisInputs
        netAvailableLimitChf={netAvailableLimitChf}
        pensionDeposit={scenarioState.pensionDeposit}
        savingsAmount={scenarioState.savingsAmount}
        payoutDirect={scenarioState.payoutDirect}
        returnPensionFund={scenarioState.returnPensionFund}
        returnSavingsPortf={scenarioState.returnSavingsPortf}
        maturityLabel={maturityLabel}
        maturityMonth={lumpSumMaturityMonth}
        maturityYear={lumpSumMaturityYear}
        onMaturityChange={(month, year) => {
          setLumpSumMaturityMonth(month);
          setLumpSumMaturityYear(year);
        }}
        pensionProjectedCapitalChf={projectedAdditionalBvgCapital}
        pensionProjectedGainChf={projectedAdditionalBvgGain}
        pensionProjectionYears={buyInYears}
        capitalWithdrawalLocked={buyInBlocksCapital(bvgBuyIn, retirementAge) && (payoutPlan?.bvgCapitalSharePercent ?? 0) > 0}
        onPensionDepositChange={(value) => applyAllocationWithLimit({ pensionDeposit: Math.max(0, value) }, "pension")}
        onSavingsAmountChange={(value) => applyAllocationWithLimit({ savingsAmount: Math.max(0, value) }, "savings")}
        onPayoutDirectChange={(value) => applyAllocationWithLimit({ payoutDirect: Math.max(0, value) }, "payout")}
        onReturnPensionFundChange={(value) =>
          dispatchScenario({ type: "SET_RETURN_PENSION_FUND", payload: Math.max(1, Math.min(13, value)) })}
        onReturnSavingsPortfChange={(value) =>
          dispatchScenario({ type: "SET_RETURN_SAVINGS_PORTF", payload: Math.max(3, Math.min(10, value)) })}
      />
    </>
  );

  const autoSave = (
    <>
      <AutoSaveManager
        state={analysisPersistState}
        enabled={allocationAutoSaveEnabled}
        debounceMs={500}
        onStatusChange={setAllocationAutoSaveStatus}
        onSave={async (persistState) => {
          await api.saveScenarioAnalysisUpdate({
            amount: lumpSumGrossAmount,
            tax_rate_percent: lumpSumBaseTaxRate || effectiveTaxRate,
            start_calculation_month: lumpSumMaturityMonth,
            start_calculation_year: lumpSumMaturityYear,
            allocation_bvg_buyin: persistState.scenarioState.pensionDeposit,
            allocation_pillar3a: persistState.scenarioState.savingsAmount,
            allocation_private_3b: persistState.scenarioState.payoutDirect,
            estimated_return_percent: persistState.scenarioState.returnPensionFund,
            plan_duration_years: 12,
          });
          await api.saveBvgRepaymentScenario({
            scenario_name: "baseline",
            bvg_mortgage_repayment_amount_per_year: persistState.bvgRepaymentPerYear,
            bvg_mortgage_repayment_total_amount: null,
            analysis_state: persistState,
          });
        }}
      />
    </>
  );

  const capitalNeedControls = (
    <>
          <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
            <p className="mb-2 text-xs font-semibold text-slate-200">{t("analysisPage.capitalNeed")}</p>
            <div className="mb-1 flex justify-between text-xs text-slate-300">
              <LabelTooltip
                label={t("analysisConfig.compensation.capitalNeedSlider.label")}
                tooltip={t("analysisConfig.compensation.capitalNeedBaseTooltip")}
              />
              <span className="text-slate-100">{capitalNeedPercent.toFixed(0)}%</span>
            </div>
            <NotchedRange
              min={Number(capitalNeedSliderConfig?.min ?? 50)}
              max={Number(capitalNeedSliderConfig?.max ?? 120)}
              step={Number(capitalNeedSliderConfig?.step ?? 1)}
              value={capitalNeedPercent}
              onChange={(event) => setCapitalNeedPercent(Number(event.target.value))}
              title={t("analysisConfig.compensation.capitalNeedTooltip")}
            />
            <p className="mt-1 text-xs text-lime-300">{formatChf(kapitalbedarfChf)}</p>
            <p className="text-2xs text-slate-400">
              {t("analysisConfig.compensation.lastIncome", { amount: formatChf(capitalBaseIncome) })}
            </p>
            <button
              type="button"
              className={`mt-2 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-2xs text-slate-200 hover:bg-slate-700 ${capitalResetPulse ? "animate-pulse" : ""}`}
              onClick={resetCapitalNeedToDefault}
            >
              ↺ {t("analysisConfig.compensation.resetLabel")}
            </button>
            <label className="mt-2 block text-2xs text-slate-300">
              <input
                type="checkbox"
                className="mr-1 align-middle accent-blue-500"
                checked={showCompensationBars}
                onChange={(event) => setShowCompensationBars(event.target.checked)}
                title={t("analysisConfig.compensation.showChartTooltip")}
              />
              {t("analysisConfig.compensation.showChartToggleLabel")}
            </label>
          </div>
    </>
  );

  const pensionCompositionBox = (
    <>
          <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
            <p className="mb-2 text-xs font-semibold text-slate-200">{t("analysisPage.pensionComposition")}</p>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLORS.ahv }} aria-hidden />
                  {t("pillars.ahv")}
                </span>
                <span className="tabular-nums text-slate-100">+ {formatChf(pensionBreakdownAnnual.basisRente)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLORS.bvg }} aria-hidden />
                  {t("pillars.bvg")}
                </span>
                <span className="tabular-nums text-slate-100">+ {formatChf(pensionBreakdownAnnual.rentenanteil)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLORS.pillar3a }} aria-hidden />
                  {t("pillars.pillar3a")}
                </span>
                <span className="tabular-nums text-slate-100">+ {formatChf(pensionBreakdownAnnual.zusatzleistungen)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLORS.life }} aria-hidden />
                  {t("pillars.life")}
                </span>
                <span className="tabular-nums text-slate-100">+ {formatChf(pensionBreakdownAnnual.lebensversicherung)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLORS.privat }} aria-hidden />
                  {t("pillars.privat")}
                </span>
                <span className="tabular-nums text-slate-100">+ {formatChf(pensionBreakdownAnnual.privatvermoegen)}</span>
              </div>
            </div>
            <div className="mt-2 border-t border-slate-700 pt-2 text-xs font-semibold text-slate-100">
              {t("analysisPage.sum", { amount: formatChf(pensionBruttoAnnual) })}
            </div>
          </div>
    </>
  );

  const shortfallBox = (
    <>
          <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
            <p className="mb-2 text-xs font-semibold text-slate-200">{t("analysisPage.shortfallAnalysis")}</p>
            <div className="mb-2 rounded border border-rose-500/40 bg-rose-900/20 px-2 py-1 text-xs text-rose-200">
              {t("analysisPage.taxBurden")}: {formatChf(steuerbelastungAnnual)}
              <span className="ml-2 text-rose-300/90">({effectiveTaxRate.toFixed(2)}%)</span>
            </div>
            <div className="rounded border border-slate-700 bg-surface-2 p-box-sm">
              <table className="w-full text-2xs text-slate-300">
                <tbody>
                  <tr className="border-b border-slate-800">
                    <td className="py-1">Pension Brutto</td>
                    <td className="py-1 text-right text-emerald-300">+ {formatChf(pensionBruttoAnnual)}</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-1">{t("analysisPage.taxBurden")}</td>
                    <td className="py-1 text-right text-rose-300">{formatChf(steuerbelastungAnnual)}</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-1">{t("analysisPage.capitalNeed")}</td>
                    <td className="py-1 text-right" style={{ color: "var(--green)" }}>- {formatChf(kapitalbedarfChf)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-semibold text-slate-100">{t("analysisPage.totalShortfall")}</td>
                    <td className={`py-1 text-right font-semibold ${fehlbetragGesamt >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {fehlbetragGesamt >= 0 ? "+" : "-"} {formatChf(Math.abs(fehlbetragGesamt))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
    </>
  );

  const compensationChart = (
    <>
        {showCompensationBars && (
          <div className="mt-3 rounded border border-slate-700 bg-surface-2 p-box-sm">
            {/* feste Höhe nur für das Diagramm — die Legende darunter darf umbrechen, ohne in die nächste Karte zu ragen */}
            <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={compensationChartData}
                margin={{ top: 8, right: 12, left: 12, bottom: 10 }}
                barCategoryGap={22}
                onMouseMove={(state) => {
                  if (!state || typeof state.activeTooltipIndex !== "number") return;
                  setHoveredComparisonBarIndex(state.activeTooltipIndex);
                }}
                onMouseLeave={() => setHoveredComparisonBarIndex(null)}
              >
                <XAxis dataKey="group" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  content={<ComparisonTooltip />}
                  cursor={{ fill: "transparent" }}
                  contentStyle={{ backgroundColor: chartThemeColors.surface2, border: `1px solid ${chartThemeColors.border}`, borderRadius: 8, fontSize: "var(--fs-xs)", color: chartThemeColors.fg1 }}
                />
                <ReferenceLine y={pensionBruttoAnnual} stroke="#94a3b8" strokeDasharray="4 3" />
                <ReferenceLine y={capitalNeedWithTax} stroke={chartThemeColors.red} strokeDasharray="4 3" />
                <Customized
                  component={() => {
                    if (hoveredComparisonBarIndex === null) return null;
                    const bounds = comparisonBarBoundsRef.current[hoveredComparisonBarIndex];
                    if (!bounds) return null;
                    const height = Math.max(1, bounds.bottom - bounds.top);
                    return (
                      <g pointerEvents="none">
                        <rect
                          x={bounds.x}
                          y={bounds.top}
                          width={bounds.width}
                          height={height}
                          fill="none"
                          stroke="rgba(255,255,255,0.58)"
                          strokeWidth={5}
                          rx={4}
                          ry={4}
                        />
                        <rect
                          x={bounds.x}
                          y={bounds.top}
                          width={bounds.width}
                          height={height}
                          fill="none"
                          stroke="rgba(255,255,255,0.95)"
                          strokeWidth={1}
                          rx={4}
                          ry={4}
                        />
                      </g>
                    );
                  }}
                />
                <Bar dataKey="ahv" stackId="pension" fill={COLORS.ahv} shape={renderComparisonBarSegment} />
                <Bar dataKey="bvg" stackId="pension" fill={COLORS.bvg} shape={renderComparisonBarSegment} />
                <Bar dataKey="pillar3a" stackId="pension" fill={COLORS.pillar3a} shape={renderComparisonBarSegment} />
                <Bar dataKey="life" stackId="pension" fill={COLORS.life} shape={renderComparisonBarSegment} />
                <Bar dataKey="privat" stackId="pension" fill={COLORS.privat} shape={renderComparisonBarSegment} />
                <Bar dataKey="gapBase" stackId="gap" fill="transparent" />
                <Bar dataKey="gap" stackId="gap" fill={chartThemeColors.yellow} shape={renderComparisonBarSegment} />
                <Bar dataKey="capitalBase" stackId="bedarf" fill={COLORS.bvg} shape={renderComparisonBarSegment} />
                <Bar dataKey="taxLoad" stackId="bedarf" fill={COLORS.tax} shape={renderComparisonBarSegment} />
              </BarChart>
            </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-700 pt-2 text-2xs text-slate-300">
              {COMPARISON_LEGEND_ITEMS.map((item) => (
                <span key={item.key} className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{t(item.nameKey)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
    </>
  );

  const incomeChart = (
    <>
      <ChartErrorBoundary title="Einkommensdiagramm konnte nicht geladen werden">
      <div className="rounded-xl border border-slate-700 bg-surface p-section">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="card-title text-sm font-semibold text-slate-200">{t("analysisPage.incomeDistribution")}</h2>
          {/* Gleiches Muster wie die Kennzahlen der Bezugsplanung (.kpi-card) */}
          <div className="kpi-card kpi-card--standalone">
            <span className="kpi-card__label">{t("analysisPage.totalAmount")}</span>
            <span className="kpi-card__value">CHF {referenceAge.totalNet.toLocaleString("de-CH")}/Monat</span>
            <span className="kpi-card__hint">
              Brutto CHF {referenceAge.totalGross.toLocaleString("de-CH")} · Tax Model {cantonDisplayName}: {effectiveTaxRate.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="mb-2 flex flex-wrap gap-2 text-2xs">
          {ahvReductionStartYear !== null ? (
            <>
              <span className="rounded border border-amber-500/40 bg-amber-900/20 px-2 py-1 text-amber-100">
                {t("analysisPage.ahvReductionActive", { year: ahvReductionStartYear, age: ahvReductionStartAge })}
              </span>
              <span className="rounded border border-slate-700 bg-surface-2 px-2 py-1 text-slate-200">
                {t("analysisPage.ahvReductionStable", { year: ahvReductionStableYear, percent: referenceAge.ahvReductionPercent.toFixed(1) })}
              </span>
            </>
          ) : (
            <span className="rounded border border-emerald-500/40 bg-emerald-900/20 px-2 py-1 text-emerald-100">
              {t("analysisPage.noAhvReduction")}
            </span>
          )}
        </div>
        <div
          className="relative h-72"
          role="img"
          aria-label={t("analysisPage.chartAria")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barsByAge}
              margin={{ top: 8, right: 16, left: 8, bottom: 24 }}
              barSize={16}
              onMouseMove={(state) => {
                if (!state || typeof state.activeTooltipIndex !== "number") return;
                setHoveredBarIndex(state.activeTooltipIndex);
              }}
              onMouseLeave={() => {
                setHoveredBarIndex(null);
              }}
            >
              <XAxis dataKey="age" tick={{ fontSize: 10 }} tickFormatter={(v) => `Alter ${v}`} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}`} />
              <Tooltip content={<IncomeDistributionTooltip />} shared={false} cursor={{ fill: "transparent" }} />
              {ahvReductionStartAge !== null && (
                <ReferenceLine
                  x={ahvReductionStartAge}
                  stroke="#f59e0b"
                  strokeDasharray="4 3"
                  label={{
                    value: t("analysisPage.ahvReductionStarts"),
                    fill: chartThemeColors.yellow,
                    fontSize: 10,
                    position: "insideTopLeft",
                  }}
                />
              )}
              <Customized
                component={() => {
                  if (hoveredBarIndex === null) return null;
                  const bounds = barBoundsRef.current[hoveredBarIndex];
                  if (!bounds) return null;
                  const height = Math.max(1, bounds.bottom - bounds.top);
                  return (
                    <g pointerEvents="none">
                      <rect
                        x={bounds.x}
                        y={bounds.top}
                        width={bounds.width}
                        height={height}
                        fill="none"
                        stroke="rgba(255,255,255,0.58)"
                        strokeWidth={4}
                        rx={4}
                        ry={4}
                      />
                      <rect
                        x={bounds.x}
                        y={bounds.top}
                        width={bounds.width}
                        height={height}
                        fill="none"
                        stroke="rgba(255,255,255,0.95)"
                        strokeWidth={1}
                        rx={4}
                        ry={4}
                      />
                    </g>
                  );
                }}
              />
              <Bar
                dataKey="ahv"
                name={t("pillars.ahv")}
                stackId="pension"
                fill={COLORS.ahv}
                shape={renderIncomeBarSegment}
              />
              <Bar
                dataKey="bvg"
                name={t("pillars.bvg")}
                stackId="pension"
                fill={COLORS.bvg}
                shape={renderIncomeBarSegment}
              />
              <Bar
                dataKey="pillar3a"
                name={t("pillars.pillar3a")}
                stackId="pension"
                fill={COLORS.pillar3a}
                shape={renderIncomeBarSegment}
              />
              <Bar
                dataKey="life"
                name={t("pillars.life")}
                stackId="pension"
                fill={COLORS.life}
                shape={renderIncomeBarSegment}
              />
              <Bar
                dataKey="privat"
                name={t("pillars.privat")}
                stackId="pension"
                fill={COLORS.privat}
                radius={[4, 4, 0, 0]}
                shape={renderIncomeBarSegment}
              />
              {showTaxBurden && (
                <Bar
                  dataKey="tax"
                  name={t("pillars.tax")}
                  stackId="pension"
                  fill={COLORS.tax}
                  shape={renderIncomeBarSegment}
                />
              )}
              <Line
                type="monotone"
                dataKey="totalNet"
                name={t("analysisPage.netIncomeName")}
                stroke={chartThemeColors.fg1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
              {/* after the bars so it is drawn on top of them; named in the legend below */}
              <ReferenceLine y={retireeMedianOwn} stroke={chartThemeColors.yellow} strokeWidth={2} strokeDasharray="6 4" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="income-legend mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-700 pt-3 text-xs">
          {INCOME_LEGEND_ITEMS.filter((item) => showTaxBurden || item.dataKey !== "tax").map((legendItem) => (
            <span key={legendItem.dataKey} className="income-legend-item">
              <span className="income-legend-swatch" style={{ backgroundColor: legendItem.color }} />
              <span className="income-legend-label">{t(legendItem.nameKey)}</span>
            </span>
          ))}
          <span className="income-legend-item">
            <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: chartThemeColors.yellow }} />
            <span className="income-legend-label">
              {t("payoutPlan.medianIncomeLine")} (CHF {Math.round(retireeMedianOwn).toLocaleString("de-CH")})
            </span>
          </span>
        </div>
        <p className="mt-2 flex items-center gap-2 text-2xs text-amber-300">
          <WarningTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{t("analysisPage.disclaimer")}</span>
        </p>
      </div>
      </ChartErrorBoundary>
    </>
  );

  const mortgageControls = (
    <>
      <section className="rounded-xl border border-slate-700 bg-surface p-section">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-200">{t("analysisPage.bvgWithdrawal")}</h2>
          <span className="inline-flex items-center gap-1 text-xs text-slate-300">
            <HomeUser className="h-3.5 w-3.5 text-emerald-300" />
            CHF {bvgRepaymentPerYear.toLocaleString("de-CH")} pro Jahr
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className="mb-1 block text-xs text-slate-300">
              Geplante BVG-Entnahme zur Eigenheimkreditablösung
            </label>
            <NotchedRange
              min={0}
              max={50000}
              step={500}
              value={bvgRepaymentPerYear}
              onChange={(e) => setBvgRepaymentPerYear(Number(e.target.value))}
            />
          </div>
          <div>
            <input
              type="number"
              min={0}
              step={getDynamicAmountStep(bvgRepaymentPerYear)}
              value={bvgRepaymentPerYear}
              onChange={(e) => setBvgRepaymentPerYear(Math.max(0, Number(e.target.value) || 0))}
              className="input-field input-field--amount w-full md:w-40"
              aria-label="BVG-Entnahmebetrag pro Jahr in CHF"
            />
          </div>
        </div>
        <p className="mt-2 text-2xs text-slate-400">
          Diese Entnahme wirkt direkt auf die nachgelagerte BVG-Rentenkurve. Die Box ist bewusst unter dem
          Einkommensdiagramm positioniert, damit Wirkung und Eingabe räumlich zusammengehören.
        </p>
      </section>
    </>
  );

  const stressChart = (
    <>
      {showStressTestChart && (
        <div className="rounded-xl border border-slate-700 bg-surface p-section">
          <h2 className="card-title mb-2 text-sm font-semibold text-slate-200">
            BVG-Rente über die Zeit (mit vs. ohne Tilgung)
          </h2>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
            {netRatio !== null && (
              <span>
                Netto-Rentenverhältnis: <span className="font-semibold text-slate-100">{(netRatio * 100).toFixed(1)}%</span>
              </span>
            )}
            {monthlyRentLoss !== null && (
              <span>
                Monatliche Einbusse: <span className="font-semibold text-rose-300">CHF {monthlyRentLoss.toLocaleString("de-CH")}</span>
              </span>
            )}
          </div>
          {/* feste Höhe nur für das Diagramm, Titel und Kennzahlen stehen darüber */}
          <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <XAxis dataKey="age" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: chartThemeColors.surface2, border: `1px solid ${chartThemeColors.border}`, borderRadius: 8, fontSize: "var(--fs-xs)", color: chartThemeColors.fg1 }}
                formatter={(value: unknown, name: unknown) => [`CHF ${value}`, String(name)]}
                labelFormatter={(label: number) => `Alter ${label}`}
              />
              <Line
                type="monotone"
                dataKey="standard"
                name="Standard BVG-Rente"
                stroke={chartThemeColors.green}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="reduced"
                name="BVG-Rente mit Tilgung"
                stroke={chartThemeColors.red}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );

  const wealthOverview = (
    <>
      <section className="rounded-xl border border-slate-700 bg-surface p-section">
        <h2 className="card-title mb-1 text-sm font-semibold text-slate-200">{t("payoutPlan.wealthOverviewTitle")}</h2>
        <p className="mb-2 text-xs text-slate-400">{t("payoutPlan.wealthOverviewHint")}</p>
        {payoutResult && wealthVariants ? (
          <>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              {([
                ["series_capitalOnly", wealthVariants.capital, chartThemeColors.green],
                ["series_pensionOnly", wealthVariants.pension, "#3b82f6"],
                ["series_planWealth", payoutResult, chartThemeColors.yellow],
              ] as const).map(([key, result, color]) => (
                <div key={key} className="rounded-md border border-slate-700 px-2 py-1">
                  <span className="inline-flex items-center gap-2 text-slate-200">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
                    {t(`payoutPlan.${key}`)}
                  </span>
                  <div className="text-slate-100">
                    {t("payoutPlan.wealthOverviewMonthly", {
                      amount: Math.round(monthlyFromAhvStart(result)).toLocaleString("de-CH"),
                      tax: Math.round(result.totalCapitalTax).toLocaleString("de-CH"),
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={wealthComparisonData}>
                  <XAxis dataKey="age" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartThemeColors.surface2,
                      border: `1px solid ${chartThemeColors.border}`,
                      borderRadius: 8,
                      fontSize: "var(--fs-xs)",
                      color: chartThemeColors.fg1,
                    }}
                    formatter={(value: unknown, name: unknown) => [`CHF ${Number(value || 0).toLocaleString("de-CH")}`, String(name)]}
                    labelFormatter={(label: number) => `${t("payoutPlan.age")} ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: "var(--fs-xs)" }} />
                  <Line type="monotone" dataKey="capitalWealth" name={t("payoutPlan.series_capitalOnly")} stroke={chartThemeColors.green} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  <Line type="monotone" dataKey="pensionWealth" name={t("payoutPlan.series_pensionOnly")} stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="planWealth" name={t("payoutPlan.series_planWealth")} stroke={chartThemeColors.yellow} strokeWidth={2.5} dot={false} />
                  <Line type="stepAfter" dataKey="medianWealth" name={t("payoutPlan.series_medianWealth")} stroke={chartThemeColors.yellow} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400">{t("payoutPlan.wealthOverviewEmpty")}</p>
        )}
      </section>
    </>
  );

  const renderPayout = (part: PayoutPart) => (
      <PayoutPlanningSection
        settings={payoutPlan}
        onChange={setPayoutPlan}
        currentAge={currentAgeEstimate}
        retirementAge={retirementAge}
        targetAge={targetAge}
        referenceAge={ahvReferenceAge}
        inflationPercent={inflation}
        canton={selectedCanton}
        ahvBaseAnnual={inputMonthlyAhv * 12}
        bvgBuyIn={bvgBuyIn}
        incomeTaxRatePercent={effectiveTaxRate}
        defaultConversionRatePercent={BVG_CONVERSION_RATE_PERCENT}
        defaultReturnPercent={investmentReturnPercent}
        part={part}
        onRetirementAgeChange={setRetirementAge}
      />
  );
  const classicView = (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-light text-slate-50">{t("analysisPage.title")}</h1>
        <p className="text-sm text-slate-400">{t("analysisPage.subtitle")}</p>
      </header>

      <section className="space-y-4 rounded-xl border border-slate-700 bg-surface p-section text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-semibold text-slate-300">
            {t("analysisPage.configureScenario")}
          </h2>
      {scenarioButtons}
        </div>
      {scenarioFeedbackBox}

        <div className={`grid gap-3 ${topSectionColumnsClass}`}>
      {baseSliders}

      {taxControls}

      {taxSummaryBox}
        </div>
      {taxModelStatus}
      {divorceInput}

      {validationMessages}
      </section>

      {allocationInputs}
      {autoSave}

      <section className="rounded-xl border border-slate-700 bg-surface p-section">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">
          {t("analysisConfig.compensation.title")}
        </h2>
        <div className="grid gap-3 lg:grid-cols-3">
      {capitalNeedControls}

      {pensionCompositionBox}

      {shortfallBox}
        </div>
      {compensationChart}
      </section>

      {incomeChart}

      {mortgageControls}

      {renderPayout("all")}

      {stressChart}

      {wealthOverview}
    </div>
  );

  if (layout === "classic") return classicView;

  // ── Cockpit: Ergebnisse im Inhalt, alle Eingaben in einer einblendbaren Sidebar mit Rubriken ──
  const cockpitTabs: { id: CockpitTab; label: string; body: React.ReactNode }[] = [
    { id: "scenario", label: t("cockpit.tabScenario"), body: (
      <div className="space-y-4">
        {scenarioButtons}
        {scenarioFeedbackBox}
        {baseSliders}
        {renderPayout("schedule")}
        {taxControls}
        {divorceInput}
      </div>
    ) },
    { id: "severance", label: t("cockpit.tabSeverance"), body: allocationInputs },
    { id: "pillars", label: t("cockpit.tabPillars"), body: renderPayout("pillars") },
    { id: "investment", label: t("cockpit.tabInvestment"), body: renderPayout("investment") },
    { id: "needs", label: t("cockpit.tabNeeds"), body: (
      <div className="space-y-4">
        {capitalNeedControls}
        {mortgageControls}
      </div>
    ) },
  ];
  const activeTab = cockpitTabs.find((tab) => tab.id === cockpitTab) ?? cockpitTabs[0];

  // Inhalt als Karten: einzeln ein-/ausklappbar und sortierbar (Reihenfolge = Standard)
  const cockpitCards: CockpitCard[] = [
    { id: "kpis", title: t("cockpit.card_kpis"), content: renderPayout("kpis") },
    { id: "sources", title: t("cockpit.card_sources"), content: renderPayout("sources") },
    { id: "chartIncome", title: t("payoutPlan.chartIncome"), content: renderPayout("chartIncome") },
    { id: "chartWealth", title: t("payoutPlan.chartWealth"), content: renderPayout("chartWealth") },
    { id: "median", title: t("cockpit.card_median"), content: renderPayout("median") },
    { id: "variants", title: t("cockpit.card_variants"), content: renderPayout("variants") },
    { id: "taxes", title: t("payoutPlan.taxTable"), content: renderPayout("taxes") },
    { id: "incomeDistribution", title: t("cockpit.card_incomeDistribution"), content: incomeChart },
    { id: "balance", title: t("analysisConfig.compensation.title"), content: (
      <>
        <div className="grid gap-3 lg:grid-cols-3">
          {taxSummaryBox}
          {pensionCompositionBox}
          {shortfallBox}
        </div>
        {compensationChart}
      </>
    ) },
    ...(showStressTestChart ? [{ id: "stress", title: t("cockpit.card_stress"), content: stressChart }] : []),
    { id: "wealthOverview", title: t("payoutPlan.wealthOverviewTitle"), content: wealthOverview },
  ];

  return (
    <div className={`cockpit${cockpitOpen ? " cockpit--open" : ""}`}>
      <div className="cockpit-content flex min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-light text-slate-50">{t("cockpit.title")}</h1>
            <p className="text-sm text-slate-400">{t("cockpit.subtitle")}</p>
          </div>
          <button type="button" className="seg-btn active inline-flex items-center gap-2" onClick={() => setCockpitOpen(!cockpitOpen)}
            aria-expanded={cockpitOpen} aria-controls="cockpit-panel">
            {cockpitOpen ? <SidebarCollapse className="h-3.5 w-3.5" /> : <SidebarExpand className="h-3.5 w-3.5" />}
            {cockpitOpen ? t("cockpit.hideSettings") : t("cockpit.showSettings")}
          </button>
        </header>

        {/* Aktive Annahmen auf einen Blick; Klick öffnet die passende Rubrik */}
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            [t(`analysisPage.scenarios.${scenario}`), "scenario"],
            [`${t("cockpit.chipRetirement")} ${retirementAge}`, "scenario"],
            [`${t("cockpit.chipInflation")} ${inflation.toFixed(1)} %`, "scenario"],
            [`${t("cockpit.chipTax")} ${effectiveTaxRate.toFixed(2)} % (${selectedCanton || "–"})`, "scenario"],
            [`${t("cockpit.chipCapitalShare")} ${payoutPlan?.bvgCapitalSharePercent ?? 0} %`, "pillars"],
            [`${t("cockpit.chipBuyIn")} CHF ${Math.round(scenarioState.pensionDeposit).toLocaleString("de-CH")}`, "severance"],
          ].map(([label, tab]) => (
            <button key={label} type="button" className="rounded-full border border-slate-600 bg-slate-800/70 px-2 py-1 text-slate-200 hover:border-sky-500"
              onClick={() => { setCockpitTab(tab as CockpitTab); setCockpitOpen(true); }}>
              {label}
            </button>
          ))}
        </div>

        {taxModelStatus}
        {validationMessages}

        {renderPayout("warnings")}
        <CockpitBoard cards={cockpitCards} />
        <p className="text-2xs leading-snug text-slate-500">{t("payoutPlan.disclaimer")}</p>
      </div>

      {cockpitOpen && <button type="button" className="cockpit-backdrop" aria-label={t("cockpit.hideSettings")} onClick={() => setCockpitOpen(false)} />}
      {cockpitOpen && (
        <aside id="cockpit-panel" className="cockpit-panel" aria-label={t("cockpit.settings")}>
          <div className="cockpit-panel-head">
            <span className="text-sm font-semibold text-slate-100">{t("cockpit.settings")}</span>
            <button type="button" className="text-slate-400 hover:text-slate-100" aria-label={t("cockpit.hideSettings")} onClick={() => setCockpitOpen(false)}>
              <Xmark className="h-4 w-4" />
            </button>
          </div>
          <div className="cockpit-tabs" role="tablist">
            {cockpitTabs.map((tab) => (
              <button key={tab.id} type="button" role="tab" aria-selected={tab.id === activeTab.id}
                className={`cockpit-tab${tab.id === activeTab.id ? " active" : ""}`} onClick={() => setCockpitTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="cockpit-panel-body text-sm" role="tabpanel">{activeTab.body}</div>
        </aside>
      )}
      {autoSave}
    </div>
  );

};