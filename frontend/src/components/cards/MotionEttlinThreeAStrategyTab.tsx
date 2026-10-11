import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getPayoutCoordinationWarnings,
  getRetirementPhase,
  getSmartContributionRecommendation,
  PayoutCalendarEntry,
} from "../../services/threeAccountStrategy";

type MotionEttlinThreeAStrategyTabProps = {
  isActive: boolean;
  birthDate: string;
  referenceAge: string;
  accountBalances: string[];
  monthlyContributionChf: string;
};

const toNumber = (value: string): number => {
  const cleaned = (value || "").replace(/['\s]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const MotionEttlinThreeAStrategyTab: React.FC<MotionEttlinThreeAStrategyTabProps> = ({
  isActive,
  birthDate,
  referenceAge,
  accountBalances,
  monthlyContributionChf,
}) => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [plannedContributionChf, setPlannedContributionChf] = useState("7258");
  const [hasPensionFund, setHasPensionFund] = useState(true);
  const [netIncomeChf, setNetIncomeChf] = useState("145000");
  const [pkWithdrawalYearsRaw, setPkWithdrawalYearsRaw] = useState("");
  const [partnerWithdrawalYearsRaw, setPartnerWithdrawalYearsRaw] = useState("");
  const [providerScores, setProviderScores] = useState([
    { name: "Anbieter A", cost: 4, flexibility: 4, investment: 4, service: 4 },
    { name: "Anbieter B", cost: 3, flexibility: 5, investment: 4, service: 3 },
    { name: "Anbieter C", cost: 5, flexibility: 3, investment: 3, service: 4 },
  ]);
  const [taxDocs, setTaxDocs] = useState<Array<{ fileName: string; year: number; mapped: boolean }>>([]);
  const [liquidityReserveMonths, setLiquidityReserveMonths] = useState("12");
  const [hasSecurities3a, setHasSecurities3a] = useState(true);
  const [lastRulesCheckYear, setLastRulesCheckYear] = useState(String(currentYear - 1));

  const normalizedBalances = useMemo(
    () =>
      [0, 1, 2].map((idx) => {
        const raw = accountBalances[idx] || "0";
        return toNumber(raw);
      }),
    [accountBalances],
  );

  const numericReferenceAge = Number(referenceAge) || 65;
  const birthYear = birthDate ? new Date(birthDate).getFullYear() : null;
  const retirementYear = birthYear ? birthYear + numericReferenceAge : currentYear + 10;
  const yearsToRetirement = retirementYear - currentYear;
  const phase = getRetirementPhase(yearsToRetirement);

  const smartRecommendation = useMemo(
    () =>
      getSmartContributionRecommendation({
        accountBalances: normalizedBalances,
        plannedContributionChf: toNumber(plannedContributionChf),
        limitInput: {
          hasPensionFund,
          netIncomeChf: toNumber(netIncomeChf),
        },
      }),
    [hasPensionFund, netIncomeChf, normalizedBalances, plannedContributionChf],
  );

  const payoutCalendar = useMemo<PayoutCalendarEntry[]>(
    () => [
      { accountLabel: "A", plannedYear: retirementYear + 0 },
      { accountLabel: "B", plannedYear: retirementYear + 2 },
      { accountLabel: "C", plannedYear: retirementYear + 4 },
    ],
    [retirementYear],
  );

  const parseYearList = (raw: string): number[] =>
    raw
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter((value) => Number.isFinite(value) && value > 1900);

  const coordinationWarnings = useMemo(
    () =>
      getPayoutCoordinationWarnings({
        payoutCalendar,
        plannedPkWithdrawalYears: parseYearList(pkWithdrawalYearsRaw),
        plannedPartnerWithdrawalYears: parseYearList(partnerWithdrawalYearsRaw),
      }),
    [partnerWithdrawalYearsRaw, payoutCalendar, pkWithdrawalYearsRaw],
  );

  const shortlist = useMemo(
    () =>
      [...providerScores]
        .map((item) => ({
          ...item,
          total: item.cost + item.flexibility + item.investment + item.service,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3),
    [providerScores],
  );

  const marketRiskWarning = hasSecurities3a && yearsToRetirement <= 5;
  const liquidityRiskWarning = toNumber(liquidityReserveMonths) < 12;
  const rulesCheckWarning = currentYear - (Number(lastRulesCheckYear) || currentYear) >= 1;
  const hasThreeADataSignal =
    normalizedBalances.some((balance) => balance > 0) || toNumber(monthlyContributionChf) > 0;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
        <p className="text-sm font-semibold text-slate-100">{t("motionEttlin.title")}</p>
        <p className="mt-1 text-xs text-slate-300">
          {t("motionEttlin.summary", { year: retirementYear })}{" "}
          <span className="font-semibold text-blue-300">
            {t(`motionEttlin.phases.${phase === "aufbau" || phase === "ausgleich" || phase === "finalcheck" ? phase : "bezug"}`)}
          </span>
          . {t("motionEttlin.signal")}{" "}
          <span className={hasThreeADataSignal ? "text-emerald-300" : "text-amber-300"}>
            {hasThreeADataSignal ? t("motionEttlin.signalActive") : t("motionEttlin.signalIncomplete")}
          </span>
          .
        </p>
      </div>

      <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
        <p className="text-sm font-semibold text-slate-100">{t("motionEttlin.smartContribution")}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-xs text-slate-300">
            {t("motionEttlin.plannedContribution")}
            <input
              className="input-field mt-1 input-field--amount"
              value={plannedContributionChf}
              onChange={(event) => setPlannedContributionChf(event.target.value)}
              disabled={!isActive}
            />
          </label>
          <label className="text-xs text-slate-300">
            {t("motionEttlin.netIncome")}
            <input
              className="input-field mt-1 input-field--amount"
              value={netIncomeChf}
              onChange={(event) => setNetIncomeChf(event.target.value)}
              disabled={!isActive}
            />
          </label>
          <label className="text-xs text-slate-300">
            {t("motionEttlin.hasPk")}
            <select
              className="input-field mt-1"
              value={hasPensionFund ? "yes" : "no"}
              onChange={(event) => setHasPensionFund(event.target.value === "yes")}
              disabled={!isActive}
            >
              <option value="yes">{t("motionEttlin.yes")}</option>
              <option value="no">{t("motionEttlin.no")}</option>
            </select>
          </label>
        </div>
        <div className="mt-2 rounded border border-emerald-700/50 bg-emerald-900/20 px-2 py-2 text-xs text-emerald-200">
          {t("motionEttlin.recommendation", { account: String.fromCharCode(65 + smartRecommendation.recommendedAccountIndex) })}
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
        <p className="text-sm font-semibold text-slate-100">{t("motionEttlin.payoutCalendar")}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {payoutCalendar.map((entry) => (
            <div key={entry.accountLabel} className="rounded border border-slate-700 bg-surface-2 p-box-sm text-xs">
              <p className="font-medium text-slate-200">{t("motionEttlin.account", { label: entry.accountLabel })}</p>
              <p className="text-slate-300">{t("motionEttlin.plannedPayout", { year: entry.plannedYear })}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="input-field"
            value={pkWithdrawalYearsRaw}
            onChange={(event) => setPkWithdrawalYearsRaw(event.target.value)}
            placeholder={t("motionEttlin.pkYearsPlaceholder")}
            disabled={!isActive}
          />
          <input
            className="input-field"
            value={partnerWithdrawalYearsRaw}
            onChange={(event) => setPartnerWithdrawalYearsRaw(event.target.value)}
            placeholder={t("motionEttlin.partnerYearsPlaceholder")}
            disabled={!isActive}
          />
        </div>
        {coordinationWarnings.map((warning, index) => (
          <div
            key={`${warning.year}-${index}`}
            className="mt-2 rounded border border-amber-700/50 bg-amber-900/20 px-2 py-2 text-xs text-amber-200"
          >
            {t("motionEttlin.alert", { message: warning.message })}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
        <p className="text-sm font-semibold text-slate-100">{t("motionEttlin.providerShortlist")}</p>
        <div className="mt-2 text-xs text-blue-200">
          {t("motionEttlin.shortlist", { list: shortlist.map((item) => `${item.name} (${item.total})`).join(" | ") })}
        </div>
        <input
          type="file"
          multiple
          className="mt-2 block text-xs text-slate-300"
          disabled={!isActive}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            const next = files.map((file) => ({
              fileName: file.name,
              year: currentYear,
              mapped: false,
            }));
            if (next.length > 0) setTaxDocs((prev) => [...prev, ...next]);
          }}
        />
        <div className="mt-2 space-y-1">
          {taxDocs.map((doc, index) => (
            <div key={`${doc.fileName}-${index}`} className="flex items-center justify-between rounded border border-slate-700 p-box-sm text-xs">
              <span className="text-slate-300">{doc.fileName}</span>
              <button
                type="button"
                className={`rounded border px-2 py-1 ${doc.mapped ? "border-emerald-600 bg-emerald-900/30 text-emerald-200" : "border-slate-600 text-slate-300"}`}
                disabled={!isActive}
                onClick={() =>
                  setTaxDocs((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, mapped: !item.mapped } : item)),
                  )
                }
              >
                {t("motionEttlin.proof", { value: doc.mapped ? t("motionEttlin.yes") : t("motionEttlin.no") })}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-surface-2 p-box text-xs">
        <p className="font-semibold text-slate-100">{t("motionEttlin.riskManagement")}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className="input-field"
            value={liquidityReserveMonths}
            onChange={(event) => setLiquidityReserveMonths(event.target.value)}
            placeholder={t("motionEttlin.liquidityPlaceholder")}
            disabled={!isActive}
          />
          <select
            className="input-field"
            value={hasSecurities3a ? "yes" : "no"}
            onChange={(event) => setHasSecurities3a(event.target.value === "yes")}
            disabled={!isActive}
          >
            <option value="yes">{t("motionEttlin.securitiesYes")}</option>
            <option value="no">{t("motionEttlin.securitiesNo")}</option>
          </select>
          <input
            className="input-field"
            value={lastRulesCheckYear}
            onChange={(event) => setLastRulesCheckYear(event.target.value)}
            placeholder={t("motionEttlin.rulesCheckPlaceholder")}
            disabled={!isActive}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className={`rounded px-2 py-1 ${liquidityRiskWarning ? "bg-red-900/30 text-red-200" : "bg-emerald-900/30 text-emerald-200"}`}>
            {t("motionEttlin.liquidity", { value: liquidityRiskWarning ? t("motionEttlin.liquidityLow") : t("motionEttlin.liquidityOk") })}
          </span>
          <span className={`rounded px-2 py-1 ${marketRiskWarning ? "bg-amber-900/30 text-amber-200" : "bg-slate-800 text-slate-300"}`}>
            {t("motionEttlin.marketRisk", { value: marketRiskWarning ? t("motionEttlin.marketRiskTriggered") : t("motionEttlin.marketRiskNone") })}
          </span>
          <span className={`rounded px-2 py-1 ${rulesCheckWarning ? "bg-amber-900/30 text-amber-200" : "bg-emerald-900/30 text-emerald-200"}`}>
            {t("motionEttlin.rules", { value: rulesCheckWarning ? t("motionEttlin.rulesDue") : t("motionEttlin.rulesCurrent") })}
          </span>
        </div>
      </div>
    </div>
  );
};
