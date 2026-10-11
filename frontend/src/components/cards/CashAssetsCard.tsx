import React from "react";
import { DirtySaveButton } from "../common/DirtySaveButton";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import {
  convertToChf,
  CurrencyCode,
  DEFAULT_FX_RATES,
  SUPPORTED_CURRENCIES,
} from "../../services/fxRates";
import { FieldHelpLabel } from "../common/FieldHelpLabel";
import { OverviewRowList } from "../dashboard/OverviewRowList";

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

export type CashAssetRow = {
  id: string;
  accountName: string;
  accountType: string;
  amount: string;
  currency: CurrencyCode;
  source?: "manual" | "import";
};

export type CashAssetsState = {
  rows: CashAssetRow[];
};

type CashAssetsCardProps = {
  data: CashAssetsState;
  isActive: boolean;
  onChange: (rows: CashAssetRow[]) => void;
  onSave: () => void | Promise<void>;
};

export const CashAssetsCard: React.FC<CashAssetsCardProps> = ({ data, isActive, onChange, onSave }) => {
  const { isDirty, isSaving, savedState, handleSave, markUserInteraction } = useFormPersistence(
    data,
    onSave,
  );
  const rows = Array.isArray(data.rows) ? data.rows : [];

  const parseAmount = (value: string) => {
    const parsed = Number((value || "").replace(/['\s]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  const totalChf = rows.reduce(
    (sum, row) => sum + convertToChf(parseAmount(row.amount), row.currency, DEFAULT_FX_RATES),
    0,
  );

  const addRow = () => {
    markUserInteraction();
    onChange([
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
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    markUserInteraction();
    onChange(rows.filter((row) => row.id !== id));
  };

  if (!isActive) {
    return (
      <OverviewRowList
        rows={[
          { label: "Liquide Mittel", value: `CHF ${totalChf.toLocaleString("de-CH", { maximumFractionDigits: 2 })}` },
          { label: "Konten", value: rows.length },
        ]}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Konten/Barvermögen je Zeile erfassen. Alle Werte werden auf CHF normalisiert.</p>
      <div className="rounded-lg border border-slate-700 bg-surface-2 p-box-sm">
        <div className="grid grid-cols-[1.3fr_0.9fr_1fr_0.8fr_auto] gap-2 px-1 pb-2 text-xs text-slate-400">
          <FieldHelpLabel
            id="cash-header-account"
            label="Konto"
            className="text-xs text-slate-400"
            helpText="Kontobezeichnung zur eindeutigen Zuordnung des Vermögenswerts. Verwende den Namen aus deinem Konto- oder Depotauszug."
          />
          <FieldHelpLabel
            id="cash-header-type"
            label="Typ"
            className="text-xs text-slate-400"
            helpText="Der Kontotyp hilft bei der Kategorisierung von liquiden Mitteln. Auswahl gemäss Kontoart auf deiner Bankbeziehung."
          />
          <FieldHelpLabel
            id="cash-header-amount"
            label="Betrag"
            className="text-xs text-slate-400"
            helpText="Der Betrag fliesst direkt in die Vermögenssumme ein. Nutze den aktuellen Saldo aus Bank-App oder Auszug."
          />
          <FieldHelpLabel
            id="cash-header-currency"
            label="Währung"
            className="text-xs text-slate-400"
            helpText="Die Währung steuert die Umrechnung in CHF für die Gesamtsicht. Währung gemäss Kontostand wählen."
          />
          <span />
        </div>
        <div className="max-h-56 space-y-2 overflow-auto">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[1.3fr_0.9fr_1fr_0.8fr_auto] gap-2">
              <input
                className="input-field"
                value={row.accountName}
                placeholder="z. B. Hauptkonto UBS"
                onChange={(event) => updateRow(row.id, { accountName: event.target.value })}
              />
              <select
                className="input-field"
                aria-label="Kontotyp"
                value={normalizeAccountType(row.accountType)}
                onChange={(event) => updateRow(row.id, { accountType: event.target.value })}
              >
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
                aria-label="Zeile entfernen"
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
            + Add Row
          </button>
          <div className="rounded-md border border-emerald-700/60 bg-emerald-900/25 px-2 py-1 text-xs font-semibold text-emerald-200">
            Total Assets (CHF): {totalChf.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
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
