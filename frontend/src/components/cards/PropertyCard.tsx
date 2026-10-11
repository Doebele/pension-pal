import React from "react";
import { LocationAutocomplete } from "../LocationAutocomplete";
import { SwissLocation } from "../locationSearch";
import { DirtySaveButton } from "../common/DirtySaveButton";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { FieldHelpLabel } from "../common/FieldHelpLabel";
import { OverviewRowList } from "../dashboard/OverviewRowList";
import { getDynamicAmountStep } from "../../utils/dynamicAmountStep";

type PropertyCardState = {
  name: string;
  canton: string;
  cantonCode: string;
  municipality: string;
  municipalityId: string;
  zipCode: string;
  estimatedMarketValue: string;
  mortgageAmount: string;
  landAreaSqm: string;
  buildingVolumeCubicM: string;
  imputedRentPerYear: string;
  usage: "owner_occupied" | "rented_out" | "mixed";
};

type PropertyCardProps = {
  data: PropertyCardState;
  onChange: (field: keyof PropertyCardState, value: string) => void;
  onZipCodeChange: (value: string) => void;
  onLocationSelect: (location: SwissLocation) => void;
  zipLookupStatus?: string;
  isActive: boolean;
  onSave: () => void | Promise<void>;
};

export const PropertyCard: React.FC<PropertyCardProps> = ({
  data,
  onChange,
  onZipCodeChange,
  onLocationSelect,
  zipLookupStatus,
  isActive,
  onSave,
}) => {
  const { isDirty, isSaving, savedState, handleSave, markUserInteraction } = useFormPersistence(
    data,
    onSave,
  );
  const toNumericAmount = (raw: string): number => {
    const normalized = raw.replace(/['\s]/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  if (!isActive) {
    const usageLabel =
      data.usage === "owner_occupied"
        ? "Eigengebrauch"
        : data.usage === "rented_out"
        ? "Vermietet"
        : data.usage === "mixed"
        ? "Gemischt"
        : "Nicht gesetzt";
    return (
      <OverviewRowList
        rows={[
          { label: "Objekt", value: data.name || "Wohneigentum noch nicht erfasst" },
          { label: "Wert", value: `CHF ${data.estimatedMarketValue || "0"}` },
          { label: "Hypothek", value: `CHF ${data.mortgageAmount || "0"}` },
          { label: "Nutzung", value: usageLabel },
        ]}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-300">
        Erfasse hier dein Wohneigentum inkl. Hypothek, Schätzwert und steuerlich relevanten Angaben
        (Eigenmietwert, Grundstücksfläche, Kubatur).
      </p>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <FieldHelpLabel
            id="property-name"
            className="text-neutral-300"
            label="Bezeichnung Objekt"
            helpText="Die Objektbezeichnung dient der Zuordnung in Analyse und Export. Verwende den Namen aus Kauf- oder Finanzierungsunterlagen."
          />
          <input
            id="property-name"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            value={data.name}
            onChange={(e) => {
              markUserInteraction();
              onChange("name", e.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="property-usage"
            className="text-neutral-300"
            label="Nutzung"
            helpText="Die Nutzung steuert, ob Eigennutzung oder Vermietung in Cashflows einfliesst. Quelle ist die aktuelle Verwendung der Immobilie."
          />
          <select
            id="property-usage"
            className="input-field py-1 text-sm"
            value={data.usage}
            onChange={(e) => {
              markUserInteraction();
              onChange("usage", e.target.value);
            }}
          >
            <option value="owner_occupied">Eigengebrauch</option>
            <option value="rented_out">Vermietet</option>
            <option value="mixed">Gemischt</option>
          </select>
        </div>

        <div className="space-y-1">
          <FieldHelpLabel
            id="property-municipality"
            className="text-neutral-300"
            label="Gemeinde (Autocomplete)"
            helpText="Gemeinde und Kanton sind relevant für Steuer- und Standortannahmen. Suche nach deinem offiziellen Wohn- oder Objektstandort."
          />
          <LocationAutocomplete
            value={data.municipality}
            onInputChange={(value) => {
              markUserInteraction();
              onChange("municipality", value);
              onChange("municipalityId", "");
              onChange("cantonCode", "");
              onChange("canton", "");
            }}
            onSelect={(location) => {
              markUserInteraction();
              onLocationSelect(location);
            }}
          />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="property-canton"
            className="text-neutral-300"
            label="Kanton"
            helpText="Der Kanton wird aus dem Standort abgeleitet und für steuerliche Modelle verwendet."
          />
          <input
            id="property-canton"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            value={data.canton}
            readOnly
          />
        </div>

        <div className="space-y-1">
          <FieldHelpLabel
            id="property-zip-code"
            className="text-neutral-300"
            label="PLZ"
            helpText="Die PLZ dient zur automatischen Standorterkennung. Du findest sie in offiziellen Adressdaten."
          />
          <input
            id="property-zip-code"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            value={data.zipCode}
            onChange={(e) => {
              markUserInteraction();
              onZipCodeChange(e.target.value);
            }}
          />
          {zipLookupStatus && <p className="text-2xs text-slate-400">{zipLookupStatus}</p>}
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="property-tax-key"
            className="text-neutral-300"
            label="Steuerschlüssel"
            helpText="Der Steuerschlüssel wird aus Kanton und Gemeinde erzeugt und für Steuerannahmen genutzt."
          />
          <input
            id="property-tax-key"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none"
            value={
              data.cantonCode && data.municipalityId
                ? `${data.cantonCode}-${data.municipalityId}`
                : ""
            }
            placeholder="Wird automatisch gesetzt"
            readOnly
          />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="property-estimated-value"
            className="text-neutral-300"
            label="Schätzwert Immobilie (CHF)"
            helpText="Der Marktwert wird für die Nettovermögensberechnung verwendet. Nutze Bank- oder Steuerbewertung als Quelle."
          />
          <input
            id="property-estimated-value"
            type="number"
            step={getDynamicAmountStep(toNumericAmount(data.estimatedMarketValue))}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            value={data.estimatedMarketValue}
            onChange={(e) => {
              markUserInteraction();
              onChange("estimatedMarketValue", e.target.value);
            }}
          />
        </div>

        <div className="space-y-1">
          <FieldHelpLabel
            id="property-mortgage"
            className="text-neutral-300"
            label="Hypothek (CHF)"
            helpText="Die Hypothek reduziert das Nettovermögen und beeinflusst Ausgaben. Quelle ist die aktuelle Hypothekenabrechnung."
          />
          <input
            id="property-mortgage"
            type="number"
            step={getDynamicAmountStep(toNumericAmount(data.mortgageAmount))}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            value={data.mortgageAmount}
            onChange={(e) => {
              markUserInteraction();
              onChange("mortgageAmount", e.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="property-land-area"
            className="text-neutral-300"
            label="Grundstücksfläche (m²)"
            helpText="Die Fläche hilft bei Plausibilisierung und Objektkontext. Du findest sie im Grundbuchauszug."
          />
          <input
            id="property-land-area"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            value={data.landAreaSqm}
            onChange={(e) => {
              markUserInteraction();
              onChange("landAreaSqm", e.target.value);
            }}
          />
        </div>

        <div className="space-y-1">
          <FieldHelpLabel
            id="property-building-volume"
            className="text-neutral-300"
            label="Kubatur (m³)"
            helpText="Die Kubatur kann für Bewertung und Vergleich genutzt werden. Quelle sind Bauunterlagen oder Schätzungsdokumente."
          />
          <input
            id="property-building-volume"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            value={data.buildingVolumeCubicM}
            onChange={(e) => {
              markUserInteraction();
              onChange("buildingVolumeCubicM", e.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <FieldHelpLabel
            id="property-imputed-rent"
            className="text-neutral-300"
            label="Eigenmietwert p.a. (CHF)"
            helpText="Der Eigenmietwert ist für Steuer- und Cashflow-Szenarien relevant. Wert aus Steuerveranlagung oder kantonaler Einschätzung."
          />
          <input
            id="property-imputed-rent"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            value={data.imputedRentPerYear}
            onChange={(e) => {
              markUserInteraction();
              onChange("imputedRentPerYear", e.target.value);
            }}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <DirtySaveButton
          isDirty={isDirty}
          isSaving={isSaving}
          savedState={savedState}
          onClick={handleSave}
          label="Angaben speichern"
        />
      </div>
    </div>
  );
};


