import React from "react";
import { useTranslation } from "react-i18next";
import {
  UBS_BVG_RETURN_MAX_PERCENT,
  UBS_BVG_RETURN_MIN_PERCENT,
  UBS_BVG_RETURN_STEP_PERCENT,
  MSCI_WORLD_RETURN_MAX_PERCENT,
  MSCI_WORLD_RETURN_MIN_PERCENT,
  MSCI_WORLD_RETURN_STEP_PERCENT,
} from "../constants/marketBenchmarks";
import { getDynamicAmountStep } from "../utils/dynamicAmountStep";
import { NotchedRange } from "./common/NotchedRange";

const formatChf = (value: number): string =>
  `CHF ${value.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type AnalysisInputsProps = {
  netAvailableLimitChf: number;
  pensionDeposit: number;
  savingsAmount: number;
  payoutDirect: number;
  returnPensionFund: number;
  returnSavingsPortf: number;
  maturityLabel: string;
  maturityMonth: number | null;
  maturityYear: number | null;
  onMaturityChange: (month: number | null, year: number | null) => void;
  pensionProjectedCapitalChf: number;
  pensionProjectedGainChf: number;
  pensionProjectionYears: number;
  capitalWithdrawalLocked?: boolean;
  onPensionDepositChange: (value: number) => void;
  onSavingsAmountChange: (value: number) => void;
  onPayoutDirectChange: (value: number) => void;
  onReturnPensionFundChange: (value: number) => void;
  onReturnSavingsPortfChange: (value: number) => void;
};

export const AnalysisInputs: React.FC<AnalysisInputsProps> = ({
  netAvailableLimitChf,
  pensionDeposit,
  savingsAmount,
  payoutDirect,
  returnPensionFund,
  returnSavingsPortf,
  maturityLabel,
  maturityMonth,
  maturityYear,
  onMaturityChange,
  pensionProjectedCapitalChf,
  pensionProjectedGainChf,
  pensionProjectionYears,
  capitalWithdrawalLocked = false,
  onPensionDepositChange,
  onSavingsAmountChange,
  onPayoutDirectChange,
  onReturnPensionFundChange,
  onReturnSavingsPortfChange,
}) => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const years = Math.max(0, pensionProjectionYears);
  const savingsFutureValue = savingsAmount * Math.pow(1 + returnSavingsPortf / 100, years);
  const taxOptimizedPayout = Math.max(0, payoutDirect);
  const totalAllocated = pensionDeposit + savingsAmount + payoutDirect;
  const overLimit = totalAllocated > netAvailableLimitChf;

  return (
    <section className="allocation-analysis-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-cyan-100">{t("analysisInputs.gridTitle")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Zeitpunkt der Auszahlung/Verwendung — gleicher Wert wie die Fälligkeit in der Abfindungs-Karte */}
          <label className="flex items-center gap-2 text-xs text-cyan-100">
            {t("analysisInputs.usedFrom")}
            <select
              className="input-field !w-auto py-1 text-xs"
              value={maturityMonth ?? ""}
              onChange={(event) => onMaturityChange(event.target.value ? Number(event.target.value) : null, maturityYear)}
            >
              <option value="">–</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
              ))}
            </select>
            <input
              type="number"
              min={currentYear}
              max={currentYear + 30}
              className="input-field !w-20 py-1 text-xs"
              value={maturityYear ?? ""}
              placeholder={String(currentYear)}
              onChange={(event) => onMaturityChange(maturityMonth, event.target.value ? Number(event.target.value) : null)}
            />
          </label>
          <span className="rounded border border-slate-700 bg-surface-2 px-2 py-1 text-xs text-slate-200">
            {t("analysisInputs.netAvailable")}: {formatChf(netAvailableLimitChf)}
          </span>
        </div>
      </div>
      <div className="allocation-analysis-grid">
        <div className="allocation-analysis-column">
          <label className="input-label">{t("analysisInputs.column1.label")} (CHF)</label>
          <input
            type="number"
            min={0}
            step={getDynamicAmountStep(pensionDeposit)}
            className="input-field input-field--amount"
            value={Math.round(pensionDeposit)}
            onChange={(event) => onPensionDepositChange(Number(event.target.value) || 0)}
          />
          <div className="mt-2 grid gap-2">
            <label className="range-label" htmlFor="pk-rate">{t("analysisInputs.column1.sliderLabel")}</label>
            <NotchedRange
              id="pk-rate"
              min={UBS_BVG_RETURN_MIN_PERCENT}
              max={UBS_BVG_RETURN_MAX_PERCENT}
              step={UBS_BVG_RETURN_STEP_PERCENT}
              value={returnPensionFund}
              onValueChange={onReturnPensionFundChange}
            />
            <div className="range-foot">
              <span>{t("analysisInputs.currentValue")}: <strong>{returnPensionFund.toFixed(2)} %</strong></span>
              <span>{t("analysisInputs.vsBvgMinimum", { delta: `${returnPensionFund >= 1.25 ? "+" : "−"}${Math.abs(returnPensionFund - 1.25).toFixed(2)}` })}</span>
            </div>
          </div>
          <div className="analysis-info-right">
            <p>{t("analysisInputs.impactDisplay")}</p>
            <span className="analysis-info-amount">{formatChf(pensionProjectedCapitalChf)}</span>
            <small>{t("analysisInputs.pensionGain")}: {formatChf(pensionProjectedGainChf)}</small>
            <small>
              {t("analysisInputs.paidIn", { date: maturityLabel || t("analysisInputs.now") })} · {t("analysisInputs.horizonYears")}:{" "}
              {years.toLocaleString("de-CH", { maximumFractionDigits: 1 })} {t("analysisInputs.years")}
            </small>
          </div>
          {capitalWithdrawalLocked && pensionDeposit > 0 && (
            <div className="mt-2 rounded border border-amber-500/50 bg-amber-900/25 px-2 py-1 text-2xs text-amber-200">
              {t("payoutPlan.buyInLock")}
            </div>
          )}
        </div>

        <div className="allocation-analysis-column">
          <label className="input-label">{t("analysisInputs.column2.label")} (CHF)</label>
          <input
            type="number"
            min={0}
            step={getDynamicAmountStep(savingsAmount)}
            className="input-field input-field--amount"
            value={Math.round(savingsAmount)}
            onChange={(event) => onSavingsAmountChange(Number(event.target.value) || 0)}
          />
          <div className="mt-2 space-y-1">
            <label className="input-label">{t("analysisInputs.column2.sliderLabel")}</label>
            <NotchedRange
              min={MSCI_WORLD_RETURN_MIN_PERCENT}
              max={MSCI_WORLD_RETURN_MAX_PERCENT}
              step={MSCI_WORLD_RETURN_STEP_PERCENT}
              value={returnSavingsPortf}
              onChange={(event) => onReturnSavingsPortfChange(Number(event.target.value))}
            />
            <p className="text-xs text-indigo-200">{t("analysisInputs.currentValue")}: {returnSavingsPortf.toFixed(1)}%</p>
          </div>
          <div className="analysis-info-right">
            <p>{t("analysisInputs.savingsImpact")}</p>
            <span className="analysis-info-amount">{formatChf(savingsFutureValue)}</span>
            <small>{t("analysisInputs.savingsGain")}: {formatChf(savingsFutureValue - savingsAmount)}</small>
            <small>
              {t("analysisInputs.paidIn", { date: maturityLabel || t("analysisInputs.now") })} · {t("analysisInputs.horizonYears")}:{" "}
              {years.toLocaleString("de-CH", { maximumFractionDigits: 1 })} {t("analysisInputs.years")}
            </small>
            <small>{t("analysisInputs.msciDefaultValue")}</small>
          </div>
        </div>

        <div className="allocation-analysis-column">
          <label className="input-label">{t("analysisInputs.column3.label")} (CHF)</label>
          <input
            type="number"
            min={0}
            step={getDynamicAmountStep(payoutDirect)}
            className="input-field input-field--amount"
            value={Math.round(payoutDirect)}
            onChange={(event) => onPayoutDirectChange(Number(event.target.value) || 0)}
          />
          <div className="analysis-info-right">
            <p>{t("analysisInputs.taxOptimizedPayout")}</p>
            <span className="analysis-info-amount">{formatChf(taxOptimizedPayout)}</span>
            <small>{t("analysisInputs.maturity")}: {maturityLabel}</small>
          </div>
          {overLimit && (
            <div className="mt-2 rounded border border-rose-500/50 bg-rose-900/25 px-2 py-1 text-2xs text-rose-200 text-right">
              {t("analysisInputs.limitExceeded")}: {formatChf(totalAllocated - netAvailableLimitChf)}.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
