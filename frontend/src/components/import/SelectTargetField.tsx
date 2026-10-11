import React, { useMemo, useState } from "react";
import { PdfFieldSchema } from "../../types/pdfFieldSchema";

export type ImportPreviewField = PdfFieldSchema;

export type ImportPreview = {
  filename: string;
  documentType: string;
  fields: ImportPreviewField[];
};

export type TargetFieldOption = {
  id: string;
  label: string;
};

export type TargetCardOption = {
  id: string;
  label: string;
  fields: TargetFieldOption[];
};

type SelectTargetFieldProps = {
  preview: ImportPreview;
  cardOptions: TargetCardOption[];
  defaultCardId?: string;
  onConfirm: (params: {
    sourceFieldIds: string[];
    targetCardId: string;
    targetFieldId: string;
    values: string[];
    selectedFields: ImportPreviewField[];
    pendingReviewFieldIds: string[];
    includeSecondary: boolean;
  }) => void;
  onCancel: () => void;
};

export const SelectTargetField: React.FC<SelectTargetFieldProps> = ({
  preview,
  cardOptions,
  defaultCardId,
  onConfirm,
  onCancel,
}) => {
  const firstSource = preview.fields[0]?.id || "";
  const initialCardId = defaultCardId && cardOptions.some((c) => c.id === defaultCardId)
    ? defaultCardId
    : cardOptions[0]?.id || "";
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(firstSource ? [firstSource] : []);
  const [targetCardId, setTargetCardId] = useState(initialCardId);
  const [includeSecondary, setIncludeSecondary] = useState(false);

  const targetFields = useMemo(
    () => cardOptions.find((option) => option.id === targetCardId)?.fields || [],
    [cardOptions, targetCardId],
  );
  const [targetFieldId, setTargetFieldId] = useState(targetFields[0]?.id || "");

  const selectedSources = preview.fields.filter((field) => selectedSourceIds.includes(field.id));
  const pendingReviewSources = selectedSources.filter((field) => field.priority === "secondary");

  const getConfidenceTone = (score: number) => {
    const normalized = score;
    if (normalized >= 0.85) return "border-green-600/50 bg-green-900/30 text-green-200";
    if (normalized >= 0.5) return "border-amber-600/50 bg-amber-900/30 text-amber-200";
    return "border-red-600/50 bg-red-900/30 text-red-200";
  };

  const getConfidenceLabel = (score: number) => {
    const normalized = score;
    if (normalized >= 0.85) return "Hoch";
    if (normalized >= 0.5) return "Mittel";
    return "Niedrig";
  };

  const toDisplayValue = (field: ImportPreviewField): string => {
    const raw = String(field.value ?? "");
    const normalized = raw.trim().toLowerCase();
    const accountTypeLabels: Record<string, string> = {
      bank: "Bankkonto",
      cash: "Bargeld",
      depot: "Depot",
      pillar3a: "Säule 3a Konto",
      vested_benefits: "Freizügigkeitskonto",
      other: "Sonstiges",
      konto: "Bankkonto",
      bankkonto: "Bankkonto",
    };
    const looksLikeAccountType =
      field.id === "accountType"
      || field.id === "account_type"
      || field.label.toLowerCase().includes("kontotyp");
    if (looksLikeAccountType && accountTypeLabels[normalized]) {
      return accountTypeLabels[normalized];
    }
    return raw;
  };

  return (
    <div className="popover-smooth popover-open popover-mount-in mt-2 space-y-3 rounded-lg border border-slate-700 bg-surface-2 p-box text-sm">
      <div>
        <p className="font-semibold text-slate-100">Dokument Vorschau</p>
        <p className="text-xs text-slate-400">
          {preview.filename} ({preview.documentType})
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-slate-700 bg-surface-2 p-box-sm">
        <p className="text-xs font-medium text-slate-300">1) Parse & Preview</p>
        <div className="max-h-24 space-y-1 overflow-y-auto pr-1">
          {preview.fields.map((field) => (
            <label
              key={field.id}
              className={`flex w-full items-center justify-between rounded border px-2 py-1 text-left text-xs ${
                selectedSourceIds.includes(field.id)
                  ? "border-blue-500/40 bg-blue-500/15 text-blue-100"
                  : `text-slate-300 hover:bg-slate-700 ${getConfidenceTone(field.confidenceScore)}`
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedSourceIds.includes(field.id)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedSourceIds((prev) => [...prev, field.id]);
                    } else {
                      setSelectedSourceIds((prev) => prev.filter((id) => id !== field.id));
                    }
                  }}
                />
                <span>{field.label}</span>
              </span>
              <span className="flex items-center gap-2 text-slate-300">
                <span>{toDisplayValue(field)}</span>
                <span className="rounded border border-slate-600 px-1 py-1 text-2xs">
                  {getConfidenceLabel(field.confidenceScore)} {Math.round(field.confidenceScore * 100)}%
                </span>
                {field.priority === "secondary" && (
                  <span className="rounded border border-amber-500/40 bg-amber-900/40 px-1 py-1 text-2xs text-amber-200">
                    Zu prüfen
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="input-label">2) Ziel-Kachel</label>
          <select
            className="input-field"
            value={targetCardId}
            onChange={(event) => {
              const nextCard = event.target.value;
              setTargetCardId(nextCard);
              const nextFields = cardOptions.find((option) => option.id === nextCard)?.fields || [];
              setTargetFieldId(nextFields[0]?.id || "");
            }}
          >
            {cardOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="input-label">2) Ziel-Feld</label>
          <select
            className="input-field"
            value={targetFieldId}
            onChange={(event) => setTargetFieldId(event.target.value)}
          >
            {targetFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {pendingReviewSources.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
          {pendingReviewSources.length} Feld(er) sind als sekundär markiert (nur prüfen). Sie werden standardmässig nicht
          übernommen.
          <label className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeSecondary}
              onChange={(event) => setIncludeSecondary(event.target.checked)}
            />
            Sekundäre Felder trotzdem übernehmen
          </label>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          onClick={onCancel}
        >
          Abbrechen
        </button>
        <button
          type="button"
          className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          onClick={() => {
            if (selectedSources.length === 0 || !targetCardId || !targetFieldId) return;
            onConfirm({
              sourceFieldIds: selectedSources.map((source) => source.id),
              targetCardId,
              targetFieldId,
              values: selectedSources
                .filter((source) => includeSecondary || source.priority !== "secondary")
                .map((source) => source.value),
              selectedFields: selectedSources,
              pendingReviewFieldIds: selectedSources
                .filter((source) => source.priority === "secondary")
                .map((source) => source.id),
              includeSecondary,
            });
          }}
        >
          3) Bestätigen & Einfügen ({selectedSources.length})
        </button>
      </div>
    </div>
  );
};
