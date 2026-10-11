import React from "react";
import { useTranslation } from "react-i18next";
import { CSVExportModal } from "../components/CSVExportModal";
import { CSVImportModal } from "../components/CSVImportModal";
import { SettingsBackupModal } from "../components/settings/SettingsBackupModal";
import { useToast } from "../components/notifications/useToast";

type ImportExportProps = {
  preferredAction?: "export" | "import";
  userName: string;
};

export const ImportExport: React.FC<ImportExportProps> = ({ preferredAction, userName }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [submenuOpen, setSubmenuOpen] = React.useState(true);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [backupOpen, setBackupOpen] = React.useState(false);

  React.useEffect(() => {
    if (preferredAction === "export") {
      setExportOpen(true);
      setSubmenuOpen(true);
    }
    if (preferredAction === "import") {
      setImportOpen(true);
      setSubmenuOpen(true);
    }
  }, [preferredAction]);

  const sectionLabel = (section: string): string =>
    t(`importExport.sections.${section}`, { defaultValue: section });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <header className="rounded-xl border border-slate-700 bg-surface p-section">
        <h1 className="text-xl font-light text-slate-100">{t("importExport.title")}</h1>
        <p className="mt-1 text-sm text-slate-300">{t("importExport.subtitle")}</p>
      </header>

      <section className="rounded-xl border border-slate-700 bg-surface p-section">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-slate-600 bg-surface-2 px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
          onClick={() => setSubmenuOpen((prev) => !prev)}
        >
          <span>{t("importExport.submenu")}</span>
          <span>{submenuOpen ? "▾" : "▸"}</span>
        </button>

        {submenuOpen && (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <button
              type="button"
              className="rounded-lg border border-emerald-600/40 bg-emerald-900/20 p-box text-left hover:bg-emerald-900/35"
              onClick={() => setExportOpen(true)}
            >
              <p className="text-base font-semibold text-emerald-100">{t("importExport.exportTitle")}</p>
              <p className="mt-1 text-sm text-emerald-200/90">{t("importExport.exportSubtitle")}</p>
            </button>
            <button
              type="button"
              className="rounded-lg border border-blue-600/40 bg-blue-900/20 p-box text-left hover:bg-blue-900/35"
              onClick={() => setImportOpen(true)}
            >
              <p className="text-base font-semibold text-blue-100">{t("importExport.importTitle")}</p>
              <p className="mt-1 text-sm text-blue-200/90">{t("importExport.importSubtitle")}</p>
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-600/40 bg-amber-900/20 p-box text-left hover:bg-amber-900/35"
              onClick={() => setBackupOpen(true)}
            >
              <p className="text-base font-semibold text-amber-100">{t("importExport.settingsTitle")}</p>
              <p className="mt-1 text-sm text-amber-200/90">{t("importExport.settingsSubtitle")}</p>
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-700 bg-surface p-section text-sm text-slate-300">
        <h2 className="text-base font-semibold text-slate-100">{t("importExport.securityTitle")}</h2>
        <ul className="mt-2 space-y-1">
          <li>{t("importExport.security1")}</li>
          <li>{t("importExport.security2")}</li>
          <li>{t("importExport.security3")}</li>
          <li>{t("importExport.security4")}</li>
          <li>{t("importExport.security5")}</li>
        </ul>
      </section>

      <CSVExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onSuccess={() => {
          showToast({
            kind: "success",
            title: t("importExport.exportSuccessTitle"),
            message: t("importExport.exportSuccessMessage"),
          });
        }}
      />
      <SettingsBackupModal open={backupOpen} userName={userName} onClose={() => setBackupOpen(false)} />
      <CSVImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={(importedSections) => {
          setImportOpen(false);
          const sectionSummary = importedSections.length > 0
            ? importedSections.map(sectionLabel).join(", ")
            : t("importExport.noSections");
          showToast({
            kind: "success",
            title: t("importExport.importSuccessTitle"),
            message: t("importExport.importSuccessMessage", { sections: sectionSummary }),
          });
        }}
      />
    </div>
  );
};
