import React from "react";
import { useTranslation } from "react-i18next";
import { DirtySaveButton } from "../common/DirtySaveButton";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import type { CashAssetRow, CashAssetsState } from "./CashAssetsCard";
import type { InvestmentAssetsState } from "./InvestmentAssetsCard";
import { convertToChf, DEFAULT_FX_RATES, SUPPORTED_CURRENCIES, type CurrencyCode } from "../../services/fxRates";
import { FieldHelpLabel } from "../common/FieldHelpLabel";
import { OverviewRowList } from "../dashboard/OverviewRowList";

const ASSETS_TAB_STORAGE_KEY = "spc_assets_active_tab";
type AssetsTabId = "cash" | "investments";

type AssetsOverviewCardProps = {
  cashData: CashAssetsState;
  investmentData: InvestmentAssetsState;
  isActive: boolean;
  onCashChange: (rows: CashAssetRow[]) => void;
  onInvestmentChange: (field: keyof InvestmentAssetsState, value: string) => void;
  onSave: () => void | Promise<void>;
};

const parseAmount = (value: string) => {
  const parsed = Number((value || "").replace(/['\s]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const ACCOUNT_TYPE_OPTIONS = [
  { value: "bank", label: "Bankkonto" },
  { value: "cash", label: "Bargeld" },
  { value: "depot", label: "Depot" },
  { value: "pillar3a", label: "Säule 3a Konto" },
  { value: "vested_benefits", label: "Freizügigkeitskonto" },
  { value: "other", label: "Sonstiges" },
] as const;

const normalizeAccountType = (value: string | undefined): string => {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "bank";
  if (["konto", "bankkonto", "bank", "account", "checking", "savings"].includes(normalized)) return "bank";
  if (["cash", "bar", "bargeld"].includes(normalized)) return "cash";
  if (["depot", "wertschriftendepot", "brokerage"].includes(normalized)) return "depot";
  if (["3a", "säule 3a", "saeule 3a", "pillar3a"].includes(normalized)) return "pillar3a";
  if (["freizügigkeit", "freizuegigkeit", "vested_benefits"].includes(normalized)) return "vested_benefits";
  if (ACCOUNT_TYPE_OPTIONS.some((option) => option.value === normalized)) return normalized;
  return "other";
};

export const AssetsOverviewCard: React.FC<AssetsOverviewCardProps> = ({
  cashData,
  investmentData,
  isActive,
  onCashChange,
  onInvestmentChange,
  onSave,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = React.useState<AssetsTabId>(() => {
    const stored = localStorage.getItem(ASSETS_TAB_STORAGE_KEY);
    return stored === "investments" ? "investments" : "cash";
  });
  const rows = Array.isArray(cashData.rows) ? cashData.rows : [];
  const totalCashChf = rows.reduce(
    (sum, row) => sum + convertToChf(parseAmount(row.amount), row.currency, DEFAULT_FX_RATES),
    0,
  );
  const totalInvestmentsChf =
    parseAmount(investmentData.etfChf)
    + parseAmount(investmentData.stocksChf)
    + parseAmount(investmentData.savingsPlanChf)
    + parseAmount(investmentData.realEstateEtfChf);
  const { isDirty, isSaving, savedState, handleSave, markUserInteraction } = useFormPersistence(
    { cashData, investmentData, activeTab },
    onSave,
  );

  React.useEffect(() => {
    localStorage.setItem(ASSETS_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const addRow = () => {
    markUserInteraction();
    onCashChange([
      ...rows,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        accountName: "",
        accountType: "bank",
        amount: "",
        currency: "CHF",
        source: "manual",
      },
    ]);
  };

  const updateRow = (id: string, patch: Partial<CashAssetRow>) => {
    markUserInteraction();
    onCashChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    markUserInteraction();
    onCashChange(rows.filter((row) => row.id !== id));
  };

  if (!isActive) {
    return (
      <OverviewRowList
        rows={[
          {
            label: t("assets.overview.cash"),
            value: `CHF ${totalCashChf.toLocaleString("de-CH", { maximumFractionDigits: 2 })}`,
          },
          {
            label: t("assets.overview.investments"),
            value: `CHF ${totalInvestmentsChf.toLocaleString("de-CH", { maximumFractionDigits: 2 })}`,
          },
        ]}
      />
    );
  }

  return (
    <div className="form-card space-y-3">
      <div role="tablist" aria-label={t("assets.tabs.ariaLabel")} className="seg-row">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "cash"}
          className={`seg-btn${activeTab === "cash" ? " active" : ""}`}
          onClick={() => setActiveTab("cash")}
        >
          {t("assets.tabs.cash")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "investments"}
          className={`seg-btn${activeTab === "investments" ? " active" : ""}`}
          onClick={() => setActiveTab("investments")}
        >
          {t("assets.tabs.investments")}
        </button>
      </div>

      {activeTab === "cash" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">{t("assets.cashIntro")}</p>
          <div className="rounded-lg border border-slate-700 bg-surface-2 p-box-sm">
            <div className="grid grid-cols-[1.3fr_0.9fr_1fr_0.8fr_auto] gap-2 px-1 pb-2 text-xs text-slate-400">
              <FieldHelpLabel
                id="assets-cash-header-account"
                label={t("assets.columns.account.label")}
                className="text-xs text-slate-400"
                helpText={t("assets.columns.account.help")}
              />
              <FieldHelpLabel
                id="assets-cash-header-type"
                label={t("assets.columns.type.label")}
                className="text-xs text-slate-400"
                helpText={t("assets.columns.type.help")}
              />
              <FieldHelpLabel
                id="assets-cash-header-amount"
                label={t("assets.columns.amount.label")}
                className="text-xs text-slate-400"
                helpText={t("assets.columns.amount.help")}
              />
              <FieldHelpLabel
                id="assets-cash-header-currency"
                label={t("assets.columns.currency.label")}
                className="text-xs text-slate-400"
                helpText={t("assets.columns.currency.help")}
              />
              <span />
            </div>
            <div className="max-h-56 space-y-2 overflow-auto">
              {rows.map((row) => (
                <div key={row.id} className="grid grid-cols-[1.3fr_0.9fr_1fr_0.8fr_auto] gap-2">
                  <input
                    className="input-field"
                    value={row.accountName}
                    placeholder={t("assets.accountPlaceholder")}
                    onChange={(event) => updateRow(row.id, { accountName: event.target.value })}
                  />
                  <select
                    className="input-field"
                    aria-label={t("assets.accountTypeAria")}
                    value={normalizeAccountType(row.accountType)}
                    onChange={(event) => updateRow(row.id, { accountType: event.target.value })}
                  >
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(`assets.accountTypes.${option.value}`)}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input-field input-field--amount"
                    value={row.amount}
                    placeholder="0.00"
                    onChange={(event) => updateRow(row.id, { amount: event.target.value })}
                  />
                  <select
                    className="input-field"
                    value={row.currency}
                    onChange={(event) => updateRow(row.id, { currency: event.target.value as CurrencyCode })}
                  >
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-2 text-xs text-slate-300 hover:bg-slate-800"
                    onClick={() => removeRow(row.id)}
                    aria-label={t("assets.removeRowAria")}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-700/70 pt-2">
              <button
                type="button"
                className="rounded-md border border-blue-600/60 bg-blue-900/30 px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/45"
                onClick={addRow}
              >
                {t("assets.addRow")}
              </button>
              <div className="rounded-md border border-emerald-700/60 bg-emerald-900/25 px-2 py-1 text-xs font-semibold text-emerald-200">
                {t("assets.totalCash", { amount: totalCashChf.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "investments" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">{t("assets.investmentsIntro")}</p>
          <div className="form-grid-3">
            <div className="space-y-1">
              <FieldHelpLabel
                id="assets-investments-etf"
                label={t("assets.fields.etf.label")}
                helpText={t("assets.fields.etf.help")}
              />
              <input className="input-field input-field--amount" value={investmentData.etfChf} onChange={(e) => {
                markUserInteraction();
                onInvestmentChange("etfChf", e.target.value);
              }} />
            </div>
            <div className="space-y-1">
              <FieldHelpLabel
                id="assets-investments-stocks"
                label={t("assets.fields.stocks.label")}
                helpText={t("assets.fields.stocks.help")}
              />
              <input className="input-field input-field--amount" value={investmentData.stocksChf} onChange={(e) => {
                markUserInteraction();
                onInvestmentChange("stocksChf", e.target.value);
              }} />
            </div>
            <div className="space-y-1">
              <FieldHelpLabel
                id="assets-investments-savings"
                label={t("assets.fields.savings.label")}
                helpText={t("assets.fields.savings.help")}
              />
              <input className="input-field input-field--amount" value={investmentData.savingsPlanChf} onChange={(e) => {
                markUserInteraction();
                onInvestmentChange("savingsPlanChf", e.target.value);
              }} />
            </div>
            <div className="space-y-1">
              <FieldHelpLabel
                id="assets-investments-realestate"
                label={t("assets.fields.realEstate.label")}
                helpText={t("assets.fields.realEstate.help")}
              />
              <input className="input-field input-field--amount" value={investmentData.realEstateEtfChf} onChange={(e) => {
                markUserInteraction();
                onInvestmentChange("realEstateEtfChf", e.target.value);
              }} />
            </div>
          </div>
          <div className="text-sm font-semibold text-slate-200">
            {t("assets.totalInvestments", { amount: totalInvestmentsChf.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}
          </div>
        </div>
      )}

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
