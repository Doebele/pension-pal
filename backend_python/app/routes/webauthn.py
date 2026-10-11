"""Passkeys (WebAuthn / FIDO2) — Anmeldung per Face ID, Touch ID, Windows Hello oder
Sicherheitsschluessel. Portiert aus Budget-Pal (backend/app/api/webauthn.py, inkl. fix/passkeys).

  POST   /api/auth/webauthn/register/options   angemeldet + Passwort → Registrierung starten
  POST   /api/auth/webauthn/register/verify    angemeldet  → Passkey speichern (+ Info-Mail)
  POST   /api/auth/webauthn/login/options      offen       → Anmeldung starten
  POST   /api/auth/webauthn/login/verify       offen       → Sitzung ausstellen
  GET    /api/auth/webauthn/credentials        angemeldet  → eigene Passkeys
  DELETE /api/auth/webauthn/credentials/{id}   angemeldet  → Passkey entfernen

- Die Challenge liegt in der Datenbank und wird ueber die Antwort gefunden (clientDataJSON),
  nicht als "juengste offene": sonst stoeren sich gleichzeitige Anmeldungen, und wer die
  offene Options-Route oft aufruft, blockiert jede Passkey-Anmeldung.
- Einmalgebrauch: jede Challenge wird beim Pruefen verbraucht, auch wenn die Signatur scheitert.
- Einen Passkey hinzufuegen verlangt das aktuelle Passwort und schickt eine Info-Mail. Sonst
  legte jemand mit gestohlener Sitzung einen eigenen Passkey an und bliebe auch nach einem
  Passwortwechsel drin. "Passwort zuruecksetzen" entfernt alle Passkeys (routes/auth.py).
- User Verification ist Pflicht: Besitz eines Schluessels ohne PIN/Biometrie reicht nicht.
- rp_id und origins kommen aus der Konfiguration (produktiv: pensionpal.doebele12.de).
"""
from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.orm import Session as DbSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from ..core.config import settings
from ..core.rate_limit import SlidingWindowRateLimiter
from ..db import get_db
from ..models.user import User, WebAuthnChallenge, WebAuthnCredential
from ..services import mailer
from .auth import ERR_CURRENT_PW, _app_url, _client_ip, _limit, _mail, _mail_lang, _new_session, _session_payload, pwd_context
from .profile import get_authenticated_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/webauthn", tags=["passkeys"])

# Eine Ceremony ist eine Interaktion, keine Sitzung — kurz halten
CHALLENGE_TTL = timedelta(minutes=5)
# Die Anmeldung ist offen und legt je Aufruf eine Challenge in der DB an
login_limiter = SlidingWindowRateLimiter(max_requests=30, window_seconds=60)
# Passwortpruefung beim Hinzufuegen: gegen Durchprobieren mit fremder Sitzung
register_limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=300)

ERR_CHALLENGE = "No valid challenge. Please try again."
ERR_PASSKEY = "Passkey not accepted."


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _store_challenge(db: DbSession, challenge: bytes, purpose: str, user_id: Optional[int]) -> None:
    """Challenge ablegen und dabei abgelaufene aufraeumen."""
    now = datetime.utcnow()
    db.execute(delete(WebAuthnChallenge).where(WebAuthnChallenge.expires_at < now))
    db.add(WebAuthnChallenge(challenge=_b64(challenge), user_id=user_id, purpose=purpose,
                             expires_at=now + CHALLENGE_TTL))
    db.commit()


def _take_challenge(db: DbSession, purpose: str, user_id: Optional[int], credential: dict) -> bytes:
    """Die Challenge dieser Antwort holen UND verbrauchen. Welche gemeint ist, steht in der
    Antwort selbst (clientDataJSON); die Signatur prueft spaeter, dass sie nicht vertauscht wurde."""
    invalid = HTTPException(status_code=400, detail=ERR_CHALLENGE)
    try:
        client_data = json.loads(_unb64(credential["response"]["clientDataJSON"]))
        challenge_b64 = str(client_data["challenge"])
    except (KeyError, TypeError, ValueError):
        raise invalid

    query = db.query(WebAuthnChallenge).filter(
        WebAuthnChallenge.challenge == challenge_b64,
        WebAuthnChallenge.purpose == purpose,
        WebAuthnChallenge.expires_at >= datetime.utcnow(),
    )
    if user_id is not None:
        query = query.filter(WebAuthnChallenge.user_id == user_id)
    row = query.first()
    if row is None:
        raise invalid
    challenge = _unb64(row.challenge)
    db.delete(row)
    db.commit()
    return challenge


def _credential_payload(c: WebAuthnCredential) -> dict:
    return {
        "id": c.id,
        "device_name": c.device_name,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
    }


class RegisterOptionsRequest(BaseModel):
    # Aktuelles Passwort: ein Passkey ist ein zweiter Schluessel zum Konto
    password: str = Field(max_length=200)


class RegisterVerifyRequest(BaseModel):
    credential: dict
    device_name: Optional[str] = Field(default=None, max_length=120)


class LoginVerifyRequest(BaseModel):
    credential: dict


# ── Registrierung ─────────────────────────────────────────────


@router.post("/register/options")
def register_options(
    data: RegisterOptionsRequest,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    """Falsches Passwort ist 400, nicht 401 — ein 401 meldet das Frontend ab."""
    _limit(register_limiter, str(user.id))
    if not pwd_context.verify(data.password, user.pin_hash):
        raise HTTPException(status_code=400, detail=ERR_CURRENT_PW)
    existing = [c for (c,) in db.query(WebAuthnCredential.credential_id).filter(WebAuthnCredential.user_id == user.id)]
    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=str(user.id).encode(),
        user_name=user.email or user.display_name,
        user_display_name=user.display_name,
        # Derselbe Authenticator soll nicht zweimal angelegt werden
        exclude_credentials=[PublicKeyCredentialDescriptor(id=_unb64(cid)) for cid in existing],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    _store_challenge(db, options.challenge, "register", user.id)
    return options_to_json(options)


@router.post("/register/verify", status_code=201)
def register_verify(
    data: RegisterVerifyRequest,
    background: BackgroundTasks,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    challenge = _take_challenge(db, "register", user.id, data.credential)
    try:
        verified = verify_registration_response(
            credential=data.credential,
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origins,
            require_user_verification=True,
        )
    except Exception as e:
        logger.warning("Passkey-Registrierung abgelehnt: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=400, detail=ERR_PASSKEY)

    credential = WebAuthnCredential(
        user_id=user.id,
        credential_id=_b64(verified.credential_id),
        public_key=_b64(verified.credential_public_key),
        sign_count=verified.sign_count,
        device_name=(data.device_name or "").strip() or None,
        created_at=datetime.utcnow(),
    )
    db.add(credential)
    db.commit()
    # Info an den Kontoinhaber — faellt auf, falls ein Fremder das war
    if user.email:
        background.add_task(mailer.send_mail, user.email,
                            *_mail("passkey", _mail_lang(db, user, None), user, _app_url("/")))
    return _credential_payload(credential)


# ── Anmeldung ─────────────────────────────────────────────────


@router.post("/login/options")
def login_options(request: Request, db: DbSession = Depends(get_db)):
    """Bewusst ohne Nutzerbezug — der Authenticator waehlt selbst den passenden Passkey."""
    _limit(login_limiter, _client_ip(request))
    options = generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    _store_challenge(db, options.challenge, "login", None)
    return options_to_json(options)


@router.post("/login/verify")
def login_verify(data: LoginVerifyRequest, request: Request, db: DbSession = Depends(get_db)):
    _limit(login_limiter, _client_ip(request))
    challenge = _take_challenge(db, "login", None, data.credential)

    raw_id = data.credential.get("id")
    credential = (
        db.query(WebAuthnCredential).filter(WebAuthnCredential.credential_id == raw_id).first() if raw_id else None
    )
    if credential is None:
        raise HTTPException(status_code=401, detail=ERR_PASSKEY)
    try:
        verified = verify_authentication_response(
            credential=data.credential,
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origins,
            credential_public_key=_unb64(credential.public_key),
            credential_current_sign_count=credential.sign_count,
            require_user_verification=True,
        )
    except Exception as e:
        logger.warning("Passkey-Anmeldung abgelehnt: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=401, detail=ERR_PASSKEY)

    user = db.get(User, credential.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail=ERR_PASSKEY)
    credential.sign_count = verified.new_sign_count
    credential.last_used_at = datetime.utcnow()
    session = _new_session(db, user)
    db.commit()
    return _session_payload(user, session)


# ── Verwaltung ────────────────────────────────────────────────


@router.get("/credentials")
def list_credentials(db: DbSession = Depends(get_db), user: User = Depends(get_authenticated_user)):
    rows = (
        db.query(WebAuthnCredential)
        .filter(WebAuthnCredential.user_id == user.id)
        .order_by(WebAuthnCredential.created_at.desc())
        .all()
    )
    return [_credential_payload(c) for c in rows]


@router.delete("/credentials/{credential_id}", status_code=204)
def delete_credential(credential_id: int, db: DbSession = Depends(get_db), user: User = Depends(get_authenticated_user)):
    removed = db.query(WebAuthnCredential).filter(
        WebAuthnCredential.id == credential_id, WebAuthnCredential.user_id == user.id
    ).delete(synchronize_session=False)
    db.commit()
    if not removed:
        raise HTTPException(status_code=404, detail="Passkey not found")
