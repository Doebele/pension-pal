/**
 * Bezugsplanung: wann und wie Vorsorgegeld ausbezahlt wird, und was das für Einkommen und
 * Vermögen im Alter heisst.
 *
 * - 2. Säule (BVG): Rente, Kapital oder gemischt (Kapitalanteil in %), bei Pensionierung.
 * - Säule 3a: jedes Konto wird in einem Jahr ganz bezogen, frühestens 5 Jahre vor dem
 *   Referenzalter, spätestens 5 Jahre danach (nur mit Erwerbstätigkeit).
 * - Säule 3b (Lebensversicherung): Kapital oder Rente bei Ablauf.
 *
 * Kapitalleistungen aus 2. Säule und 3a desselben Kalenderjahres werden zusammengezählt und
 * separat vom übrigen Einkommen besteuert (progressiv). Die Steuer kommt aus den offiziellen
 * ESTV-Werten (data/capitalTaxTables.json, scripts/fetch-capital-tax-tables.py).
 *
 * Ausbezahltes Kapital wird angelegt (Rendite wählbar) und so entnommen, dass es bis zum
 * Zielalter reicht: gleichbleibender Betrag in heutiger Kaufkraft. Alles Übrige rechnet
 * nominal; Ausgaben werden in heutigen Franken gezeigt (inflationsbereinigt).
 */
import taxTables from "../data/capitalTaxTables.json" with { type: "json" };

export type Relationship = "single" | "married";
export type LifePayoutMode = "capital" | "pension";

export type CapitalTax = { total: number; federal: number; cantonal: number; municipal: number; ratePercent: number };

type TaxPoint = { amount: number; federal: number; cantonal: number; municipal: number };
type CantonTable = { municipality: string; single: TaxPoint[]; married: TaxPoint[] };
const CANTONS = taxTables.cantons as Record<string, CantonTable>;

export const CAPITAL_TAX_YEAR: number = taxTables.taxYear;
export const CAPITAL_TAX_CANTONS = Object.keys(CANTONS);
export const capitalTaxMunicipality = (canton: string) => CANTONS[canton]?.municipality ?? "";

/**
 * Steuer auf eine Kapitalleistung aus Vorsorge (Bund + Kanton + Gemeinde, ohne Kirche).
 * Zwischen den Rasterpunkten linear interpoliert; unter dem kleinsten Punkt mit dessen Satz,
 * über dem grössten mit dessen Satz (die Tarife flachen dort ab).
 */
export function capitalWithdrawalTax(amount: number, canton: string, relationship: Relationship): CapitalTax {
  const points = CANTONS[canton]?.[relationship];
  if (!points?.length || amount <= 0) return { total: 0, federal: 0, cantonal: 0, municipal: 0, ratePercent: 0 };
  const scale = (p: TaxPoint, factor: number) => ({
    federal: p.federal * factor,
    cantonal: p.cantonal * factor,
    municipal: p.municipal * factor,
  });
  let parts: { federal: number; cantonal: number; municipal: number };
  const first = points[0];
  const last = points[points.length - 1];
  if (amount <= first.amount) {
    parts = scale(first, amount / first.amount);
  } else if (amount >= last.amount) {
    parts = scale(last, amount / last.amount);
  } else {
    const upper = points.findIndex((p) => p.amount >= amount);
    const lo = points[upper - 1];
    const hi = points[upper];
    const w = (amount - lo.amount) / (hi.amount - lo.amount);
    parts = {
      federal: lo.federal + (hi.federal - lo.federal) * w,
      cantonal: lo.cantonal + (hi.cantonal - lo.cantonal) * w,
      municipal: lo.municipal + (hi.municipal - lo.municipal) * w,
    };
  }
  const total = parts.federal + parts.cantonal + parts.municipal;
  return {
    total: Math.round(total),
    federal: Math.round(parts.federal),
    cantonal: Math.round(parts.cantonal),
    municipal: Math.round(parts.municipal),
    ratePercent: (total / amount) * 100,
  };
}

export type Pillar3aAccount = { label: string; balance: number; returnPercent: number; payoutAge: number };

export type PayoutPlanInput = {
  currentAge: number;
  currentYear: number;
  retirementAge: number;
  targetAge: number; // Kapital soll bis zu diesem Alter reichen
  referenceAge: number; // AHV-Referenzalter (für die 3a-Bezugsgrenzen)
  canton: string;
  relationship: Relationship;
  inflationPercent: number;
  ahvAnnual: number; // in heutigen Franken, schon um Vorbezug/Aufschub angepasst; folgt etwa der Teuerung
  ahvStartAge?: number; // ab diesem Alter AHV (Vorbezug frühestens 2 Jahre vor dem Referenzalter); Standard: Pensionierung
  bvg: { capitalAtRetirement: number; conversionRatePercent: number; capitalSharePercent: number };
  pillar3a: Pillar3aAccount[];
  life?: { maturityAge: number; capital: number; annualPension: number; mode: LifePayoutMode };
  startWealth: number; // freies Vermögen bei Pensionierung
  investmentReturnPercent: number; // Rendite des angelegten Kapitals (nach Kosten)
};

export type PayoutYear = {
  age: number;
  year: number;
  ahv: number; // nominal pro Jahr
  bvgPension: number;
  lifePension: number;
  capitalDraw: number; // Entnahme aus dem angelegten Vermögen
  capitalInflowGross: number; // Kapitalleistungen dieses Jahres vor Steuern
  capitalTax: number;
  wealthEnd: number; // angelegtes Vermögen am Jahresende
  deflator: number; // teilt nominale Werte in heutige Franken
  shortfall: boolean; // geplante Entnahme war mangels Kapital nicht möglich
};

/** Eine Kapitalleistung, die angelegt wird — Herkunft des Anlagekapitals */
export type CapitalInflow = {
  age: number;
  year: number;
  source: "bvg" | "pillar3a" | "life" | "start";
  label: string;
  gross: number; // nominal im Auszahlungsjahr
  tax: number; // Anteil an der Kapitalbezugssteuer dieses Jahres (nach Betrag aufgeteilt)
  net: number;
  netReal: number; // netto in heutigen Franken
};

export type PayoutPlanResult = {
  years: PayoutYear[];
  /** Herkunft des Anlagekapitals nach Alter und Quelle */
  inflows: CapitalInflow[];
  totalCapitalTax: number;
  bvgCapital: number;
  bvgAnnualPension: number;
  /** Monatlich verfügbar im ersten Pensionsjahr, in heutigen Franken (vor Einkommenssteuer) */
  monthlyAtRetirementReal: number;
  /** Gleichbleibende Entnahme aus dem Kapital pro Monat, in heutigen Franken */
  monthlyDrawReal: number;
  wealthAtTargetReal: number;
  /** Gleichbleibende reale Entnahme pro Jahr (heutige Franken) */
  annualDrawReal: number;
  /** Kapitalzuflüsse nach Steuern (nominal) nach Alter — Grundlage für Monte Carlo */
  netInflows: { age: number; amount: number }[];
  warnings: string[];
};

// ── Früh- und Spätpensionierung ─────────────────────────────────────────────

export const AHV_EARLY_REDUCTION_PER_YEAR = 0.068;
export const AHV_LATE_INCREASE_PER_YEAR = 0.052;
export const BVG_EARLY_REDUCTION_PER_YEAR = 0.05;
export const BVG_LATE_INCREASE_PER_YEAR = 0.015;

/** AHV beginnt mit der Pensionierung, frühestens 2 Jahre vor dem Referenzalter (AHV 21: ab 63) */
export const ahvStartAgeFor = (retirementAge: number, referenceAge: number) => Math.max(retirementAge, referenceAge - 2);

/** Kürzung/Zuschlag der AHV-Rente nach Bezugsbeginn.
 *  ponytail: fester Satz; für die Übergangsjahrgänge 1961–1969 gelten mit AHV 21 tiefere Kürzungen */
export function ahvFactor(startAge: number, referenceAge: number): number {
  const delta = startAge - referenceAge;
  return delta < 0
    ? Math.max(0.5, 1 + delta * AHV_EARLY_REDUCTION_PER_YEAR)
    : Math.min(1.31, 1 + delta * AHV_LATE_INCREASE_PER_YEAR);
}

/** Umwandlungssatz relativ zum Referenzalter (früher tiefer, später höher) */
export function bvgConversionFactor(retirementAge: number, referenceAge: number): number {
  const delta = retirementAge - referenceAge;
  return delta < 0
    ? Math.max(0.6, 1 + delta * BVG_EARLY_REDUCTION_PER_YEAR)
    : Math.min(1.25, 1 + delta * BVG_LATE_INCREASE_PER_YEAR);
}

/** Erlaubter Bezugsbereich für 3a-Konten */
export const pillar3aPayoutRange = (referenceAge: number) => ({ min: referenceAge - 5, max: referenceAge + 5 });

export function simulatePayoutPlan(input: PayoutPlanInput): PayoutPlanResult {
  const inflation = input.inflationPercent / 100;
  const nominalReturn = input.investmentReturnPercent / 100;
  const realReturn = (1 + nominalReturn) / (1 + inflation) - 1;
  const deflatorAt = (age: number) => Math.pow(1 + inflation, Math.max(0, age - input.currentAge));
  const warnings: string[] = [];

  const shareCapital = Math.min(100, Math.max(0, input.bvg.capitalSharePercent)) / 100;
  const bvgCapital = input.bvg.capitalAtRetirement * shareCapital;
  const bvgAnnualPension = Math.round(input.bvg.capitalAtRetirement * (1 - shareCapital) * (input.bvg.conversionRatePercent / 100));

  // Kapitalleistungen nach Alter (nominal), vor Steuern; 3a wächst bis zum Bezug mit seiner Rendite
  const range = pillar3aPayoutRange(input.referenceAge);
  const taxedInflows = new Map<number, number>(); // 2. Säule + 3a: gemeinsam besteuert
  const taxFreeInflows = new Map<number, number>(); // 3b-Kapital
  const add = (map: Map<number, number>, age: number, amount: number) =>
    map.set(age, (map.get(age) ?? 0) + amount);
  const items: Omit<CapitalInflow, "tax" | "net" | "netReal" | "year">[] = [];
  if (bvgCapital > 0) {
    add(taxedInflows, input.retirementAge, bvgCapital);
    items.push({ age: input.retirementAge, source: "bvg", label: "2. Säule", gross: bvgCapital });
  }
  for (const account of input.pillar3a) {
    const age = Math.min(range.max, Math.max(range.min, Math.round(account.payoutAge)));
    if (age !== account.payoutAge) warnings.push(`${account.label}: Bezug auf ${age} verschoben (erlaubt ${range.min}–${range.max})`);
    if (age > input.retirementAge) warnings.push(`${account.label}: Bezug nach der Pensionierung setzt weitere Erwerbstätigkeit voraus`);
    const grown = account.balance * Math.pow(1 + account.returnPercent / 100, Math.max(0, age - input.currentAge));
    add(taxedInflows, age, grown);
    items.push({ age, source: "pillar3a", label: account.label, gross: grown });
  }
  const life = input.life;
  if (life && life.mode === "capital" && life.capital > 0) {
    // 3b-Kapital aus rückkaufsfähiger Lebensversicherung: bei erfüllten Bedingungen einkommenssteuerfrei
    add(taxFreeInflows, life.maturityAge, life.capital);
    items.push({ age: life.maturityAge, source: "life", label: "3b", gross: life.capital });
  }

  const taxByAge = new Map<number, number>();
  for (const [age, amount] of taxedInflows) {
    taxByAge.set(age, capitalWithdrawalTax(amount, input.canton, input.relationship).total);
  }
  const netInflowAt = (age: number) =>
    (taxedInflows.get(age) ?? 0) - (taxByAge.get(age) ?? 0) + (taxFreeInflows.get(age) ?? 0);

  // Gleichbleibende reale Entnahme: Barwert aller Nettozuflüsse (heutige Franken, auf den
  // Pensionierungszeitpunkt) verteilt als Annuität bis zum Zielalter
  const years = Math.max(1, input.targetAge - input.retirementAge);
  const startReal = input.startWealth / deflatorAt(input.retirementAge);
  let presentValue = startReal;
  const firstInflowAge = Math.min(...[...taxedInflows.keys(), ...taxFreeInflows.keys(), input.retirementAge]);
  for (let age = firstInflowAge; age < input.targetAge; age += 1) {
    const real = netInflowAt(age) / deflatorAt(age);
    if (!real) continue;
    // Vor der Pensionierung eingehendes Kapital wächst bis dahin mit, danach wird abgezinst
    presentValue += real / Math.pow(1 + realReturn, age - input.retirementAge);
  }
  const annuityFactor = realReturn === 0 ? years : (1 - Math.pow(1 + realReturn, -years)) / realReturn * (1 + realReturn);
  const annualDrawReal = Math.max(0, presentValue / annuityFactor);

  // Vor der Pensionierung bezogenes 3a-Kapital bis zur Pensionierung anlegen
  let wealth = input.startWealth;
  for (let age = firstInflowAge; age < input.retirementAge; age += 1) {
    wealth = (wealth + netInflowAt(age)) * (1 + nominalReturn);
  }

  const rows: PayoutYear[] = [];
  for (let age = input.retirementAge; age <= input.targetAge; age += 1) {
    const deflator = deflatorAt(age);
    wealth += netInflowAt(age);
    const planned = age < input.targetAge ? annualDrawReal * deflator : 0;
    const draw = Math.min(planned, Math.max(0, wealth));
    wealth = (wealth - draw) * (1 + nominalReturn);
    rows.push({
      age,
      year: input.currentYear + (age - input.currentAge),
      ahv: age >= (input.ahvStartAge ?? input.retirementAge) ? input.ahvAnnual * deflator : 0, // folgt etwa der Teuerung (Mischindex)
      bvgPension: bvgAnnualPension, // BVG-Renten werden meist nicht der Teuerung angepasst
      lifePension: life && life.mode === "pension" && age >= life.maturityAge ? life.annualPension : 0,
      capitalDraw: draw,
      capitalInflowGross: (taxedInflows.get(age) ?? 0) + (taxFreeInflows.get(age) ?? 0),
      capitalTax: taxByAge.get(age) ?? 0,
      wealthEnd: Math.max(0, wealth),
      deflator,
      shortfall: planned - draw > 1,
    });
  }
  if (rows.some((r) => r.shortfall)) {
    warnings.push("In einigen Jahren reicht das Kapital nicht für die geplante Entnahme (Kapital fliesst erst später zu)");
  }
  // Vor der Pensionierung ausbezahlte Beträge erscheinen nicht in den Jahreszeilen; Steuer trotzdem zählen
  const totalCapitalTax = [...taxByAge.values()].reduce((a, b) => a + b, 0);
  // Steuer eines Jahres nach Betrag auf die gemeinsam besteuerten Bezüge (PK + 3a) verteilen
  if (input.startWealth > 0) items.push({ age: input.retirementAge, source: "start", label: "", gross: input.startWealth });
  const inflows: CapitalInflow[] = items
    .map((item) => {
      const taxedTotal = taxedInflows.get(item.age) ?? 0;
      const taxed = item.source === "bvg" || item.source === "pillar3a";
      const tax = taxed && taxedTotal > 0 ? (taxByAge.get(item.age) ?? 0) * (item.gross / taxedTotal) : 0;
      const net = item.gross - tax;
      return { ...item, year: input.currentYear + (item.age - input.currentAge), tax, net, netReal: net / deflatorAt(item.age) };
    })
    .sort((a, b) => a.age - b.age);
  const first = rows[0];
  const monthlyAtRetirementReal = first
    ? (first.ahv + first.bvgPension + first.lifePension + first.capitalDraw) / first.deflator / 12
    : 0;
  return {
    years: rows,
    inflows,
    totalCapitalTax,
    bvgCapital,
    bvgAnnualPension,
    monthlyAtRetirementReal,
    monthlyDrawReal: annualDrawReal / 12,
    wealthAtTargetReal: rows.length ? rows[rows.length - 1].wealthEnd / rows[rows.length - 1].deflator : 0,
    annualDrawReal,
    netInflows: [...new Set([...taxedInflows.keys(), ...taxFreeInflows.keys()])]
      .sort((a, b) => a - b)
      .map((age) => ({ age, amount: netInflowAt(age) })),
    warnings,
  };
}

// ── Anlagetöpfe ─────────────────────────────────────────────────────────────

export type BucketProfileId = "cash" | "conservative" | "balanced" | "growth" | "worldEquity" | "custom";

/**
 * Langfristige Annahmen je Anlageart (nominal p.a., vor Kosten), keine Prognose und frei änderbar.
 * Bewusst unter den historischen Werten der letzten Jahrzehnte: für eine Planung über 25+ Jahre
 * mit heutigen Zinsen realistischer. Volatilität = jährliche Schwankung (Standardabweichung).
 */
export const BUCKET_PROFILES: Record<BucketProfileId, { returnPercent: number; volatilityPercent: number; terPercent: number }> = {
  cash: { returnPercent: 0.5, volatilityPercent: 0.5, terPercent: 0 },
  conservative: { returnPercent: 2.5, volatilityPercent: 5, terPercent: 0.5 }, // Strategiefonds ~25 % Aktien
  balanced: { returnPercent: 3.5, volatilityPercent: 8, terPercent: 0.5 }, // ~50 % Aktien
  growth: { returnPercent: 4.5, volatilityPercent: 11, terPercent: 0.5 }, // ~75 % Aktien
  worldEquity: { returnPercent: 6, volatilityPercent: 15, terPercent: 0.2 }, // Aktien-ETF Welt (z. B. MSCI World)
  custom: { returnPercent: 3, volatilityPercent: 8, terPercent: 0.3 },
};

export type InvestmentBucket = {
  id: string;
  profile: BucketProfileId;
  sharePercent: number; // Anteil am angelegten Kapital
  returnPercent: number;
  volatilityPercent: number;
  terPercent: number;
};

/** Korrelation zwischen den Töpfen. ponytail: eine Konstante für alle Paare; Matrix, falls Töpfe sehr unterschiedlich werden */
const BUCKET_CORRELATION = 0.7;

/** Rendite nach Kosten und Volatilität des Portfolios (Anteile werden auf 100 % normiert) */
export function portfolioStats(buckets: InvestmentBucket[]): { netReturnPercent: number; volatilityPercent: number } {
  const total = buckets.reduce((sum, b) => sum + Math.max(0, b.sharePercent), 0);
  if (total <= 0) return { netReturnPercent: 0, volatilityPercent: 0 };
  const w = buckets.map((b) => Math.max(0, b.sharePercent) / total);
  const netReturnPercent = buckets.reduce((sum, b, i) => sum + w[i] * (b.returnPercent - b.terPercent), 0);
  let variance = 0;
  buckets.forEach((a, i) => buckets.forEach((b, j) => {
    variance += w[i] * w[j] * a.volatilityPercent * b.volatilityPercent * (i === j ? 1 : BUCKET_CORRELATION);
  }));
  return { netReturnPercent, volatilityPercent: Math.sqrt(variance) };
}

// ── Monte Carlo ─────────────────────────────────────────────────────────────

/** Reproduzierbarer Zufall (mulberry32): gleiche Eingaben → gleiches Bild, kein Flackern */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number) {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

export type MonteCarloResult = {
  ages: number[];
  p10: number[]; // Vermögen in heutigen Franken
  p50: number[];
  p90: number[];
  /** Anteil der Pfade, in denen die geplante Entnahme bis zum Zielalter jedes Jahr möglich war */
  successRate: number;
};

/**
 * Jährliche Renditen lognormal mit Mittelwert und Volatilität des Portfolios; Zuflüsse und die
 * geplante reale Entnahme wie im Plan. drawFactor skaliert die Entnahme (für die sichere Entnahme).
 */
export function monteCarlo(
  input: PayoutPlanInput,
  plan: PayoutPlanResult,
  volatilityPercent: number,
  runs = 1000,
  drawFactor = 1,
  seed = 20260928,
): MonteCarloResult {
  const inflation = input.inflationPercent / 100;
  const m = input.investmentReturnPercent / 100;
  const s = volatilityPercent / 100;
  const sigma2 = Math.log(1 + (s * s) / ((1 + m) * (1 + m)));
  const mu = Math.log(1 + m) - sigma2 / 2;
  const sigma = Math.sqrt(sigma2);
  const inflow = new Map(plan.netInflows.map((f) => [f.age, f.amount]));
  const firstAge = Math.min(input.retirementAge, ...plan.netInflows.map((f) => f.age));
  const ages: number[] = [];
  for (let age = input.retirementAge; age <= input.targetAge; age += 1) ages.push(age);
  const paths: number[][] = ages.map(() => []);
  const random = rng(seed);
  let successes = 0;
  const growth = () => Math.exp(mu + sigma * normal(random));
  for (let run = 0; run < runs; run += 1) {
    let wealth = input.startWealth;
    for (let age = firstAge; age < input.retirementAge; age += 1) wealth = (wealth + (inflow.get(age) ?? 0)) * growth();
    let ok = true;
    ages.forEach((age, i) => {
      const deflator = Math.pow(1 + inflation, Math.max(0, age - input.currentAge));
      wealth += inflow.get(age) ?? 0;
      const planned = age < input.targetAge ? plan.annualDrawReal * drawFactor * deflator : 0;
      if (planned - wealth > 1) ok = false;
      wealth = Math.max(0, wealth - planned) * growth();
      paths[i].push(wealth / deflator);
    });
    if (ok) successes += 1;
  }
  const pct = (values: number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  };
  return {
    ages,
    p10: paths.map((v) => pct(v, 0.1)),
    p50: paths.map((v) => pct(v, 0.5)),
    p90: paths.map((v) => pct(v, 0.9)),
    successRate: successes / runs,
  };
}

/**
 * Monatliche Entnahme (heutige Franken), die mit der gewünschten Wahrscheinlichkeit bis zum
 * Zielalter reicht — Bisektion über den Entnahmefaktor mit festem Zufall.
 */
export function safeMonthlyDraw(
  input: PayoutPlanInput,
  plan: PayoutPlanResult,
  volatilityPercent: number,
  confidence = 0.9,
  runs = 500,
): number {
  if (plan.annualDrawReal <= 0) return 0;
  let lo = 0;
  let hi = 1.5;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    if (monteCarlo(input, plan, volatilityPercent, runs, mid).successRate >= confidence) lo = mid;
    else hi = mid;
  }
  return (plan.annualDrawReal * lo) / 12;
}

// ── Einkauf in die Pensionskasse (z. B. aus einer Abfindung) ───────────────

export type BvgBuyIn = { amount: number; paidAtAge: number; ratePercent: number };

/** Einkauf mit Zins bis zur Pensionierung; 0, wenn die Pensionierung vor der Einzahlung liegt */
export const bvgBuyInAtRetirement = (buyIn: BvgBuyIn | undefined, retireAt: number) =>
  buyIn && buyIn.amount > 0 && retireAt > buyIn.paidAtAge
    ? buyIn.amount * Math.pow(1 + buyIn.ratePercent / 100, retireAt - buyIn.paidAtAge)
    : 0;

/** Kapitalbezug innert 3 Jahren nach einem Einkauf ist gesperrt (BVG Art. 79b Abs. 3) */
export const buyInBlocksCapital = (buyIn: BvgBuyIn | undefined, retireAt: number) =>
  Boolean(buyIn && buyIn.amount > 0 && retireAt > buyIn.paidAtAge && retireAt - buyIn.paidAtAge < 3);

// ── AHV-Referenzalter (gesetzlich, AHV 21) ─────────────────────────────────

/**
 * Gesetzliches Referenzalter — nicht das geplante Pensionsalter. Frauen bis Jahrgang 1960: 64,
 * Übergang 1961 (64 + 3 Mte), 1962 (64 + 6), 1963 (64 + 9), ab 1964 wie Männer 65.
 * ponytail: ganze Jahre (1961 → 64, 1962/63 → 65); Monate erst, wenn das Modell monatsgenau rechnet.
 */
export function legalAhvReferenceAge(gender: string | null | undefined, birthYear: number | null | undefined): number {
  if (gender !== "female") return 65;
  if (!birthYear) return 65;
  return birthYear <= 1961 ? 64 : 65;
}

/**
 * Die AHV-Karte kürzt ihre Prognose bereits für das geplante Pensionsalter (Vorbezug 6.8 %/J.,
 * Aufschub 5.2 %/J., Abstand zum Referenzalter 2 %/J., Grenzen 0.70–1.31). Die Bezugsplanung braucht
 * die ungekürzte Rente und kürzt selbst ab dem tatsächlichen AHV-Beginn — sonst doppelt gekürzt.
 */
export function unreducedAhvFromCard(
  expectedAnnual: number, plannedAge: number, cardStatutoryAge: number, earlyYears = 0, lateYears = 0,
): number {
  const factor = Math.max(0.7, Math.min(1.31,
    1 - earlyYears * AHV_EARLY_REDUCTION_PER_YEAR + lateYears * AHV_LATE_INCREASE_PER_YEAR + (plannedAge - cardStatutoryAge) * 0.02));
  return expectedAnnual / factor;
}
