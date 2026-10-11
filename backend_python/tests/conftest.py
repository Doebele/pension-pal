"""Gemeinsamer Aufbau fuer die Tests von Anmeldung, Einladungen und Passkeys:
SQLite im Speicher statt Postgres, Mails werden abgefangen statt verschickt."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db import Base, get_db
from app.main import app
from app.models.user import Invite, PersonProfile, Session as UserSession, User, WebAuthnChallenge, WebAuthnCredential
from app.routes import auth as auth_routes
from app.routes import webauthn as webauthn_routes
from app.services import mailer

# Nur die Tabellen der Anmeldung: andere nutzen JSONB, das SQLite nicht kennt
AUTH_TABLES = [t.__table__ for t in (User, UserSession, PersonProfile, Invite, WebAuthnCredential, WebAuthnChallenge)]
LIMITERS = (
    auth_routes.login_limiter, auth_routes.register_limiter, auth_routes.forgot_ip_limiter,
    auth_routes.forgot_email_limiter, auth_routes.reset_limiter, auth_routes.change_limiter,
    webauthn_routes.login_limiter, webauthn_routes.register_limiter,
)


@pytest.fixture
def ctx(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=AUTH_TABLES)
    Session = sessionmaker(bind=engine, autoflush=False)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    for limiter in LIMITERS:
        limiter._events.clear()
    mails = []
    monkeypatch.setattr(mailer, "send_mail", lambda to, subject, text: mails.append((to, subject, text)))
    monkeypatch.setattr(settings, "app_base_url", "https://pensionpal.example")
    # Ohne "with": die Startup-Routine (Postgres) laeuft nicht
    yield TestClient(app), Session, mails
    app.dependency_overrides.clear()


def register(client, name="anna", email="Anna@Example.ch", pin="geheim123", invite=None):
    return client.post("/api/auth/register",
                       json={"display_name": name, "email": email, "pin": pin, "invite": invite})


def headers(res):
    body = res.json()
    return {"X-User-Id": str(body["user_id"]), "X-Session-Token": body["session_token"]}


def invite_for(client, h) -> str:
    return client.post("/api/auth/invites", headers=h).json()["code"]
