import React from "react";
import { useTranslation } from "react-i18next";
import { api, type AiSettings } from "../../services/api";
import { useUiPreferencesStore, type UiDensity, type UiLanguage, type UiTheme } from "../../store/uiPreferencesStore";
import { WarningTriangle } from "iconoir-react";

// Same backup shape as Fintools' "portfolio-pal-settings": { format, version, exported_at, username, settings }.
// Contains every AI provider's API key in plain text — the UI warns about that.
const SETTINGS_BACKUP_FORMAT = "pension-pal-settings";

type Preferences = { ui_theme: UiTheme; ui_language: UiLanguage; ui_density: UiDensity };
type BackupSettings = { preferences: Preferences; ai: AiSettings };

export const SettingsBackupModal: React.FC<{ open: boolean; userName: string; onClose: () => void }> = ({
  open,
  userName,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const { setTheme, setDensity, setUiLanguage } = useUiPreferencesStore();
  const [msg, setMsg] = React.useState<null | { ok: boolean; text: string }>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) setMsg(null);
  }, [open]);

  if (!open) return null;

  const handleExport = async () => {
    setMsg(null);
    setBusy(true);
    try {
      // Saved server state, not unsaved form edits
      const [state, { ai }] = await Promise.all([
        api.fetchProfileState() as Promise<{ preferences?: Record<string, string> }>,
        api.fetchAiSettings(),
      ]);
      const p = state.preferences || {};
      const settings: BackupSettings = {
        preferences: {
          ui_theme: (p.uiTheme as UiTheme) || "dark",
          ui_language: (p.uiLanguage as UiLanguage) || "de",
          ui_density: (p.uiDensity as UiDensity) || "comfort",
        },
        ai,
      };
      const doc = { format: SETTINGS_BACKUP_FORMAT, version: 1, exported_at: new Date().toISOString(), username: userName, settings };
      const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `pension-pal-settings_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    setMsg(null);
    setBusy(true);
    try {
      const doc = JSON.parse(await file.text());
      const s = doc?.settings as BackupSettings | undefined;
      if (doc?.format !== SETTINGS_BACKUP_FORMAT || !s || typeof s.ai !== "object" || typeof s.preferences !== "object")
        throw new Error(t("backup.invalid"));
      // Both endpoints validate the payload server-side (allowed values, endpoint policy)
      await api.updatePreferences(s.preferences);
      await api.saveAiSettings(s.ai);
      setTheme(s.preferences.ui_theme);
      setDensity(s.preferences.ui_density);
      setUiLanguage(s.preferences.ui_language);
      await i18n.changeLanguage(s.preferences.ui_language);
      const keyCount = Object.values(s.ai.profiles ?? { active: s.ai }).filter((p) => p?.key).length;
      setMsg({ ok: true, text: t("backup.restored", { count: keyCount }) });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof SyntaxError ? t("backup.invalid") : (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby="backup-title"
        className="w-full max-w-xl rounded-xl border border-slate-700 bg-surface p-section shadow-2xl">
        <h2 id="backup-title" className="text-base font-semibold text-slate-100">{t("backup.title")}</h2>
        <p className="mt-1 text-sm text-slate-300">{t("backup.hint")}</p>
        <p className="mt-3 flex gap-2 rounded-md border border-amber-500/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
          <WarningTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>{t("backup.warn")}</span>
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => void handleExport()} disabled={busy}
            className="rounded-md border border-emerald-600/50 bg-emerald-900/25 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-900/40 disabled:opacity-60">
            {t("backup.exportBtn")}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
            className="rounded-md border border-blue-600/50 bg-blue-900/25 px-3 py-2 text-sm font-medium text-blue-100 hover:bg-blue-900/40 disabled:opacity-60">
            {t("backup.importBtn")}
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => { void handleImport(e.target.files?.[0]); e.target.value = ""; }} />
        <p className="mt-2 text-2xs text-slate-400">{t("backup.importHint")}</p>

        {msg && (
          <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${msg.ok
            ? "border-green-500/40 bg-green-900/25 text-green-200"
            : "border-red-500/40 bg-red-900/30 text-red-200"}`}>
            {msg.ok ? "✓" : "✗"} {msg.text}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded-md border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800">
            {t("settings.close")}
          </button>
        </div>
      </div>
    </div>
  );
};
