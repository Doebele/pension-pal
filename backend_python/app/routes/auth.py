"""Anmeldung, Profil und Passwort — gleiche Logik wie Budget-Pal (feat/passwort-reset)
und Fintools (feat(auth): profile and password reset by mail).

POST /api/auth/register         Konto mit Name, E-Mail und Passwort (min. 8)
POST /api/auth/login            Name oder E-Mail + Passwort (alte kurze PINs gelten weiter)
POST /api/auth/logout           diese Sitzung beenden
GET  /api/auth/me               eigenes Profil (Name, E-Mail)
PUT  /api/auth/me               Name/E-Mail aendern; neue E-Mail braucht das aktuelle Passwort
POST /api/auth/password/change  aktuelles Passwort noetig; alle anderen Sitzungen enden
POST /api/auth/password/forgot  Link per Mail, immer gleiche Antwort (202)
POST /api/auth/password/reset   neues Passwort mit dem Link; alle Sitzungen und Passkeys enden
GET/POST /api/auth/invites      eigene Einladungscodes (wie Fintools), DELETE /api/auth/invites/{code}

Registrierung nur mit Einladungscode; das allererste Konto einer leeren Datenbank braucht keinen.

Reset-Links: nur der SHA-256 des Tokens liegt in der DB, 30 Minuten und einmal gueltig,
Token im URL-Fragment, Link nur aus APP_BASE_URL (nie aus dem Host-Header).
"""
import hashlib
import re
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, update
from sqlalchemy.orm import Session as DbSession

from ..core.config import settings
from ..core.rate_limit import SlidingWindowRateLimiter
from ..db import get_db
from ..models.user import Invite, PersonProfile, Session as UserSession, User, WebAuthnCredential
from ..services import mailer
from .profile import get_authenticated_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

MIN_PASSWORD = 8
SESSION_TTL = timedelta(days=30)
RESET_LINK_TTL = timedelta(minutes=30)
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# Fehlertexte sind feste englische Strings; das Frontend uebersetzt sie (wie Fintools)
ERR_LOGIN = "Invalid credentials"
ERR_NAME_TAKEN = "Username already taken"
ERR_EMAIL_TAKEN = "Email address already in use"
ERR_EMAIL_INVALID = "A valid email address is required"
ERR_CURRENT_PW = "Current password is incorrect"
ERR_LINK = "This link is invalid or has expired."
ERR_TOO_SHORT = f"Password must be at least {MIN_PASSWORD} characters"
ERR_NAME = "Name must be 2-100 characters"
ERR_INVITE = "Invalid or expired invite code"
ERR_TOO_MANY_INVITES = "Too many open invites. Revoke some or let them expire."

INVITE_TTL = timedelta(days=7)
MAX_OPEN_INVITES = 10
# 6 Zeichen ohne Verwechsler (0/O, 1/I) → 32^6 ≈ 1e9 Moeglichkeiten
INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

login_limiter = SlidingWindowRateLimiter(max_requests=8, window_seconds=60)
register_limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=900)
# Passwort vergessen: je IP und je Adresse, damit niemand Postfaecher flutet
forgot_ip_limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=900)
forgot_email_limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=900)
reset_limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=900)
# Je Nutzer: mit einer gestohlenen Sitzung das aktuelle Passwort durchprobieren
change_limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=300)


# ── Hilfen ────────────────────────────────────────────────────


def _client_ip(request: Request) -> str:
    """IP des Browsers fuer die Rate-Limits.

    Produktiv: Host-nginx → Container-nginx → Backend. Beide haengen an X-Forwarded-For an;
    was der Client selbst mitschickt, steht davor und ist faelschbar. Verlaesslich ist der
    vorletzte Eintrag (vom Host-nginx). Lokal ohne Proxy gilt die direkte Verbindung.
    """
    # ponytail: fest auf zwei Proxys; aendert sich die Kette, hier anpassen
    hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    if len(hops) >= 2:
        return hops[-2]
    return request.client.host if request.client else "unknown"


def _limit(limiter: SlidingWindowRateLimiter, key: str) -> None:
    decision = limiter.check(key)
    if not decision.allowed:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")


def _norm_email(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _valid_email(value: str) -> bool:
    return bool(EMAIL_RE.match(value)) and len(value) <= 254


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _email_taken(db: DbSession, email: str, except_user_id: Optional[int] = None) -> bool:
    query = db.query(User.id).filter(func.lower(User.email) == email)
    if except_user_id is not None:
        query = query.filter(User.id != except_user_id)
    return query.first() is not None


def _name_taken(db: DbSession, name: str, except_user_id: Optional[int] = None) -> bool:
    query = db.query(User.id).filter(User.display_name == name)
    if except_user_id is not None:
        query = query.filter(User.id != except_user_id)
    return query.first() is not None


def _norm_invite(value: Optional[str]) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def _new_invite_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(6))


def _invite_is_open(db: DbSession, code: str) -> bool:
    return db.query(Invite.code).filter(
        Invite.code == code, Invite.used_at.is_(None), Invite.expires_at > datetime.utcnow()
    ).first() is not None


def _is_bootstrap(db: DbSession) -> bool:
    """Leere Datenbank: das erste Konto braucht keinen Code (sonst kaeme niemand hinein)."""
    return db.query(User.id).first() is None


def _new_session(db: DbSession, user: User) -> UserSession:
    now = datetime.utcnow()
    session = UserSession(
        user_id=user.id,
        token=secrets.token_urlsafe(32),
        created_at=now,
        expires_at=now + SESSION_TTL,
        is_active=True,
    )
    db.add(session)
    return session


def _session_payload(user: User, session: UserSession) -> dict:
    return {
        "status": "ok",
        "user_id": user.id,
        "display_name": user.display_name,
        "email": user.email,
        "session_token": session.token,
        "expires_at": session.expires_at.isoformat(),
    }


def _set_password(db: DbSession, user: User, new_password: str, keep_token: Optional[str] = None) -> None:
    """Einziger Weg, ein Passwort zu setzen: beendet alle anderen Sitzungen (alle, wenn
    keep_token fehlt) und macht einen offenen Reset-Link ungueltig."""
    user.pin_hash = pwd_context.hash(new_password)
    user.password_reset_hash = None
    user.password_reset_expires = None
    others = db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.is_active.is_(True))
    if keep_token:
        others = others.filter(UserSession.token != keep_token)
    others.update({UserSession.is_active: False}, synchronize_session=False)


_MAILS = {
    "de": {
        "reset": (
            "Pension-Pal: Passwort zurücksetzen",
            "Hallo {name}\n\n"
            "Für dein Pension-Pal-Konto wurde ein neues Passwort angefordert. "
            "Mit diesem Link setzt du es. Er gilt 30 Minuten und nur einmal:\n\n"
            "{link}\n\n"
            "Hast du das nicht angefordert, ignoriere diese Mail. Dein Passwort bleibt, wie es ist.",
        ),
        "changed": (
            "Pension-Pal: Passwort geändert",
            "Hallo {name}\n\n"
            "Das Passwort deines Pension-Pal-Kontos wurde eben geändert. "
            "Alle anderen Geräte sind abgemeldet.\n\n"
            "Warst du das nicht, setze das Passwort sofort über „Passwort vergessen?“ zurück:\n"
            "{link}",
        ),
        "passkey": (
            "Pension-Pal: neuer Passkey hinzugefügt",
            "Hallo {name}\n\n"
            "Deinem Pension-Pal-Konto wurde eben ein neuer Passkey hinzugefügt. "
            "Mit ihm kann man sich ohne Passwort anmelden.\n\n"
            "Warst du das nicht, entferne ihn unter Einstellungen → Sicherheit und "
            "ändere dein Passwort:\n{link}",
        ),
    },
    "en": {
        "reset": (
            "Pension-Pal: reset your password",
            "Hello {name}\n\n"
            "A new password was requested for your Pension-Pal account. "
            "Use this link to set it. It is valid for 30 minutes and works once:\n\n"
            "{link}\n\n"
            "If you did not request this, ignore this email. Your password stays as it is.",
        ),
        "changed": (
            "Pension-Pal: password changed",
            "Hello {name}\n\n"
            "The password of your Pension-Pal account was just changed. "
            "All other devices have been signed out.\n\n"
            "If this wasn't you, reset your password right away via “Forgot password?”:\n"
            "{link}",
        ),
        "passkey": (
            "Pension-Pal: new passkey added",
            "Hello {name}\n\n"
            "A new passkey was just added to your Pension-Pal account. "
            "It can be used to sign in without a password.\n\n"
            "If this wasn't you, remove it under Settings → Security and "
            "change your password:\n{link}",
        ),
    },
}


def _mail_lang(db: DbSession, user: User, requested: Optional[str]) -> str:
    if requested in _MAILS:
        return requested
    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
    return profile.ui_language if profile and profile.ui_language in _MAILS else "de"


def _mail(kind: str, lang: str, user: User, link: str) -> tuple[str, str]:
    subject, text = _MAILS[lang][kind]
    return subject, text.format(name=user.display_name, link=link)


def _app_url(path: str) -> str:
    # Immer aus der Konfiguration, nie aus dem Host-Header der Anfrage
    return settings.app_base_url.rstrip("/") + path


# ── Schemas ───────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    display_name: str = Field(max_length=100)
    email: str = Field(max_length=254)
    pin: str = Field(max_length=200)
    invite: Optional[str] = Field(default=None, max_length=20)


class LoginRequest(BaseModel):
    # Name oder E-Mail — das Feld heisst weiter display_name (Frontend-Kompatibilitaet)
    display_name: str = Field(max_length=254)
    pin: str = Field(max_length=200)


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=100)
    email: Optional[str] = Field(default=None, max_length=254)
    current_password: Optional[str] = Field(default=None, max_length=200)


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)
    lang: Optional[str] = None


class PasswordForgot(BaseModel):
    email: str = Field(max_length=254)
    lang: Optional[str] = None


class PasswordReset(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(max_length=200)
    lang: Optional[str] = None


# ── Routen ────────────────────────────────────────────────────


@router.post("/register")
def register(data: RegisterRequest, request: Request, db: DbSession = Depends(get_db)):
    _limit(register_limiter, _client_ip(request))
    code = _norm_invite(data.invite)
    # Code zuerst: wer keinen hat, erfaehrt nichts ueber vorhandene Namen oder Adressen
    bootstrap = _is_bootstrap(db)
    if not bootstrap and not _invite_is_open(db, code):
        raise HTTPException(status_code=403, detail=ERR_INVITE)
    name = data.display_name.strip()
    email = _norm_email(data.email)
    if not 2 <= len(name) <= 100:
        raise HTTPException(status_code=400, detail=ERR_NAME)
    if not _valid_email(email):
        raise HTTPException(status_code=400, detail=ERR_EMAIL_INVALID)
    if len(data.pin) < MIN_PASSWORD:
        raise HTTPException(status_code=400, detail=ERR_TOO_SHORT)
    if _name_taken(db, name):
        raise HTTPException(status_code=409, detail=ERR_NAME_TAKEN)
    if _email_taken(db, email):
        raise HTTPException(status_code=409, detail=ERR_EMAIL_TAKEN)

    user = User(display_name=name, email=email, pin_hash=pwd_context.hash(data.pin))
    db.add(user)
    db.flush()
    # Code in derselben Transaktion verbrauchen: er kann waehrend bcrypt benutzt worden sein
    if not bootstrap:
        consumed = db.execute(
            update(Invite)
            .where(Invite.code == code, Invite.used_at.is_(None), Invite.expires_at > datetime.utcnow())
            .values(used_by=user.id, used_at=datetime.utcnow())
        ).rowcount
        if consumed != 1:
            db.rollback()
            raise HTTPException(status_code=403, detail=ERR_INVITE)
    session = _new_session(db, user)
    db.commit()
    return _session_payload(user, session)


@router.post("/login")
def login(data: LoginRequest, request: Request, db: DbSession = Depends(get_db)):
    identifier = data.display_name.strip()
    limit_key = f"{_client_ip(request)}:{identifier.lower()}"
    _limit(login_limiter, limit_key)
    if not identifier or not data.pin:
        raise HTTPException(status_code=401, detail=ERR_LOGIN)

    # Name oder E-Mail. Ein exakter Name gewinnt, damit ein Name, der wie eine fremde
    # Adresse aussieht, deren Anmeldung nicht verdecken kann.
    user = db.query(User).filter(User.display_name == identifier).first()
    if user is None and "@" in identifier:
        user = db.query(User).filter(func.lower(User.email) == _norm_email(identifier)).first()
    # Kein Unterschied zwischen "gibt es nicht" und "falsches Passwort": verraet keine Konten
    if user is None or not pwd_context.verify(data.pin, user.pin_hash):
        raise HTTPException(status_code=401, detail=ERR_LOGIN)

    login_limiter.reset(limit_key)
    session = _new_session(db, user)
    db.commit()
    return _session_payload(user, session)


@router.post("/logout")
def logout(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
    x_session_token: Optional[str] = Header(default=None),
):
    db.query(UserSession).filter(
        UserSession.user_id == user.id, UserSession.token == x_session_token
    ).update({UserSession.is_active: False}, synchronize_session=False)
    db.commit()
    return {"status": "ok"}


def _profile(user: User) -> dict:
    return {
        "user_id": user.id,
        "display_name": user.display_name,
        "email": user.email,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.get("/me")
def get_me(user: User = Depends(get_authenticated_user)):
    return _profile(user)


@router.put("/me")
def update_me(
    data: ProfileUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    name = user.display_name if data.display_name is None else data.display_name.strip()
    email = user.email if data.email is None else _norm_email(data.email)
    if not 2 <= len(name) <= 100:
        raise HTTPException(status_code=400, detail=ERR_NAME)
    if email != user.email:
        if not _valid_email(email or ""):
            raise HTTPException(status_code=400, detail=ERR_EMAIL_INVALID)
        # Die E-Mail bestimmt, wohin Reset-Links gehen: ihre Aenderung braucht das Passwort,
        # sonst koennte eine gestohlene Sitzung das Konto ueber "Passwort vergessen" uebernehmen.
        # 400 statt 401: ein 401 meldet das Frontend ab.
        if not pwd_context.verify(data.current_password or "", user.pin_hash):
            raise HTTPException(status_code=400, detail=ERR_CURRENT_PW)
        if _email_taken(db, email, except_user_id=user.id):
            raise HTTPException(status_code=409, detail=ERR_EMAIL_TAKEN)
    if _name_taken(db, name, except_user_id=user.id):
        raise HTTPException(status_code=409, detail=ERR_NAME_TAKEN)
    user.display_name = name
    user.email = email
    db.commit()
    return _profile(user)


@router.post("/password/change")
def change_password(
    data: PasswordChange,
    background: BackgroundTasks,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
    x_session_token: Optional[str] = Header(default=None),
):
    """Falsches aktuelles Passwort ist 400, nicht 401 — ein 401 meldet das Frontend ab."""
    _limit(change_limiter, str(user.id))
    if len(data.new_password) < MIN_PASSWORD:
        raise HTTPException(status_code=400, detail=ERR_TOO_SHORT)
    if not pwd_context.verify(data.current_password, user.pin_hash):
        raise HTTPException(status_code=400, detail=ERR_CURRENT_PW)
    _set_password(db, user, data.new_password, keep_token=x_session_token)  # diese Sitzung bleibt
    db.commit()
    if user.email:
        lang = _mail_lang(db, user, data.lang)
        background.add_task(mailer.send_mail, user.email, *_mail("changed", lang, user, _app_url("/forgot-password")))
    return {"status": "ok"}


@router.post("/password/forgot", status_code=202)
def forgot_password(
    data: PasswordForgot,
    request: Request,
    background: BackgroundTasks,
    db: DbSession = Depends(get_db),
):
    """Die Antwort ist immer dieselbe — sie verraet nicht, ob es zur Adresse ein Konto gibt.
    Die Mail geht im Hintergrund raus, damit auch die Antwortzeit nichts verraet."""
    email = _norm_email(data.email)
    _limit(forgot_ip_limiter, _client_ip(request))
    _limit(forgot_email_limiter, email)

    user = db.query(User).filter(func.lower(User.email) == email).first() if _valid_email(email) else None
    if user is not None:
        token = secrets.token_urlsafe(32)
        user.password_reset_hash = _token_hash(token)
        user.password_reset_expires = datetime.utcnow() + RESET_LINK_TTL
        db.commit()
        # Token im Fragment: der Browser schickt es nie an einen Server,
        # es steht also in keinem Zugriffslog und keinem Referer
        link = _app_url(f"/reset-password#token={token}")
        background.add_task(mailer.send_mail, user.email, *_mail("reset", _mail_lang(db, user, data.lang), user, link))
    return {"detail": "If an account exists for this address, an email is on its way."}


@router.post("/password/reset")
def reset_password(
    data: PasswordReset,
    request: Request,
    background: BackgroundTasks,
    db: DbSession = Depends(get_db),
):
    """Setzt das Passwort mit dem Link aus der Mail. Danach ist der Link verbraucht
    und jede Sitzung beendet (keine automatische Anmeldung, wie Budget-Pal)."""
    _limit(reset_limiter, _client_ip(request))
    if len(data.new_password) < MIN_PASSWORD:
        raise HTTPException(status_code=400, detail=ERR_TOO_SHORT)

    token_hash = _token_hash(data.token)
    user = (
        db.query(User)
        .filter(User.password_reset_hash == token_hash, User.password_reset_expires > datetime.utcnow())
        .first()
    )
    # Link verbrauchen, bevor das langsame bcrypt laeuft: zwei parallele Anfragen
    # koennen ihn so nicht beide nutzen
    consumed = user is not None and db.execute(
        update(User)
        .where(User.id == user.id, User.password_reset_hash == token_hash)
        .values(password_reset_hash=None)
    ).rowcount == 1
    if not consumed:
        db.rollback()
        raise HTTPException(status_code=400, detail=ERR_LINK)

    _set_password(db, user, data.new_password)
    # "Passwort vergessen" rettet ein Konto — ein Passkey, den ein Eindringling angelegt
    # hat, muss dabei mit raus (wie Budget-Pal)
    db.execute(delete(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id))
    db.commit()
    if user.email:
        lang = _mail_lang(db, user, data.lang)
        background.add_task(mailer.send_mail, user.email, *_mail("changed", lang, user, _app_url("/forgot-password")))
    return {"status": "ok"}


# ── Einladungen (wie Fintools): jedes Konto darf einladen, Codes einmalig, 7 Tage ──


def _invite_status(invite: Invite) -> str:
    if invite.used_at is not None:
        return "used"
    return "expired" if invite.expires_at.replace(tzinfo=None) <= datetime.utcnow() else "open"


def _invite_payload(db: DbSession, invite: Invite) -> dict:
    used_by = db.get(User, invite.used_by) if invite.used_by else None
    return {
        "code": invite.code,
        "created_at": invite.created_at.isoformat() if invite.created_at else None,
        "expires_at": invite.expires_at.isoformat(),
        "used_at": invite.used_at.isoformat() if invite.used_at else None,
        "used_by": used_by.display_name if used_by else None,
        "status": _invite_status(invite),
    }


@router.get("/invites")
def list_invites(db: DbSession = Depends(get_db), user: User = Depends(get_authenticated_user)):
    invites = db.query(Invite).filter(Invite.created_by == user.id).order_by(Invite.created_at.desc()).all()
    return [_invite_payload(db, i) for i in invites]


@router.post("/invites", status_code=201)
def create_invite(db: DbSession = Depends(get_db), user: User = Depends(get_authenticated_user)):
    open_count = db.query(func.count(Invite.code)).filter(
        Invite.created_by == user.id, Invite.used_at.is_(None), Invite.expires_at > datetime.utcnow()
    ).scalar()
    if open_count >= MAX_OPEN_INVITES:
        raise HTTPException(status_code=429, detail=ERR_TOO_MANY_INVITES)
    code = _new_invite_code()
    while db.get(Invite, code) is not None:
        code = _new_invite_code()
    invite = Invite(code=code, created_by=user.id, created_at=datetime.utcnow(),
                    expires_at=datetime.utcnow() + INVITE_TTL)
    db.add(invite)
    db.commit()
    return _invite_payload(db, invite)


@router.delete("/invites/{code}")
def revoke_invite(code: str, db: DbSession = Depends(get_db), user: User = Depends(get_authenticated_user)):
    removed = db.query(Invite).filter(
        Invite.code == _norm_invite(code), Invite.created_by == user.id, Invite.used_at.is_(None)
    ).delete(synchronize_session=False)
    db.commit()
    if not removed:
        raise HTTPException(status_code=404, detail="Invite not found")
    return {"status": "ok"}
