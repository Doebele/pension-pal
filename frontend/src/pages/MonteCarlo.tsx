import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getDynamicAmountStep } from "../utils/dynamicAmountStep";
import { CHART_CATEGORICAL, useChartThemeColors } from "../constants/chartColors";

type Bucket = { label: string; count: number };

function randomNormal(mean = 0, stdDev = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdDev + mean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

export const MonteCarlo: React.FC = () => {
  const { t } = useTranslation();
  const chartThemeColors = useChartThemeColors();
  const [runs, setRuns] = useState(3000);
  const [years, setYears] = useState(35);
  const [startCapital, setStartCapital] = useState(350000);
  const [annualContribution, setAnnualContribution] = useState(12000);
  const [expectedReturn, setExpectedReturn] = useState(4.5);
  const [volatility, setVolatility] = useState(10);
  const [inflation, setInflation] = useState(2);

  const simulation = useMemo(() => {
    const finals: number[] = [];
    const mean = expectedReturn / 100;
    const sigma = volatility / 100;
    const infl = inflation / 100;

    for (let i = 0; i < runs; i++) {
      let capital = startCapital;
      for (let y = 0; y < years; y++) {
        const annualReturn = randomNormal(mean, sigma);
        capital = (capital + annualContribution) * (1 + annualReturn);
      }
      const realValue = capital / Math.pow(1 + infl, years);
      finals.push(Math.max(0, realValue));
    }

    finals.sort((a, b) => a - b);
    const p10 = percentile(finals, 0.1);
    const p50 = percentile(finals, 0.5);
    const p90 = percentile(finals, 0.9);

    const min = finals[0] ?? 0;
    const max = finals[finals.length - 1] ?? 0;
    const bucketCount = 16;
    const size = Math.max(1, (max - min) / bucketCount);
    const buckets = Array.from({ length: bucketCount }, (_, idx) => ({
      label: `${Math.round((min + idx * size) / 1000)}k`,
      count: 0,
    }));

    for (const value of finals) {
      const idx = Math.min(bucketCount - 1, Math.floor((value - min) / size));
      buckets[idx].count += 1;
    }

    return { p10, p50, p90, buckets };
  }, [runs, years, startCapital, annualContribution, expectedReturn, volatility, inflation]);

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h1 className="text-xl font-light text-slate-50">{t("montecarlo.title")}</h1>
        <p className="text-sm text-slate-400">{t("montecarlo.subtitle")}</p>
      </header>

      <section className="grid gap-3 rounded-xl border border-slate-700 bg-surface p-section text-sm sm:grid-cols-4">
        <div>
          <label className="input-label">{t("montecarlo.runs")}</label>
          <input className="input-field" type="number" value={runs} min={500} max={20000} step={500} onChange={(e) => setRuns(Number(e.target.value) || 3000)} />
        </div>
        <div>
          <label className="input-label">{t("montecarlo.years")}</label>
          <input className="input-field" type="number" value={years} min={5} max={50} onChange={(e) => setYears(Number(e.target.value) || 35)} />
        </div>
        <div>
          <label className="input-label">{t("montecarlo.startCapital")}</label>
          <input className="input-field input-field--amount" type="number" step={getDynamicAmountStep(startCapital)} value={startCapital} onChange={(e) => setStartCapital(Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="input-label">{t("montecarlo.contribution")}</label>
          <input className="input-field input-field--amount" type="number" step={getDynamicAmountStep(annualContribution)} value={annualContribution} onChange={(e) => setAnnualContribution(Number(e.target.value) || 0)} />
        </div>

        <div>
          <label className="input-label">{t("montecarlo.expectedReturn")}</label>
          <input className="input-field" type="number" step={0.1} value={expectedReturn} onChange={(e) => setExpectedReturn(Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="input-label">{t("montecarlo.volatility")}</label>
          <input className="input-field" type="number" step={0.1} value={volatility} onChange={(e) => setVolatility(Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="input-label">{t("montecarlo.inflation")}</label>
          <input className="input-field" type="number" step={0.1} value={inflation} onChange={(e) => setInflation(Number(e.target.value) || 0)} />
        </div>
      </section>

      <section className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
          <div className="text-slate-400">{t("montecarlo.p10")}</div>
          <div className="mt-1 text-2xl font-light text-slate-100">CHF {Math.round(simulation.p10).toLocaleString("de-CH")}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
          <div className="text-slate-400">{t("montecarlo.p50")}</div>
          <div className="mt-1 text-2xl font-light text-blue-300">CHF {Math.round(simulation.p50).toLocaleString("de-CH")}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
          <div className="text-slate-400">{t("montecarlo.p90")}</div>
          <div className="mt-1 text-2xl font-light text-emerald-300">CHF {Math.round(simulation.p90).toLocaleString("de-CH")}</div>
        </div>
      </section>

      <section className="h-80 rounded-xl border border-slate-700 bg-surface p-section">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">{t("montecarlo.distribution")}</h2>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={simulation.buckets} margin={{ top: 12, right: 16, left: 8, bottom: 20 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: chartThemeColors.surface2, border: `1px solid ${chartThemeColors.border}`, borderRadius: 8, fontSize: "var(--fs-xs)", color: chartThemeColors.fg1 }}
              formatter={(value: number) => [value, t("montecarlo.runCount")]}
            />
            <Bar dataKey="count" fill={CHART_CATEGORICAL[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
};

