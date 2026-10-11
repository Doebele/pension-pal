import React from "react";
import { useTranslation } from "react-i18next";
import { startRegistration } from "@simplewebauthn/browser";
import { Trash } from "iconoir-react";
import { api, type PasskeyCredential } from "../../services/api";
import { MIN_PASSWORD, authError, isPasskeyCancel, passkeysSupported } from "../../services/authErrors";
import { NoteLine, smallBtn, type Note } from "./AccountSettings";
import { inputClass, labelClass } from "./formClasses";

// Sicherheit: Passwort ändern (wie Fintools) und Passkeys (wie Budget-Pal, Einstellungen → Sicherheit).
export const SecuritySettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2);
  const [pwCur, setPwCur] = React.useState("");
  const [pwNew, setPwNew] = React.useState("");
  const [pwNew2, setPwNew2] = React.useState("");
  const [pwNote, setPwNote] = React.useState<Note>(null);
  const [passkeys, setPasskeys] = React.useState<PasskeyCredential[]>([]);
  const [deviceName, setDeviceName] = React.useState("");
  const [passkeyPassword, setPasskeyPassword] = React.useState("");
  const [registering, setRegistering] = React.useState(false);
  const [passkeyNote, setPasskeyNote] = React.useState<Note>(null);
  const supported = passkeysSupported();

  const loadPasskeys = React.useCallback(() => {
    api.passkeys().then(setPasskeys).catch(() => undefined);
  }, []);
  React.useEffect(loadPasskeys, [loadPasskeys]);

  const changePassword = async () => {
    if (pwNew !== pwNew2) return setPwNote({ ok: false, text: t("auth.pinMismatch") });
    if (pwNew.length < MIN_PASSWORD) return setPwNote({ ok: false, text: t("auth.err_tooShort") });
    try {
      await api.changePassword(pwCur, pwNew, lang);
      setPwCur("");
      setPwNew("");
      setPwNew2("");
      setPwNote({ ok: true, text: t("profile.pwChanged") });
    } catch (e) {
      setPwNote({ ok: false, text: authError(t, e) });
    }
  };

  const addPasskey = async () => {
    setPasskeyNote(null);
    setRegistering(true);
    try {
      // Ein 400 hier heisst "Passwort falsch"; beim Verify hiesse es etwas anderes
      const options = JSON.parse(await api.passkeyRegisterOptions(passkeyPassword));
      // Der Browser führt die Ceremony (Face ID, Touch ID, Windows Hello)
      const credential = await startRegistration({ optionsJSON: options });
      await api.passkeyRegisterVerify(credential, deviceName.trim() || undefined);
      setDeviceName("");
      setPasskeyPassword("");
      setPasskeyNote({ ok: true, text: t("security.passkeyAdded") });
      loadPasskeys();
    } catch (e) {
      setPasskeyNote({
        ok: false,
        text: isPasskeyCancel(e) ? t("security.passkeyCancelled") : authError(t, e) || t("security.passkeyFailed"),
      });
    } finally {
      setRegistering(false);
    }
  };

  const removePasskey = async (id: number) => {
    try {
      await api.removePasskey(id);
      setPasskeys((list) => list.filter((k) => k.id !== id));
    } catch (e) {
      setPasskeyNote({ ok: false, text: authError(t, e) });
    }
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso + (iso.endsWith("Z") || iso.includes("+") ? "" : "Z")).toLocaleDateString(lang) : "";

  return (
    <div className="mt-3 space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">{t("profile.changePassword")}</h3>
        <div>
          <label className={labelClass} htmlFor="pw-current">{t("profile.currentPassword")}</label>
          <input id="pw-current" type="password" className={inputClass} value={pwCur} autoComplete="current-password"
            onChange={(e) => setPwCur(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="pw-new">{t("auth.newPassword")}</label>
          <input id="pw-new" type="password" className={inputClass} value={pwNew} autoComplete="new-password"
            placeholder={t("auth.newPasswordPh")} onChange={(e) => setPwNew(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="pw-new2">{t("auth.repeatPassword")}</label>
          <input id="pw-new2" type="password" className={inputClass} value={pwNew2} autoComplete="new-password"
            onChange={(e) => setPwNew2(e.target.value)} />
        </div>
        <button type="button" className={smallBtn} disabled={!pwCur || !pwNew || !pwNew2} onClick={() => void changePassword()}>
          {t("profile.changePassword")}
        </button>
        <p className="text-2xs text-slate-500">{t("profile.pwHint")}</p>
        <NoteLine note={pwNote} />
      </section>

      <section className="space-y-2 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">{t("security.passkeys")}</h3>
        <p className="text-xs leading-relaxed text-slate-400">{t("security.passkeysHint")}</p>
        {!supported ? (
          <p className="text-xs text-slate-400">{t("security.passkeyUnsupported")}</p>
        ) : (
          <>
            <div>
              <label className={labelClass} htmlFor="pk-device">{t("security.deviceName")}</label>
              <input id="pk-device" className={inputClass} value={deviceName} maxLength={120}
                placeholder={t("security.devicePlaceholder")} onChange={(e) => setDeviceName(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pk-password">{t("profile.currentPassword")}</label>
              <input id="pk-password" type="password" className={inputClass} value={passkeyPassword}
                autoComplete="current-password" onChange={(e) => setPasskeyPassword(e.target.value)} />
            </div>
            <button type="button" className={smallBtn} disabled={registering || !passkeyPassword} onClick={() => void addPasskey()}>
              ＋ {registering ? t("security.registering") : t("security.addPasskey")}
            </button>
            <NoteLine note={passkeyNote} />
            <div className="space-y-2">
              {passkeys.map((k) => (
                <div key={k.id} className="flex items-center gap-2 rounded-md border border-slate-700 bg-surface-2 px-2 py-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{k.device_name || t("security.unknownDevice")}</p>
                    <p className="text-2xs text-slate-400">
                      {t("security.addedOn", { date: fmtDate(k.created_at) })}
                      {k.last_used_at && ` · ${t("security.lastUsed", { date: fmtDate(k.last_used_at) })}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => void removePasskey(k.id)} title={t("security.removePasskey")}
                    aria-label={t("security.removePasskey")} className="p-1 text-slate-400 hover:text-red-400">
                    <Trash width={14} height={14} />
                  </button>
                </div>
              ))}
              {passkeys.length === 0 && <p className="text-xs text-slate-500">{t("security.noPasskeys")}</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
