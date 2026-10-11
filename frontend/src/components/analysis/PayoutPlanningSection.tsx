import React, { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Area, Bar, BarChart, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../services/api";
import {
  bvgBuyInAtRetirement,
  buyInBlocksCapital,
  type BvgBuyIn,
  CAPITAL_TAX_CANTONS,
  CAPITAL_TAX_YEAR,
  capitalTaxMunicipality,
  capitalWithdrawalTax,
  pillar3aPayoutRange,
  simulatePayoutPlan,
  monteCarlo,
  portfolioStats,
  safeMonthlyDraw,
  BUCKET_PROFILES,
  type BucketProfileId,
  type InvestmentBucket,
  type LifePayoutMode,
  type PayoutPlanInput,
  type Pillar3aAccount,
  type Relationship,
  ahvFactor,
  ahvStartAgeFor,
  bvgConversionFactor,
} from "../../services/payoutPlanning";
import { MEDIAN_SOURCES, medianWealth, retireeIncomeMonthly } from "../../services/swissMedians";
import { CHART_CATEGORICAL, useChartThemeColors } from "../../constants/chartColors";
import { ChartErrorBoundary } from "../common/ChartErrorBoundary";
import { WarningTriangle } from "iconoir-react";

/** Einstellungen der Bezugsplanung — werden mit dem Analyse-Zustand gespeichert */
export type PayoutPlanSettings = {
  bvgCapitalAtRetirement: number;
  bvgConversionRatePercent: number;
  bvgCapitalSharePercent: number;
  pillar3a: Pillar3aAccount[];
  life: { enabled: boolean; maturityAge: number; capital: number; annualPension: number; mode: LifePayoutMode };
  relationship: Relationship;
  startWealth: number;
  /** Alt (vor den Anlagetöpfen): eine einzige Rendite; wird beim Laden in einen Topf übernommen */
  investmentReturnPercent: number;
  buckets?: InvestmentBucket[];
  /** Altersgutschriften + Zins pro Jahr: wie viel Guthaben bei früherer Pensionierung fehlt (bzw. später dazukommt) */
  bvgAnnualCredit?: number;
  /** Einkommen der Partnerin / des Partners im Alter, netto pro Monat — für den Haushaltsvergleich mit dem Median */
  partnerMonthlyIncome?: number;
  /** Profilwerte (Karten PK, 3a, Lebensversicherung), die zuletzt übernommen wurden — erkennt Änderungen in den Karten */
  profileSync?: ProfileSnapshot;
};

type ProfileSnapshot = { bvg: number; pillar3a: number[]; lifeCapital: number; lifePension: number; lifeMaturityAge: number };

const newBucket = (profile: BucketProfileId, sharePercent: number): InvestmentBucket => ({
  id: `${profile}-${Math.random().toString(36).slice(2, 8)}`,
  profile,
  sharePercent,
  ...BUCKET_PROFILES[profile],
});

/** Anlagetöpfe der Einstellungen; ältere Einstellungen mit nur einer Rendite werden zu einem eigenen Topf */
export const bucketsOf = (settings: PayoutPlanSettings): InvestmentBucket[] =>
  settings.buckets?.length
    ? settings.buckets
    : [{ ...newBucket("custom", 100), returnPercent: settings.investmentReturnPercent, terPercent: 0 }];

type PlanContext = {
  currentAge: number;
  retirementAge: number; // Pensionierungsalter der Analyse — darauf beziehen sich Guthaben und Umwandlungssatz
  targetAge: number;
  referenceAge: number;
  inflationPercent: number;
  canton: string;
  ahvBaseAnnual: number; // volle AHV-Rente im Referenzalter, heutige Franken
  bvgBuyIn?: BvgBuyIn; // Einkauf aus der Abfindung (Analyse → Verwendung der Abfindung)
};

/**
 * Eingaben der Simulation aus Einstellungen + Analyse — auch von der Analyse selbst genutzt.
 * `retireAt` rechnet eine andere Pensionierung durch (Vergleich Früh-/Normalpensionierung):
 * AHV frühestens 2 Jahre vor dem Referenzalter mit Kürzung/Zuschlag, PK-Guthaben um die
 * fehlenden/zusätzlichen Altersgutschriften verschoben, Umwandlungssatz entsprechend angepasst.
 */
export function buildPayoutInput(settings: PayoutPlanSettings, ctx: PlanContext, retireAt = ctx.retirementAge): PayoutPlanInput {
  const ahvStartAge = ahvStartAgeFor(retireAt, ctx.referenceAge);
  const yearsShift = retireAt - ctx.retirementAge;
  return {
    currentAge: ctx.currentAge,
    currentYear: new Date().getFullYear(),
    retirementAge: retireAt,
    targetAge: Math.max(retireAt + 1, ctx.targetAge),
    referenceAge: ctx.referenceAge,
    canton: CAPITAL_TAX_CANTONS.includes(ctx.canton) ? ctx.canton : "ZH",
    relationship: settings.relationship,
    inflationPercent: ctx.inflationPercent,
    ahvAnnual: ctx.ahvBaseAnnual * ahvFactor(ahvStartAge, ctx.referenceAge),
    ahvStartAge,
    bvg: {
      capitalAtRetirement: Math.max(0, settings.bvgCapitalAtRetirement + yearsShift * (settings.bvgAnnualCredit ?? 0))
        + bvgBuyInAtRetirement(ctx.bvgBuyIn, retireAt),
      conversionRatePercent: settings.bvgConversionRatePercent
        * (bvgConversionFactor(retireAt, ctx.referenceAge) / bvgConversionFactor(ctx.retirementAge, ctx.referenceAge)),
      capitalSharePercent: settings.bvgCapitalSharePercent,
    },
    // Andere Pensionierung: 3a-Bezüge um gleich viele Jahre verschieben (Staffelung bleibt erhalten)
    pillar3a: yearsShift === 0 ? settings.pillar3a : settings.pillar3a.map((a) => {
      const range = pillar3aPayoutRange(ctx.referenceAge);
      return { ...a, payoutAge: Math.min(range.max, Math.max(range.min, a.payoutAge + yearsShift)) };
    }),
    life: settings.life.enabled ? settings.life : undefined,
    startWealth: settings.startWealth,
    investmentReturnPercent: portfolioStats(bucketsOf(settings)).netReturnPercent,
  };
}

export const RESULT_PARTS = ["kpis", "sources", "variants", "median", "chartIncome", "chartWealth", "taxes", "warnings"] as const;
export type PayoutPart = "all" | "pillars" | "investment" | "schedule" | "results" | (typeof RESULT_PARTS)[number];

type Props = {
  settings: PayoutPlanSettings | null;
  onChange: (next: PayoutPlanSettings) => void;
  currentAge: number;
  retirementAge: number;
  targetAge: number;
  referenceAge: number;
  inflationPercent: number;
  canton: string;
  ahvBaseAnnual: number; // volle AHV-Rente im Referenzalter, heutige Franken
  bvgBuyIn?: BvgBuyIn;
  incomeTaxRatePercent: number; // geschätzte Einkommenssteuer auf Renten (aus der Analyse)
  defaultConversionRatePercent: number;
  defaultReturnPercent: number;
  /** Cockpit-Ansicht: nur Eingaben (PK/3a/3b bzw. Anlage) für die Sidebar oder nur Ergebnisse für den Inhalt */
  part?: PayoutPart;
  /** Bezugsjahr der 2. Säule = Pensionierung; der Zeitplan («schedule») stellt sie über die Analyse um */
  onRetirementAgeChange?: (age: number) => void;
};

/** Pensionierungsalter für den Monatsvergleich */
const COMPARE_AGES = [60, 61, 62, 63, 64, 65, 66];

const COLORS = { ahv: CHART_CATEGORICAL[0], bvg: CHART_CATEGORICAL[1], life: CHART_CATEGORICAL[3], draw: CHART_CATEGORICAL[4] };
const SHARES = [0, 25, 50, 75, 100];
const chf = (v: number) => `CHF ${Math.round(v).toLocaleString("de-CH")}`;

type KpiStatus = "good" | "warn" | "bad" | "info";
/** Kleines Statussymbol der Kennzahlen: Haken (gut), Dreieck (knapp/kritisch), i (Info) */
const KpiStatusIcon = ({ status }: { status: KpiStatus }) =>
  status === "good" ? (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden><path d="M2.5 6.2 5 8.5l4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : status === "info" ? (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden><circle cx="6" cy="6" r="4.4" stroke="currentColor" strokeWidth="1.4" /><path d="M6 5.4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="6" cy="3.7" r=".75" fill="currentColor" /></svg>
  ) : (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden><path d="M6 1.8 10.6 10H1.4L6 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6 5v2.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="6" cy="8.6" r=".7" fill="currentColor" /></svg>
  );
const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

const inputClass = "input-field input-field--amount w-full !px-2";
const labelClass = "mb-1 block text-xs text-slate-300";

/** Erste Einstellungen aus dem Profil (Vorsorgeausweis, 3a-Konten, Lebensversicherung) */
type ProfileValues = { settings: PayoutPlanSettings; lifeCurrency: string };

async function settingsFromProfile(fallbackAge: number, referenceAge: number, conversion: number, ret: number): Promise<ProfileValues> {
  const state = (await api.fetchProfileState()) as Record<string, any>;
  // Alter aus dem Geburtsdatum des Profils: das Alter der Analyse kann beim ersten Laden noch der Vorgabewert sein
  const dob = state?.personal?.date_of_birth ? new Date(state.personal.date_of_birth) : null;
  const currentAge = dob && !Number.isNaN(dob.getTime())
    ? new Date().getFullYear() - dob.getFullYear() - (new Date() < new Date(new Date().getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)
    : fallbackAge;
  const bvgCapital = num(state?.pension_fund?.current_oldage_capital);
  const accounts = Array.isArray(state?.third_pillar?.accounts_json) ? state.third_pillar.accounts_json : [];
  const range = pillar3aPayoutRange(referenceAge);
  const pillar3a: Pillar3aAccount[] = accounts
    .filter((a: Record<string, unknown>) => num(a.balance_chf) > 0)
    .map((a: Record<string, unknown>, i: number) => ({
      label: `3a ${String.fromCharCode(65 + i)}`,
      balance: num(a.balance_chf),
      returnPercent: num(a.expected_return_percent, 2),
      payoutAge: Math.min(range.max, Math.max(range.min, currentAge + num(a.years_to_payout, referenceAge - currentAge))),
    }));
  if (!pillar3a.length && num(state?.third_pillar?.capital_3a) > 0) {
    pillar3a.push({ label: "3a A", balance: num(state.third_pillar.capital_3a), returnPercent: 2, payoutAge: referenceAge });
  }
  const li = state?.life_insurance ?? {};
  const maturityYear = num(li.maturity_year) || (li.maturity_date ? new Date(li.maturity_date).getFullYear() : 0);
  const maturityAge = maturityYear ? currentAge + (maturityYear - new Date().getFullYear()) : referenceAge;
  const lifeCapital = num(li.capital_payout_at_maturity);
  const lifePension = num(li.monthly_pension_at_retirement) * 12;
  // Altersgutschrift nach BVG-Minimum 55–65: 18 % des versicherten Lohns (Pensionskassen oft mehr — änderbar)
  const insuredSalary = num(state?.pension_fund?.bvg_insured_salary) || num(state?.pension_fund?.insured_salary_total);
  const settings: PayoutPlanSettings = {
    bvgAnnualCredit: Math.round(insuredSalary * 0.18),
    partnerMonthlyIncome: 0,
    bvgCapitalAtRetirement: Math.round(bvgCapital),
    bvgConversionRatePercent: conversion,
    bvgCapitalSharePercent: 0,
    pillar3a,
    life: { enabled: lifeCapital > 0 || lifePension > 0, maturityAge, capital: Math.round(lifeCapital), annualPension: Math.round(lifePension), mode: "capital" },
    relationship: String(state?.personal?.marital_status || "").toLowerCase() === "married" ? "married" : "single",
    startWealth: 0,
    investmentReturnPercent: ret,
  };
  return { settings, lifeCurrency: String(li.currency || "CHF").toUpperCase() };
}

/** Profilwerte, die in der gespeicherten Planung veraltet sein können (Planung merkt sich ihre Werte) */
function profileDiffers(plan: PayoutPlanSettings, profile: PayoutPlanSettings): boolean {
  if (plan.bvgCapitalAtRetirement !== profile.bvgCapitalAtRetirement) return true;
  if (plan.pillar3a.map((a) => a.balance).join() !== profile.pillar3a.map((a) => a.balance).join()) return true;
  return plan.life.capital !== profile.life.capital || plan.life.annualPension !== profile.life.annualPension
    || plan.life.maturityAge !== profile.life.maturityAge;
}

const snapshotOf = (p: PayoutPlanSettings): ProfileSnapshot => ({
  bvg: p.bvgCapitalAtRetirement,
  pillar3a: p.pillar3a.map((a) => a.balance),
  lifeCapital: p.life.capital,
  lifePension: p.life.annualPension,
  lifeMaturityAge: p.life.maturityAge,
});

type SyncChange = { key: "bvg" | "pillar3a" | "lifeCapital" | "lifePension" | "lifeMaturityAge"; from: string; to: string };

/**
 * Was sich in den Karten seit der letzten Übernahme geändert hat, fliesst automatisch in die Planung.
 * Werte, die nur in der Planung angepasst wurden (Karte unverändert), bleiben. Ohne Merker (alte Planungen)
 * gilt jede Abweichung als Änderung in der Karte.
 */
export function syncFromProfile(plan: PayoutPlanSettings, profile: PayoutPlanSettings): { next: PayoutPlanSettings; changes: SyncChange[] } | null {
  const now = snapshotOf(profile);
  const before = plan.profileSync;
  if (before && JSON.stringify(before) === JSON.stringify(now)) return null;
  const cardChanged = <K extends keyof ProfileSnapshot>(k: K) => !before || JSON.stringify(before[k]) !== JSON.stringify(now[k]);
  const planValue = snapshotOf(plan);
  const changes: SyncChange[] = [];
  const next: PayoutPlanSettings = { ...plan, life: { ...plan.life }, profileSync: now };
  const money = (v: number) => `CHF ${Math.round(v).toLocaleString("de-CH")}`;
  if (cardChanged("bvg") && planValue.bvg !== now.bvg) {
    changes.push({ key: "bvg", from: money(planValue.bvg), to: money(now.bvg) });
    next.bvgCapitalAtRetirement = now.bvg;
  }
  if (cardChanged("pillar3a") && planValue.pillar3a.join() !== now.pillar3a.join()) {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    changes.push({ key: "pillar3a", from: money(sum(planValue.pillar3a)), to: money(sum(now.pillar3a)) });
    next.pillar3a = applyProfile(plan, profile).pillar3a;
  }
  if (cardChanged("lifeCapital") && planValue.lifeCapital !== now.lifeCapital) {
    changes.push({ key: "lifeCapital", from: money(planValue.lifeCapital), to: money(now.lifeCapital) });
    next.life.capital = now.lifeCapital;
    next.life.enabled = profile.life.enabled;
  }
  if (cardChanged("lifePension") && planValue.lifePension !== now.lifePension) {
    changes.push({ key: "lifePension", from: money(planValue.lifePension), to: money(now.lifePension) });
    next.life.annualPension = now.lifePension;
    next.life.enabled = profile.life.enabled;
  }
  if (cardChanged("lifeMaturityAge") && planValue.lifeMaturityAge !== now.lifeMaturityAge) {
    changes.push({ key: "lifeMaturityAge", from: String(planValue.lifeMaturityAge), to: String(now.lifeMaturityAge) });
    next.life.maturityAge = now.lifeMaturityAge;
  }
  return { next, changes };
}

/** Profilwerte übernehmen, eigene Entscheide (Kapitalanteil, Bezugsjahre, Renditen, Töpfe, 3b-Modus) behalten */
function applyProfile(plan: PayoutPlanSettings, profile: PayoutPlanSettings): PayoutPlanSettings {
  return {
    ...plan,
    bvgCapitalAtRetirement: profile.bvgCapitalAtRetirement,
    pillar3a: profile.pillar3a.map((a, i) => ({
      ...a,
      payoutAge: plan.pillar3a[i]?.payoutAge ?? a.payoutAge,
      returnPercent: plan.pillar3a[i]?.returnPercent ?? a.returnPercent,
    })),
    life: { ...plan.life, enabled: profile.life.enabled, capital: profile.life.capital, annualPension: profile.life.annualPension, maturityAge: profile.life.maturityAge },
  };
}

export const PayoutPlanningSection: React.FC<Props> = ({
  settings, onChange, currentAge, retirementAge, targetAge, referenceAge, inflationPercent, canton,
  ahvBaseAnnual, bvgBuyIn, incomeTaxRatePercent, defaultConversionRatePercent, defaultReturnPercent, part = "all",
  onRetirementAgeChange,
}) => {
  // "results" = alle Ergebnis-Teile; im Cockpit kann jeder Teil einzeln als Karte erscheinen
  const show = (p: Exclude<PayoutPart, "all" | "results" | "schedule">) =>
    part === "all" || part === p || (part === "results" && (RESULT_PARTS as readonly string[]).includes(p));
  const separateCharts = part === "chartIncome" || part === "chartWealth";
  const needsRisk = ["all", "results", "kpis", "chartWealth"].includes(part); // Monte Carlo
  const needsComparison = ["all", "results", "median"].includes(part); // Früh-/Normalpensionierung
  const compact = part !== "all"; // schmale Sidebar: Spalten untereinander
  const { t } = useTranslation();
  const theme = useChartThemeColors();

  // Profil einmal pro Anzeige lesen: erste Füllung und Vergleich mit der gespeicherten Planung
  const [fromProfile, setFromProfile] = React.useState<ProfileValues | null>(null);
  useEffect(() => {
    settingsFromProfile(currentAge, referenceAge, defaultConversionRatePercent, defaultReturnPercent)
      .then(setFromProfile)
      .catch(() => undefined);
  }, [currentAge, referenceAge, defaultConversionRatePercent, defaultReturnPercent]);
  // Änderungen in den Karten automatisch übernehmen. Nur eine Instanz pro Ansicht gleicht ab (Cockpit zeigt
  // mehrere Teile): "all" in der klassischen Ansicht, "warnings" im Cockpit — dort steht auch der Hinweis.
  const syncOwner = part === "all" || part === "warnings";
  const [openKpi, setOpenKpi] = React.useState<string | null>(null); // Statuserklärung per Klick (Touch)
  const [lastSync, setLastSync] = React.useState<{ previous: PayoutPlanSettings; changes: SyncChange[] } | null>(null);
  useEffect(() => {
    if (!fromProfile) return;
    if (!settings) {
      if (syncOwner || part === "pillars") onChange({ ...fromProfile.settings, profileSync: snapshotOf(fromProfile.settings) });
      return;
    }
    if (!syncOwner) return;
    const sync = syncFromProfile(settings, fromProfile.settings);
    if (!sync) return;
    if (sync.changes.length) setLastSync({ previous: settings, changes: sync.changes });
    onChange(sync.next);
  }, [settings, fromProfile, onChange, syncOwner, part]);

  const taxCanton = CAPITAL_TAX_CANTONS.includes(canton) ? canton : "ZH";
  const range = pillar3aPayoutRange(referenceAge);

  const baseInput = useMemo<PayoutPlanInput | null>(
    () => (settings
      ? buildPayoutInput(settings, { currentAge, retirementAge, targetAge, referenceAge, inflationPercent, canton, ahvBaseAnnual, bvgBuyIn })
      : null),
    [settings, currentAge, retirementAge, targetAge, referenceAge, inflationPercent, canton, ahvBaseAnnual, bvgBuyIn],
  );
  const buckets = settings ? bucketsOf(settings) : [];
  const portfolio = portfolioStats(buckets);

  const result = useMemo(() => (baseInput ? simulatePayoutPlan(baseInput) : null), [baseInput]);
  // Schwankungen: Band des Vermögens und Entnahme, die mit 90 % bis zum Zielalter reicht
  const risk = useMemo(() => {
    if (!needsRisk || !baseInput || !result || result.annualDrawReal <= 0) return null;
    return {
      mc: monteCarlo(baseInput, result, portfolio.volatilityPercent),
      safeDraw: safeMonthlyDraw(baseInput, result, portfolio.volatilityPercent, 0.9),
    };
  }, [baseInput, result, portfolio.volatilityPercent, needsRisk]);

  // Vergleich mit dem Median der Pensionierten (verfügbares Einkommen: nach Steuern; Kapitalverzehr zählt dort nicht)
  const married = settings?.relationship === "married";
  const partnerIncome = married ? settings?.partnerMonthlyIncome ?? 0 : 0;
  const medianHousehold = retireeIncomeMonthly(married);
  const taxKeep = 1 - Math.min(60, Math.max(0, incomeTaxRatePercent)) / 100;
  /** Netto pro Monat in heutigen Franken: Renten nach geschätzter Einkommenssteuer, Entnahme aus Kapital unversteuert */
  const netOf = (row: { ahv: number; bvgPension: number; lifePension: number; capitalDraw: number; deflator: number }, draw = row.capitalDraw) => ({
    pensions: ((row.ahv + row.bvgPension + row.lifePension) * taxKeep) / row.deflator / 12,
    draw: draw / row.deflator / 12,
  });

  // Früh- und Normalpensionierung im Vergleich, je mit sicherer Entnahme (90 %)
  const comparison = useMemo(() => {
    if (!settings || !needsComparison) return [];
    const ctx = { currentAge, retirementAge, targetAge, referenceAge, inflationPercent, canton, ahvBaseAnnual, bvgBuyIn };
    return [...new Set([...COMPARE_AGES, retirementAge])].sort((a, b) => a - b).map((age) => {
      const input = buildPayoutInput(settings, ctx, age);
      const plan = simulatePayoutPlan(input);
      const safe = plan.annualDrawReal > 0 ? safeMonthlyDraw(input, plan, portfolio.volatilityPercent, 0.9, 300) : 0;
      const ahvStart = input.ahvStartAge ?? age;
      const atAhv = plan.years.find((y) => y.age === ahvStart) ?? plan.years[0];
      const bridge = age < ahvStart ? netOf(plan.years[0]) : null;
      const n = netOf(atAhv);
      const safeNet = n.pensions + safe;
      return {
        age,
        ahvStart,
        bridgeMonthly: bridge ? bridge.pensions + bridge.draw : null,
        planNet: n.pensions + n.draw,
        safeNet,
        pensionsOnly: n.pensions,
        vsMedian: (safeNet + partnerIncome) / medianHousehold - 1,
        vsMedianNoDraw: (n.pensions + partnerIncome) / medianHousehold - 1,
        tax: plan.totalCapitalTax,
      };
    });
  }, [settings, currentAge, retirementAge, targetAge, referenceAge, inflationPercent, canton, ahvBaseAnnual, bvgBuyIn,
    portfolio.volatilityPercent, partnerIncome, medianHousehold, taxKeep, needsComparison]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vergleich: BVG-Kapitalanteil 0/50/100 % und 3a alles im Pensionsjahr statt gestaffelt
  const variants = useMemo(() => {
    if (!baseInput) return [];
    const run = (label: string, patch: Partial<PayoutPlanInput>) => {
      const r = simulatePayoutPlan({ ...baseInput, ...patch });
      return { label, monthly: r.monthlyAtRetirementReal, tax: r.totalCapitalTax, pension: r.bvgAnnualPension };
    };
    return [0, 50, 100].map((share) =>
      run(t("payoutPlan.variantBvg", { share }), { bvg: { ...baseInput.bvg, capitalSharePercent: share } }),
    );
  }, [baseInput, t]);

  const staggeringSaving = useMemo(() => {
    if (!baseInput || baseInput.pillar3a.length < 2) return null;
    const allAtRetirement = simulatePayoutPlan({
      ...baseInput,
      pillar3a: baseInput.pillar3a.map((a) => ({ ...a, payoutAge: Math.min(range.max, Math.max(range.min, retirementAge)) })),
    });
    return allAtRetirement.totalCapitalTax - (result?.totalCapitalTax ?? 0);
  }, [baseInput, result, range.max, range.min, retirementAge]);

  const buyInLock = Boolean(settings && settings.bvgCapitalSharePercent > 0 && buyInBlocksCapital(bvgBuyIn, retirementAge));
  if (!settings || !result) {
    return (
      <section className="rounded-xl border border-slate-700 bg-surface p-section text-sm text-slate-400">
        {t("payoutPlan.loading")}
      </section>
    );
  }

  const set = (patch: Partial<PayoutPlanSettings>) => onChange({ ...settings, ...patch });
  // Angelegtes Kapital (heutige Franken, jede Leistung im eigenen Auszahlungsjahr) — Summe der Herkunftstabelle
  const capitalReal = result.inflows.reduce((sum, f) => sum + f.netReal, 0);
  const sourceName = (source: string, label: string) =>
    source === "pillar3a" ? t("payoutPlan.src_pillar3a", { label }) : t(`payoutPlan.src_${source}`);
  const setAccount = (index: number, patch: Partial<Pillar3aAccount>) =>
    set({ pillar3a: settings.pillar3a.map((a, i) => (i === index ? { ...a, ...patch } : a)) });

  const medianOwnShare = Math.max(0, Math.round(medianHousehold - partnerIncome));
  const chartRows = result.years.map((y) => ({
    age: y.age,
    // Renten nach geschätzter Einkommenssteuer — vergleichbar mit dem verfügbaren Einkommen des Medians
    ahv: Math.round((y.ahv * taxKeep) / y.deflator / 12),
    bvg: Math.round((y.bvgPension * taxKeep) / y.deflator / 12),
    life: Math.round((y.lifePension * taxKeep) / y.deflator / 12),
    draw: Math.round(y.capitalDraw / y.deflator / 12),
    medianWealth: medianWealth(y.age, married) ?? undefined,
    wealth: Math.round(y.wealthEnd / y.deflator),
    ...(risk ? (() => {
      const i = risk.mc.ages.indexOf(y.age);
      return { p10: Math.round(risk.mc.p10[i]), band: Math.round(risk.mc.p90[i] - risk.mc.p10[i]), p50: Math.round(risk.mc.p50[i]) };
    })() : {}),
  }));
  const taxRows = [...new Map(
    [...settings.pillar3a.map((a) => Math.min(range.max, Math.max(range.min, a.payoutAge))), ...(result.bvgCapital > 0 ? [retirementAge] : [])]
      .map((age) => [age, age]),
  ).keys()].sort((a, b) => a - b).map((age) => {
    const grossAtAge = (settings.bvgCapitalSharePercent > 0 && age === retirementAge ? result.bvgCapital : 0)
      + settings.pillar3a
        .filter((a) => Math.min(range.max, Math.max(range.min, a.payoutAge)) === age)
        .reduce((sum, a) => sum + a.balance * Math.pow(1 + a.returnPercent / 100, Math.max(0, age - currentAge)), 0);
    return { age, gross: grossAtAge, tax: capitalWithdrawalTax(grossAtAge, taxCanton, settings.relationship) };
  });

  const segBtn = (active: boolean) => `seg-btn${active ? " active" : ""}`;
  const tooltipStyle = { background: theme.surface2, border: `1px solid ${theme.border}`, fontSize: "var(--fs-xs)", color: theme.fg1 };

  return (
    <section className={part === "all" ? "space-y-4 rounded-xl border border-slate-700 bg-surface p-section text-sm" : "space-y-4 text-sm"}>
      {(part === "all" || part === "results") && (
      <div>
        <h2 className="text-sm font-semibold text-slate-200">{t("payoutPlan.title")}</h2>
        <p className="mt-1 text-xs text-slate-400">{t("payoutPlan.intro")}</p>
      </div>
      )}

      {part === "schedule" && (() => {
        // Auszahlungs-Zeitplan: wann welcher Topf bezogen wird (Kapital) bzw. die Rente beginnt — gleiche Einstellungen
        // wie im Reiter «Vorsorge» (3a/3b) und das Rentenalter des Szenarios (2. Säule)
        const yearOf = (age: number) => new Date().getFullYear() + (age - currentAge);
        const ageYear = (age: number) => t("payoutPlan.sched_ageYear", { age, year: yearOf(age) });
        type Mark = { age: number; amount: number; tax: number; kind: "capital" | "pension"; withPension?: number };
        const capitalAt = (source: string, label = "") => result.inflows
          .filter((f) => f.source === source && (source !== "pillar3a" || f.label === label))
          .map((f): Mark => ({ age: f.age, amount: f.gross, tax: f.tax, kind: "capital" }));
        const rows: { key: string; name: string; color: string; marks: Mark[] }[] = [];
        const k = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
        // Teilbezug: Kapital und Rente beginnen im selben Jahr → ein Punkt mit Zusatz «+ Rente»
        const bvgCapital = capitalAt("bvg");
        const bvgPension = result.bvgAnnualPension;
        rows.push({ key: "bvg", name: t("payoutPlan.sched_bvgShort"), color: COLORS.bvg, marks: bvgCapital.length
          ? bvgCapital.map((m) => ({ ...m, withPension: bvgPension > 0 ? bvgPension : undefined }))
          : bvgPension > 0 ? [{ age: retirementAge, amount: bvgPension, tax: 0, kind: "pension" }] : [] });
        settings.pillar3a.forEach((a) => rows.push({ key: `3a-${a.label}`, name: a.label, color: CHART_CATEGORICAL[2], marks: capitalAt("pillar3a", a.label) }));
        if (settings.life.enabled) rows.push({ key: "life", name: t("payoutPlan.sched_lifeShort"), color: COLORS.life, marks:
          settings.life.mode === "capital" ? capitalAt("life")
            : [{ age: settings.life.maturityAge, amount: settings.life.annualPension, tax: 0, kind: "pension" }] });
        const ages = rows.flatMap((r) => r.marks.map((m) => m.age));
        if (!ages.length) return <p className="text-xs text-slate-400">{t("payoutPlan.sched_empty")}</p>;
        const from = Math.min(...ages) - 1, to = Math.max(...ages) + 1;
        const span = Array.from({ length: to - from + 1 }, (_, i) => from + i);
        // Kapitalbezüge im selben Jahr werden zusammen (progressiv) besteuert
        const taxByAge = new Map<number, { tax: number; count: number }>();
        for (const r of rows) for (const m of r.marks) if (m.kind === "capital") {
          const e = taxByAge.get(m.age) ?? { tax: 0, count: 0 }; taxByAge.set(m.age, { tax: e.tax + m.tax, count: e.count + 1 });
        }
        const clashAges = new Set([...taxByAge.entries()].filter(([, v]) => v.count > 1).map(([age]) => age));
        const marksAt = (r: (typeof rows)[number], age: number) => r.marks.filter((m) => m.age === age);
        const summary = (r: (typeof rows)[number]) => r.marks.map((m) => (m.kind === "capital"
          ? `${k(m.amount)}${m.withPension ? ` + ${t("payoutPlan.sched_pensionShort")}` : ""}`
          : t("payoutPlan.sched_pensionShort"))).join(" · ");
        const markTitle = (m: Mark) => `${ageYear(m.age)} · ${m.kind === "capital" ? t("payoutPlan.sched_capital", { amount: chf(m.amount) }) : t("payoutPlan.sched_pensionPa", { amount: chf(m.amount) })}${m.withPension ? ` · ${t("payoutPlan.sched_pensionPa", { amount: chf(m.withPension) })}` : ""}`;
        // Umrandung je Bezugsjahr in der Farbe des Topfs; mehrere Kapitalbezüge im selben Jahr → Alarmfarbe
        const outlines = span.filter((age) => rows.some((r) => marksAt(r, age).length)).map((age) => ({
          age, clash: clashAges.has(age), color: rows.find((r) => marksAt(r, age).length)!.color,
        }));
        const ageSelect = (value: number, min: number, max: number, onPick: (age: number) => void, label: string) => (
          <select className="input-field w-full" value={value} aria-label={label} onChange={(e) => onPick(Number(e.target.value))}>
            {[...new Set([...Array.from({ length: max - min + 1 }, (_, i) => min + i), value])].sort((x, y) => x - y).map((age) => (
              <option key={age} value={age}>{ageYear(age)}</option>
            ))}
          </select>
        );
        return (
          <div className="space-y-3 rounded-lg border border-slate-700 bg-surface-2 p-box">
            <div>
              <h3 className="font-semibold text-slate-200">{t("payoutPlan.sched_title")}</h3>
              <p className="mt-1 text-2xs leading-snug text-slate-400">{t("payoutPlan.sched_hint")}</p>
            </div>
            {/* Raster: Spalte je Alter, Zeile je Topf; Punkt = Kapitalbezug, Ring = Rentenbeginn, Umrandung = Bezugsjahr */}
            <div className="payout-grid" role="img" aria-label={t("payoutPlan.sched_title")}
              style={{ gridTemplateColumns: `4rem repeat(${span.length}, minmax(0, 1fr))` }}>
              <span className="payout-grid__label">{t("payoutPlan.sched_age")}</span>
              {span.map((age) => <span key={age} className="payout-grid__cell">{age}</span>)}
              {rows.map((r) => (
                <React.Fragment key={r.key}>
                  <span className="payout-grid__label payout-grid__pot">{r.name}<small>{summary(r) || "–"}</small></span>
                  {span.map((age) => (
                    <span key={age} className="payout-grid__cell payout-grid__marks" style={{ ["--c" as string]: r.color }}>
                      {marksAt(r, age).map((m) => (
                        <React.Fragment key={m.kind}>
                          <i className={`payout-grid__dot is-${m.kind}`} title={markTitle(m)} />
                          {m.withPension ? <i className="payout-grid__dot is-pension" title={markTitle(m)} /> : null}
                        </React.Fragment>
                      ))}
                    </span>
                  ))}
                </React.Fragment>
              ))}
              <span className="payout-grid__label">{t("payoutPlan.sched_tax")}</span>
              {span.map((age) => {
                const v = taxByAge.get(age);
                return <span key={age} className={`payout-grid__cell payout-grid__tax${clashAges.has(age) ? " is-clash" : ""}`}>{v ? k(v.tax) : ""}</span>;
              })}
              <span className="payout-grid__label payout-grid__last">{t("payoutPlan.sched_yearRow")}</span>
              {span.map((age) => (
                <span key={age} className={`payout-grid__cell payout-grid__last${age === retirementAge ? " is-retire" : ""}`}>{String(yearOf(age)).slice(2)}</span>
              ))}
              {/* Umrandungen in eigener Ebene mit demselben Spaltenraster (stört die Zellen-Platzierung nicht) */}
              <div className="payout-grid__overlay" aria-hidden style={{ gridTemplateColumns: `4rem repeat(${span.length}, minmax(0, 1fr))` }}>
                {outlines.map((o) => (
                  <span key={o.age} className={`payout-grid__outline${o.clash ? " is-clash" : ""}`}
                    style={{ gridColumn: o.age - from + 2, ["--c" as string]: o.color }} />
                ))}
              </div>
            </div>
            {clashAges.size > 0 && (
              <p className="flex gap-2 rounded-md border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200" role="alert">
                <WarningTriangle className="h-4 w-4 shrink-0" aria-hidden />
                <span>{t("payoutPlan.sched_clash", { years: [...clashAges].sort((x, y) => x - y).map(yearOf).join(", ") })}</span>
              </p>
            )}
            <p className="text-2xs text-slate-400">{t("payoutPlan.sched_legend")}</p>
            {/* Bezugsjahre einstellen */}
            <div className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-3 gap-y-2">
              <span className="text-xs text-slate-300">{t("payoutPlan.sched_bvg")}
                <small className="block text-slate-400">{t("payoutPlan.sched_bvgNote", { share: settings.bvgCapitalSharePercent })}</small>
              </span>
              {onRetirementAgeChange
                ? ageSelect(retirementAge, 58, 70, onRetirementAgeChange, t("payoutPlan.sched_bvg"))
                : <span className="text-xs text-slate-200">{ageYear(retirementAge)}</span>}
              {settings.pillar3a.map((a, i) => (
                <React.Fragment key={a.label}>
                  <span className="text-xs text-slate-300">{t("payoutPlan.src_pillar3a", { label: a.label })}
                    <small className="block text-slate-400">{chf(a.balance)} {t("payoutPlan.sched_today")}</small>
                  </span>
                  {ageSelect(Math.min(range.max, Math.max(range.min, a.payoutAge)), range.min, range.max, (age) => setAccount(i, { payoutAge: age }), t("payoutPlan.src_pillar3a", { label: a.label }))}
                </React.Fragment>
              ))}
              {settings.life.enabled && (<>
                <span className="text-xs text-slate-300">{t("payoutPlan.sched_life")}
                  <small className="block text-slate-400">{t(`payoutPlan.lifeMode_${settings.life.mode}`)}</small>
                </span>
                {ageSelect(settings.life.maturityAge, 50, 90, (age) => set({ life: { ...settings.life, maturityAge: age } }), t("payoutPlan.sched_life"))}
              </>)}
            </div>
          </div>
        );
      })()}

      {show("pillars") && (<>
      {fromProfile && profileDiffers(settings, fromProfile.settings) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-700 bg-surface-2 px-3 py-2 text-xs text-slate-200">
          <span>
            {t("payoutPlan.profileChanged", {
              bvg: chf(fromProfile.settings.bvgCapitalAtRetirement),
              life: chf(fromProfile.settings.life.capital),
              lifePension: chf(fromProfile.settings.life.annualPension),
            })}
          </span>
          <button type="button" className="seg-btn active" onClick={() => onChange(applyProfile(settings, fromProfile.settings))}>
            {t("payoutPlan.applyProfile")}
          </button>
        </div>
      )}
      {fromProfile && fromProfile.lifeCurrency !== "CHF" && settings.life.enabled && (
        <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
          <WarningTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>{t("payoutPlan.lifeCurrency", { currency: fromProfile.lifeCurrency })}</span>
        </p>
      )}
      </>)}

      {show("kpis") && (<>
      {/* Kennzahlen */}
      {(() => {
        // Ampel je Kennzahl aus Werten, die die App ohnehin rechnet: Median der Pensionierten,
        // 90-%-Ziel der Monte-Carlo-Simulation, sichere vs. geplante Entnahme. Steuer/Restvermögen nur Info.
        const netMonthly = result.monthlyAtRetirementReal * taxKeep;
        const medianRatio = medianOwnShare > 0 ? netMonthly / medianOwnShare : null;
        const success = risk ? risk.mc.successRate : null;
        const safe = risk ? risk.safeDraw : null;
        const grossCapital = result.inflows.reduce((sum, f) => sum + f.gross, 0);
        const taxShare = grossCapital > 0 ? result.totalCapitalTax / grossCapital : 0;
        const sMedian: KpiStatus = medianRatio === null ? "info" : medianRatio >= 1 ? "good" : medianRatio >= 0.85 ? "warn" : "bad";
        const sSuccess: KpiStatus = success === null ? "info" : success >= 0.9 ? "good" : success >= 0.75 ? "warn" : "bad";
        const sSafe: KpiStatus = safe === null ? "info" : safe <= 0 ? "bad" : safe >= 0.9 * result.monthlyDrawReal ? "good" : "warn";
        const pct = (v: number) => `${Math.round(v * 100)} %`;
        const medianText = medianRatio === null
          ? t("payoutPlan.kpiNoMedian")
          : medianRatio >= 1
            ? t("payoutPlan.kpiAboveMedian", { percent: pct(medianRatio - 1) })
            : t("payoutPlan.kpiBelowMedian", { percent: pct(1 - medianRatio) });
        // Messbalken: Wert gegen Referenz (Strich); Median-Skala bis 150 % des Medians
        const cards: { key: string; label: string; value: string; hint: string; status: KpiStatus; meter?: number; mark?: number }[] = [
          { key: "monthly", label: t("payoutPlan.kpiMonthly", { age: retirementAge }), value: chf(result.monthlyAtRetirementReal),
            hint: t("payoutPlan.kpiMonthlyNet", { amount: chf(netMonthly), median: medianText }), status: sMedian,
            ...(medianRatio === null ? {} : { meter: Math.min(1, netMonthly / (medianOwnShare * 1.5)), mark: 1 / 1.5 }) },
          { key: "draw", label: t("payoutPlan.kpiDraw"), value: chf(result.monthlyDrawReal),
            hint: success === null ? "" : t("payoutPlan.kpiDrawOdds", { percent: Math.round(success * 100), age: targetAge }), status: sSuccess,
            ...(success === null ? {} : { meter: success, mark: 0.9 }) },
          { key: "safe", label: t("payoutPlan.kpiSafeDraw"), value: safe === null ? "–" : chf(safe),
            hint: safe !== null && safe <= 0 ? t("payoutPlan.kpiSafeDrawNone") : t("payoutPlan.kpiSafeDrawHint", { age: targetAge }), status: sSafe,
            ...(safe === null || result.monthlyDrawReal <= 0 ? {} : { meter: Math.min(1, safe / result.monthlyDrawReal), mark: 0.9 }) },
          { key: "tax", label: t("payoutPlan.kpiTax"), value: chf(result.totalCapitalTax), hint: t("payoutPlan.kpiTaxShare", { percent: pct(taxShare) }), status: "info" },
          { key: "wealth", label: t("payoutPlan.kpiWealth", { age: targetAge }), value: chf(result.wealthAtTargetReal),
            // unter CHF 1'000 (Anzeige «CHF 0») gilt das Kapital als aufgebraucht, nicht als Reserve
            hint: result.wealthAtTargetReal >= 1000 ? t("payoutPlan.kpiWealthReserve") : t("payoutPlan.kpiWealthUsedUp"),
            status: result.wealthAtTargetReal >= 1000 ? "good" : "info" },
          { key: "portfolio", label: t("payoutPlan.kpiPortfolio"), value: `${portfolio.netReturnPercent.toFixed(2)} %`,
            hint: t("payoutPlan.kpiPortfolioHint", { vol: portfolio.volatilityPercent.toFixed(1) }), status: portfolio.volatilityPercent > 12 ? "warn" : "info" },
        ];
        return (
          <div className="kpi-grid">
            {cards.map((card) => (
              <div key={card.label} className="kpi-card">
                <div className="kpi-card__top">
                  <span className="kpi-card__label">{card.label}</span>
                  {/* Nur Symbol; Erklärung beim Überfahren/Fokus (CSS) oder per Klick (Touch) */}
                  <span className={`kpi-status${openKpi === card.key ? " is-open" : ""}`}>
                    <button
                      type="button"
                      className={`kpi-chip is-${card.status}`}
                      aria-label={t(`payoutPlan.kpiStatus_${card.status}`)}
                      aria-expanded={openKpi === card.key}
                      aria-describedby={`kpi-tip-${card.key}`}
                      onClick={() => setOpenKpi(openKpi === card.key ? null : card.key)}
                      onBlur={() => setOpenKpi(null)}
                      onKeyDown={(event) => { if (event.key === "Escape") setOpenKpi(null); }}
                    >
                      <KpiStatusIcon status={card.status} />
                    </button>
                    <span role="tooltip" id={`kpi-tip-${card.key}`} className="kpi-tip">
                      <strong className={`is-${card.status}`}>{t(`payoutPlan.kpiStatus_${card.status}`)}</strong>
                      {t(`payoutPlan.kpiWhy_${card.key}_${card.status}`, { age: targetAge, vol: portfolio.volatilityPercent.toFixed(1) })}
                    </span>
                  </span>
                </div>
                <span className="kpi-card__value">{card.value}</span>
                {card.hint && <span className="kpi-card__hint">{card.hint}</span>}
                {card.meter !== undefined && (
                  <span className={`kpi-meter is-${card.status}`} aria-hidden>
                    <i style={{ width: `${Math.max(2, card.meter * 100)}%` }} />
                    {card.mark !== undefined && <b style={{ left: `${card.mark * 100}%` }} />}
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      })()}
      <p className="text-2xs text-slate-500">{t("payoutPlan.realNote", { inflation: inflationPercent })}</p>
      </>)}

      {show("pillars") && (<>
      <div className={`grid grid-cols-1 gap-4 ${compact ? "" : "lg:grid-cols-[1fr_1.35fr_1fr]"}`}>
        {/* 2. Säule */}
        <div className="space-y-2 rounded-lg border border-slate-700 p-box">
          <h3 className="font-semibold text-slate-200">{t("payoutPlan.bvgTitle")}</h3>
          <div>
            <label className={labelClass}>{t("payoutPlan.bvgCapital", { age: retirementAge })}</label>
            <input type="number" min={0} step={5000} className={inputClass} value={settings.bvgCapitalAtRetirement}
              onChange={(e) => set({ bvgCapitalAtRetirement: Math.max(0, num(e.target.value)) })} />
            <p className="mt-1 text-2xs text-slate-500">{t("payoutPlan.bvgCapitalHint")}</p>
            {bvgBuyInAtRetirement(bvgBuyIn, retirementAge) > 0 && (
              <p className="mt-1 text-2xs text-cyan-200">
                {t("payoutPlan.bvgBuyInIncluded", { amount: chf(bvgBuyInAtRetirement(bvgBuyIn, retirementAge)) })}
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>{t("payoutPlan.conversionRate")}</label>
            <input type="number" min={3} max={7.5} step={0.05} className={inputClass} value={settings.bvgConversionRatePercent}
              onChange={(e) => set({ bvgConversionRatePercent: Math.min(7.5, Math.max(3, num(e.target.value))) })} />
          </div>
          <div>
            <label className={labelClass}>{t("payoutPlan.bvgAnnualCredit")}</label>
            <input type="number" min={0} step={500} className={inputClass} value={settings.bvgAnnualCredit ?? 0}
              onChange={(e) => set({ bvgAnnualCredit: Math.max(0, num(e.target.value)) })} />
            <p className="mt-1 text-2xs text-slate-500">{t("payoutPlan.bvgAnnualCreditHint")}</p>
          </div>
          <div>
            <label className={labelClass}>{t("payoutPlan.capitalShare")}</label>
            <div className="seg-row">
              {SHARES.map((share) => (
                <button key={share} type="button" className={segBtn(settings.bvgCapitalSharePercent === share)}
                  onClick={() => set({ bvgCapitalSharePercent: share })}>
                  {share}%
                </button>
              ))}
            </div>
            <p className="mt-1 text-2xs text-slate-400">
              {t("payoutPlan.bvgResult", { pension: chf(result.bvgAnnualPension / 12), capital: chf(result.bvgCapital) })}
            </p>
          </div>
        </div>

        {/* Säule 3a */}
        <div className="space-y-2 rounded-lg border border-slate-700 p-box">
          <h3 className="font-semibold text-slate-200">{t("payoutPlan.pillar3aTitle")}</h3>
          <p className="text-2xs text-slate-400">{t("payoutPlan.pillar3aHint", { min: range.min, max: range.max })}</p>
          {settings.pillar3a.length === 0 && <p className="text-xs text-slate-500">{t("payoutPlan.no3a")}</p>}
          {settings.pillar3a.map((account, i) => (
            <div key={account.label} className="grid grid-cols-[2.25rem_minmax(6rem,1fr)_3.75rem_4.25rem] items-end gap-2">
              <span className="pb-2 font-semibold text-slate-300">{account.label}</span>
              <div>
                {i === 0 && <label className={labelClass}>{t("payoutPlan.balance")}</label>}
                <input type="number" min={0} step={1000} className={inputClass} value={account.balance}
                  onChange={(e) => setAccount(i, { balance: Math.max(0, num(e.target.value)) })} />
              </div>
              <div>
                {i === 0 && <label className={labelClass}>{t("payoutPlan.return")}</label>}
                <input type="number" min={-2} max={10} step={0.5} className={inputClass} value={account.returnPercent}
                  onChange={(e) => setAccount(i, { returnPercent: num(e.target.value) })} />
              </div>
              <div>
                {i === 0 && <label className={labelClass}>{t("payoutPlan.payoutAge")}</label>}
                <select className="input-field w-full" value={account.payoutAge}
                  onChange={(e) => setAccount(i, { payoutAge: num(e.target.value) })}>
                  {Array.from({ length: range.max - range.min + 1 }, (_, k) => range.min + k).map((age) => (
                    <option key={age} value={age}>{age}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {staggeringSaving !== null && (
            <p className={`text-xs ${staggeringSaving > 0 ? "text-emerald-300" : "text-slate-400"}`}>
              {staggeringSaving > 0
                ? t("payoutPlan.staggeringSaves", { amount: chf(staggeringSaving), age: retirementAge })
                : t("payoutPlan.staggeringHint")}
            </p>
          )}
        </div>

        {/* Säule 3b Lebensversicherung */}
        <div className="space-y-2 rounded-lg border border-slate-700 p-box">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-200">{t("payoutPlan.lifeTitle")}</h3>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={settings.life.enabled}
                onChange={(e) => set({ life: { ...settings.life, enabled: e.target.checked } })} />
              {t("payoutPlan.lifeEnabled")}
            </label>
          </div>
          {settings.life.enabled && (
            <>
              <div className="seg-row">
                {(["capital", "pension"] as const).map((mode) => (
                  <button key={mode} type="button" className={segBtn(settings.life.mode === mode)}
                    onClick={() => set({ life: { ...settings.life, mode } })}>
                    {t(`payoutPlan.lifeMode_${mode}`)}
                  </button>
                ))}
              </div>
              {/* Ablaufalter rechts als Auswahl, wie «Bezug mit» bei der Säule 3a */}
              <div className="grid grid-cols-[minmax(5.5rem,1fr)_minmax(5rem,1fr)_4.25rem] items-end gap-2">
                <div>
                  <label className={labelClass}>{t("payoutPlan.lifeCapital")}</label>
                  <input type="number" min={0} step={1000} className={inputClass} value={Math.round(settings.life.capital)}
                    onChange={(e) => set({ life: { ...settings.life, capital: Math.max(0, num(e.target.value)) } })} />
                </div>
                <div>
                  <label className={labelClass}>{t("payoutPlan.lifePension")}</label>
                  <input type="number" min={0} step={500} className={inputClass} value={Math.round(settings.life.annualPension)}
                    onChange={(e) => set({ life: { ...settings.life, annualPension: Math.max(0, num(e.target.value)) } })} />
                </div>
                <div>
                  <label className={`${labelClass} whitespace-nowrap`}>{t("payoutPlan.maturityAge")}</label>
                  <select className="input-field w-full" value={settings.life.maturityAge}
                    onChange={(e) => set({ life: { ...settings.life, maturityAge: Math.round(num(e.target.value)) } })}>
                    {[...new Set([...Array.from({ length: 41 }, (_, k) => 50 + k), settings.life.maturityAge])].sort((x, y) => x - y).map((age) => (
                      <option key={age} value={age}>{age}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-2xs leading-snug text-slate-400">{t("payoutPlan.lifeTaxNote")}</p>
            </>
          )}
        </div>
      </div>
      </>)}

      {show("sources") && (<>
      {/* Herkunft des Anlagekapitals: woraus sich das Kapital in den Töpfen zusammensetzt */}
      {(() => {
        // Einkauf aus der Abfindung ist Teil des PK-Kapitals: anteilig als eigene Zeile zeigen
        const bvgTotal = baseInput?.bvg.capitalAtRetirement ?? 0;
        const buyInShare = bvgTotal > 0 ? Math.min(1, bvgBuyInAtRetirement(bvgBuyIn, retirementAge) / bvgTotal) : 0;
        const rows = result.inflows.flatMap((f) => {
          if (f.source !== "bvg" || buyInShare <= 0) return [{ ...f, key: f.source + f.label + f.age, name: sourceName(f.source, f.label) }];
          const part = (x: number, share: number) => x * share;
          return [
            { ...f, key: "bvg", name: sourceName("bvg", ""), gross: part(f.gross, 1 - buyInShare), tax: part(f.tax, 1 - buyInShare), net: part(f.net, 1 - buyInShare), netReal: part(f.netReal, 1 - buyInShare) },
            { ...f, key: "buyIn", name: t("payoutPlan.src_buyIn"), gross: part(f.gross, buyInShare), tax: part(f.tax, buyInShare), net: part(f.net, buyInShare), netReal: part(f.netReal, buyInShare) },
          ];
        });
        const total = rows.reduce((sum, r) => sum + r.netReal, 0);
        if (!rows.length || total <= 0) return null;
        const colors: Record<string, string> = { bvg: COLORS.bvg, buyIn: "#22d3ee", pillar3a: CHART_CATEGORICAL[2], life: COLORS.life, start: "#94a3b8" };
        const colorOf = (r: (typeof rows)[number]) => colors[r.key === "buyIn" ? "buyIn" : r.source];
        let cumulative = 0;
        return (
          <div className="space-y-2 rounded-lg border border-slate-700 p-box">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="card-title font-semibold text-slate-200">{t("payoutPlan.sourcesTitle")}</h3>
              <span className="text-xs text-slate-400">{t("payoutPlan.sourcesTotal", { amount: chf(total) })}</span>
            </div>
            <p className="text-2xs text-slate-400">{t("payoutPlan.sourcesHint")}</p>
            {/* Anteile als Balken */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800" aria-hidden>
              {rows.map((r) => (
                <div key={r.key} style={{ width: `${(r.netReal / total) * 100}%`, backgroundColor: colorOf(r) }} title={r.name} />
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-1 font-medium">{t("payoutPlan.sourcesWhen")}</th>
                    <th className="py-1 font-medium">{t("payoutPlan.sourcesSource")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.sourcesGross")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.sourcesTax")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.sourcesNet")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.sourcesNetToday")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.sourcesShare")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.sourcesCumulative")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    cumulative += r.netReal;
                    return (
                      <tr key={r.key} className="border-t border-slate-700/60">
                        <td className="py-1 pr-2 text-slate-300">{r.age} ({r.year})</td>
                        <td className="py-1 pr-2 text-slate-200">
                          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(r) }} />
                          {r.name}
                        </td>
                        <td className="py-1 text-right text-slate-300">{chf(r.gross)}</td>
                        <td className="py-1 text-right text-slate-400">{r.tax > 0 ? `− ${chf(r.tax)}` : "–"}</td>
                        <td className="py-1 text-right text-slate-200">{chf(r.net)}</td>
                        <td className="py-1 text-right text-slate-100">{chf(r.netReal)}</td>
                        <td className="py-1 text-right text-slate-400">{Math.round((r.netReal / total) * 100)} %</td>
                        <td className="py-1 text-right text-slate-300">{chf(cumulative)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-slate-600 font-semibold text-slate-100">
                    <td className="py-1" colSpan={2}>{t("payoutPlan.sourcesSum")}</td>
                    <td className="py-1 text-right">{chf(rows.reduce((s, r) => s + r.gross, 0))}</td>
                    <td className="py-1 text-right">− {chf(rows.reduce((s, r) => s + r.tax, 0))}</td>
                    <td className="py-1 text-right">{chf(rows.reduce((s, r) => s + r.net, 0))}</td>
                    <td className="py-1 text-right">{chf(total)}</td>
                    <td className="py-1 text-right">100 %</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
      </>)}

      {show("investment") && (<>
      {/* Anlagetöpfe */}
      <div className="space-y-2 rounded-lg border border-slate-700 p-box">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-slate-200">{t("payoutPlan.bucketsTitle")}</h3>
          <span className="text-xs text-slate-400">
            {t("payoutPlan.bucketsSummary", {
              ret: portfolio.netReturnPercent.toFixed(2),
              vol: portfolio.volatilityPercent.toFixed(1),
              amount: chf(capitalReal),
            })}
          </span>
        </div>
        <p className="text-2xs text-slate-400">{t("payoutPlan.bucketsHint")}</p>
        {compact ? (
          // Sidebar: jeder Topf als Karte, alle Angaben gleichzeitig sichtbar
          <div className="space-y-2">
            {buckets.map((b, i) => {
              const shareTotal = buckets.reduce((sum, x) => sum + Math.max(0, x.sharePercent), 0) || 1;
              const setBucket = (patch: Partial<InvestmentBucket>) =>
                set({ buckets: buckets.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              const field = (key: "sharePercent" | "returnPercent" | "volatilityPercent" | "terPercent", label: string, min: number, max: number, step: number) => (
                <label className="block text-2xs text-slate-400">
                  {label}
                  <input type="number" min={min} max={max} step={step} className={`${inputClass} mt-1`} value={b[key]}
                    onChange={(e) => setBucket({ [key]: Math.min(max, Math.max(min, num(e.target.value))) })} />
                </label>
              );
              return (
                <div key={b.id} className="space-y-2 rounded-lg border border-slate-700 bg-surface-2 p-box">
                  <div className="flex items-center gap-2">
                    <select className="input-field min-w-0 flex-1" value={b.profile} aria-label={t("payoutPlan.bucketProfile")}
                      onChange={(e) => {
                        const profile = e.target.value as BucketProfileId;
                        setBucket({ profile, ...BUCKET_PROFILES[profile] });
                      }}>
                      {(Object.keys(BUCKET_PROFILES) as BucketProfileId[]).map((id) => (
                        <option key={id} value={id}>{t(`payoutPlan.profile_${id}`)}</option>
                      ))}
                    </select>
                    {buckets.length > 1 && (
                      <button type="button" className="px-1 text-slate-400 hover:text-red-400" aria-label={t("payoutPlan.bucketRemove")}
                        title={t("payoutPlan.bucketRemove")} onClick={() => set({ buckets: buckets.filter((_, j) => j !== i) })}>✕</button>
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                    {field("sharePercent", t("payoutPlan.bucketShare"), 0, 100, 5)}
                    <div className="pb-1 text-right">
                      <p className="text-2xs text-slate-400">{t("payoutPlan.bucketAmount")}</p>
                      <p className="text-base font-semibold text-slate-100">{chf((capitalReal * Math.max(0, b.sharePercent)) / shareTotal)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {field("returnPercent", t("payoutPlan.bucketReturn"), -2, 12, 0.25)}
                    {field("volatilityPercent", t("payoutPlan.bucketVol"), 0, 30, 0.5)}
                    {field("terPercent", t("payoutPlan.bucketTer"), 0, 3, 0.05)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="text-slate-400">
              <tr>
                <th className="py-1 font-medium">{t("payoutPlan.bucketProfile")}</th>
                <th className="py-1 text-right font-medium">{t("payoutPlan.bucketShare")}</th>
                <th className="py-1 text-right font-medium">{t("payoutPlan.bucketAmount")}</th>
                <th className="py-1 text-right font-medium">{t("payoutPlan.bucketReturn")}</th>
                <th className="py-1 text-right font-medium">{t("payoutPlan.bucketVol")}</th>
                <th className="py-1 text-right font-medium">{t("payoutPlan.bucketTer")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => {
                const shareTotal = buckets.reduce((sum, x) => sum + Math.max(0, x.sharePercent), 0) || 1;
                const setBucket = (patch: Partial<InvestmentBucket>) =>
                  set({ buckets: buckets.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <tr key={b.id} className="border-t border-slate-700/60">
                    <td className="py-1 pr-2">
                      <select className="input-field w-full" value={b.profile}
                        onChange={(e) => {
                          const profile = e.target.value as BucketProfileId;
                          setBucket({ profile, ...BUCKET_PROFILES[profile] });
                        }}>
                        {(Object.keys(BUCKET_PROFILES) as BucketProfileId[]).map((id) => (
                          <option key={id} value={id}>{t(`payoutPlan.profile_${id}`)}</option>
                        ))}
                      </select>
                    </td>
                    {([
                      ["sharePercent", 0, 100, 5],
                    ] as const).map(([key, min, max, step]) => (
                      <td key={key} className="w-20 py-1 pl-1">
                        <input type="number" min={min} max={max} step={step} className={inputClass} value={b[key]}
                          onChange={(e) => setBucket({ [key]: Math.min(max, Math.max(min, num(e.target.value))) })} />
                      </td>
                    ))}
                    <td className="w-28 py-1 pl-1 text-right text-slate-300">{chf((capitalReal * Math.max(0, b.sharePercent)) / shareTotal)}</td>
                    {([
                      ["returnPercent", -2, 12, 0.25],
                      ["volatilityPercent", 0, 30, 0.5],
                      ["terPercent", 0, 3, 0.05],
                    ] as const).map(([key, min, max, step]) => (
                      <td key={key} className="w-20 py-1 pl-1">
                        <input type="number" min={min} max={max} step={step} className={inputClass} value={b[key]}
                          onChange={(e) => setBucket({ [key]: Math.min(max, Math.max(min, num(e.target.value))) })} />
                      </td>
                    ))}
                    <td className="w-8 py-1 pl-1 text-right">
                      {buckets.length > 1 && (
                        <button type="button" className="text-slate-400 hover:text-red-400" aria-label={t("payoutPlan.bucketRemove")}
                          title={t("payoutPlan.bucketRemove")} onClick={() => set({ buckets: buckets.filter((_, j) => j !== i) })}>✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        <button type="button" className="rounded-md border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          onClick={() => set({ buckets: [...buckets, newBucket("worldEquity", 0)] })}>
          ＋ {t("payoutPlan.bucketAdd")}
        </button>
        <p className="text-2xs leading-snug text-slate-500">{t("payoutPlan.bucketsAssumptions")}</p>
      </div>

      {/* Freies Vermögen und Steuerpflicht */}
      <div className={`grid grid-cols-1 gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
        <div>
          <label className={labelClass}>{t("payoutPlan.startWealth")}</label>
          <input type="number" min={0} step={5000} className={inputClass} value={settings.startWealth}
            onChange={(e) => set({ startWealth: Math.max(0, num(e.target.value)) })} />
        </div>
        <div>
          <label className={labelClass}>{t("payoutPlan.relationship")}</label>
          <div className="seg-row">
            {(["single", "married"] as const).map((rel) => (
              <button key={rel} type="button" className={segBtn(settings.relationship === rel)} onClick={() => set({ relationship: rel })}>
                {t(`payoutPlan.relationship_${rel}`)}
              </button>
            ))}
          </div>
          {married && (
            <div className="mt-2">
              <label className={labelClass}>{t("payoutPlan.partnerIncome")}</label>
              <input type="number" min={0} step={100} className={inputClass} value={settings.partnerMonthlyIncome ?? 0}
                onChange={(e) => set({ partnerMonthlyIncome: Math.max(0, num(e.target.value)) })} />
              <p className="mt-1 text-2xs text-slate-500">{t("payoutPlan.partnerIncomeHint")}</p>
            </div>
          )}
        </div>
      </div>
      </>)}

      {show("variants") && (<>
      {/* Varianten */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="py-1 font-medium">{t("payoutPlan.variant")}</th>
              <th className="py-1 text-right font-medium">{t("payoutPlan.variantMonthly")}</th>
              <th className="py-1 text-right font-medium">{t("payoutPlan.variantPension")}</th>
              <th className="py-1 text-right font-medium">{t("payoutPlan.kpiTax")}</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.label} className="border-t border-slate-700/60 text-slate-200">
                <td className="py-1">{v.label}</td>
                <td className="py-1 text-right">{chf(v.monthly)}</td>
                <td className="py-1 text-right">{chf(v.pension / 12)}</td>
                <td className="py-1 text-right">{chf(v.tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-2xs text-slate-500">{t("payoutPlan.variantNote", { age: targetAge })}</p>
      </div>

      </>)}
      {show("median") && (<>
      {/* Vergleich mit dem Median und Früh-/Normalpensionierung */}
      {(() => {
        const current = comparison.find((c) => c.age === retirementAge);
        if (!current) return null;
        const pct = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)} %`;
        return (
          <div className="space-y-2 rounded-lg border border-slate-700 bg-surface-2 p-box">
            <h3 className="font-semibold text-slate-200">{t("payoutPlan.medianTitle")}</h3>
            <p className="text-xs leading-relaxed text-slate-300">
              {t(current.vsMedian >= 0 ? "payoutPlan.medianAbove" : "payoutPlan.medianBelow", {
                age: retirementAge,
                net: chf(current.safeNet + partnerIncome),
                median: chf(medianHousehold),
                pct: `${Math.abs(Math.round(current.vsMedian * 100))} %`,
                pctNoDraw: pct(current.vsMedianNoDraw),
              })}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-1 font-medium">{t("payoutPlan.cmpAge")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.cmpBridge")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.cmpPlan")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.cmpSafe")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.cmpVsMedian")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.cmpVsMedianNoDraw")}</th>
                    <th className="py-1 text-right font-medium">{t("payoutPlan.kpiTax")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((c) => (
                    <tr key={c.age} className={`border-t border-slate-700/60 ${c.age === retirementAge ? "font-semibold text-slate-50" : "text-slate-200"}`}>
                      <td className="py-1">{t("payoutPlan.cmpAgeValue", { age: c.age, ahv: c.ahvStart })}</td>
                      <td className="py-1 text-right">{c.bridgeMonthly === null ? "–" : chf(c.bridgeMonthly)}</td>
                      <td className="py-1 text-right">{chf(c.planNet)}</td>
                      <td className="py-1 text-right">{chf(c.safeNet)}</td>
                      <td className={`py-1 text-right ${c.vsMedian >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pct(c.vsMedian)}</td>
                      <td className={`py-1 text-right ${c.vsMedianNoDraw >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pct(c.vsMedianNoDraw)}</td>
                      <td className="py-1 text-right">{chf(c.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-2xs leading-snug text-slate-500">
              {t("payoutPlan.cmpNote", { tax: incomeTaxRatePercent.toFixed(1), married: married ? t("payoutPlan.cmpNoteMarried") : "" })}
            </p>
            <p className="text-2xs leading-snug text-slate-500">
              {t("payoutPlan.medianSources", { income: MEDIAN_SOURCES.income, wealth: MEDIAN_SOURCES.wealth })}
            </p>
          </div>
        );
      })()}

      </>)}
      {/* Einkommen und Vermögen nach Alter */}
      <div className={separateCharts ? "" : "grid grid-cols-1 gap-4 lg:grid-cols-2"}>
        {show("chartIncome") && (
        <div className={`flex flex-col ${separateCharts ? "h-80" : "h-64"}`}>
          <p className="card-title mb-1 text-xs font-semibold text-slate-300">{t("payoutPlan.chartIncome")}</p>
          <ChartErrorBoundary>
            {/* Diagramm füllt den Rest unter Titel/Hinweis — sonst ragt es aus der Box */}
            <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <XAxis dataKey="age" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={48} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [chf(v), t(`payoutPlan.series_${name}`)]} />
                <Bar dataKey="ahv" stackId="m" fill={COLORS.ahv} />
                <Bar dataKey="bvg" stackId="m" fill={COLORS.bvg} />
                <Bar dataKey="life" stackId="m" fill={COLORS.life} />
                <Bar dataKey="draw" stackId="m" fill={COLORS.draw} />
                <ReferenceLine y={medianOwnShare} stroke={theme.yellow} strokeDasharray="5 4"
                  label={{ value: t("payoutPlan.medianIncomeLine"), fill: theme.yellow, fontSize: 10, position: "insideTopRight" }} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </ChartErrorBoundary>
        </div>
        )}
        {show("chartWealth") && (
        <div className={`flex flex-col ${separateCharts ? "h-80" : "h-64"}`}>
          <p className="card-title mb-1 text-xs font-semibold text-slate-300">{t("payoutPlan.chartWealth")}</p>
          {risk && <p className="-mt-1 mb-1 text-2xs text-slate-500">{t("payoutPlan.chartWealthBand")}</p>}
          <ChartErrorBoundary>
            {/* Diagramm füllt den Rest unter Titel/Hinweis — sonst ragt es aus der Box */}
            <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartRows}>
                <XAxis dataKey="age" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={56} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, name: string, item: { payload?: { p10?: number; band?: number } }) =>
                    name === "band"
                      ? [`${chf(item.payload?.p10 ?? 0)} – ${chf((item.payload?.p10 ?? 0) + v)}`, t("payoutPlan.series_band")]
                      : name === "p10" ? [null, null] : [chf(v), t(`payoutPlan.series_${name}`)]}
                />
                <ReferenceLine y={0} stroke={theme.border} />
                {risk && <Area type="monotone" dataKey="p10" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />}
                {risk && <Area type="monotone" dataKey="band" stackId="band" stroke="none" fill={theme.accent} fillOpacity={0.15} isAnimationActive={false} />}
                {risk && <Line type="monotone" dataKey="p50" stroke={theme.accent} strokeDasharray="4 3" dot={false} strokeWidth={1.5} />}
                <Line type="monotone" dataKey="wealth" stroke={theme.accent} dot={false} strokeWidth={2} />
                <Line type="stepAfter" dataKey="medianWealth" stroke={theme.yellow} strokeDasharray="5 4" dot={false} strokeWidth={1.5} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
            </div>
          </ChartErrorBoundary>
        </div>
        )}
      </div>
      {show("chartIncome") && (
      <div className="flex flex-wrap gap-3 text-2xs text-slate-400">
        {(["ahv", "bvg", "life", "draw"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COLORS[k] }} />
            {t(`payoutPlan.series_${k}`)}
          </span>
        ))}
      </div>
      )}

      {show("taxes") && (<>
      {/* Kapitalsteuer je Bezugsjahr */}
      {taxRows.length > 0 && (
        <div className="overflow-x-auto">
          <p className="card-title mb-1 text-xs font-semibold text-slate-300">{t("payoutPlan.taxTable")}</p>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400">
              <tr>
                <th className="py-1 font-medium">{t("payoutPlan.age")}</th>
                <th className="py-1 text-right font-medium">{t("payoutPlan.gross")}</th>
                <th className="py-1 text-right font-medium">{t("payoutPlan.taxFederal")}</th>
                <th className="py-1 text-right font-medium">{t("payoutPlan.taxCantonMunicipal")}</th>
                <th className="py-1 text-right font-medium">{t("payoutPlan.taxRate")}</th>
              </tr>
            </thead>
            <tbody>
              {taxRows.map((row) => (
                <tr key={row.age} className="border-t border-slate-700/60 text-slate-200">
                  <td className="py-1">{row.age}</td>
                  <td className="py-1 text-right">{chf(row.gross)}</td>
                  <td className="py-1 text-right">{chf(row.tax.federal)}</td>
                  <td className="py-1 text-right">{chf(row.tax.cantonal + row.tax.municipal)}</td>
                  <td className="py-1 text-right">{row.tax.ratePercent.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-2xs text-slate-500">
            {t("payoutPlan.taxSource", { year: CAPITAL_TAX_YEAR, municipality: capitalTaxMunicipality(taxCanton), canton: taxCanton })}
          </p>
        </div>
      )}

      </>)}
      {show("warnings") && (<>
      {lastSync && (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-slate-700 bg-surface-2 px-3 py-2 text-xs text-slate-200" role="status">
          <div>
            <p className="font-semibold">{t("payoutPlan.syncedTitle")}</p>
            <ul className="mt-1">
              {lastSync.changes.map((c) => (
                <li key={c.key}>{t(`payoutPlan.synced_${c.key}`)}: {c.from} → {c.to}</li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2">
            <button type="button" className="seg-btn" onClick={() => {
              // zurück zu den Planwerten, Merker bleibt auf dem aktuellen Profil (kein erneutes Übernehmen)
              onChange({ ...lastSync.previous, profileSync: settings.profileSync });
              setLastSync(null);
            }}>{t("payoutPlan.syncUndo")}</button>
            <button type="button" className="seg-btn" onClick={() => setLastSync(null)}>{t("payoutPlan.syncOk")}</button>
          </div>
        </div>
      )}
      {(result.warnings.length > 0 || buyInLock) && (
        <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
          {buyInLock && <li className="flex gap-2"><WarningTriangle className="h-4 w-4 shrink-0" aria-hidden /><span>{t("payoutPlan.buyInLock")}</span></li>}
          {result.warnings.map((w) => <li key={w} className="flex gap-2"><WarningTriangle className="h-4 w-4 shrink-0" aria-hidden /><span>{w}</span></li>)}
        </ul>
      )}
      </>)}
      {(part === "all" || part === "results") && <p className="text-2xs leading-snug text-slate-500">{t("payoutPlan.disclaimer")}</p>}

    </section>
  );
};
