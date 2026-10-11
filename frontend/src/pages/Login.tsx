import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeClosed, Key, Lock, User, WarningCircle } from "iconoir-react";
import { api, checkApiHealth } from "../services/api";
import { MIN_PASSWORD, authError, isLinkError, isPasskeyCancel, passkeysSupported } from "../services/authErrors";

type Mode = "login" | "register" | "forgot" | "reset";

type LoginPageProps = {
  onLogin: (identifier: string, pin: string) => Promise<void>;
  onRegister: (displayName: string, pin: string, email: string, invite: string) => Promise<void>;
  onPasskey: () => Promise<void>;
};

// Einstiege aus Mails: /reset-password#token=… und /forgot-password (wie Fintools/Budget-Pal),
// aus geteilten Einladungen: /?invite=CODE
export const AUTH_LINK_PATHS = ["/reset-password", "/forgot-password"];

const readEntry = (): { mode: Mode; token: string | null; invite: string } => {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  const invite = new URLSearchParams(window.location.search).get("invite") ?? "";
  const mode: Mode = token
    ? "reset"
    : window.location.pathname === "/forgot-password"
      ? "forgot"
      : invite
        ? "register"
        : "login";
  return { mode, token, invite };
};

export const Login: React.FC<LoginPageProps> = ({ onLogin, onRegister, onPasskey }) => {
  const { t, i18n } = useTranslation();
  const [entry] = useState(readEntry);
  const [mode, setMode] = useState<Mode>(entry.mode);
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState(entry.invite);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sent, setSent] = useState(false); // forgot: Link angefordert → nur noch die Bestätigung
  const [linkInvalid, setLinkInvalid] = useState(false); // reset: Link abgelehnt → neuen anbieten
  const [apiOnline, setApiOnline] = useState<boolean>(false);
  const lang = i18n.language?.slice(0, 2);

  // Token, Einladung und Pfad sofort aus Adresszeile und Verlauf nehmen
  useEffect(() => {
    if (
      AUTH_LINK_PATHS.includes(window.location.pathname) ||
      window.location.hash.includes("token=") ||
      new URLSearchParams(window.location.search).has("invite")
    ) {
      window.history.replaceState(null, "", "/");
    }
  }, []);

  const handlePasskey = async () => {
    setError(null);
    setInfo(null);
    setPasskeyLoading(true);
    try {
      await onPasskey();
    } catch (err) {
      if (!isPasskeyCancel(err)) setError(authError(t, err) || t("auth.passkeyFailed"));
    } finally {
      setPasskeyLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      const ok = await checkApiHealth();
      if (alive) setApiOnline(ok);
    };
    void ping();
    const interval = setInterval(() => void ping(), 5000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPin("");
    setPin2("");
    setAcceptedDisclaimer(false);
    setSent(false);
    setLinkInvalid(false);
  };

  const canSubmit =
    !isLoading &&
    {
      login: Boolean(identifier.trim() && pin),
      register: Boolean(identifier.trim() && email.trim() && pin && acceptedDisclaimer),
      forgot: Boolean(email.trim()),
      reset: Boolean(pin && pin2),
    }[mode];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setInfo(null);
    setIsLoading(true);
    try {
      if ((mode === "register" || mode === "reset") && pin.length < MIN_PASSWORD) {
        throw new Error(t("auth.err_tooShort"));
      }
      if (mode === "forgot") {
        await api.forgotPassword(email.trim(), lang);
        setInfo(t("auth.forgotSent")); // gleiche Antwort, ob es die Adresse gibt oder nicht
        setSent(true);
      } else if (mode === "reset") {
        if (pin !== pin2) throw new Error(t("auth.pinMismatch"));
        await api.resetPassword(entry.token || "", pin, lang);
        switchMode("login"); // keine automatische Anmeldung nach dem Zurücksetzen (wie Budget-Pal)
        setInfo(t("auth.resetDone"));
      } else if (mode === "register") {
        await onRegister(identifier.trim(), pin, email.trim(), invite.trim());
      } else {
        await onLogin(identifier.trim(), pin);
      }
    } catch (err) {
      setError(authError(t, err));
      if (mode === "reset" && isLinkError(err)) setLinkInvalid(true);
    } finally {
      setIsLoading(false);
    }
  };

  const passwordField = (value: string, setValue: (v: string) => void, label: string, placeholder: string) => (
    <div>
      <label className="input-label">{label}</label>
      <div className="relative">
        <Lock width={14} height={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
        <input
          type={showPin ? "text" : "password"}
          className="input-field !pl-9 !pr-10"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder={placeholder}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        <button
          type="button"
          onClick={() => setShowPin((v) => !v)}
          aria-label={showPin ? t("auth.hidePassword") : t("auth.showPassword")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-3 hover:text-fg-1"
        >
          {showPin ? <EyeClosed width={14} height={14} /> : <Eye width={14} height={14} />}
        </button>
      </div>
    </div>
  );

  const linkClass = "font-semibold text-blue-400 hover:underline";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-surface p-6 shadow-xl"
      >
        <h1 className="text-2xl font-light text-slate-50">{t("login.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">{t(`auth.title_${mode}`)}</p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${apiOnline ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className={apiOnline ? "text-emerald-300" : "text-red-300"}>
            {t("login.apiStatus", { status: apiOnline ? t("login.apiOnline") : t("login.apiOffline") })}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {(mode === "login" || mode === "register") && (
            <div>
              <label className="input-label">{t(mode === "login" ? "auth.usernameOrEmail" : "auth.username")}</label>
              <div className="relative">
                <User width={14} height={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
                <input
                  className="input-field !pl-9"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setError(null);
                  }}
                  placeholder={t(mode === "login" ? "auth.usernameOrEmailPh" : "auth.usernamePh")}
                  autoComplete="username"
                />
              </div>
            </div>
          )}
          {(mode === "register" || (mode === "forgot" && !sent)) && (
            <div>
              <label className="input-label">{t("auth.email")}</label>
              <input
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder={t("auth.emailPh")}
                autoComplete="email"
              />
            </div>
          )}
          {mode === "forgot" && !sent && <p className="text-xs leading-relaxed text-slate-400">{t("auth.forgotHint")}</p>}
          {mode === "login" && passwordField(pin, setPin, t("auth.password"), t("auth.passwordPh"))}
          {mode === "register" && passwordField(pin, setPin, t("auth.password"), t("auth.newPasswordPh"))}
          {mode === "reset" && !linkInvalid && passwordField(pin, setPin, t("auth.newPassword"), t("auth.newPasswordPh"))}
          {mode === "reset" && !linkInvalid && passwordField(pin2, setPin2, t("auth.repeatPassword"), t("auth.newPasswordPh"))}
          {mode === "register" && (
            <div>
              <label className="input-label">{t("auth.invite")}</label>
              <input
                className="input-field font-mono uppercase tracking-[0.15em]"
                value={invite}
                onChange={(e) => {
                  setInvite(e.target.value);
                  setError(null);
                }}
                placeholder="K7M-Q2P"
                autoComplete="off"
              />
              <p className="mt-1 text-2xs text-slate-400">{t("auth.inviteHint")}</p>
            </div>
          )}
        </div>

        {mode === "login" && (
          <div className="mt-2 text-right">
            <button type="button" className="text-xs text-blue-400 hover:underline" onClick={() => switchMode("forgot")}>
              {t("auth.forgotLink")}
            </button>
          </div>
        )}

        {mode === "register" && (
          <div className="mt-3 space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-box text-xs text-amber-100">
            <div>
              <p className="font-semibold">{t("login.disclaimerTitle")}</p>
              <p className="mt-1">{t("login.disclaimerBody1")}</p>
              <p className="mt-1">{t("login.disclaimerBody2")}</p>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={acceptedDisclaimer}
                onChange={(e) => setAcceptedDisclaimer(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-800 text-blue-500 focus:ring-blue-500"
              />
              <span>{t("login.disclaimerAccept")}</span>
            </label>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-400">
            <WarningCircle width={13} height={13} className="shrink-0" /> {error}
          </p>
        )}
        {info && (
          <p role="status" className="mt-3 rounded-md border border-green-500/40 bg-green-900/25 px-3 py-2 text-sm leading-relaxed text-green-200">
            {info}
          </p>
        )}

        {linkInvalid ? (
          <button type="button" className="btn-primary mt-5 w-full" onClick={() => switchMode("forgot")}>
            {t("auth.requestNewLink")}
          </button>
        ) : (
          !(mode === "forgot" && sent) && (
            <button type="submit" className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={!canSubmit}>
              {isLoading ? t("auth.working") : t(`auth.submit_${mode}`)}
            </button>
          )
        )}

        {mode === "login" && passkeysSupported() && (
          <>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-700" />
              <span className="text-xs text-slate-500">{t("auth.or")}</span>
              <div className="h-px flex-1 bg-slate-700" />
            </div>
            <button
              type="button"
              onClick={() => void handlePasskey()}
              disabled={passkeyLoading}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-base font-medium text-slate-100 hover:bg-slate-700/50 disabled:opacity-60"
            >
              <Key width={15} height={15} />
              {passkeyLoading ? t("auth.passkeyWaiting") : t("auth.passkey")}
            </button>
          </>
        )}

        <div className="mt-4 text-center text-sm text-slate-400">
          {mode === "login" ? (
            <>
              {t("auth.noAccount")}{" "}
              <button type="button" className={linkClass} onClick={() => switchMode("register")}>
                {t("auth.createOne")}
              </button>
            </>
          ) : mode === "register" ? (
            <>
              {t("auth.haveAccount")}{" "}
              <button type="button" className={linkClass} onClick={() => switchMode("login")}>
                {t("auth.signIn")}
              </button>
            </>
          ) : (
            <button type="button" className={linkClass} onClick={() => switchMode("login")}>
              {t("auth.backToLogin")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
