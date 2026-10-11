import React from "react";
import { useTranslation } from "react-i18next";
import { DirtySaveButton } from "../common/DirtySaveButton";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { FieldHelpLabel } from "../common/FieldHelpLabel";
import { CANTON_OPTIONS } from "../../services/swissTax";
import { OverviewRowList } from "../dashboard/OverviewRowList";
import { MARITAL_STATUS_OPTIONS, SHOW_MARRIAGE_FIELDS_FOR } from "../../constants/maritalStatusOptions";
import { useMarriageDuration } from "../../hooks/useMarriageDuration";
import type {
  AdditionalProperty,
  LivingSituation,
  MaritalStatusValue,
  ProfileGender,
} from "../../types/personalDataTypes";
type PrimaryProperty = {
  name: string;
  estimatedMarketValue: string;
  mortgageAmount: string;
  landAreaSqm: string;
  usage: "owner_occupied" | "rented_out" | "mixed";
};

type PersonalDataCardProps = {
  birthDate: string;
  gender: ProfileGender;
  onBirthDateChange: (value: string) => void;
  onGenderChange: (value: ProfileGender) => void;
  maritalStatus: MaritalStatusValue | "";
  marriageYear: string;
  divorceYear: string;
  taxDomicileCanton: string;
  onMaritalStatusChange: (value: MaritalStatusValue) => void;
  onMarriageYearChange: (value: string) => void;
  onDivorceYearChange: (value: string) => void;
  onTaxDomicileCantonChange: (value: string) => void;
  livingSituation: LivingSituation;
  onLivingSituationChange: (value: LivingSituation) => void;
  rentMonthlyChf: string;
  rentYearlyChf: string;
  onRentMonthlyChfChange: (value: string) => void;
  onRentYearlyChfChange: (value: string) => void;
  primaryProperty: PrimaryProperty;
  onPrimaryPropertyChange: (field: keyof PrimaryProperty, value: string) => void;
  additionalProperties: AdditionalProperty[];
  onAddAdditionalProperty: () => void;
  onRemoveAdditionalProperty: (id: string) => void;
  onAdditionalPropertyChange: (id: string, field: keyof AdditionalProperty, value: string | boolean) => void;
  isActive: boolean;
  onSave: () => void | Promise<void>;
};

export const PersonalDataCard: React.FC<PersonalDataCardProps> = ({
  birthDate,
  gender,
  onBirthDateChange,
  onGenderChange,
  maritalStatus,
  marriageYear,
  divorceYear,
  taxDomicileCanton,
  onMaritalStatusChange,
  onMarriageYearChange,
  onDivorceYearChange,
  onTaxDomicileCantonChange,
  livingSituation,
  onLivingSituationChange,
  rentMonthlyChf,
  rentYearlyChf,
  onRentMonthlyChfChange,
  onRentYearlyChfChange,
  primaryProperty,
  onPrimaryPropertyChange,
  additionalProperties,
  onAddAdditionalProperty,
  onRemoveAdditionalProperty,
  onAdditionalPropertyChange,
  isActive,
  onSave,
}) => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const maxAdultYear = currentYear - 18;
  const maritalLabel = maritalStatus ? t(`options.maritalStatus.${maritalStatus}`) : t("common.notSet");
  const genderLabel = gender ? t(`options.gender.${gender}`) : t("common.notSet");
  const {
    shouldShowMarriageFields,
    shouldShowDivorceYear,
    years: marriageYears,
    errors: marriageErrors,
  } = useMarriageDuration(maritalStatus, marriageYear, divorceYear);
  const birthDateError = React.useMemo(() => {
    if (!birthDate) return "";
    const parsed = new Date(birthDate);
    if (Number.isNaN(parsed.getTime())) return t("personal.birthDate.errorInvalid");
    const now = new Date();
    if (parsed > now) return t("personal.birthDate.errorFuture");
    const minAdultDate = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
    if (parsed > minAdultDate) return t("personal.birthDate.errorMinAge");
    return "";
  }, [birthDate, t]);
  const { isDirty, isSaving, savedState, handleSave, markUserInteraction } = useFormPersistence(
    {
      birthDate,
      gender,
      maritalStatus,
      marriageYear,
      divorceYear,
      taxDomicileCanton,
      livingSituation,
      rentMonthlyChf,
      rentYearlyChf,
      primaryProperty,
      additionalProperties,
    },
    onSave,
  );

  if (!isActive) {
    const rows = [
      { label: t("personal.birthDate.label"), value: birthDate || t("common.notSet") },
      { label: t("personal.gender.label"), value: genderLabel },
      { label: t("personal.maritalStatus.label"), value: maritalLabel },
      {
        label: t("personal.livingSituation.label"),
        value:
          livingSituation === "rent"
            ? t("options.livingSituation.rentShort")
            : livingSituation === "own"
            ? t("options.livingSituation.own")
            : t("common.open"),
      },
      { label: t("personal.taxDomicile.label"), value: taxDomicileCanton || t("common.notSet") },
      ...(SHOW_MARRIAGE_FIELDS_FOR.has(maritalStatus as MaritalStatusValue) && marriageYear
        ? [{ label: t("personal.marriageYear.label"), value: marriageYear }]
        : []),
      ...(maritalStatus === "divorced" && divorceYear
        ? [{ label: t("personal.divorceYear.label"), value: divorceYear }]
        : []),
      ...(SHOW_MARRIAGE_FIELDS_FOR.has(maritalStatus as MaritalStatusValue) && marriageYear
        ? [{ label: t("personal.marriageYears.label"), value: `${marriageYears} ${t("common.years")}` }]
        : []),
    ];
    return (
      <OverviewRowList rows={rows} />
    );
  }

  return (
    <div className="form-card space-y-3">
      <p className="text-sm text-slate-400">{t("personal.intro")}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2">
          <FieldHelpLabel
            id="personal-birth-date"
            label={t("personal.birthDate.label")}
            helpText={t("personal.birthDate.help")}
          />
          <input
            id="personal-birth-date"
            type="date"
            className={`input-field ${birthDateError ? "field-error" : ""}`}
            value={birthDate}
            onChange={(e) => {
              markUserInteraction();
              onBirthDateChange(e.target.value);
            }}
          />
          {birthDateError && <p className="field-error-text">{birthDateError}</p>}
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="personal-gender"
            label={t("personal.gender.label")}
            helpText={t("personal.gender.help")}
          />
          <select
            id="personal-gender"
            className="input-field"
            value={gender}
            onChange={(e) => {
              markUserInteraction();
              onGenderChange(e.target.value as ProfileGender);
            }}
          >
            <option value="">{t("common.pleaseSelect")}</option>
            <option value="male">{t("options.gender.male")}</option>
            <option value="female">{t("options.gender.female")}</option>
            <option value="other">{t("options.gender.other")}</option>
          </select>
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="personal-marital-status"
            label={t("personal.maritalStatus.label")}
            helpText={t("personal.maritalStatus.help")}
          />
          <select
            id="personal-marital-status"
            className="input-field"
            value={maritalStatus}
            onChange={(e) => {
              markUserInteraction();
              onMaritalStatusChange(e.target.value as MaritalStatusValue);
            }}
          >
            <option value="">{t("common.pleaseSelect")}</option>
            {MARITAL_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(`options.maritalStatus.${option.value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="personal-living-situation"
            label={t("personal.livingSituation.label")}
            helpText={t("personal.livingSituation.help")}
          />
          <select
            id="personal-living-situation"
            className="input-field"
            value={livingSituation}
            onChange={(e) => {
              markUserInteraction();
              onLivingSituationChange(e.target.value as LivingSituation);
            }}
          >
            <option value="">{t("common.pleaseSelect")}</option>
            <option value="rent">{t("options.livingSituation.rent")}</option>
            <option value="own">{t("options.livingSituation.own")}</option>
          </select>
        </div>
        <div className="space-y-2">
          <FieldHelpLabel
            id="personal-tax-domicile-canton"
            label={t("personal.taxDomicile.label")}
            helpText={t("personal.taxDomicile.help")}
          />
          <select
            id="personal-tax-domicile-canton"
            className="input-field"
            value={taxDomicileCanton}
            onChange={(event) => {
              markUserInteraction();
              onTaxDomicileCantonChange(event.target.value);
            }}
          >
            <option value="">{t("common.pleaseSelect")}</option>
            {CANTON_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        {shouldShowMarriageFields && (
          <div className="space-y-2">
            <FieldHelpLabel
              id="marriage-year"
              label={t("personal.marriageYear.label")}
              helpText={t("personal.marriageYear.help")}
            />
            <input
              id="marriage-year"
              type="number"
              className={`input-field ${marriageErrors.marriageYear ? "field-error" : ""}`}
              min={1900}
              max={maxAdultYear}
              value={marriageYear}
              onChange={(event) => {
                markUserInteraction();
                onMarriageYearChange(event.target.value);
              }}
            />
            {marriageErrors.marriageYear && <p className="field-error-text">{marriageErrors.marriageYear}</p>}
          </div>
        )}
        {shouldShowDivorceYear && (
          <div className="space-y-2">
            <FieldHelpLabel
              id="divorce-year"
              label={t("personal.divorceYear.label")}
              helpText={t("personal.divorceYear.help")}
            />
            <input
              id="divorce-year"
              type="number"
              className={`input-field ${marriageErrors.divorceYear ? "field-error" : ""}`}
              min={1900}
              max={maxAdultYear}
              value={divorceYear}
              onChange={(event) => {
                markUserInteraction();
                onDivorceYearChange(event.target.value);
              }}
            />
            {marriageErrors.divorceYear && <p className="field-error-text">{marriageErrors.divorceYear}</p>}
          </div>
        )}
        {shouldShowMarriageFields && (
          <div className="space-y-2">
            <FieldHelpLabel id="marriage-years" label={t("personal.marriageYears.label")} helpText={t("personal.marriageYears.help")} />
            <div className="rounded-lg border border-slate-700 bg-surface-2 px-3 py-2">
              <p className="text-xs text-blue-200">{t("common.autoCalculated")}</p>
              <p className="text-2xl font-light text-blue-100">{marriageYears} {t("common.years")}</p>
              <p className="text-xs text-blue-300/90">
                {shouldShowDivorceYear && divorceYear ? t("personal.marriageYears.formulaDivorce") : t("personal.marriageYears.formulaCurrent")}
              </p>
            </div>
          </div>
        )}
      </div>

      {livingSituation === "rent" && (
        <div className="form-grid-3" aria-expanded>
          <div className="space-y-1">
            <FieldHelpLabel
              id="rent-monthly-chf"
              label={t("personal.rentMonthly.label")}
              helpText={t("personal.rentMonthly.help")}
            />
            <input
              id="rent-monthly-chf"
              className="input-field"
              required
              value={rentMonthlyChf}
              onChange={(event) => {
                markUserInteraction();
                onRentMonthlyChfChange(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1">
            <FieldHelpLabel
              id="rent-yearly-chf"
              label={t("personal.rentYearly.label")}
              helpText={t("personal.rentYearly.help")}
            />
            <input
              id="rent-yearly-chf"
              className="input-field"
              value={rentYearlyChf}
              onChange={(event) => {
                markUserInteraction();
                onRentYearlyChfChange(event.target.value);
              }}
            />
          </div>
        </div>
      )}

      {livingSituation === "own" && (
        <div className="space-y-3" aria-expanded>
          <div className="form-grid-3">
            <div className="space-y-1">
              <FieldHelpLabel
                id="primary-property-name"
                label={t("personal.propertyName.label")}
                helpText={t("personal.propertyName.help")}
              />
              <input
                id="primary-property-name"
                className="input-field"
                value={primaryProperty.name}
                onChange={(event) => {
                  markUserInteraction();
                  onPrimaryPropertyChange("name", event.target.value);
                }}
              />
            </div>
            <div className="space-y-1">
              <FieldHelpLabel
                id="primary-property-usage"
                label={t("personal.propertyUsage.label")}
                helpText={t("personal.propertyUsage.help")}
              />
              <select
                id="primary-property-usage"
                className="input-field"
                value={primaryProperty.usage}
                onChange={(event) => {
                  markUserInteraction();
                  onPrimaryPropertyChange("usage", event.target.value);
                }}
              >
                <option value="owner_occupied">{t("options.propertyUsage.owner_occupied")}</option>
                <option value="rented_out">{t("options.propertyUsage.rented_out")}</option>
                <option value="mixed">{t("options.propertyUsage.mixed")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <FieldHelpLabel
                id="primary-property-value"
                label={t("personal.propertyValue.label")}
                helpText={t("personal.propertyValue.help")}
              />
              <input
                id="primary-property-value"
                className="input-field"
                value={primaryProperty.estimatedMarketValue}
                onChange={(event) => {
                  markUserInteraction();
                  onPrimaryPropertyChange("estimatedMarketValue", event.target.value);
                }}
              />
            </div>
            <div className="space-y-1">
              <FieldHelpLabel
                id="primary-property-mortgage"
                label={t("personal.propertyMortgage.label")}
                helpText={t("personal.propertyMortgage.help")}
              />
              <input
                id="primary-property-mortgage"
                className="input-field"
                value={primaryProperty.mortgageAmount}
                onChange={(event) => {
                  markUserInteraction();
                  onPrimaryPropertyChange("mortgageAmount", event.target.value);
                }}
              />
            </div>
            <div className="space-y-1">
              <FieldHelpLabel
                id="primary-property-land-area"
                label={t("personal.propertyLandArea.label")}
                helpText={t("personal.propertyLandArea.help")}
              />
              <input
                id="primary-property-land-area"
                className="input-field"
                value={primaryProperty.landAreaSqm}
                onChange={(event) => {
                  markUserInteraction();
                  onPrimaryPropertyChange("landAreaSqm", event.target.value);
                }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-surface-2 p-box">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-200">{t("personal.additionalProperties.title")}</p>
              <button
                type="button"
                className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  markUserInteraction();
                  onAddAdditionalProperty();
                }}
              >
                {t("personal.additionalProperties.add")}
              </button>
            </div>
            <div className="space-y-3">
              {additionalProperties.map((entry, index) => (
                <div key={entry.id} className="rounded-md border border-slate-700 p-box-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-200">{t("personal.additionalProperties.item", { index: index + 2 })}</p>
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-slate-200"
                      onClick={() => {
                        markUserInteraction();
                        onRemoveAdditionalProperty(entry.id);
                      }}
                    >
                      {t("common.remove")}
                    </button>
                  </div>
                  <div className="form-grid-3 gap-2">
                    <input
                      className="input-field"
                      placeholder={t("personal.additionalProperties.labelPlaceholder")}
                      value={entry.label}
                      onChange={(event) => {
                        markUserInteraction();
                        onAdditionalPropertyChange(entry.id, "label", event.target.value);
                      }}
                    />
                    <label className="flex items-center gap-2 rounded-md border border-slate-700 px-2 py-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        className="checkbox-field"
                        checked={entry.isRentalUnit}
                        onChange={(event) => {
                          markUserInteraction();
                          onAdditionalPropertyChange(entry.id, "isRentalUnit", event.target.checked);
                        }}
                      />
                      {t("personal.additionalProperties.rentalUnit")}
                    </label>
                    <input
                      className="input-field"
                      placeholder={t("personal.additionalProperties.valuePlaceholder")}
                      value={entry.estimatedMarketValueChf}
                      onChange={(event) => {
                        markUserInteraction();
                        onAdditionalPropertyChange(
                          entry.id,
                          "estimatedMarketValueChf",
                          event.target.value,
                        );
                      }}
                    />
                    <input
                      className="input-field"
                      placeholder={t("personal.additionalProperties.mortgagePlaceholder")}
                      value={entry.mortgageAmountChf}
                      onChange={(event) => {
                        markUserInteraction();
                        onAdditionalPropertyChange(entry.id, "mortgageAmountChf", event.target.value);
                      }}
                    />
                    {entry.isRentalUnit && (
                      <input
                        className="input-field sm:col-span-2"
                        placeholder={t("personal.additionalProperties.rentalIncomePlaceholder")}
                        required
                        value={entry.monthlyRentalIncomeChf}
                        onChange={(event) => {
                          markUserInteraction();
                          onAdditionalPropertyChange(entry.id, "monthlyRentalIncomeChf", event.target.value);
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="form-actions-row">
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
