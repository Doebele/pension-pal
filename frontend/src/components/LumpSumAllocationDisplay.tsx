import React from "react";
import { useLumpSumAllocation } from "../hooks/useLumpSumAllocation";
import { getTaxRateAtMaturity, getUbsPensionFundYieldForMaturity } from "../store/constants/taxAndYieldConfig";
import { getDynamicAmountStep } from "../utils/dynamicAmountStep";
import { NotchedRange } from "./common/NotchedRange";

const formatChf = (value: number): string =>
  `CHF ${value.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type LumpSumAllocationDisplayProps = {
  grossLumpSumChf: number;
  baseTaxRatePercent: number;
  maturityMonth: number | null;
  maturityYear: number | null;
  initialDepositPensionChf: number;
  initialMutualFundsChf: number;
  initialDirectPayoutChf: number;
  onChange: (next: {
    depositPensionChf: number;
    mutualFundsChf: number;
    directPayoutChf: number;
  }) => void;
};

const ADJUSTMENT_HINTS: Record<string, string> = {
  none: "Verteilung ist innerhalb des Netto-Limits stabil.",
  mutual_funds_clamped: "Mutual Funds angepasst, damit Netto-Limit nicht überschritten wird.",
  deposit_clamped: "Pensionskassen-Einlage angepasst, um das Netto-Limit einzuhalten.",
  direct_payout_clamped: "Direktauszahlung angepasst, um das Netto-Limit einzuhalten.",
};

export const LumpSumAllocationDisplay: React.FC<LumpSumAllocationDisplayProps> = ({
  grossLumpSumChf,
  baseTaxRatePercent,
  maturityMonth,
  maturityYear,
  initialDepositPensionChf,
  initialMutualFundsChf,
  initialDirectPayoutChf,
  onChange,
}) => {
  const maturityTaxRate = getTaxRateAtMaturity(baseTaxRatePercent, maturityYear);
  const netLumpSumLimitChf = Math.max(0, grossLumpSumChf * (1 - maturityTaxRate / 100));
  const pensionYield = getUbsPensionFundYieldForMaturity(maturityYear);
  const {
    limit,
    depositPensionChf,
    mutualFundsChf,
    directPayoutChf,
    adjustmentReason,
    onChangeMutualFunds,
    onChangeDepositPension,
    onChangeDirectPayout,
  } = useLumpSumAllocation({
    netLumpSumLimitChf,
    initialDepositPensionChf,
    initialMutualFundsChf,
    initialDirectPayoutChf,
  });

  React.useEffect(() => {
    onChange({
      depositPensionChf,
      mutualFundsChf,
      directPayoutChf,
    });
  }, [depositPensionChf, directPayoutChf, mutualFundsChf, onChange]);

  const maturityLabel = maturityMonth && maturityYear
    ? `${String(maturityMonth).padStart(2, "0")}.${maturityYear}`
    : maturityYear
    ? `${maturityYear}`
    : "nicht gesetzt";

  return (
    <section className="rounded-xl border border-slate-700 bg-surface p-section">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-cyan-100">Lump sum usage</h2>
        <span className="rounded border border-slate-700 bg-surface-2 px-2 py-1 text-xs text-slate-200">
          Netto-Limit: {formatChf(limit)}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-xs text-slate-200">
            Amount to Deposit in Pension Fund (Pensionskasse)
            <input
              type="number"
              min={0}
              max={limit}
              step={getDynamicAmountStep(depositPensionChf)}
              className="input-field mt-1 input-field--amount"
              value={Math.round(depositPensionChf)}
              onChange={(event) => onChangeDepositPension(Number(event.target.value) || 0)}
            />
          </label>
          <label className="block text-xs text-slate-200">
            Amount for Mutual Funds/Savings
            <NotchedRange
              min={0}
              max={Math.max(0, Math.round(limit))}
              step={100}
              className="mt-1"
              value={Math.round(mutualFundsChf)}
              onChange={(event) => onChangeMutualFunds(Number(event.target.value) || 0)}
            />
            <span className="mt-1 block text-cyan-100">{formatChf(mutualFundsChf)}</span>
          </label>
          <label className="block text-xs text-slate-200">
            Payout Amount (Direct/Investment)
            <input
              type="number"
              min={0}
              max={limit}
              step={getDynamicAmountStep(directPayoutChf)}
              className="input-field mt-1 input-field--amount"
              value={Math.round(directPayoutChf)}
              onChange={(event) => onChangeDirectPayout(Number(event.target.value) || 0)}
            />
          </label>
        </div>
        <div className="space-y-2 rounded-lg border border-slate-700 bg-surface-2 p-box text-xs text-slate-200">
          <p>
            Constraint: Total Allocation ≤ Lump Sum - Tax
          </p>
          <p>Gross Amount: {formatChf(grossLumpSumChf)}</p>
          <p>Tax rate at maturity ({maturityLabel}): {maturityTaxRate.toFixed(2)}%</p>
          <p>Tax amount at maturity: {formatChf(Math.max(0, grossLumpSumChf - netLumpSumLimitChf))}</p>
          <p>UBS Pension Fund yield (assumed): {(pensionYield * 100).toFixed(2)}% p.a.</p>
          <p className="rounded border border-slate-700 bg-surface-2 px-2 py-1 text-slate-200">
            {ADJUSTMENT_HINTS[adjustmentReason] || ADJUSTMENT_HINTS.none}
          </p>
        </div>
      </div>
    </section>
  );
};
