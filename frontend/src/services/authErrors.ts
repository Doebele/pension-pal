import type { TFunction } from "i18next";

export const MIN_PASSWORD = 8;

// Feste englische Fehlertexte aus backend_python/app/routes/auth.py → übersetzter Text (wie Fintools)
const AUTH_ERRORS: Record<string, string> = {
  login: "Invalid credentials",
  link: "This link is invalid or has expired.",
  tooMany: "Too many attempts. Try again later.",
  uname: "Username already taken",
  email: "Email address already in use",
  emailOk: "A valid email address is required",
  curPw: "Current password is incorrect",
  tooShort: `Password must be at least ${MIN_PASSWORD} characters`,
  name: "Name must be 2-100 characters",
  invite: "Invalid or expired invite code",
  tooManyInvites: "Too many open invites. Revoke some or let them expire.",
  passkey: "Passkey not accepted.",
  challenge: "No valid challenge. Please try again.",
};

// Abbruch im Passkey-Dialog des Browsers ist kein Fehler, den man anzeigen muss (wie Budget-Pal)
export const isPasskeyCancel = (e: unknown) => (e as { name?: string } | null)?.name === "NotAllowedError";

// Passkeys brauchen einen sicheren Kontext (HTTPS oder localhost)
export const passkeysSupported = () => typeof window !== "undefined" && !!window.PublicKeyCredential;

export const isLinkError = (e: unknown) => e instanceof Error && e.message === AUTH_ERRORS.link;

export const authError = (t: TFunction, e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e);
  const key = Object.keys(AUTH_ERRORS).find((k) => AUTH_ERRORS[k] === message);
  return key ? t(`auth.err_${key}`) : message;
};
