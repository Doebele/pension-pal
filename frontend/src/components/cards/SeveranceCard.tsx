import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DirtySaveButton } from "../common/DirtySaveButton";
import { FieldHelpLabel } from "../common/FieldHelpLabel";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { getWithdrawalTaxRateForCanton } from "../../services/swissTax";
import { OverviewRowList } from "../dashboard/OverviewRowList";
import type { ProfileGender } from "../../types/personalDataTypes";

type UsagePurpose = "pillar2" | "etf" | "ubs58plus" | "cash";
type EtfRiskLevel = "low" | "medium" | "high";
type UbsProductType = "money_market" | "mixed_fund" | "pension_product";
type SeveranceCalculationType = "fixed" | "formula";
type SeveranceFormulaModel = "tenure_salary_days" | "or339b_months" | "reference_age_formula";
type SeveranceProviderPreset = "general" | "ubs" | "social_plan";

export type SeveranceState = {
  amountChf: string;
  isGrossAmount: boolean;
  severanceType: SeveranceCalculationType;
  providerPreset: SeveranceProviderPreset;
  formulaModel: SeveranceFormulaModel;
  payoutYear: string;
  maturityMonth: string;
  maturityYear: string;
  allocationPensionChf: string;
  allocationMutualFundsChf: string;
  allocationDirectPayoutChf: string;
  // Backward compatibility fields (kept in state for persisted data migration).
  clientName: string;
  employmentStartDate: string;
  employmentEndDate: string;
  startCalculationDay: string;
  startCalculationMonth: string;
  startCalculationYear: string;
  lastAnnualSalaryChf: string;
  formulaDayFactor: string;
  formulaMonthFactor: string;
  employer: string;
  usagePurpose: UsagePurpose;
  etfRiskLevel: EtfRiskLevel;
  ubsProductType: UbsProductType;
  annualFeePercent: string;
  planDurationYears: string;
  returnScenarioAdjustment: string;
};

type SeveranceCardProps = {
  data: SeveranceState;
  taxDomicileCanton: string;
  profileGender: ProfileGender;
  profileBirthDate?: string;
  isActive: boolean;
  onChange: (field: keyof SeveranceState, value: string | boolean) => void;
  onSave: () => Promise<void> | void;
};

const parseNumber = (raw: string): number => {
  const cleaned = raw.replace(/['\s]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const SeveranceCard: React.FC<SeveranceCardProps> = ({
  data,
  taxDomicileCanton,
  profileGender,
  profileBirthDate,
  isActive,
  onChange,
  onSave,
}) => {
  const { t } = useTranslation();
  const { isDirty, isSaving, savedState, handleSave, markUserInteraction } = useFormPersistence(
    data,
    onSave,
  );
  const currentYear = new Date().getFullYear();
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = Array.from({ length: 25 }, (_, i) => currentYear + i);
  const formulaAmount = useMemo(() => {
    if (data.severanceType !== "formula") return 0;
    const salary = Math.max(0, parseNumber(data.lastAnnualSalaryChf));
    if (!salary) return 0;
    if (data.formulaModel === "or339b_months") {
      const monthFactor = Math.max(2, Math.min(8, parseNumber(data.formulaMonthFactor) || 2));
      return (salary / 12) * monthFactor;
    }
    if (data.formulaModel === "reference_age_formula") {
      if (!profileBirthDate) return 0;
      const birthDate = new Date(profileBirthDate);
      if (Number.isNaN(birthDate.getTime())) return 0;
      const startMonth = Number(data.maturityMonth || data.startCalculationMonth || 0);
      const startYear = Number(data.maturityYear || data.startCalculationYear || 0);
      if (!startMonth || !startYear) return 0;
      const startDate = new Date(startYear, startMonth - 1, 1);
      const referenceAge = profileGender === "female" ? 64 : 65;
      const referenceDate = new Date(
        birthDate.getFullYear() + referenceAge,
        birthDate.getMonth(),
        birthDate.getDate(),
      );
      const months = Math.max(
        0,
        (referenceDate.getFullYear() - startDate.getFullYear()) * 12
          + (referenceDate.getMonth() - startDate.getMonth())
          - (referenceDate.getDate() < startDate.getDate() ? 1 : 0),
      );
      const part1 = months * ((0.15 * salary) / 12);
      const part2 = months * 2450;
      return part1 + part2;
    }
    const startDate = new Date(data.employmentStartDate);
    const endDate = new Date(data.employmentEndDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
      return 0;
    }
    const tenureYears = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (!tenureYears || tenureYears <= 0) return 0;
    const dayFactor = Math.max(1, Math.min(60, parseNumber(data.formulaDayFactor) || 30));
    return salary * tenureYears * (dayFactor / 360);
  }, [
    data.employmentEndDate,
    data.employmentStartDate,
    data.formulaDayFactor,
    data.formulaModel,
    data.formulaMonthFactor,
    data.lastAnnualSalaryChf,
    data.maturityMonth,
    data.maturityYear,
    data.severanceType,
    data.startCalculationMonth,
    data.startCalculationYear,
    profileBirthDate,
    profileGender,
  ]);
  const amount = useMemo(
    () => (data.severanceType === "formula" ? formulaAmount : Math.max(0, parseNumber(data.amountChf))),
    [data.amountChf, data.severanceType, formulaAmount],
  );
  const baseTaxRate = useMemo(() => {
    const fromCanton = getWithdrawalTaxRateForCanton(taxDomicileCanton || "");
    return fromCanton ?? 7.2;
  }, [taxDomicileCanton]);
  const taxAmount = useMemo(
    () => (data.isGrossAmount ? amount * (baseTaxRate / 100) : 0),
    [amount, baseTaxRate, data.isGrossAmount],
  );
  const netAmount = useMemo(
    () => (data.isGrossAmount ? Math.max(0, amount - taxAmount) : amount),
    [amount, data.isGrossAmount, taxAmount],
  );

  if (!isActive) {
    return (
      <OverviewRowList
        rows={[
          { label: t("severance.overview.gross"), value: `CHF ${Math.round(amount).toLocaleString("de-CH")}` },
          { label: t("severance.overview.net"), value: `CHF ${Math.round(netAmount).toLocaleString("de-CH")}` },
          { label: t("severance.overview.maturity"), value: data.maturityMonth && data.maturityYear ? `${data.maturityMonth}.${data.maturityYear}` : t("severance.notSet") },
        ]}
      />
    );
  }

  return (
    <div className="form-card space-y-3">
      <p className="text-sm text-slate-300">{t("severance.intro")}</p>
      <div className="form-grid-3">
        <div className="col-span-3 rounded border border-slate-700 bg-surface-2 px-3 py-2">
          <p className="mb-2 text-xs text-slate-300">{t("severance.entryType")}</p>
          <div className="seg-row max-w-xs">
            <button
              type="button"
              className={`seg-btn${data.severanceType === "fixed" ? " active" : ""}`}
              onClick={() => {
                markUserInteraction();
                onChange("severanceType", "fixed");
              }}
            >
              {t("severance.exact")}
            </button>
            <button
              type="button"
              className={`seg-btn${data.severanceType === "formula" ? " active" : ""}`}
              onClick={() => {
                markUserInteraction();
                onChange("severanceType", "formula");
              }}
            >
              {t("severance.calculate")}
            </button>
          </div>
        </div>
        {data.severanceType === "fixed" ? (
        <div className="space-y-2">
          <FieldHelpLabel
            id="severance-amount"
            label={t("severance.amount.label")}
            helpText={t("severance.amount.help")}
          />
          <input
            id="severance-amount"
            className="input-field input-field--amount"
            inputMode="numeric"
            value={data.amountChf}
            onChange={(event) => {
              markUserInteraction();
              onChange("amountChf", event.target.value);
            }}
          />
        </div>
        ) : (
          <>
            <div className="space-y-2">
              <FieldHelpLabel
                id="severance-formula-model"
                label={t("severance.formulaModel.label")}
                helpText={t("severance.formulaModel.help")}
              />
              <select
                id="severance-formula-model"
                className="input-field"
                value={data.formulaModel}
                onChange={(event) => {
                  markUserInteraction();
                  onChange("formulaModel", event.target.value as SeveranceFormulaModel);
                }}
              >
                <option value="tenure_salary_days">{t("severance.formulaModel.tenureSalaryDays")}</option>
                <option value="or339b_months">{t("severance.formulaModel.or339bMonths")}</option>
                <option value="reference_age_formula">{t("severance.formulaModel.referenceAgeFormula")}</option>
              </select>
            </div>
            <div className="space-y-2">
              <FieldHelpLabel
                id="severance-last-salary"
                label={t("severance.lastSalary.label")}
                helpText={t("severance.lastSalary.help")}
              />
              <input
                id="severance-last-salary"
                className="input-field input-field--amount"
                value={data.lastAnnualSalaryChf}
                onChange={(event) => {
                  markUserInteraction();
                  onChange("lastAnnualSalaryChf", event.target.value);
                }}
              />
            </div>
            <div className="rounded border border-slate-700 bg-surface-2 px-3 py-2 text-xs text-slate-300">
              {t("severance.calculatedAmount")}{" "}
              <span className="font-semibold text-slate-100">
                CHF {Math.round(formulaAmount).toLocaleString("de-CH")}
              </span>
            </div>
            {data.formulaModel === "tenure_salary_days" && (
              <>
                <div className="space-y-2">
                  <FieldHelpLabel
                    id="severance-employment-start"
                    label={t("severance.employmentStart.label")}
                    helpText={t("severance.employmentStart.help")}
                  />
                  <input
                    id="severance-employment-start"
                    type="date"
                    className="input-field"
                    value={data.employmentStartDate}
                    onChange={(event) => {
                      markUserInteraction();
                      onChange("employmentStartDate", event.target.value);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <FieldHelpLabel
                    id="severance-employment-end"
                    label={t("severance.employmentEnd.label")}
                    helpText={t("severance.employmentEnd.help")}
                  />
                  <input
                    id="severance-employment-end"
                    type="date"
                    className="input-field"
                    value={data.employmentEndDate}
                    onChange={(event) => {
                      markUserInteraction();
                      onChange("employmentEndDate", event.target.value);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <FieldHelpLabel
                    id="severance-day-factor"
                    label={t("severance.dayFactor.label")}
                    helpText={t("severance.dayFactor.help")}
                  />
                  <input
                    id="severance-day-factor"
                    className="input-field"
                    value={data.formulaDayFactor}
                    onChange={(event) => {
                      markUserInteraction();
                      onChange("formulaDayFactor", event.target.value);
                    }}
                  />
                </div>
              </>
            )}
            {data.formulaModel === "or339b_months" && (
              <div className="space-y-2">
                <FieldHelpLabel
                  id="severance-month-factor"
                  label={t("severance.monthFactor.label")}
                  helpText={t("severance.monthFactor.help")}
                />
                <input
                  id="severance-month-factor"
                  className="input-field"
                  value={data.formulaMonthFactor}
                  onChange={(event) => {
                    markUserInteraction();
                    onChange("formulaMonthFactor", event.target.value);
                  }}
                />
              </div>
            )}
          </>
        )}
        <label className="rounded border border-slate-700 bg-surface-2 px-3 py-2 text-xs text-slate-200">
          <input
            type="checkbox"
            className="checkbox-field mr-2 align-middle"
            checked={data.isGrossAmount}
            onChange={(event) => {
              markUserInteraction();
              onChange("isGrossAmount", event.target.checked);
            }}
          />
          {t("severance.isGross")}
        </label>
        <div className="rounded border border-slate-700 bg-surface-2 px-3 py-2 text-xs text-slate-300">
          {t("severance.taxDomicile")}{" "}
          <span className="font-semibold text-slate-100">{taxDomicileCanton || t("severance.notSet")}</span>
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="severance-maturity-month"
            label={t("severance.maturity.label")}
            helpText={t("severance.maturity.help")}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              id="severance-maturity-month"
              className="input-field"
              value={data.maturityMonth}
              onChange={(event) => {
                markUserInteraction();
                onChange("maturityMonth", event.target.value);
                onChange("startCalculationMonth", event.target.value);
                onChange("startCalculationDay", "1");
              }}
            >
              <option value="">{t("severance.maturity.month")}</option>
              {monthOptions.map((month) => (
                <option key={month} value={String(month)}>
                  {String(month).padStart(2, "0")}
                </option>
              ))}
            </select>
            <select
              id="severance-maturity-year"
              className="input-field"
              value={data.maturityYear}
              onChange={(event) => {
                markUserInteraction();
                onChange("maturityYear", event.target.value);
                onChange("payoutYear", event.target.value);
                onChange("startCalculationYear", event.target.value);
                onChange("startCalculationDay", "1");
              }}
            >
              <option value="">{t("severance.maturity.year")}</option>
              {yearOptions.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-slate-700 bg-surface-2 p-box text-xs text-slate-200">
        <p>{t("severance.taxRate", { rate: baseTaxRate.toFixed(2) })}</p>
        <p>{t("severance.taxAtMaturity", { amount: Math.round(taxAmount).toLocaleString("de-CH") })}</p>
        <p>{t("severance.netLimit", { amount: Math.round(netAmount).toLocaleString("de-CH") })}</p>
      </div>
      <div className="form-actions-row">
        <DirtySaveButton
          isDirty={isDirty}
          isSaving={isSaving}
          savedState={savedState}
          onClick={handleSave}
        />
      </div>
    </div>
  );
};

