import React from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { PROFILE_QUERY_KEY } from "../hooks/useUserProfile";
import { applyImportedCsvData, parseImportCsvFile } from "../services/dataImporter";
import type { MissingFieldMode, ParsedCsvImport } from "../types/exportTypes";

type CSVImportModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (importedSections: string[]) => void;
};

export const CSVImportModal: React.FC<CSVImportModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [missingFieldMode, setMissingFieldMode] = React.useState<MissingFieldMode>("error");
  const [progress, setProgress] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [parsed, setParsed] = React.useState<ParsedCsvImport | null>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setMissingFieldMode("error");
      setProgress(0);
      setBusy(false);
      setErrors([]);
      setParsed(null);
    }
  }, [open]);

  if (!open) return null;

  const handleAnalyze = async () => {
    if (!file) {
      setErrors([t("csvImport.selectFirst")]);
      return;
    }
    setBusy(true);
    setErrors([]);
    setParsed(null);
    setProgress(15);
    try {
      setProgress(45);
      const parsedResult = await parseImportCsvFile(file, missingFieldMode);
      setProgress(80);
      setParsed(parsedResult);
      setProgress(100);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("csvImport.invalidFile");
      setErrors([message]);
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!parsed) {
      setErrors([t("csvImport.validateFirst")]);
      return;
    }
    if (!file) {
      setErrors([t("csvImport.selectFirst")]);
      return;
    }
    setBusy(true);
    setErrors([]);
    setProgress(20);
    try {
      setProgress(65);
      const importedSections = await applyImportedCsvData(file, missingFieldMode);
      await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      setProgress(100);
      onSuccess(importedSections);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("csvImport.failed");
      setErrors([message]);
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 px-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-surface p-section shadow-2xl">
        <h2 className="text-base font-semibold text-slate-100">{t("csvImport.title")}</h2>
        <p className="mt-1 text-sm text-slate-300">{t("csvImport.subtitle")}</p>

        <div className="mt-3 space-y-3 rounded-md border border-slate-700 bg-surface-2 p-box">
          <label className="flex flex-col gap-1 text-xs text-slate-300">
            {t("csvImport.chooseFile")}
            <input
              type="file"
              accept=".csv,text/csv"
              className="rounded border border-slate-600 bg-surface px-2 py-1 text-sm text-slate-200 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-slate-100 hover:file:bg-slate-600"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setParsed(null);
                setErrors([]);
                setProgress(0);
              }}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-300">
            {t("csvImport.missingFields")}
            <select
              className="input-field py-1 text-sm"
              value={missingFieldMode}
              onChange={(event) => setMissingFieldMode(event.target.value as MissingFieldMode)}
            >
              <option value="error">{t("csvImport.modeError")}</option>
              <option value="skip">{t("csvImport.modeSkip")}</option>
            </select>
          </label>

          <div>
            <div className="h-2 w-full overflow-hidden rounded bg-slate-700">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">{t("csvImport.progress", { percent: progress })}</p>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}

        {parsed && (
          <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200">
            <p>{t("csvImport.previewDetected", { timestamp: parsed.row.timestamp, version: parsed.row.exportVersion })}</p>
            <p>
              {t("csvImport.previewLine", { birth: parsed.row.birthDate || "n/a", gender: parsed.row.gender || "n/a", bvg: parsed.row.secondPillarGuthaben ?? "n/a" })}
            </p>
            {parsed.warnings.length > 0 && (
              <p className="mt-1 text-amber-200">{parsed.warnings.join(" ")}</p>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
            onClick={onClose}
            disabled={busy}
          >
            {t("csvImport.cancel")}
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-500 px-3 py-1 text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-progress disabled:opacity-70"
            onClick={() => void handleAnalyze()}
            disabled={busy}
          >
            {t("csvImport.validate")}
          </button>
          <button
            type="button"
            className="rounded-md border border-blue-500/60 bg-blue-600/20 px-3 py-1 text-sm font-medium text-blue-100 hover:bg-blue-600/35 disabled:cursor-progress disabled:opacity-70"
            onClick={() => void handleImport()}
            disabled={busy || !parsed}
          >
            {busy ? t("csvImport.inProgress") : t("csvImport.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
};
