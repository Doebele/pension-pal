import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DirtySaveButton } from "../common/DirtySaveButton";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { DetailsAccordion } from "../common/DetailsAccordion";
import { FieldHelpLabel } from "../common/FieldHelpLabel";
import { OverviewRowList } from "../dashboard/OverviewRowList";
import { CheckCircle, WarningCircle, WarningTriangle } from "iconoir-react";

type Currency = "CHF" | "EUR" | "USD" | "GBP";

export type LifeInsuranceState = {
  insuranceType: "renten" | "kapital" | "gemischt";
  insurer: string;
  policyNumber: string;
  insuredName: string;
  capitalSumChf: string;
  annualRentPaymentChf: string;
  monthlyPremium: string;
  sumAtDeath: string;
  entryAge: string;
  surrenderValue: string;
  annualPremium: string;
  maturityDate: string;
  maturityYear: string;
  monthlyPensionAtRetirement: string;
  capitalPayoutAtMaturity: string;
  currency: Currency;
};

export type LifeImportFieldId =
  | "insurer"
  | "policyNumber"
  | "insuredName"
  | "capitalPayoutAtMaturity"
  | "annualPensionChf"
  | "annualPremium"
  | "monthlyPremium"
  | "surrenderValue"
  | "sumAtDeath"
  | "maturityDate"
  | "currency";

export type LifeImportMapping = {
  source_field_id: LifeImportFieldId;
  source_label: string;
  target_field_id: LifeImportFieldId;
  target_label: string;
  confidence: number;
};

export type LifeImportPreview = {
  fields: Array<{
    id: LifeImportFieldId;
    label: string;
    value: string;
    confidence_score: number;
    priority: "essential" | "secondary";
    source_pattern?: string;
  }>;
  issues: string[];
  metadata?: Record<string, unknown>;
  mappingSuggestions: LifeImportMapping[];
};

export interface ImportFieldValidation {
  fieldName: string;
  extractedValue: string | null;
  confidenceScore: number;
  isEditableManually: boolean;
}

type ImportValidationLevel = "ok" | "likely" | "error";

type LifeInsuranceCardProps = {
  data: LifeInsuranceState;
  onChange: (field: keyof LifeInsuranceState, value: string) => void;
  isActive: boolean;
  onSave: () => Promise<void> | void;
  detailsOpen?: boolean;
  onDetailsToggle?: (next: boolean) => void;
  onImportPolicy?: (file: File) => Promise<void> | void;
  importPreview?: LifeImportPreview | null;
  onAcceptImportPreview?: (payload?: {
    valuesBySource?: Partial<Record<LifeImportFieldId, string>>;
    autoApplyBySource?: Partial<Record<LifeImportFieldId, boolean>>;
  }) => void;
  onDiscardImportPreview?: () => void;
  onChangeImportMapping?: (sourceFieldId: LifeImportFieldId, targetFieldId: LifeImportFieldId) => void;
};

const currencyLabelsMap: Record<Currency, string> = {
  CHF: "CHF",
  EUR: "EUR",
  USD: "USD",
  GBP: "GBP",
};

const INSURER_OPTIONS = ["Zürich", "AXA", "Generali", "ERGO", "Swiss Life", "Manuia", "Weitere"] as const;
const LIFE_IMPORT_TARGET_IDS: LifeImportFieldId[] = [
  "insurer",
  "policyNumber",
  "insuredName",
  "capitalPayoutAtMaturity",
  "annualPensionChf",
  "annualPremium",
  "monthlyPremium",
  "surrenderValue",
  "sumAtDeath",
  "maturityDate",
  "currency",
];

const LOW_CONFIDENCE_THRESHOLD = 0.2;
const REVIEW_CONFIDENCE_THRESHOLD = 0.4;
const GOOD_CONFIDENCE_THRESHOLD = 0.7;

const getImportValidationLevel = (
  confidenceScore: number,
  extractedValue: string | null | undefined,
): ImportValidationLevel => {
  if (!extractedValue || confidenceScore < LOW_CONFIDENCE_THRESHOLD) return "error";
  if (confidenceScore < GOOD_CONFIDENCE_THRESHOLD) return "likely";
  return "ok";
};

const validationBadgeStyles: Record<ImportValidationLevel, string> = {
  ok: "border-emerald-500/40 bg-emerald-900/20 text-emerald-200",
  likely: "border-amber-500/40 bg-amber-900/20 text-amber-200",
  error: "border-rose-500/40 bg-rose-900/20 text-rose-200",
};

const validationBadgeLabelKey: Record<ImportValidationLevel, string> = {
  ok: "life.import.ok",
  likely: "life.import.likely",
  error: "life.import.error",
};

type ImportTargetDropdownProps = {
  value: LifeImportFieldId;
  onChange: (next: LifeImportFieldId) => void;
  options: Array<{ id: LifeImportFieldId; label: string }>;
};

const ImportTargetDropdown: React.FC<ImportTargetDropdownProps> = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const currentLabel = options.find((option) => option.id === value)?.label ?? value;

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-md border border-slate-600 bg-slate-900/70 px-3 py-2 text-left text-xs text-slate-100"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="whitespace-normal break-words leading-snug">{currentLabel}</span>
        <span className="text-slate-400">{isOpen ? "▴" : "▾"}</span>
      </button>
      {isOpen && (
        <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-slate-600 bg-slate-950 p-1 shadow-xl">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`mb-1 flex min-h-[32px] w-full items-center rounded px-2 py-1 text-left text-xs leading-snug ${
                option.id === value
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "bg-surface-2 text-slate-200 hover:bg-slate-800"
              }`}
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
            >
              <span className="whitespace-normal break-words">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const LifeInsuranceCard: React.FC<LifeInsuranceCardProps> = ({
  data,
  onChange,
  isActive,
  onSave,
  detailsOpen,
  onDetailsToggle,
  onImportPolicy,
  importPreview,
  onAcceptImportPreview,
  onDiscardImportPreview,
  onChangeImportMapping,
}) => {
  const { t } = useTranslation();
  const [localDetailsOpen, setLocalDetailsOpen] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [isImportDrawerOpen, setIsImportDrawerOpen] = useState(false);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [valuesBySource, setValuesBySource] = useState<Partial<Record<LifeImportFieldId, string>>>({});
  const [autoApplyBySource, setAutoApplyBySource] = useState<Partial<Record<LifeImportFieldId, boolean>>>({});
  const isDetailsOpen = detailsOpen ?? localDetailsOpen;
  const setDetailsOpen = (next: boolean) => {
    if (onDetailsToggle) {
      onDetailsToggle(next);
      return;
    }
    setLocalDetailsOpen(next);
  };
  const { isDirty, isSaving, savedState, handleSave, markUserInteraction } = useFormPersistence(
    data,
    onSave,
  );

  const handleCurrencyChange = (newCurrency: Currency) => {
    markUserInteraction();
    onChange("currency", newCurrency);
  };

  const currencySymbol = currencyLabelsMap[data.currency];
  const lifeImportTargetOptions = LIFE_IMPORT_TARGET_IDS.map((id) => ({ id, label: t(`life.fields.${id}`) }));
  const selectedInsurer = INSURER_OPTIONS.includes(data.insurer as (typeof INSURER_OPTIONS)[number]) ? data.insurer : "Weitere";
  const duplicateMappingTargets = useMemo(() => {
    const seen = new Set<LifeImportFieldId>();
    const duplicates = new Set<LifeImportFieldId>();
    for (const item of importPreview?.mappingSuggestions || []) {
      if (seen.has(item.target_field_id)) duplicates.add(item.target_field_id);
      seen.add(item.target_field_id);
    }
    return Array.from(duplicates);
  }, [importPreview?.mappingSuggestions]);

  useEffect(() => {
    if (importPreview) {
      setIsImportDrawerOpen(true);
      setValuesBySource(
        Object.fromEntries(
          importPreview.fields.map((field) => [field.id, field.value || ""]),
        ) as Partial<Record<LifeImportFieldId, string>>,
      );
      setAutoApplyBySource(
        Object.fromEntries(
          importPreview.mappingSuggestions.map((mapping) => {
            const field = importPreview.fields.find((item) => item.id === mapping.source_field_id);
            const confidence = field?.confidence_score ?? mapping.confidence ?? 0;
            const hasValue = Boolean(field?.value);
            return [mapping.source_field_id, hasValue && confidence >= REVIEW_CONFIDENCE_THRESHOLD];
          }),
        ) as Partial<Record<LifeImportFieldId, boolean>>,
      );
    }
  }, [importPreview]);

  if (!isActive) {
    const projectedMonthlyShare =
      data.insuranceType === "kapital"
        ? (Number(data.capitalPayoutAtMaturity || 0) / (25 * 12)).toFixed(0)
        : data.monthlyPensionAtRetirement || "0";
    const insuranceTypeLabel =
      data.insuranceType === "kapital"
        ? t("life.insuranceType.kapitalShort")
        : data.insuranceType === "renten"
        ? t("life.insuranceType.rentenShort")
        : t("life.insuranceType.gemischtShort");
    return (
      <OverviewRowList
        rows={[
          { label: t("life.overview.type"), value: insuranceTypeLabel },
          { label: t("life.overview.portfolioValue"), value: `CHF ${data.capitalPayoutAtMaturity || data.capitalSumChf || "0"}` },
          { label: t("life.overview.sharePerYear"), value: t("life.overview.perMonthShort", { amount: projectedMonthlyShare }) },
        ]}
      />
    );
  }

  const projectedMonthlyShare =
    data.insuranceType === "kapital"
      ? Number(data.capitalPayoutAtMaturity || 0) / (25 * 12)
      : Number(data.monthlyPensionAtRetirement || 0);

  return (
    <div className="form-card space-y-3">
      <p className="text-sm text-slate-400">{t("life.intro")}</p>
      <div className="form-grid-3">
        <div className="space-y-2">
          <FieldHelpLabel
            id="life-insurance-type"
            label={t("life.insuranceType.label")}
            helpText={t("life.insuranceType.help")}
          />
          <select
            id="life-insurance-type"
            className="input-field"
            value={data.insuranceType}
            onChange={(e) => {
              markUserInteraction();
              onChange("insuranceType", e.target.value);
            }}
          >
            <option value="renten">{t("life.insuranceType.renten")}</option>
            <option value="kapital">{t("life.insuranceType.kapital")}</option>
            <option value="gemischt">{t("life.insuranceType.gemischt")}</option>
          </select>
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="life-insurer"
            label={t("life.insurer.label")}
            helpText={t("life.insurer.help")}
          />
          <select
            id="life-insurer"
            className="input-field"
            value={selectedInsurer}
            onChange={(e) => {
              markUserInteraction();
              const value = e.target.value;
              onChange("insurer", value === "Weitere" ? "" : value);
            }}
          >
            {INSURER_OPTIONS.map((insurer) => (
              <option key={insurer} value={insurer}>
                {insurer === "Weitere" ? t("life.insurer.other") : insurer}
              </option>
            ))}
          </select>
          {selectedInsurer === "Weitere" && (
            <input
              type="text"
              className="input-field"
              placeholder={t("life.insurer.placeholder")}
              value={data.insurer}
              onChange={(e) => {
                markUserInteraction();
                onChange("insurer", e.target.value);
              }}
            />
          )}
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="life-policy-number"
            label={t("life.policyNumber.label")}
            helpText={t("life.policyNumber.help")}
          />
          <input
            id="life-policy-number"
            type="text"
            className="input-field"
            value={data.policyNumber}
            onChange={(e) => {
              markUserInteraction();
              onChange("policyNumber", e.target.value);
            }}
          />
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="life-insured-name"
            label={t("life.insuredName.label")}
            helpText={t("life.insuredName.help")}
          />
          <input
            id="life-insured-name"
            type="text"
            className="input-field"
            value={data.insuredName}
            onChange={(e) => {
              markUserInteraction();
              onChange("insuredName", e.target.value);
            }}
          />
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="life-currency"
            label={t("life.currency.label")}
            helpText={t("life.currency.help")}
          />
          <select
            id="life-currency"
            className="input-field"
            value={data.currency}
            onChange={(e) => handleCurrencyChange(e.target.value as Currency)}
          >
            <option value="CHF">CHF</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="life-capital-sum"
            label={t("life.capitalSum.label", { currency: currencySymbol })}
            helpText={t("life.capitalSum.help")}
          />
          <input
            id="life-capital-sum"
            type="text"
            className="input-field input-field--amount"
            placeholder={t("life.capitalSum.placeholder")}
            value={data.capitalSumChf}
            onChange={(e) => {
              markUserInteraction();
              onChange("capitalSumChf", e.target.value);
            }}
          />
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="life-annual-rent"
            label={t("life.annualRent.label", { currency: currencySymbol })}
            helpText={t("life.annualRent.help")}
          />
          <input
            id="life-annual-rent"
            type="text"
            className="input-field input-field--amount"
            placeholder={t("life.annualRent.placeholder")}
            value={data.annualRentPaymentChf}
            onChange={(e) => {
              markUserInteraction();
              onChange("annualRentPaymentChf", e.target.value);
            }}
          />
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="life-entry-age"
            label={t("life.entryAge.label")}
            helpText={t("life.entryAge.help")}
          />
          <input
            id="life-entry-age"
            type="text"
            className="input-field"
            placeholder={t("life.entryAge.placeholder")}
            value={data.entryAge}
            onChange={(e) => {
              markUserInteraction();
              onChange("entryAge", e.target.value);
            }}
          />
        </div>
      </div>
      <DetailsAccordion
        title={t("bvg.moreDetails")}
        isOpen={isDetailsOpen}
        onToggle={() => setDetailsOpen(!isDetailsOpen)}
      >
        <div className="form-grid-3">
          <div className="space-y-2">
            <FieldHelpLabel
              id="life-surrender-value"
              label={t("life.surrenderValue.label", { currency: currencySymbol })}
              helpText={t("life.surrenderValue.help")}
            />
            <input
              id="life-surrender-value"
              type="text"
              className="input-field input-field--amount"
              placeholder={t("life.surrenderValue.placeholder")}
              value={data.surrenderValue}
              onChange={(e) => {
                markUserInteraction();
                onChange("surrenderValue", e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <FieldHelpLabel
              id="life-monthly-premium"
              label={t("life.monthlyPremium.label", { currency: currencySymbol })}
              helpText={t("life.monthlyPremium.help")}
            />
            <input
              id="life-monthly-premium"
              type="text"
              className="input-field input-field--amount"
              value={data.monthlyPremium}
              onChange={(e) => {
                markUserInteraction();
                onChange("monthlyPremium", e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <FieldHelpLabel
              id="life-sum-at-death"
              label={t("life.sumAtDeath.label", { currency: currencySymbol })}
              helpText={t("life.sumAtDeath.help")}
            />
            <input
              id="life-sum-at-death"
              type="text"
              className="input-field input-field--amount"
              value={data.sumAtDeath}
              onChange={(e) => {
                markUserInteraction();
                onChange("sumAtDeath", e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <FieldHelpLabel
              id="life-maturity-date"
              label={t("life.maturityDate.label")}
              helpText={t("life.maturityDate.help")}
            />
            <input
              id="life-maturity-date"
              type="text"
              className="input-field"
              value={data.maturityDate}
              onChange={(e) => {
                markUserInteraction();
                onChange("maturityDate", e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <FieldHelpLabel
              id="life-annual-premium"
              label={t("life.annualPremium.label", { currency: currencySymbol })}
              helpText={t("life.annualPremium.help")}
            />
            <input
              id="life-annual-premium"
              type="text"
              className="input-field input-field--amount"
              value={data.annualPremium}
              onChange={(e) => {
                markUserInteraction();
                onChange("annualPremium", e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <FieldHelpLabel
              id="life-maturity-year"
              label={t("life.maturityYear.label")}
              helpText={t("life.maturityYear.help")}
            />
            <input
              id="life-maturity-year"
              type="text"
              className="input-field"
              value={data.maturityYear}
              onChange={(e) => {
                markUserInteraction();
                onChange("maturityYear", e.target.value);
              }}
            />
          </div>
          {data.insuranceType !== "kapital" && (
            <div className="space-y-2">
              <FieldHelpLabel
                id="life-monthly-pension"
                label={t("life.monthlyPension.label", { currency: currencySymbol })}
                helpText={t("life.monthlyPension.help")}
              />
              <input
                id="life-monthly-pension"
                type="text"
                className="input-field input-field--amount"
                value={data.monthlyPensionAtRetirement}
                onChange={(e) => {
                  markUserInteraction();
                  onChange("monthlyPensionAtRetirement", e.target.value);
                }}
              />
            </div>
          )}
          {data.insuranceType !== "renten" && (
            <div className="space-y-2">
              <FieldHelpLabel
                id="life-capital-payout"
                label={t("life.capitalPayout.label", { currency: currencySymbol })}
                helpText={t("life.capitalPayout.help")}
              />
              <input
                id="life-capital-payout"
                type="text"
                className="input-field input-field--amount"
                value={data.capitalPayoutAtMaturity}
                onChange={(e) => {
                  markUserInteraction();
                  onChange("capitalPayoutAtMaturity", e.target.value);
                }}
              />
            </div>
          )}
        </div>
      </DetailsAccordion>
      <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
        <p className="mb-2 text-xs font-medium text-slate-200">{t("life.pdfImport")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".pdf,.txt"
            className="text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-slate-100"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              setSelectedImportFile(file);
            }}
          />
          <button
            type="button"
            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedImportFile}
            onClick={() => {
              if (!selectedImportFile || !onImportPolicy) return;
              void onImportPolicy(selectedImportFile);
            }}
          >
            {t("life.parsePreview")}
          </button>
          {importPreview && (
            <button
              type="button"
              className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-xs text-blue-200 hover:bg-blue-500/20"
              onClick={() => setIsImportDrawerOpen(true)}
            >
              {t("life.openPreview")}
            </button>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-slate-700 bg-surface-2 p-box-sm text-sm text-slate-300">
        {t("life.projectedShare", { currency: currencySymbol, amount: projectedMonthlyShare.toFixed(0) })}
      </div>
      <div className="text-xs text-amber-300">
        {t("life.taxNote")}
      </div>
      <div className="form-actions-row">
        <DirtySaveButton
          isDirty={isDirty}
          isSaving={isSaving}
          savedState={savedState}
          onClick={handleSave}
        />
      </div>
      {importPreview && (
        <div
          className={`fixed inset-0 z-50 transition-opacity duration-300 ${
            isImportDrawerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <button
            type="button"
            className={`absolute inset-0 bg-slate-950/70 transition-opacity duration-300 ${
              isImportDrawerOpen ? "opacity-100" : "opacity-0"
            }`}
            aria-label={t("life.import.closeAria")}
            onClick={() => setIsImportDrawerOpen(false)}
          />
          <div
            className={`absolute inset-x-3 bottom-3 top-16 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl transition-all duration-300 ${
              isImportDrawerOpen ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
            }`}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
                <div>
                  <p className="text-base font-semibold text-slate-100">{t("life.import.title")}</p>
                  <p className="text-xs text-slate-400">{t("life.import.subtitle")}</p>
                </div>
                <button
                  type="button"
                  className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                  onClick={() => setIsImportDrawerOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <div className="mb-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded border border-slate-700 bg-surface-2 p-box-sm text-xs text-slate-200">
                    {t("life.import.detected", { count: importPreview.fields.filter((field) => field.value).length })}
                  </div>
                  <div className="rounded border border-slate-700 bg-surface-2 p-box-sm text-xs text-slate-200">
                    {t("life.import.problems", { count: (() => {
                      const manualOrCriticalIssues = importPreview.mappingSuggestions.filter((mapping) => {
                        const field = importPreview.fields.find((item) => item.id === mapping.source_field_id);
                        const manualValue = valuesBySource[mapping.source_field_id] ?? field?.value ?? "";
                        const confidence = field?.confidence_score ?? mapping.confidence ?? 0;
                        const validationLevel = getImportValidationLevel(confidence, manualValue);
                        const autoApply = autoApplyBySource[mapping.source_field_id] ?? false;
                        return validationLevel === "error" || !autoApply;
                      }).length;
                      return importPreview.issues.length + manualOrCriticalIssues;
                    })() })}
                  </div>
                  <label className="rounded border border-slate-700 bg-surface-2 p-box-sm text-xs text-slate-200">
                    <input
                      type="checkbox"
                      className="checkbox-field mr-1 align-middle"
                      checked={manualEditMode}
                      onChange={(event) => setManualEditMode(event.target.checked)}
                    />
                    {t("life.import.manualEdit")}
                  </label>
                </div>
                {duplicateMappingTargets.length > 0 && (
                  <div className="mb-3 rounded border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
                    {t("life.import.duplicateMapping")}
                  </div>
                )}
                {importPreview.issues.length > 0 && (
                  <div className="mb-3 rounded border border-amber-500/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
                    {importPreview.issues.join(" | ")}
                  </div>
                )}
                {(() => {
                  const surrenderField = importPreview.mappingSuggestions.find(
                    (mapping) => mapping.target_field_id === "surrenderValue",
                  );
                  const sourceField = surrenderField
                    ? importPreview.fields.find((field) => field.id === surrenderField.source_field_id)
                    : null;
                  const manualValue = surrenderField
                    ? (valuesBySource[surrenderField.source_field_id] ?? sourceField?.value ?? "")
                    : "";
                  const missingSurrender = !manualValue.trim();
                  if (!missingSurrender) return null;
                  return (
                    <div className="mb-3 rounded border border-amber-400/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
                      {t("life.import.missingSurrender")}
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  {(importPreview.mappingSuggestions || []).map((item) => {
                    const field = importPreview.fields.find((f) => f.id === item.source_field_id);
                    const validation: ImportFieldValidation = {
                      fieldName: item.source_label,
                      extractedValue: field?.value || null,
                      confidenceScore: field?.confidence_score ?? item.confidence ?? 0,
                      isEditableManually: true,
                    };
                    const editableValue = valuesBySource[item.source_field_id] ?? field?.value ?? "";
                    const validationLevel = getImportValidationLevel(
                      validation.confidenceScore,
                      editableValue || validation.extractedValue,
                    );
                    const needsWarning = validationLevel === "error";
                    const autoApply = autoApplyBySource[item.source_field_id] ?? false;
                    return (
                      <div
                        key={`${item.source_field_id}-${item.target_field_id}`}
                        className={`rounded border p-box-sm ${
                          needsWarning
                            ? "border-rose-500/50 bg-rose-950/25"
                            : "border-slate-700 bg-surface-2"
                        }`}
                      >
                        <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr_auto] sm:items-start">
                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <p className="text-xs text-slate-300">{item.source_label}</p>
                              <span
                                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-2xs ${validationBadgeStyles[validationLevel]}`}
                              >
                                {validationLevel === "ok" ? <CheckCircle className="h-3 w-3" aria-hidden /> : validationLevel === "likely" ? <WarningTriangle className="h-3 w-3" aria-hidden /> : <WarningCircle className="h-3 w-3" aria-hidden />}
                                <span>{t(validationBadgeLabelKey[validationLevel])}</span>
                              </span>
                            </div>
                            <input
                              type="text"
                              className={`input-field text-xs ${
                                needsWarning ? "border-rose-500/60 bg-rose-950/20" : ""
                              }`}
                              value={editableValue}
                              placeholder={needsWarning ? t("life.import.enterManually") : t("life.import.autoDetected")}
                              onChange={(event) =>
                                setValuesBySource((prev) => ({
                                  ...prev,
                                  [item.source_field_id]: event.target.value,
                                }))
                              }
                            />
                            <p className="mt-1 text-2xs text-slate-400">
                              {t("life.import.confidenceLine", { percent: Math.round(validation.confidenceScore * 100), value: field?.value || "-" })}
                            </p>
                            {needsWarning && (
                              <p className="field-error-text mt-1 text-2xs text-rose-300">
                                {t("life.import.uncertain")}
                              </p>
                            )}
                            {!needsWarning && validationLevel === "likely" && (
                              <p className="mt-1 text-2xs text-amber-300">
                                {t("life.import.mediumQuality")}
                              </p>
                            )}
                            {manualEditMode && (
                              <label className="mt-1 inline-flex items-center gap-1 text-2xs text-slate-300">
                                <input
                                  type="checkbox"
                                  className="checkbox-field accent-emerald-500"
                                  checked={autoApply}
                                  onChange={(event) =>
                                    setAutoApplyBySource((prev) => ({
                                      ...prev,
                                      [item.source_field_id]: event.target.checked,
                                    }))
                                  }
                                />
                                {t("life.import.autoApply")}
                              </label>
                            )}
                          </div>
                          <ImportTargetDropdown
                            value={item.target_field_id}
                            onChange={(nextTarget) =>
                              onChangeImportMapping?.(
                                item.source_field_id,
                                nextTarget,
                              )
                            }
                            options={lifeImportTargetOptions}
                          />
                          <span
                            className={`inline-flex rounded border px-2 py-1 text-2xs ${validationBadgeStyles[validationLevel]}`}
                          >
                            {t(validationBadgeLabelKey[validationLevel])}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-700 px-4 py-3">
                <button
                  type="button"
                  className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                  onClick={() => {
                    onDiscardImportPreview?.();
                    setIsImportDrawerOpen(false);
                  }}
                >
                  {t("life.import.discard")}
                </button>
                <button
                  type="button"
                  disabled={duplicateMappingTargets.length > 0}
                  className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                  onClick={() => {
                    const needsVerification = importPreview.mappingSuggestions.some((mapping) => {
                      const field = importPreview.fields.find((item) => item.id === mapping.source_field_id);
                      const value = valuesBySource[mapping.source_field_id] ?? field?.value ?? "";
                      const confidence = field?.confidence_score ?? mapping.confidence ?? 0;
                      const lowOrMissing = getImportValidationLevel(confidence, value) === "error";
                      const needsReviewByConfidence = confidence < REVIEW_CONFIDENCE_THRESHOLD;
                      const autoApply = autoApplyBySource[mapping.source_field_id] ?? false;
                      return lowOrMissing || needsReviewByConfidence || !autoApply;
                    });
                    if (needsVerification) {
                      const confirmed = window.confirm(t("life.import.confirmUnverified"));
                      if (!confirmed) return;
                    }
                    onAcceptImportPreview?.({
                      valuesBySource,
                      autoApplyBySource,
                    });
                    setIsImportDrawerOpen(false);
                  }}
                >
                  {t("life.import.accept")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
