import React from "react";
import { DirtySaveButton } from "../common/DirtySaveButton";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { FieldHelpLabel } from "../common/FieldHelpLabel";
import { OverviewRowList } from "../dashboard/OverviewRowList";

export type InvestmentAssetsState = {
  etfChf: string;
  stocksChf: string;
  savingsPlanChf: string;
  realEstateEtfChf: string;
};

type InvestmentAssetsCardProps = {
  data: InvestmentAssetsState;
  isActive: boolean;
  onChange: (field: keyof InvestmentAssetsState, value: string) => void;
  onSave: () => void | Promise<void>;
};

export const InvestmentAssetsCard: React.FC<InvestmentAssetsCardProps> = ({
  data,
  isActive,
  onChange,
  onSave,
}) => {
  const { isDirty, isSaving, savedState, handleSave, markUserInteraction } = useFormPersistence(
    data,
    onSave,
  );
  const parseAmount = (value: string) => {
    const parsed = Number((value || "").replace(/['\s]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const totalInvestmentChf =
    parseAmount(data.etfChf)
    + parseAmount(data.stocksChf)
    + parseAmount(data.savingsPlanChf)
    + parseAmount(data.realEstateEtfChf);
  if (!isActive) {
    return (
      <OverviewRowList
        rows={[
          { label: "Anlagevermögen", value: `CHF ${totalInvestmentChf.toLocaleString("de-CH", { maximumFractionDigits: 2 })}` },
          { label: "Positionen", value: 4 },
        ]}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">ETFs, Aktien, Sparpläne und Immobilien-ETFs getrennt erfassen.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <FieldHelpLabel
            id="investment-etf-chf"
            label="ETF (CHF)"
            helpText="ETF-Bestände zeigen den liquiden Anlageanteil im Depot. Du findest den Wert im aktuellen Depotauszug."
          />
          <input id="investment-etf-chf" className="input-field input-field--amount" value={data.etfChf} onChange={(e) => {
            markUserInteraction();
            onChange("etfChf", e.target.value);
          }} />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="investment-stocks-chf"
            label="Aktien (CHF)"
            helpText="Aktienpositionen beeinflussen Rendite- und Risikoszenarien. Quelle ist dein Wertschriftendepot."
          />
          <input id="investment-stocks-chf" className="input-field input-field--amount" value={data.stocksChf} onChange={(e) => {
            markUserInteraction();
            onChange("stocksChf", e.target.value);
          }} />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="investment-savings-plan-chf"
            label="Sparpläne (CHF)"
            helpText="Sparpläne erfassen regelmässige Einzahlungen in Anlagen. Den Betrag findest du in deinem Bank- oder Brokerprofil."
          />
          <input id="investment-savings-plan-chf" className="input-field input-field--amount" value={data.savingsPlanChf} onChange={(e) => {
            markUserInteraction();
            onChange("savingsPlanChf", e.target.value);
          }} />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="investment-real-estate-etf-chf"
            label="Immobilien-ETF (CHF)"
            helpText="Immobilien-ETF werden separat für die Vermögensstruktur ausgewiesen. Basis ist der Depotwert dieser Positionen."
          />
          <input id="investment-real-estate-etf-chf" className="input-field input-field--amount" value={data.realEstateEtfChf} onChange={(e) => {
            markUserInteraction();
            onChange("realEstateEtfChf", e.target.value);
          }} />
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
