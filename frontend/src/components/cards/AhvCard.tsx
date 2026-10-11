import React from "react";
import { useTranslation } from "react-i18next";
import { DirtySaveButton } from "../common/DirtySaveButton";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { AhvContributionRow, AhvContributionTable } from "./AhvContributionTable";
import { FieldHelpLabel } from "../common/FieldHelpLabel";
import { OverviewRowList } from "../dashboard/OverviewRowList";

type AhvImportFieldId =
  | "year"
  | "annual_income_chf"
  | "contribution_total_chf"
  | "age_end_of_year"
  | "ahv_rent_share_chf";

const AHV_IMPORT_TARGET_OPTIONS: Array<{ id: AhvImportFieldId; labelKey: string }> = [
  { id: "year", labelKey: "ahv.fields.year" },
  { id: "annual_income_chf", labelKey: "ahv.fields.annualIncome" },
  { id: "contribution_total_chf", labelKey: "ahv.fields.total" },
  { id: "age_end_of_year", labelKey: "ahv.fields.age" },
  { id: "ahv_rent_share_chf", labelKey: "ahv.fields.rentShare" },
];

export type AhvState = {
  referenceAge: string;
  estimatedAverageAnnualIncome: string;
  contributionEstimate: string;
  expectedAnnualPension: string;
  contributionYears: string;
  earlyRetirementYears: string;
  lateRetirementYears: string;
};

type AhvCardProps = {
  data: AhvState;
  profileAge?: number | null;
  retirementAgeOptions: number[];
  hasDetailedContributionHistory?: boolean;
  /** Beitragsjahre aus der Geschichte, gleich gezählt wie in der Rentenschätzung (services/ahvEstimate) */
  historyContributionYears?: number;
  onChange: (field: keyof AhvState, value: string) => void;
  contributionRows: AhvContributionRow[];
  onContributionRowsChange: (rows: AhvContributionRow[]) => void;
  onImportContributions?: (file: File) => void | Promise<void>;
  importPreview?: {
    rows: AhvContributionRow[];
    issues: string[];
    metadata?: {
      rows_detected?: number;
      computed_average_income_chf?: number | null;
      computed_total_contributions_chf?: number | null;
      average_income_reference_chf?: number | null;
      total_accumulated_reference_chf?: number | null;
      latest_monthly_rent_reference_chf?: number | null;
      difference_table?: Array<{ label?: string; delta_monthly_chf?: number | null }>;
    };
    mappingSuggestions?: Array<{
      source_field_id: AhvImportFieldId;
      source_label: string;
      target_field_id: AhvImportFieldId;
      target_label: string;
      confidence: number;
    }>;
  } | null;
  onChangeImportPreviewRow?: (index: number, row: AhvContributionRow) => void;
  onAcceptImportPreview?: () => void;
  onDiscardImportPreview?: () => void;
  onChangeImportMapping?: (sourceFieldId: AhvImportFieldId, targetFieldId: AhvImportFieldId) => void;
  contributionIssues?: string[];
  isActive: boolean;
  onSave: () => void | Promise<void>;
};
type AhvInputMode = "approximate" | "exact";

export const AhvCard: React.FC<AhvCardProps> = ({
  data,
  profileAge,
  retirementAgeOptions,
  hasDetailedContributionHistory = false,
  historyContributionYears = 0,
  onChange,
  contributionRows,
  onContributionRowsChange,
  onImportContributions,
  importPreview,
  onChangeImportPreviewRow,
  onAcceptImportPreview,
  onDiscardImportPreview,
  onChangeImportMapping,
  contributionIssues,
  isActive,
  onSave,
}) => {
  const { t } = useTranslation();
  const { isDirty, isSaving, savedState, handleSave, markUserInteraction } = useFormPersistence(
    { ...data, contributionRows },
    onSave,
  );
  const annualPension = Number(data.expectedAnnualPension || 0);
  const monthlyPension = Number.isFinite(annualPension) ? annualPension / 12 : 0;
  const contributionYearsDisplay = hasDetailedContributionHistory
    ? String(historyContributionYears)
    : (data.contributionYears?.trim() || t("ahv.notAvailable"));
  const minRetirementAge = retirementAgeOptions[0] ?? 58;
  const [inputMode, setInputMode] = React.useState<AhvInputMode>(
    hasDetailedContributionHistory ? "exact" : "approximate",
  );
  const [selectedImportFile, setSelectedImportFile] = React.useState<File | null>(null);
  const [isParsingPreview, setIsParsingPreview] = React.useState(false);
  const [isImportDrawerOpen, setIsImportDrawerOpen] = React.useState(false);
  const [manualEditMode, setManualEditMode] = React.useState(false);

  React.useEffect(() => {
    if (!importPreview) return;
    setIsParsingPreview(false);
    setIsImportDrawerOpen(true);
  }, [importPreview]);

  const importValidationStatus = React.useMemo(() => {
    if (!importPreview) return [];
    const parseNumber = (value: string): number | null => {
      const normalized = value.trim().replace(/'/g, "").replace(/\s+/g, "").replace(",", ".");
      if (!normalized) return null;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    };
    return importPreview.rows.map((row) => {
      const yearValid = /^\d{4}$/.test(row.year.trim());
      const incomeValid = parseNumber(row.annualIncomeChf) !== null;
      const totalValid = parseNumber(row.contributionTotalChf) !== null;
      if (yearValid && incomeValid && totalValid) {
        return { isValid: true, message: t("ahv.import.rowValid") };
      }
      const message = [
        !yearValid ? t("ahv.import.yearInvalid") : "",
        !incomeValid ? t("ahv.import.incomeInvalid") : "",
        !totalValid ? t("ahv.import.totalInvalid") : "",
      ]
        .filter(Boolean)
        .join(", ");
      return { isValid: false, message };
    });
  }, [importPreview, t]);

  const importSummary = React.useMemo(() => {
    const totalRows = importValidationStatus.length;
    const successfulRows = importValidationStatus.filter((item) => item.isValid).length;
    return {
      totalRows,
      successfulRows,
      failedRows: Math.max(0, totalRows - successfulRows),
    };
  }, [importValidationStatus]);

  const duplicateMappingTargets = React.useMemo(() => {
    const duplicates: Array<{ targetFieldId: AhvImportFieldId; sourceLabels: string[] }> = [];
    const byTarget = new Map<AhvImportFieldId, string[]>();
    (importPreview?.mappingSuggestions || []).forEach((item) => {
      const existing = byTarget.get(item.target_field_id) || [];
      existing.push(item.source_label);
      byTarget.set(item.target_field_id, existing);
    });
    byTarget.forEach((sourceLabels, targetFieldId) => {
      if (sourceLabels.length > 1) {
        duplicates.push({ targetFieldId, sourceLabels });
      }
    });
    return duplicates;
  }, [importPreview?.mappingSuggestions]);

  const handleParseAndPreview = async () => {
    if (!selectedImportFile || !onImportContributions) return;
    setIsParsingPreview(true);
    await onImportContributions(selectedImportFile);
  };

  if (!isActive) {
    return (
      <OverviewRowList
        rows={[
          { label: t("ahv.overview.expectedPension"), value: `CHF ${data.expectedAnnualPension || "0"}` },
          { label: t("ahv.overview.avgIncome"), value: `CHF ${data.estimatedAverageAnnualIncome || "0"}` },
        ]}
      />
    );
  }

  return (
    <div className="form-card space-y-3">
      <p className="text-sm text-neutral-300">{t("ahv.intro")}</p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">{t("ahv.importStructure")}</p>
        {onImportContributions && (
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">
              {t("ahv.chooseFile")}
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.pdf,.txt"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setSelectedImportFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className={`rounded px-2 py-1 text-xs font-semibold ${
                selectedImportFile && !isParsingPreview
                  ? "bg-blue-500 text-slate-950 hover:bg-blue-400"
                  : "cursor-not-allowed bg-slate-700 text-slate-400"
              }`}
              onClick={() => void handleParseAndPreview()}
              disabled={!selectedImportFile || isParsingPreview}
            >
              {isParsingPreview ? t("ahv.parsing") : t("ahv.parsePreview")}
            </button>
            {importPreview && (
              <button
                type="button"
                className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                onClick={() => setIsImportDrawerOpen(true)}
              >
                {t("ahv.openPreview")}
              </button>
            )}
          </div>
        )}
      </div>
      {selectedImportFile && (
        <p className="text-2xs text-slate-400">{t("ahv.selectedFile", { name: selectedImportFile.name })}</p>
      )}

      <div className="form-grid-3">
        <div
          className="rounded-md border border-emerald-600/40 bg-emerald-900/20 px-3 py-2"
          aria-label={t("ahv.profileAgeAria")}
        >
          <p className="text-xs text-emerald-300">{t("ahv.keyData")}</p>
          <p className="text-base font-semibold text-emerald-200">
            {t("ahv.referenceAge", { age: profileAge !== null && profileAge !== undefined ? t("ahv.ageYears", { age: profileAge }) : t("ahv.notAvailable") })}
          </p>
          <p className="text-2xs text-emerald-100/85">
            {t("ahv.contributionYearsLine", { years: contributionYearsDisplay })}
          </p>
        </div>
        <div className="rounded-md border border-emerald-600/40 bg-emerald-900/20 px-3 py-2">
          <p className="text-xs text-emerald-300">{t("ahv.expectedPension")}</p>
          <p className="text-base font-semibold text-emerald-200">{t("ahv.perYear", { amount: data.expectedAnnualPension || "0" })}</p>
          <p className="text-2xs text-emerald-100/85">
            {t("ahv.perMonth", { amount: Math.round(monthlyPension).toLocaleString("de-CH") })}
          </p>
        </div>
      </div>

      <div role="tablist" aria-label={t("ahv.modeAria")} className="seg-row">
        <button
          type="button"
          id="ahv-mode-approximate-tab"
          role="tab"
          aria-selected={inputMode === "approximate"}
          aria-controls="ahv-mode-approximate"
          className={`seg-btn${inputMode === "approximate" ? " active" : ""}`}
          onClick={() => setInputMode("approximate")}
        >
          {t("ahv.approximate")}
        </button>
        <button
          type="button"
          id="ahv-mode-exact-tab"
          role="tab"
          aria-selected={inputMode === "exact"}
          aria-controls="ahv-mode-exact"
          className={`seg-btn${inputMode === "exact" ? " active" : ""}`}
          onClick={() => setInputMode("exact")}
        >
          {t("ahv.exact")}
        </button>
      </div>

      <div
        id="ahv-mode-approximate"
        role="tabpanel"
        aria-labelledby="ahv-mode-approximate-tab"
        className={`${inputMode === "approximate" ? "block" : "hidden"} space-y-3`}
      >
      <div className="form-grid-3 text-xs">
        <div className="space-y-1">
          <FieldHelpLabel
            id="ahv-income"
            label={t("ahv.income.label")}
            helpText={t("ahv.income.help")}
          />
          <input
            id="ahv-income"
            className="input-field input-field--amount"
            value={data.estimatedAverageAnnualIncome}
            onChange={(e) => {
              markUserInteraction();
              onChange("estimatedAverageAnnualIncome", e.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="ahv-reference-age"
            label={t("ahv.plannedRetirementAge.label")}
            helpText={t("ahv.plannedRetirementAge.help")}
          />
          <select
            id="ahv-reference-age"
            aria-label={t("ahv.plannedRetirementAge.label")}
            className="input-field"
            value={data.referenceAge}
            onChange={(e) => {
              markUserInteraction();
              onChange("referenceAge", e.target.value);
            }}
          >
            {retirementAgeOptions.map((age) => (
              <option key={age} value={String(age)}>
                {t("ahv.ageYears", { age })}
              </option>
            ))}
          </select>
          <p className="text-2xs text-slate-400">
            {t("ahv.retirementAgeHint", { minAge: minRetirementAge })}
          </p>
        </div>

        <div className="space-y-1">
          <FieldHelpLabel
            id="ahv-contribution-estimate"
            label={t("ahv.contributionEstimate.label")}
            helpText={t("ahv.contributionEstimate.help")}
          />
          <input
            id="ahv-contribution-estimate"
            readOnly={hasDetailedContributionHistory}
            className={`input-field input-field--amount ${
              hasDetailedContributionHistory
                ? "border border-neutral-700/80 bg-neutral-900/60 text-neutral-300"
                : ""
            }`}
            value={data.contributionEstimate}
            onChange={(e) => {
              if (hasDetailedContributionHistory) return;
              markUserInteraction();
              onChange("contributionEstimate", e.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="ahv-contribution-years"
            label={t("ahv.contributionYears.label")}
            helpText={t("ahv.contributionYears.help")}
          />
          <input
            id="ahv-contribution-years"
            className="input-field"
            value={data.contributionYears}
            onChange={(e) => {
              markUserInteraction();
              onChange("contributionYears", e.target.value);
            }}
          />
        </div>
      </div>
      </div>

      <div
        id="ahv-mode-exact"
        role="tabpanel"
        aria-labelledby="ahv-mode-exact-tab"
        className={`${inputMode === "exact" ? "block" : "hidden"} space-y-3`}
      >
      <div className="form-grid-3 text-xs">
        <div className="space-y-1">
          <FieldHelpLabel
            id="ahv-exact-reference-age"
            label={t("ahv.exactRetirementAge.label")}
            helpText={t("ahv.exactRetirementAge.help")}
          />
          <select
            id="ahv-exact-reference-age"
            className="input-field"
            value={data.referenceAge}
            onChange={(e) => {
              markUserInteraction();
              onChange("referenceAge", e.target.value);
            }}
          >
            {retirementAgeOptions.map((age) => (
              <option key={age} value={String(age)}>
                {t("ahv.ageYears", { age })}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="ahv-exact-income"
            label={t("ahv.exactIncome.label")}
            helpText={t("ahv.exactIncome.help")}
          />
          <input
            id="ahv-exact-income"
            className="input-field input-field--amount"
            value={data.estimatedAverageAnnualIncome}
            onChange={(e) => {
              markUserInteraction();
              onChange("estimatedAverageAnnualIncome", e.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="ahv-exact-early"
            label={t("ahv.earlyYears.label")}
            helpText={t("ahv.earlyYears.help")}
          />
          <input
            id="ahv-exact-early"
            className="input-field"
            value={data.earlyRetirementYears}
            readOnly
            aria-readonly="true"
          />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="ahv-exact-late"
            label={t("ahv.lateYears.label")}
            helpText={t("ahv.lateYears.help")}
          />
          <input
            id="ahv-exact-late"
            className="input-field"
            value={data.lateRetirementYears}
            readOnly
            aria-readonly="true"
          />
        </div>
      </div>

      <AhvContributionTable
        rows={contributionRows}
        onChangeRow={(index, nextRow) => {
          markUserInteraction();
          const next = [...contributionRows];
          next[index] = nextRow;
          onContributionRowsChange(next);
        }}
        onAddRow={() => {
          markUserInteraction();
          onContributionRowsChange([
            ...contributionRows,
            {
              year: "",
              annualIncomeChf: "",
              contributionTotalChf: "",
              ageEndOfYear: "",
              ahvRentShareChf: "",
              source: "manual",
            },
          ]);
        }}
        onDeleteRow={(index) => {
          markUserInteraction();
          onContributionRowsChange(contributionRows.filter((_, rowIndex) => rowIndex !== index));
        }}
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
            aria-label={t("ahv.import.closeAria")}
            className={`absolute inset-0 bg-slate-950/70 transition-opacity duration-300 ${
              isImportDrawerOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setIsImportDrawerOpen(false)}
          />
          <div
            className={`absolute inset-x-3 bottom-3 top-16 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl transition-all duration-300 ease-out ${
              isImportDrawerOpen
                ? "translate-y-0 scale-100 opacity-100"
                : "-translate-y-4 scale-[0.99] opacity-0"
            }`}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
                <div>
                  <p className="text-base font-semibold text-slate-100">{t("ahv.import.title")}</p>
                  <p className="text-xs text-slate-400">{t("ahv.import.subtitle")}</p>
                </div>
                <button
                  type="button"
                  className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                  onClick={() => setIsImportDrawerOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="grid gap-3 overflow-auto p-4 lg:grid-cols-[340px_1fr]">
                <div className="space-y-3">
                  <div className="rounded border border-slate-700 bg-surface-2 p-box text-xs">
                    <p className="mb-1 font-medium text-slate-200">{t("ahv.import.summary")}</p>
                    <p className="text-slate-300">{t("ahv.import.totalRows", { count: importSummary.totalRows })}</p>
                    <p className="text-emerald-300">{t("ahv.import.successRows", { count: importSummary.successfulRows })}</p>
                    <p className="text-rose-300">{t("ahv.import.failedRows", { count: importSummary.failedRows })}</p>
                  </div>
                  <div className="rounded border border-slate-700 bg-surface-2 p-box text-xs">
                    <label className="flex items-center gap-2 text-slate-200">
                      <input
                        type="checkbox"
                        className="checkbox-field"
                        checked={manualEditMode}
                        onChange={(event) => setManualEditMode(event.target.checked)}
                      />
                      {t("ahv.import.manualEdit")}
                    </label>
                    <p className="mt-1 text-2xs text-slate-400">{t("ahv.import.manualEditHint")}</p>
                  </div>
                  <div className="rounded border border-slate-700 bg-surface-2 p-box text-xs">
                    <p className="mb-2 font-medium text-slate-200">{t("ahv.import.fieldMapping")}</p>
                    <div className="space-y-2">
                      {(importPreview.mappingSuggestions || []).map((item) => (
                        <div key={`${item.source_field_id}-${item.target_field_id}`} className="rounded border border-slate-700 bg-surface-2 p-box-sm">
                          <p className="mb-1 text-2xs text-slate-300">{item.source_label} →</p>
                          <select
                            className="input-field h-8 text-2xs"
                            value={item.target_field_id}
                            onChange={(event) =>
                              onChangeImportMapping?.(item.source_field_id, event.target.value as AhvImportFieldId)
                            }
                          >
                            {AHV_IMPORT_TARGET_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {t(option.labelKey)}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-2xs text-slate-400">
                            {t("ahv.import.confidence", { percent: Math.round((item.confidence || 0) * 100) })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {duplicateMappingTargets.length > 0 && (
                    <div className="rounded border border-amber-500/40 bg-amber-900/30 p-box-sm text-2xs text-amber-200">
                      <p className="font-medium">{t("ahv.import.duplicateTitle")}</p>
                      <p className="mt-1 text-amber-100/90">{t("ahv.import.duplicateHint")}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {importPreview.metadata && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded border border-slate-700 bg-surface-2 px-2 py-1 text-2xs text-slate-200">
                        {t("ahv.import.detected", { count: importPreview.metadata.rows_detected ?? importPreview.rows.length })}
                      </div>
                      <div className="rounded border border-slate-700 bg-surface-2 px-2 py-1 text-2xs text-slate-200">
                        {t("ahv.import.avgIncome", { amount: Math.round(importPreview.metadata.computed_average_income_chf || 0).toLocaleString("de-CH") })}
                      </div>
                      <div className="rounded border border-slate-700 bg-surface-2 px-2 py-1 text-2xs text-slate-200">
                        {t("ahv.import.totalContributions", { amount: Math.round(importPreview.metadata.computed_total_contributions_chf || 0).toLocaleString("de-CH") })}
                      </div>
                    </div>
                  )}
                  <AhvContributionTable
                    rows={importPreview.rows}
                    onChangeRow={(index, nextRow) => onChangeImportPreviewRow?.(index, nextRow)}
                    onAddRow={() => undefined}
                    onDeleteRow={() => undefined}
                    hideAddRowButton
                    hideDeleteButtons
                    readOnly={!manualEditMode}
                    rowValidationStatus={importValidationStatus}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-700 px-4 py-3">
                <button
                  type="button"
                  className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
                  onClick={() => {
                    onDiscardImportPreview?.();
                    setIsImportDrawerOpen(false);
                  }}
                >
                  {t("ahv.import.discard")}
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs font-semibold ${
                    duplicateMappingTargets.length > 0
                      ? "cursor-not-allowed bg-slate-600 text-slate-300"
                      : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  }`}
                  onClick={() => {
                    onAcceptImportPreview?.();
                    setIsImportDrawerOpen(false);
                  }}
                  disabled={duplicateMappingTargets.length > 0}
                >
                  {t("ahv.import.accept", { count: importPreview.rows.length })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {(contributionIssues || []).length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-900/30 p-box-sm text-xs text-amber-200">
          {(contributionIssues || []).map((issue) => (
            <p key={issue}>- {issue}</p>
          ))}
        </div>
      )}
      <div className="form-actions-row">
        <DirtySaveButton
          isDirty={isDirty}
          isSaving={isSaving}
          savedState={savedState}
          onClick={handleSave}
          label={t("common.saveDetails")}
        />
      </div>
    </div>
  );
};

