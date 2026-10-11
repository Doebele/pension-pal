import React from "react";

type ExtractedField = {
  id: string;
  label: string;
  suggestedValue: string;
  confirmedValue?: string;
};

type OcrReviewPanelProps = {
  fields: ExtractedField[];
  onChangeField: (id: string, value: string) => void;
  onAccept: () => void;
  onReject: () => void;
};

export const OcrReviewPanel: React.FC<OcrReviewPanelProps> = ({
  fields,
  onChangeField,
  onAccept,
  onReject,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-neutral-400">
          Dokument-Import Review – Werte bestätigen
        </h4>
        <span className="rounded-full bg-amber-500/10 px-2 py-1 text-2xs font-medium text-amber-300">
          Menschliche Prüfung
        </span>
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950/60 p-box">
        {fields.map((field) => (
          <div key={field.id} className="space-y-1">
            <label className="flex items-center justify-between text-xs text-neutral-300">
              <span>{field.label}</span>
              <span className="text-2xs text-neutral-500">Automatisch erkannt: {field.suggestedValue}</span>
            </label>
            <input
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none ring-emerald-500/40 focus:border-emerald-500 focus:ring-1"
              value={field.confirmedValue ?? field.suggestedValue}
              onChange={(e) => onChangeField(field.id, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
          onClick={onReject}
        >
          Verwerfen
        </button>
        <button
          type="button"
          className="rounded-md bg-emerald-500 px-3 py-1 text-sm font-medium text-neutral-900 hover:bg-emerald-400"
          onClick={onAccept}
        >
          Werte bestätigen
        </button>
      </div>
    </div>
  );
};

