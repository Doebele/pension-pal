import React from "react";
import { useTranslation } from "react-i18next";
import { CANTON_OPTIONS, getWithdrawalTaxRateForCanton } from "../../services/swissTax";
import { DirtySaveButton } from "../common/DirtySaveButton";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { MotionEttlinThreeAStrategyTab } from "./MotionEttlinThreeAStrategyTab";
import { FieldHelpLabel } from "../common/FieldHelpLabel";
import { OverviewRowList } from "../dashboard/OverviewRowList";
import { getDynamicAmountStep } from "../../utils/dynamicAmountStep";
import { NotchedRange } from "../common/NotchedRange";

export type ThirdPillarAccount = {
  balanceChf: string;
  expectedReturnPercent: string;
  yearsToPayout: string;
};

export type ThirdPillarState = {
  provider: string;
  securitiesChf: string;
  realEstateEquityChf: string;
  monthlySavingsChf: string;
  expectedReturnPercent: string;
  accountCount: number;
  accounts: ThirdPillarAccount[];
  withdrawalTaxRatePercent: string;
  taxModel: "flat_placeholder" | "progressive_placeholder";
  taxCanton: string;
};

type ThirdPillarCardProps = {
  data: ThirdPillarState;
  onChange: (
    field: keyof ThirdPillarState,
    value: ThirdPillarState[keyof ThirdPillarState],
  ) => void;
  isActive: boolean;
  onSave: () => void | Promise<void>;
  initialTab?: "portfolio" | "motionEttlin3a";
  onTabChange?: (tab: "portfolio" | "motionEttlin3a") => void;
  scrollToTabsTrigger?: number;
  navigationContextLabel?: string | null;
  motionEttlinContext: {
    birthDate: string;
    referenceAge: string;
    accountBalances: string[];
    monthlyContributionChf: string;
  };
};

const PILLAR3_TAB_STORAGE_KEY = "spc_pillar3_active_tab";

export const ThirdPillarCard: React.FC<ThirdPillarCardProps> = ({
  data,
  onChange,
  isActive,
  onSave,
  initialTab = "portfolio",
  onTabChange,
  scrollToTabsTrigger = 0,
  navigationContextLabel = null,
  motionEttlinContext,
}) => {
  const { t } = useTranslation();
  const { isDirty, isSaving, savedState, handleSave, markUserInteraction } = useFormPersistence(
    data,
    onSave,
  );
  const MAX_ACCOUNTS = 3;
  const [activeTab, setActiveTab] = React.useState<"portfolio" | "motionEttlin3a">(() => {
    if (initialTab) return initialTab;
    const stored = localStorage.getItem(PILLAR3_TAB_STORAGE_KEY);
    return stored === "motionEttlin3a" ? "motionEttlin3a" : "portfolio";
  });
  const [autoTabFlash, setAutoTabFlash] = React.useState(false);
  const autoTabAppliedRef = React.useRef<"portfolio" | "motionEttlin3a">("portfolio");
  const tabHeaderRef = React.useRef<HTMLDivElement | null>(null);
  const accountCount = Math.min(MAX_ACCOUNTS, Math.max(1, data.accountCount || 1));

  React.useEffect(() => {
    if (!initialTab) return;
    if (autoTabAppliedRef.current === initialTab && activeTab === initialTab) return;
    const switched = activeTab !== initialTab;
    setActiveTab(initialTab);
    autoTabAppliedRef.current = initialTab;
    if (switched) {
      setAutoTabFlash(true);
      const timer = window.setTimeout(() => setAutoTabFlash(false), 1100);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [activeTab, initialTab]);

  React.useEffect(() => {
    localStorage.setItem(PILLAR3_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    if (!isActive || scrollToTabsTrigger === 0) return;
    if (!tabHeaderRef.current) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tabHeaderRef.current.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [isActive, scrollToTabsTrigger]);

  const handleTabChange = (tab: "portfolio" | "motionEttlin3a") => {
    setActiveTab(tab);
    autoTabAppliedRef.current = tab;
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const parseNum = (value: string): number => {
    if (!value) return 0;
    const cleaned = value.replace(/['\s]/g, "").replace(",", ".");
    const num = Number(cleaned);
    return Number.isFinite(num) && num > 0 ? num : 0;
  };

  const updateAccountCount = (nextCount: number) => {
    markUserInteraction();
    onChange("accountCount", nextCount);
    if (data.accounts.length < nextCount) {
      const padded = [...data.accounts];
      while (padded.length < nextCount) {
        padded.push({
          balanceChf: "",
          expectedReturnPercent: data.expectedReturnPercent || "4",
          yearsToPayout: "10",
        });
      }
      onChange("accounts", padded);
    }
  };

  const calculateProjectedBalance = (account: ThirdPillarAccount): number => {
    const start = parseNum(account.balanceChf);
    const rate = parseNum(account.expectedReturnPercent) / 100;
    const years = Math.max(0, Math.floor(parseNum(account.yearsToPayout)));
    return start * Math.pow(1 + rate, years);
  };

  const calculatePillar3aTax = (
    totalPayout: number,
    taxRatePercent: number,
    model: ThirdPillarState["taxModel"],
  ): number => {
    // Platzhaltermodell: Kanton/Gemeinde spezifische Steuersätze sollen später zentral konfiguriert werden.
    if (model === "progressive_placeholder") {
      const tranche1 = Math.min(totalPayout, 50000) * (taxRatePercent * 0.7) / 100;
      const tranche2 = Math.max(0, totalPayout - 50000) * (taxRatePercent * 1.1) / 100;
      return tranche1 + tranche2;
    }
    return (totalPayout * taxRatePercent) / 100;
  };

  const activeAccounts = data.accounts.slice(0, accountCount);
  const totalCurrent3a = activeAccounts.reduce((sum, acc) => sum + parseNum(acc.balanceChf), 0);
  const totalProjected3a = activeAccounts.reduce(
    (sum, acc) => sum + calculateProjectedBalance(acc),
    0,
  );
  const taxRate = parseNum(data.withdrawalTaxRatePercent);
  const estimatedTax = calculatePillar3aTax(totalProjected3a, taxRate, data.taxModel);
  const projectedNet = Math.max(0, totalProjected3a - estimatedTax);

  if (!isActive) {
    return (
      <OverviewRowList
        rows={[
          { label: t("pillar3.overview.accounts", { count: accountCount }), value: `CHF ${Math.round(totalCurrent3a).toLocaleString("de-CH")}` },
          { label: t("pillar3.overview.savingsRate"), value: t("pillar3.overview.perMonth", { amount: data.monthlySavingsChf || "0" }) },
        ]}
      />
    );
  }

  return (
    <div className="form-card space-y-4">
      {navigationContextLabel && (
        <div
          className="inline-flex items-center rounded-full border border-blue-600/40 bg-blue-900/25 px-2 py-1 text-2xs font-medium tracking-wide text-blue-200"
          aria-live="polite"
        >
          {navigationContextLabel}
        </div>
      )}
      <div
        ref={tabHeaderRef}
        role="tablist"
        aria-label={t("pillar3.tabsAria")}
        className="seg-row"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "portfolio"}
          aria-controls="pillar3-tabpanel-payout"
          onClick={() => handleTabChange("portfolio")}
          className={`seg-btn${activeTab === "portfolio" ? ` active${autoTabFlash ? " tab-auto-selected-flash" : ""}` : ""}`}
        >
          {t("pillar3.tabPayout")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "motionEttlin3a"}
          aria-controls="pillar3-tabpanel-motion"
          onClick={() => handleTabChange("motionEttlin3a")}
          className={`seg-btn${activeTab === "motionEttlin3a" ? ` active${autoTabFlash ? " tab-auto-selected-flash" : ""}` : ""}`}
        >
          {t("pillar3.tabMotion")}
        </button>
      </div>

      {activeTab === "motionEttlin3a" ? (
        <div id="pillar3-tabpanel-motion" role="tabpanel" aria-label={t("pillar3.tabMotion")}>
          <MotionEttlinThreeAStrategyTab
            isActive={isActive}
            birthDate={motionEttlinContext.birthDate}
            referenceAge={motionEttlinContext.referenceAge}
            accountBalances={motionEttlinContext.accountBalances}
            monthlyContributionChf={motionEttlinContext.monthlyContributionChf}
          />
        </div>
      ) : (
        <div id="pillar3-tabpanel-payout" role="tabpanel" aria-label={t("pillar3.tabPayout")}>
      <p className="text-sm text-slate-400">{t("pillar3.intro")}</p>

      <div className="space-y-2">
        <FieldHelpLabel
          id="pillar3-securities"
          label={t("pillar3.securities.label")}
          helpText={t("pillar3.securities.help")}
        />
        <input
          id="pillar3-securities" type="text" className="input-field input-field--amount"
          placeholder={t("pillar3.securities.placeholder")}
          value={data.securitiesChf}
          onChange={(e) => {
            markUserInteraction();
            onChange("securitiesChf", e.target.value);
          }}
        />
      </div>
      <div className="space-y-2">
        <FieldHelpLabel
          id="pillar3-real-estate-equity"
          label={t("pillar3.realEstateEquity.label")}
          helpText={t("pillar3.realEstateEquity.help")}
        />
        <input
          id="pillar3-real-estate-equity" type="text" className="input-field input-field--amount"
          placeholder={t("pillar3.realEstateEquity.placeholder")}
          value={data.realEstateEquityChf}
          onChange={(e) => {
            markUserInteraction();
            onChange("realEstateEquityChf", e.target.value);
          }}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-slate-700 p-box">
        <div className="flex items-center justify-between">
          <FieldHelpLabel
            id="pillar3-account-count"
            label={t("pillar3.accountCount.label")}
            helpText={t("pillar3.accountCount.help")}
          />
          <span className="text-sm text-slate-200">{accountCount}</span>
        </div>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t("pillar3.accountCount.legend")}</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            {[
              { value: 1, label: t("pillar3.accountCount.one") },
              { value: 2, label: t("pillar3.accountCount.two") },
              { value: 3, label: t("pillar3.accountCount.three") },
            ].map((option) => (
              <label key={option.value} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="pillar3-account-count"
                  value={option.value}
                  checked={accountCount === option.value}
                  onChange={() => updateAccountCount(option.value)}
                  className="checkbox-field accent-blue-500"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {activeAccounts.map((account, idx) => (
          <div key={idx} className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-slate-700 p-box-sm">
            <div>
              <FieldHelpLabel
                id={`pillar3-account-balance-${idx}`}
                label={t("pillar3.accountBalance.label", { index: idx + 1 })}
                helpText={t("pillar3.accountBalance.help")}
              />
              <input
                id={`pillar3-account-balance-${idx}`}
                type="number"
                min={0}
                step={getDynamicAmountStep(Number(account.balanceChf) || 0)}
                className="input-field input-field--amount"
                value={account.balanceChf}
                onChange={(e) => {
                  markUserInteraction();
                  const next = [...data.accounts];
                  next[idx] = { ...next[idx], balanceChf: e.target.value };
                  onChange("accounts", next);
                }}
              />
            </div>
            <div>
              <FieldHelpLabel
                id={`pillar3-account-return-${idx}`}
                label={t("pillar3.accountReturn.label")}
                helpText={t("pillar3.accountReturn.help")}
              />
              <input
                id={`pillar3-account-return-${idx}`}
                type="number"
                min={0}
                step={0.1}
                className="input-field"
                value={account.expectedReturnPercent}
                onChange={(e) => {
                  markUserInteraction();
                  const next = [...data.accounts];
                  next[idx] = { ...next[idx], expectedReturnPercent: e.target.value };
                  onChange("accounts", next);
                }}
              />
            </div>
            <div>
              <FieldHelpLabel
                id={`pillar3-account-years-${idx}`}
                label={t("pillar3.accountYears.label")}
                helpText={t("pillar3.accountYears.help")}
              />
              <input
                id={`pillar3-account-years-${idx}`}
                type="number"
                min={0}
                className="input-field"
                value={account.yearsToPayout}
                onChange={(e) => {
                  markUserInteraction();
                  const next = [...data.accounts];
                  next[idx] = { ...next[idx], yearsToPayout: e.target.value };
                  onChange("accounts", next);
                }}
              />
            </div>
          </div>
        ))}

        <div className="form-grid-3 mt-3">
          <div>
            <FieldHelpLabel
              id="pillar3-tax-model"
              label={t("pillar3.taxModel.label")}
              helpText={t("pillar3.taxModel.help")}
            />
            <select
              id="pillar3-tax-model"
              className="input-field"
              value={data.taxModel}
              onChange={(e) => {
                markUserInteraction();
                onChange("taxModel", e.target.value as ThirdPillarState["taxModel"]);
              }}
            >
              <option value="flat_placeholder">{t("pillar3.taxModel.flat")}</option>
              <option value="progressive_placeholder">{t("pillar3.taxModel.progressive")}</option>
            </select>
          </div>
          <div>
            <FieldHelpLabel
              id="pillar3-tax-canton"
              label={t("pillar3.taxCanton.label")}
              helpText={t("pillar3.taxCanton.help")}
            />
            <select
              id="pillar3-tax-canton"
              className="input-field"
              value={data.taxCanton}
              onChange={(e) => {
                markUserInteraction();
                const canton = e.target.value;
                onChange("taxCanton", canton);
                const rate = getWithdrawalTaxRateForCanton(canton);
                if (rate !== null) {
                  onChange("withdrawalTaxRatePercent", String(rate));
                }
              }}
            >
              <option value="">{t("common.pleaseSelect")}</option>
              {CANTON_OPTIONS.map((canton) => (
                <option key={canton} value={canton}>
                  {canton}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <FieldHelpLabel
              id="pillar3-tax-rate"
              label={t("pillar3.taxRate.label")}
              helpText={t("pillar3.taxRate.help")}
            />
            <input
              id="pillar3-tax-rate"
              type="number"
              min={0}
              step={0.1}
              className="input-field"
              value={data.withdrawalTaxRatePercent}
              onChange={(e) => {
                markUserInteraction();
                onChange("withdrawalTaxRatePercent", e.target.value);
              }}
            />
          </div>
        </div>

        <div className="mt-3 rounded-md border border-slate-700 bg-surface-2 p-box-sm text-sm text-slate-200">
          <div className="flex justify-between">
            <span>{t("pillar3.totalCurrent")}</span>
            <span>CHF {Math.round(totalCurrent3a).toLocaleString("de-CH")}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("pillar3.totalProjected")}</span>
            <span>CHF {Math.round(totalProjected3a).toLocaleString("de-CH")}</span>
          </div>
          <div className="flex justify-between text-amber-300">
            <span>{t("pillar3.estimatedTax")}</span>
            <span>CHF {Math.round(estimatedTax).toLocaleString("de-CH")}</span>
          </div>
          <div className="flex justify-between font-semibold text-emerald-300">
            <span>{t("pillar3.netAfterTax")}</span>
            <span>CHF {Math.round(projectedNet).toLocaleString("de-CH")}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <FieldHelpLabel
            id="pillar3-monthly-savings"
            label={t("pillar3.monthlySavings.label")}
            helpText={t("pillar3.monthlySavings.help")}
          />
          <span className="text-sm text-slate-300">{data.monthlySavingsChf || "0"}</span>
        </div>
        <NotchedRange
          min={0}
          max={5000}
          step={50}
          value={Number(data.monthlySavingsChf) || 0}
          onChange={(e) => {
            markUserInteraction();
            onChange("monthlySavingsChf", e.target.value);
          }}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <FieldHelpLabel
            id="pillar3-base-return"
            label={t("pillar3.baseReturn.label")}
            helpText={t("pillar3.baseReturn.help")}
          />
          <span className="text-sm text-slate-300">{data.expectedReturnPercent || "0"} %</span>
        </div>
        <NotchedRange
          min={0}
          max={10}
          step={0.5}
          value={Number(data.expectedReturnPercent) || 0}
          onChange={(e) => {
            markUserInteraction();
            onChange("expectedReturnPercent", e.target.value);
          }}
        />
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
      )}
    </div>
  );
};
