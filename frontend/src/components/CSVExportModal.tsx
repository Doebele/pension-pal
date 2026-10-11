import React from "react";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import { exportAllDataAsCsv } from "../services/dataExporter";
import type { ExportCSVData } from "../types/exportTypes";

type CSVExportModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

function triggerFileDownload(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function readProjectIdFromSession(): string | null {
  try {
    const raw = localStorage.getItem("spc_auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: number };
    return parsed.userId ? String(parsed.userId) : null;
  } catch {
    return null;
  }
}

export const CSVExportModal: React.FC<CSVExportModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<ExportCSVData | null>(null);

  React.useEffect(() => {
    if (!open) {
      setBusy(false);
      setError("");
      setResult(null);
    }
  }, [open]);

  if (!open) return null;

  const handleExport = async () => {
    setBusy(true);
    setError("");
    try {
      const profileData = (await api.fetchProfile()) as Record<string, unknown>;
      const projectId = readProjectIdFromSession();
      const exportResult = exportAllDataAsCsv(profileData, projectId);
      triggerFileDownload(exportResult.csvContent, exportResult.fileName);
      setResult(exportResult.data);
      onSuccess();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : t("csvExport.failed");
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 px-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-surface p-section shadow-2xl">
        <h2 className="text-base font-semibold text-slate-100">{t("csvExport.title")}</h2>
        <p className="mt-1 text-sm text-slate-300">{t("csvExport.subtitle")}</p>
        <div className="mt-3 rounded-md border border-slate-700 bg-surface-2 p-box text-xs text-slate-300">
          <p>{t("csvExport.format1")}</p>
          <p>{t("csvExport.format2")}</p>
          <p>{t("csvExport.format3")}</p>
        </div>
        {error && (
          <p className="mt-3 rounded-md border border-red-500/40 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        {result && (
          <p className="mt-3 rounded-md border border-green-500/40 bg-green-900/25 px-3 py-2 text-sm text-green-200">
            {t("csvExport.success", { timestamp: result.timestamp })}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
            onClick={onClose}
            disabled={busy}
          >
            {t("csvExport.close")}
          </button>
          <button
            type="button"
            className="rounded-md border border-blue-500/60 bg-blue-600/20 px-3 py-1 text-sm font-medium text-blue-100 hover:bg-blue-600/35 disabled:cursor-progress disabled:opacity-70"
            onClick={() => void handleExport()}
            disabled={busy}
          >
            {busy ? t("csvExport.inProgress") : t("csvExport.start")}
          </button>
        </div>
      </div>
    </div>
  );
};
