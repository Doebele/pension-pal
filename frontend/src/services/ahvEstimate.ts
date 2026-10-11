// AHV-Schätzung aus der Beitragsgeschichte — eine Quelle für Karte (Anzeige), Speichern und damit Analyse/Cockpit
import type { AhvContributionRow } from "../components/cards/AhvContributionTable";
import { ahvFactor, ahvStartAgeFor } from "./payoutPlanning.ts";

export const parseChf = (value: string | undefined | null): number | null => {
  if (!value) return null;
  const n = Number(String(value).replace(/['\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export type AhvHistoryStats = {
  /** Es gibt erfasste Jahre: die Geschichte ersetzt dann die manuelle Angabe der Beitragsjahre */
  hasDetailedHistory: boolean;
  /**
   * Beitragsjahre (Skala 44): vergangene Jahre nur mit Einkommen > 0 (ein Jahr mit 0 ist eine Lücke);
   * künftige Jahre bis zum Jahr vor dem Referenzalter zählen auch ohne Einkommen, weil bis dahin Beitragspflicht
   * besteht (als Nichterwerbstätige auch nach Frühpensionierung oder Vorbezug). Danach zählt nichts mehr.
   * Doppelte Jahre zählen einmal.
   */
  contributionYears: number;
  averageIncome: number | null;
  /**
   * Ø Jahresbeitrag aus der Spalte «Total». Ist sie keine Jahresbeitragsspalte (ein Wert > Einkommen des Jahres,
   * z. B. kumuliertes Einkommen) oder leer: AHV-Satz × Ø Einkommen.
   */
  averageContribution: number | null;
};

/** AHV-Beitragssatz Arbeitnehmer + Arbeitgeber (ohne IV/EO), seit 2020 */
export const AHV_CONTRIBUTION_RATE = 0.087;

export function ahvHistoryStats(
  rows: AhvContributionRow[],
  opts: { currentYear?: number; birthYear?: number | null; statutoryAge?: number } = {},
): AhvHistoryStats {
  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const statutoryAge = opts.statutoryAge ?? 65;
  const byYear = new Map<string, { income: number | null; contribution: number | null }>();
  let anyYear = false;
  let totalsAreAnnual = true;
  for (const row of rows) {
    const year = row.year.trim();
    if (!year) continue;
    anyYear = true;
    const income = parseChf(row.annualIncomeChf);
    const contribution = parseChf(row.contributionTotalChf);
    const hasIncome = income !== null && income > 0;
    const age = parseChf(row.ageEndOfYear) ?? (opts.birthYear ? Number(year) - opts.birthYear : null);
    const futureDuty = Number(year) > currentYear && age !== null && age < statutoryAge;
    if (!hasIncome && !futureDuty) continue;
    if (hasIncome && contribution !== null && contribution > income!) totalsAreAnnual = false;
    byYear.set(year, { income: hasIncome ? income : null, contribution: hasIncome && contribution !== null && contribution > 0 ? contribution : null });
  }
  const years = [...byYear.values()];
  const avg = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
  const averageIncome = avg(years.map((y) => y.income).filter((v): v is number => v !== null));
  const contributions = years.map((y) => y.contribution).filter((v): v is number => v !== null);
  return {
    hasDetailedHistory: anyYear,
    contributionYears: years.length,
    averageIncome,
    averageContribution: totalsAreAnnual && contributions.length
      ? avg(contributions)
      : averageIncome !== null ? Math.round(averageIncome * AHV_CONTRIBUTION_RATE) : null,
  };
}

/** Ungekürzte Rente (Bezug ab Referenzalter): Skala 44 mit Mindest-/Maximalrente, siehe Wissen → «Berechnung der drei Säulen» */
export function ahvUnreducedAnnualPension(input: {
  averageIncome: number;
  contributionYears: number;
  gender: "female" | "male" | string | null | undefined;
}): number {
  const incomeFactor = Math.max(0.3, Math.min(1.0, input.averageIncome / 88_200));
  const yearsFactor = Math.max(0, Math.min(1, input.contributionYears / 44));
  const baseAnnual = 14_700 + (29_400 - 14_700) * incomeFactor;
  const genderFactor = input.gender === "female" ? 1.01 : 1;
  return baseAnnual * yearsFactor * genderFactor;
}

/**
 * AHV-Bezug wie in der Bezugsplanung: Beginn mit der Pensionierung, frühestens 2 Jahre vor (Vorbezug),
 * spätestens 5 Jahre nach dem Referenzalter (Aufschub). Eine frühere Pensionierung allein kürzt die AHV nicht,
 * weil bis zum Referenzalter weiter Beiträge bezahlt werden (als Nichterwerbstätige).
 */
export function ahvTiming(plannedAge: number, referenceAge: number) {
  const startAge = Math.min(referenceAge + 5, ahvStartAgeFor(plannedAge, referenceAge));
  return {
    startAge,
    earlyYears: Math.max(0, referenceAge - startAge),
    lateYears: Math.max(0, startAge - referenceAge),
    factor: ahvFactor(startAge, referenceAge),
  };
}

/** Erwartete Jahresrente beim geplanten Pensionsalter — gleiche Rechnung wie Analyse und Cockpit */
export function estimateAhvAnnualPension(input: {
  averageIncome: number;
  contributionYears: number;
  plannedAge: number;
  referenceAge: number;
  gender: "female" | "male" | string | null | undefined;
}): number {
  return Math.round(ahvUnreducedAnnualPension(input) * ahvTiming(input.plannedAge, input.referenceAge).factor);
}
