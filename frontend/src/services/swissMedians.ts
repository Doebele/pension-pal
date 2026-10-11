/**
 * Vergleichswerte: wo steht man im Vergleich zum Median? Gleiche Zahlen und Quellen wie
 * Budget-Pal (backend/app/services/swiss_medians.py), damit beide Apps dasselbe zeigen.
 *
 * - Einkommen im Ruhestand: Median des verfügbaren Äquivalenzeinkommens der Personen ab 65,
 *   SILC 2018 (BFS, "Armut im Alter", 2020): 44'899 CHF pro Jahr. Verfügbar = nach Steuern,
 *   Sozialbeiträgen und Krankenkasse; Vermögensertrag zählt, Kapitalverzehr nicht.
 *   ponytail: aktuellste Zahl nach Alter (nur "ab 65", keine feinere Gliederung).
 * - Freies Vermögen nach Alter: Median des Äquivalenz-Reinvermögens nach Alter der
 *   Referenzperson, Steuerdaten Kanton Luzern 2020 (LUSTAT, FinSit 2024). Ohne Pensionskasse und
 *   nicht bezogene 3a. Eine schweizweite Reihe nach Alter gibt es nicht (die ESTV erhält von den
 *   Kantonen keine Altersangaben). ponytail: Luzern als Näherung; ab 75 fehlt der Wert.
 * - Neurenten 2024 (BFS, Statistik der beruflichen Vorsorge, 27.11.2025): Median der
 *   Pensionskassen-Rente und des Kapitalbezugs, nach Geschlecht.
 * Paare: modifizierte OECD-Skala, zweite erwachsene Person 0.5 → Faktor 1.5.
 */
export const COUPLE_FACTOR = 1.5;

/** Verfügbares Äquivalenzeinkommen ab 65, CHF pro Jahr (SILC 2018) */
export const RETIREE_INCOME_MEDIAN_ANNUAL = 44_899;

/** [von Alter, bis Alter, Median CHF] je Haushalt mit einer Person */
export const WEALTH_BY_AGE: [number, number, number][] = [
  [18, 25, 15_800], [26, 34, 26_000], [35, 44, 26_900],
  [45, 54, 49_700], [55, 64, 104_600], [65, 74, 240_700],
];

export const NEW_PENSIONS_2024 = {
  bvgMonthly: { male: 2_042, female: 1_227 },
  bvgCapital: { male: 201_825, female: 82_942 },
};

export const MEDIAN_SOURCES = {
  income: "BFS, SILC 2018 (Armut im Alter, 2020)",
  wealth: "LUSTAT, FinSit 2024 (Steuerdaten Kanton Luzern 2020)",
  newPensions: "BFS, Statistik der beruflichen Vorsorge 2024",
};

/** Median-Einkommen eines Rentnerhaushalts pro Monat (verfügbar) */
export const retireeIncomeMonthly = (married: boolean) =>
  (RETIREE_INCOME_MEDIAN_ANNUAL / 12) * (married ? COUPLE_FACTOR : 1);

/** Median des freien Vermögens im Alter `age` (Haushalt), linear zwischen den Mitten der Altersgruppen; ausserhalb 18–74 keiner */
export function medianWealth(age: number, married: boolean): number | null {
  const lo = WEALTH_BY_AGE[0][0];
  const hi = WEALTH_BY_AGE[WEALTH_BY_AGE.length - 1][1];
  if (age < lo || age > hi) return null;
  const mids = WEALTH_BY_AGE.map(([a, b]) => (a + b) / 2);
  const values = WEALTH_BY_AGE.map(([, , v]) => v);
  let value: number;
  if (age <= mids[0]) value = values[0];
  else if (age >= mids[mids.length - 1]) value = values[values.length - 1];
  else {
    const i = mids.findIndex((m) => m >= age);
    const w = (age - mids[i - 1]) / (mids[i] - mids[i - 1]);
    value = values[i - 1] + (values[i] - values[i - 1]) * w;
  }
  return value * (married ? COUPLE_FACTOR : 1);
}
