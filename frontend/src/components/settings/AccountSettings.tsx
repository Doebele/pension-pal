import React from "react";
import { useTranslation } from "react-i18next";
import { api, type AuthProfile, type Invite } from "../../services/api";
import { authError } from "../../services/authErrors";
import { inputClass, labelClass } from "./formClasses";
import { WarningTriangle } from "iconoir-react";

// Profil und Einladungen (wie Fintools AccountSettings). Jeder Block speichert mit eigenem Knopf.
// Passwort und Passkeys: SecuritySettings.tsx
export type Note = { ok: boolean; text: string } | null;

export const smallBtn =
  "rounded-md border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-45";

export const NoteLine: React.FC<{ note: Note }> = ({ note }) =>
  note ? (
    <p role={note.ok ? "status" : "alert"} className={`text-xs ${note.ok ? "text-green-400" : "text-red-400"}`}>
      {note.ok ? "✓" : "✗"} {note.text}
    </p>
  ) : null;

export const AccountSettings: React.FC<{ onRenamed?: (displayName: string) => void }> = ({ onRenamed }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2);
  const [me, setMe] = React.useState<AuthProfile | null>(null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [curPw, setCurPw] = React.useState(""); // bestätigt eine neue E-Mail
  const [profileNote, setProfileNote] = React.useState<Note>(null);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [inviteNote, setInviteNote] = React.useState<Note>(null);

  React.useEffect(() => {
    api
      .me()
      .then((u) => {
        setMe(u);
        setName(u.display_name);
        setEmail(u.email ?? "");
      })
      .catch((e) => setProfileNote({ ok: false, text: authError(t, e) }));
    api.invites().then(setInvites).catch(() => undefined);
  }, [t]);

  const emailChanged = !!me && email.trim().toLowerCase() !== (me.email ?? "");

  const saveProfile = async () => {
    try {
      const u = await api.updateMe({
        display_name: name.trim(),
        ...(emailChanged ? { email: email.trim(), current_password: curPw } : {}),
      });
      setMe(u);
      setEmail(u.email ?? "");
      setCurPw("");
      if (u.display_name !== me?.display_name) onRenamed?.(u.display_name);
      setProfileNote({ ok: true, text: t("profile.saved") });
    } catch (e) {
      setProfileNote({ ok: false, text: authError(t, e) });
    }
  };

  const createInvite = async () => {
    try {
      const inv = await api.createInvite();
      setInvites((list) => [inv, ...list]);
      setInviteNote(null);
    } catch (e) {
      setInviteNote({ ok: false, text: authError(t, e) });
    }
  };

  const revokeInvite = async (code: string) => {
    try {
      await api.revokeInvite(code);
      setInvites((list) => list.filter((i) => i.code !== code));
    } catch (e) {
      setInviteNote({ ok: false, text: authError(t, e) });
    }
  };

  const copyLink = async (code: string) => {
    const link = `${window.location.origin}/?invite=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setInviteNote({ ok: true, text: link }); // ohne Zwischenablage: Link zum Abschreiben zeigen
    }
  };

  const fmtDate = (iso: string | null) => (iso ? new Date(iso + (iso.endsWith("Z") || iso.includes("+") ? "" : "Z")).toLocaleDateString(lang) : "");
  const fmtCode = (c: string) => `${c.slice(0, 3)}-${c.slice(3)}`;

  return (
    <div className="mt-3 space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">{t("profile.title")}</h3>
        <div>
          <label className={labelClass} htmlFor="profile-name">{t("auth.username")}</label>
          <input id="profile-name" className={inputClass} value={name} autoComplete="username"
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="profile-email">{t("auth.email")}</label>
          <input id="profile-email" type="email" className={inputClass} value={email} autoComplete="email"
            placeholder={t("auth.emailPh")} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {me && !me.email && <p className="flex gap-2 text-xs leading-snug text-amber-300"><WarningTriangle className="h-4 w-4 shrink-0" aria-hidden /><span>{t("profile.noEmail")}</span></p>}
        {emailChanged && (
          <div>
            <label className={labelClass} htmlFor="profile-curpw">{t("profile.confirmWithPassword")}</label>
            <input id="profile-curpw" type="password" className={inputClass} value={curPw} autoComplete="current-password"
              onChange={(e) => setCurPw(e.target.value)} />
          </div>
        )}
        <button type="button" className={smallBtn} disabled={!me} onClick={() => void saveProfile()}>
          {t("profile.save")}
        </button>
        <NoteLine note={profileNote} />
      </section>

      <section className="space-y-2 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">{t("invites.title")}</h3>
        <p className="text-xs leading-relaxed text-slate-400">{t("invites.hint")}</p>
        <button type="button" className={smallBtn} onClick={() => void createInvite()}>
          ＋ {t("invites.create")}
        </button>
        <NoteLine note={inviteNote} />
        {invites.map((inv) => (
          <div key={inv.code}
            className={`flex items-center gap-2 rounded-md border border-slate-700 bg-surface-2 px-2 py-1 ${inv.status === "open" ? "" : "opacity-60"}`}>
            <span className="font-mono text-sm tracking-[0.1em] text-slate-100">{fmtCode(inv.code)}</span>
            <span className="flex-1 text-2xs text-slate-400">
              {inv.status === "open" && t("invites.openUntil", { date: fmtDate(inv.expires_at) })}
              {inv.status === "used" && t("invites.usedBy", { name: inv.used_by ?? "?", date: fmtDate(inv.used_at) })}
              {inv.status === "expired" && t("invites.expired")}
            </span>
            {inv.status === "open" && (
              <>
                <button type="button" className="text-xs font-semibold text-blue-400 hover:underline" onClick={() => void copyLink(inv.code)}>
                  {copied === inv.code ? "✓" : t("invites.copyLink")}
                </button>
                <button type="button" className="text-xs font-semibold text-red-400 hover:underline" onClick={() => void revokeInvite(inv.code)}>
                  {t("invites.revoke")}
                </button>
              </>
            )}
          </div>
        ))}
      </section>
    </div>
  );
};
