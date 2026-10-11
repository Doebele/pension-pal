import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { DirtySaveButton } from "../common/DirtySaveButton";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { DetailsAccordion } from "../common/DetailsAccordion";
import { FieldHelpLabel } from "../common/FieldHelpLabel";
import { OverviewRowList } from "../dashboard/OverviewRowList";

export type PensionFundSnapshot = {
  provider: string;
  asOfDate: string;

  annualSalary: string;
  insuredSalaryTotal: string;
  bvgInsuredSalary: string;

  currentOldageCapital: string;
  bvgOldageCapital: string;
  vestedBenefitsTotal: string;
  maxBuyinTotal: string;
  wefAvailable: string;

  coordinationDeduction: string;
  insuredSalaryRentenplan: string;
  insuredSalaryBonusplan: string;
  maxBuyinRentenplan: string;
  maxBuyinBonusplan: string;
};

type PensionFundCardProps = {
  data: PensionFundSnapshot;
  onChange: (field: keyof PensionFundSnapshot, value: string) => void;
  isActive: boolean;
  onSave: () => void | Promise<void>;
  detailsOpen?: boolean;
  onDetailsToggle?: (open: boolean) => void;
};

const SUMMARY_FIELDS = [
  "annualSalary",
  "insuredSalaryTotal",
  "currentOldageCapital",
  "bvgOldageCapital",
  "vestedBenefitsTotal",
  "wefAvailable",
] as const;

const DETAIL_FIELDS = [
  "asOfDate",
  "coordinationDeduction",
  "insuredSalaryRentenplan",
  "insuredSalaryBonusplan",
  "maxBuyinTotal",
  "maxBuyinRentenplan",
  "maxBuyinBonusplan",
] as const;

export const PensionFundCard: React.FC<PensionFundCardProps> = ({
  data,
  onChange,
  isActive,
  onSave,
  detailsOpen,
  onDetailsToggle,
}) => {
  const { t } = useTranslation();
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = detailsOpen ?? localExpanded;
  const setExpanded = (next: boolean) => {
    if (onDetailsToggle) {
      onDetailsToggle(next);
      return;
    }
    setLocalExpanded(next);
  };
  const { isDirty, isSaving, savedState, handleSave, markUserInteraction } = useFormPersistence(
    data,
    onSave,
  );

  if (!isActive) {
    return (
      <OverviewRowList
        rows={[
          { label: t("bvg.overview.annualSalary"), value: `CHF ${data.annualSalary || "0"}` },
          { label: t("bvg.overview.oldageCapital"), value: `CHF ${data.currentOldageCapital || "0"}` },
          { label: t("bvg.overview.bvgCapital"), value: `CHF ${data.bvgOldageCapital || "0"}` },
        ]}
      />
    );
  }

  return (
    <div className="form-card flex flex-col gap-3">
      {/* Kopfbereich mit relevanten Kennzahlen für die Berechnung */}
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <span className="font-medium text-neutral-100">{data.provider || t("bvg.providerFallback")}</span>
            {data.asOfDate && <span>• {t("bvg.asOf", { date: data.asOfDate })}</span>}
          </div>
          <p className="text-xs text-neutral-500">{t("bvg.intro")}</p>
        </div>
      </div>

      <div className="form-grid-3 rounded-lg border border-neutral-800 bg-neutral-950/70 p-box text-xs">
        {SUMMARY_FIELDS.map((field) => (
          <div key={field} className="space-y-1">
            <FieldHelpLabel
              id={`pk-summary-${field}`}
              className="text-neutral-300"
              label={t(`bvg.fields.${field}`)}
              helpText={t("bvg.summaryHelp")}
            />
            <input
              id={`pk-summary-${field}`}
              className="input-field input-field--amount"
              value={data[field]}
              onChange={(e) => {
                markUserInteraction();
                onChange(field, e.target.value);
              }}
            />
          </div>
        ))}
      </div>

      <DetailsAccordion
        title={t("bvg.moreDetails")}
        isOpen={expanded}
        onToggle={() => setExpanded(!expanded)}
      >
        <div className="space-y-3 text-xs">
          <div className="form-grid-3">
            {DETAIL_FIELDS.map((field) => (
              <div key={field} className="space-y-1">
                <FieldHelpLabel
                  id={`pk-detail-${field}`}
                  className="text-neutral-300"
                  label={t(`bvg.fields.${field}.label`)}
                  helpText={t(`bvg.fields.${field}.help`)}
                />
                <input
                  id={`pk-detail-${field}`} className={`input-field${field === "asOfDate" ? "" : " input-field--amount"}`}
                  value={data[field]}
                  onChange={(e) => {
                    markUserInteraction();
                    onChange(field, e.target.value);
                  }}
                />
              </div>
            ))}
          </div>
          <p className="text-2xs text-neutral-400">{t("bvg.detailsNote")}</p>
        </div>
      </DetailsAccordion>

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
