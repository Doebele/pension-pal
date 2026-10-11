// Selbsttest der Bezugsplanung. Ausführen: npm run check:payout (Node 22, ohne Build)
import assert from "node:assert/strict";
import { ahvFactor, ahvStartAgeFor, buyInBlocksCapital, bvgBuyInAtRetirement, capitalWithdrawalTax, legalAhvReferenceAge, unreducedAhvFromCard, monteCarlo, portfolioStats, safeMonthlyDraw, simulatePayoutPlan, type PayoutPlanInput } from "./payoutPlanning.ts";
import { medianWealth, retireeIncomeMonthly } from "./swissMedians.ts";
import taxTables from "../data/capitalTaxTables.json" with { type: "json" };

// 1. Rasterpunkte treffen die ESTV-Werte exakt
const tg = taxTables.cantons.TG.married.find((p) => p.amount === 100_000)!;
assert.equal(capitalWithdrawalTax(100_000, "TG", "married").total, tg.federal + tg.cantonal + tg.municipal);

// 2. Progression: grössere Beträge zahlen einen höheren Satz; zwischen Punkten liegt die Steuer dazwischen
const low = capitalWithdrawalTax(100_000, "TG", "married");
const high = capitalWithdrawalTax(500_000, "TG", "married");
assert.ok(high.ratePercent > low.ratePercent, "Progression fehlt");
const mid = capitalWithdrawalTax(120_000, "TG", "married").total;
assert.ok(mid > capitalWithdrawalTax(100_000, "TG", "married").total && mid < capitalWithdrawalTax(150_000, "TG", "married").total);
assert.equal(capitalWithdrawalTax(0, "TG", "single").total, 0);

const base: PayoutPlanInput = {
  currentAge: 57, currentYear: 2026, retirementAge: 63, targetAge: 90, referenceAge: 65,
  canton: "TG", relationship: "married", inflationPercent: 1.5,
  ahvAnnual: 28_000,
  bvg: { capitalAtRetirement: 600_000, conversionRatePercent: 5.2, capitalSharePercent: 50 },
  pillar3a: [
    { label: "3a A", balance: 100_000, returnPercent: 3, payoutAge: 63 },
    { label: "3a B", balance: 100_000, returnPercent: 3, payoutAge: 63 },
  ],
  life: { maturityAge: 65, capital: 80_000, annualPension: 5_000, mode: "capital" },
  startWealth: 0, investmentReturnPercent: 4,
};

// 3. Gestaffelter 3a-Bezug (andere Jahre als das BVG-Kapital) spart Steuern gegenüber allem in einem Jahr
const together = simulatePayoutPlan(base);
const staggered = simulatePayoutPlan({
  ...base,
  pillar3a: [{ ...base.pillar3a[0], payoutAge: 60 }, { ...base.pillar3a[1], payoutAge: 61 }],
});
assert.ok(staggered.totalCapitalTax < together.totalCapitalTax, "Staffelung spart keine Steuern");

// 4. Das Kapital reicht bis zum Zielalter und ist dann aufgebraucht (ohne Engpass)
assert.ok(together.wealthAtTargetReal < 1_000, `Restvermögen ${together.wealthAtTargetReal}`);
assert.ok(together.years.every((y) => y.wealthEnd >= 0));

// 5. 100 % Rente: keine Kapitalsteuer auf das BVG, höhere Rente
const pension = simulatePayoutPlan({ ...base, bvg: { ...base.bvg, capitalSharePercent: 0 }, pillar3a: [], life: undefined });
assert.equal(pension.totalCapitalTax, 0);
assert.equal(pension.bvgAnnualPension, 600_000 * 0.052);

// 6. 3b als Rente: kein Kapital, Rente ab Ablauf
const lifePension = simulatePayoutPlan({ ...base, life: { ...base.life!, mode: "pension" } });
assert.equal(lifePension.years.find((y) => y.age === 64)!.lifePension, 0);
assert.equal(lifePension.years.find((y) => y.age === 65)!.lifePension, 5_000);

// 7. Portfolio: ein Topf = seine Werte; zwei Töpfe mit Korrelation < 1 schwanken weniger als ihr Mittel
const one = portfolioStats([{ id: "a", profile: "balanced", sharePercent: 100, returnPercent: 3.5, volatilityPercent: 8, terPercent: 0.5 }]);
assert.ok(Math.abs(one.netReturnPercent - 3) < 1e-9 && Math.abs(one.volatilityPercent - 8) < 1e-9);
const two = portfolioStats([
  { id: "a", profile: "cash", sharePercent: 50, returnPercent: 0.5, volatilityPercent: 0.5, terPercent: 0 },
  { id: "b", profile: "worldEquity", sharePercent: 50, returnPercent: 6, volatilityPercent: 15, terPercent: 0.2 },
]);
assert.ok(Math.abs(two.netReturnPercent - 3.15) < 1e-9);
assert.ok(two.volatilityPercent < (0.5 + 15) / 2);

// 8. Monte Carlo ohne Schwankung = deterministischer Plan; gleicher Seed = gleiches Ergebnis
const capitalPlan = { ...base, bvg: { ...base.bvg, capitalSharePercent: 100 } };
const det = simulatePayoutPlan(capitalPlan);
const flat = monteCarlo(capitalPlan, det, 0.0001, 50);
const detAt75 = det.years.find((y) => y.age === 75)!;
assert.ok(Math.abs(flat.p50[flat.ages.indexOf(75)] - detAt75.wealthEnd / detAt75.deflator) < 50, "MC ohne Volatilität weicht ab");
assert.deepEqual(monteCarlo(capitalPlan, det, 12, 200), monteCarlo(capitalPlan, det, 12, 200));

// 9. Mit Schwankung: eine Entnahme, die mit 90 % reicht, ist tiefer als die geplante (die im Mittel genau aufgeht)
const volatile = monteCarlo(capitalPlan, det, 12, 500);
assert.ok(volatile.successRate < 0.9 && volatile.p10[10] < volatile.p90[10]);
const safe = safeMonthlyDraw(capitalPlan, det, 12, 0.9);
assert.ok(safe > 0 && safe < det.monthlyDrawReal, `sichere Entnahme ${safe} vs ${det.monthlyDrawReal}`);
assert.ok(monteCarlo(capitalPlan, det, 12, 500, (safe * 12) / det.annualDrawReal).successRate >= 0.88);

// 10. Frühpensionierung: AHV frühestens 2 Jahre vor dem Referenzalter, vorher keine AHV
assert.equal(ahvStartAgeFor(60, 65), 63);
assert.equal(ahvStartAgeFor(66, 65), 66);
assert.ok(Math.abs(ahvFactor(63, 65) - (1 - 2 * 0.068)) < 1e-9 && ahvFactor(65, 65) === 1);
const early = simulatePayoutPlan({ ...base, retirementAge: 60, ahvStartAge: 63 });
assert.equal(early.years.find((y) => y.age === 62)!.ahv, 0);
assert.ok(early.years.find((y) => y.age === 63)!.ahv > 0);

// 11. Medianwerte: Einkommen SILC 2018 (Paar × 1.5), Vermögen nach Alter bis 74, zwischen den Gruppen interpoliert
assert.ok(Math.abs(retireeIncomeMonthly(false) - 44_899 / 12) < 1e-9);
assert.ok(Math.abs(retireeIncomeMonthly(true) - (44_899 / 12) * 1.5) < 1e-9);
assert.equal(medianWealth(70, false), 240_700);
assert.equal(medianWealth(80, false), null);
const w60 = medianWealth(60, false)!;
assert.ok(w60 > 104_600 && w60 < 240_700);

// 12. Einkauf aus der Abfindung: Zins ab Einzahlung, 3-Jahres-Sperre für Kapitalbezug
const buyIn = { amount: 100_000, paidAtAge: 61.25, ratePercent: 1.25 };
assert.ok(Math.abs(bvgBuyInAtRetirement(buyIn, 64) - 100_000 * Math.pow(1.0125, 2.75)) < 1e-6);
assert.equal(bvgBuyInAtRetirement(buyIn, 61), 0); // vor der Einzahlung pensioniert
assert.equal(buyInBlocksCapital(buyIn, 64), true); // 2.75 Jahre < 3
assert.equal(buyInBlocksCapital(buyIn, 65), false);

// 13. Gesetzliches Referenzalter und ungekürzte AHV aus der Karte
assert.equal(legalAhvReferenceAge("male", 1969), 65);
assert.equal(legalAhvReferenceAge("female", 1960), 64);
assert.equal(legalAhvReferenceAge("female", 1964), 65);
assert.ok(Math.abs(unreducedAhvFromCard(19_752, 60, 65) - 19_752 / 0.9) < 1e-9); // Karte: −5 J. × 2 %
assert.equal(unreducedAhvFromCard(24_000, 65, 65), 24_000);

// 14. Herkunft des Anlagekapitals: Summe netto = Zuflüsse netto, Steuer vollständig verteilt
{
  const plan = simulatePayoutPlan({ ...base, startWealth: 50_000 });
  const net = plan.inflows.reduce((sum, f) => sum + f.net, 0);
  const tax = plan.inflows.reduce((sum, f) => sum + f.tax, 0);
  assert.ok(Math.abs(net - (plan.netInflows.reduce((sum, f) => sum + f.amount, 0) + 50_000)) < 1e-6);
  assert.ok(Math.abs(tax - plan.totalCapitalTax) < 1e-6);
  assert.ok(plan.inflows.some((f) => f.source === "start"));
}

console.log("payoutPlanning: ok", {
  steuerZusammen: together.totalCapitalTax, steuerGestaffelt: staggered.totalCapitalTax,
  monatlichBeiPensionierung: Math.round(together.monthlyAtRetirementReal),
  entnahmeGeplant: Math.round(det.monthlyDrawReal), entnahmeSicher90: Math.round(safe), erfolgGeplant: volatile.successRate,
});

// AHV-Beitragsgeschichte: Lücken (0) und doppelte Jahre zählen nicht, künftige Jahre nur bis zum Referenzalter,
// ein kumuliertes «Total» ist kein Jahresbeitrag
{
  const { ahvHistoryStats, estimateAhvAnnualPension } = await import("./ahvEstimate.ts");
  const row = (year: string, income: string, total = "", age = "") =>
    ({ year, annualIncomeChf: income, contributionTotalChf: total, ageEndOfYear: age, ahvRentShareChf: "" });
  const stats = ahvHistoryStats([
    row("2020", "80'000", "4000"), row("2021", "0", "80000"), row("2022", "100000", "180000"), row("2022", "100000"),
    row("", "50000"),
    row("2027", "0", "180000", "64"), row("2028", "0", "180000", "65"), row("2029", "0", "", "66"),
  ], { currentYear: 2026 });
  assert.equal(stats.contributionYears, 3); // 2020, 2022, 2027 (Beitragspflicht bis 64)
  assert.equal(stats.averageIncome, 90_000);
  assert.equal(stats.averageContribution, Math.round(90_000 * 0.087)); // 180'000 > Einkommen: Spalte kumuliert → AHV-Satz
  assert.equal(ahvHistoryStats([row("2020", "80000", "6960"), row("2021", "100000", "8700")], { currentYear: 2026 }).averageContribution, 7830);
  assert.equal(stats.hasDetailedHistory, true);
  // Ohne Altersspalte zählt das Geburtsjahr
  assert.equal(ahvHistoryStats([row("2030", "0")], { currentYear: 2026, birthYear: 1968 }).contributionYears, 1);
  assert.equal(ahvHistoryStats([row("2034", "0")], { currentYear: 2026, birthYear: 1968 }).contributionYears, 0);
  // Eine Lücke weniger senkt die Rente proportional (Skala 44)
  const { ahvTiming } = await import("./ahvEstimate.ts");
  const full = estimateAhvAnnualPension({ averageIncome: 90_000, contributionYears: 44, plannedAge: 65, referenceAge: 65, gender: "male" });
  const gap = estimateAhvAnnualPension({ averageIncome: 90_000, contributionYears: 43, plannedAge: 65, referenceAge: 65, gender: "male" });
  assert.equal(full, 29_400);
  assert.equal(gap, Math.round(29_400 * 43 / 44));
  // Bezug wie in der Bezugsplanung: Pensionierung mit 60 → AHV ab 63 (2 Jahre Vorbezug), nicht mehr
  assert.deepEqual(ahvTiming(60, 65), { startAge: 63, earlyYears: 2, lateYears: 0, factor: 1 - 2 * 0.068 });
  assert.equal(ahvTiming(67, 65).lateYears, 2);
  assert.equal(ahvTiming(72, 65).lateYears, 5);
  assert.equal(estimateAhvAnnualPension({ averageIncome: 90_000, contributionYears: 44, plannedAge: 60, referenceAge: 65, gender: "male" }), Math.round(29_400 * 0.864));
}
