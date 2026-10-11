import React from "react";
import { useTranslation } from "react-i18next";
import { FieldHelpLabel } from "../common/FieldHelpLabel";

export type AhvContributionRow = {
  year: string;
  annualIncomeChf: string;
  contributionTotalChf: string;
  ageEndOfYear: string;
  ahvRentShareChf: string;
  source?: "manual" | "xlsx" | "pdf";
};

type AhvContributionTableProps = {
  rows: AhvContributionRow[];
  onChangeRow: (index: number, row: AhvContributionRow) => void;
  onAddRow: () => void;
  onDeleteRow: (index: number) => void;
  hideAddRowButton?: boolean;
  hideDeleteButtons?: boolean;
  readOnly?: boolean;
  rowValidationStatus?: Array<{ isValid: boolean; message: string }>;
};

export const AhvContributionTable: React.FC<AhvContributionTableProps> = ({
  rows,
  onChangeRow,
  onAddRow,
  onDeleteRow,
  hideAddRowButton = false,
  hideDeleteButtons = false,
  readOnly = false,
  rowValidationStatus,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-surface-2 p-box-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-200">{t("ahvTable.title")}</p>
        {!hideAddRowButton && (
          <button
            type="button"
            className={`rounded border px-2 py-1 text-xs ${
              readOnly
                ? "cursor-not-allowed border-slate-700 text-slate-500"
                : "border-slate-600 text-slate-200 hover:bg-slate-700"
            }`}
            onClick={onAddRow}
            disabled={readOnly}
          >
            {t("ahvTable.addRow")}
          </button>
        )}
      </div>
      <div className="max-h-56 overflow-auto">
        <table className="w-full min-w-[680px] text-xs">
          <thead>
            <tr className="text-slate-400">
              <th className="px-1 py-1 text-left">
                <FieldHelpLabel
                  id="ahv-table-year"
                  className="text-xs text-slate-400"
                  label={t("ahvTable.year.label")}
                  helpText={t("ahvTable.year.help")}
                />
              </th>
              <th className="px-1 py-1 text-left">
                <FieldHelpLabel
                  id="ahv-table-income"
                  className="text-xs text-slate-400"
                  label={t("ahvTable.income.label")}
                  helpText={t("ahvTable.income.help")}
                />
              </th>
              <th className="px-1 py-1 text-left">
                <FieldHelpLabel
                  id="ahv-table-total"
                  className="text-xs text-slate-400"
                  label={t("ahvTable.total.label")}
                  helpText={t("ahvTable.total.help")}
                />
              </th>
              <th className="px-1 py-1 text-left">
                <FieldHelpLabel
                  id="ahv-table-age"
                  className="text-xs text-slate-400"
                  label={t("ahvTable.age.label")}
                  helpText={t("ahvTable.age.help")}
                />
              </th>
              <th className="px-1 py-1 text-left">
                <FieldHelpLabel
                  id="ahv-table-rent-share"
                  className="text-xs text-slate-400"
                  label={t("ahvTable.rentShare.label")}
                  helpText={t("ahvTable.rentShare.help")}
                />
              </th>
              {rowValidationStatus && <th className="px-1 py-1 text-left">{t("ahvTable.validation")}</th>}
              {!hideDeleteButtons && <th className="px-1 py-1 text-left">{t("ahvTable.action")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.year}-${index}`} className="border-t border-slate-800">
                <td className="px-1 py-1">
                  <input
                    className="input-field"
                    value={row.year}
                    readOnly={readOnly}
                    onChange={(event) => onChangeRow(index, { ...row, year: event.target.value })}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className="input-field input-field--amount"
                    value={row.annualIncomeChf}
                    readOnly={readOnly}
                    onChange={(event) => onChangeRow(index, { ...row, annualIncomeChf: event.target.value })}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className="input-field input-field--amount"
                    value={row.contributionTotalChf}
                    readOnly={readOnly}
                    onChange={(event) => onChangeRow(index, { ...row, contributionTotalChf: event.target.value })}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className="input-field"
                    value={row.ageEndOfYear}
                    readOnly={readOnly}
                    onChange={(event) => onChangeRow(index, { ...row, ageEndOfYear: event.target.value })}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className="input-field input-field--amount"
                    value={row.ahvRentShareChf}
                    readOnly={readOnly}
                    onChange={(event) => onChangeRow(index, { ...row, ahvRentShareChf: event.target.value })}
                  />
                </td>
                {rowValidationStatus && (
                  <td className="px-1 py-1 text-2xs">
                    <span
                      className={`inline-flex rounded border px-1 py-1 ${
                        rowValidationStatus[index]?.isValid
                          ? "border-emerald-500/40 bg-emerald-900/30 text-emerald-200"
                          : "border-rose-500/40 bg-rose-900/30 text-rose-200"
                      }`}
                    >
                      {rowValidationStatus[index]?.isValid ? t("ahvTable.ok") : t("ahvTable.error")}
                    </span>
                    {!rowValidationStatus[index]?.isValid && rowValidationStatus[index]?.message && (
                      <p className="mt-1 text-rose-200">{rowValidationStatus[index]?.message}</p>
                    )}
                  </td>
                )}
                {!hideDeleteButtons && (
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      className="rounded border border-red-700 px-2 py-1 text-2xs text-red-300 hover:bg-red-900/40"
                      disabled={readOnly}
                      onClick={() => onDeleteRow(index)}
                    >
                      {t("common.remove")}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
