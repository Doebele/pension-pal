"""Anmeldung, Profil, Passwort aendern / vergessen / zuruecksetzen (routes/auth.py).

Laeuft gegen SQLite im Speicher; Mails werden abgefangen statt verschickt.
"""
import re
from datetime import datetime, timedelta

from app.models.user import User
from app.routes import auth as auth_routes

from conftest import headers, invite_for, register


def reset_token(mails):
    return re.search(r"#token=([\w-]+)", mails[-1][2]).group(1)


def test_register_and_login_with_name_or_email(ctx):
    client, _, _ = ctx
    assert register(client).status_code == 200
    assert client.post("/api/auth/login", json={"display_name": "anna", "pin": "geheim123"}).status_code == 200
    by_mail = client.post("/api/auth/login", json={"display_name": "ANNA@example.ch", "pin": "geheim123"})
    assert by_mail.status_code == 200 and by_mail.json()["display_name"] == "anna"
    # Falsches Passwort und unbekanntes Konto sind nicht zu unterscheiden
    wrong = client.post("/api/auth/login", json={"display_name": "anna", "pin": "falsch123"})
    unknown = client.post("/api/auth/login", json={"display_name": "niemand", "pin": "falsch123"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_register_validation(ctx):
    client, _, _ = ctx
    assert register(client, pin="kurz").json()["detail"] == auth_routes.ERR_TOO_SHORT
    assert register(client, email="keine-mail").json()["detail"] == auth_routes.ERR_EMAIL_INVALID
    h = headers(register(client))
    assert register(client, name="anna", invite=invite_for(client, h)).status_code == 409
    taken = register(client, name="bert", email="anna@EXAMPLE.ch", invite=invite_for(client, h))
    assert taken.json()["detail"] == auth_routes.ERR_EMAIL_TAKEN


def test_legacy_short_pin_still_logs_in(ctx):
    client, Session, _ = ctx
    with Session() as db:
        db.add(User(display_name="alt", pin_hash=auth_routes.pwd_context.hash("1234")))
        db.commit()
    assert client.post("/api/auth/login", json={"display_name": "alt", "pin": "1234"}).status_code == 200


def test_forgot_reveals_nothing_and_stores_only_the_hash(ctx):
    client, Session, mails = ctx
    register(client)
    unknown = client.post("/api/auth/password/forgot", json={"email": "wer@example.ch"})
    known = client.post("/api/auth/password/forgot", json={"email": "ANNA@example.ch"},
                        headers={"Host": "evil.example"})
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert len(mails) == 1 and mails[0][0] == "anna@example.ch"
    # Link aus APP_BASE_URL, nicht aus dem Host-Header; Token im Fragment
    assert "https://pensionpal.example/reset-password#token=" in mails[0][2]
    token = reset_token(mails)
    with Session() as db:
        user = db.query(User).filter_by(display_name="anna").one()
        assert user.password_reset_hash and token not in user.password_reset_hash


def test_reset_sets_password_ends_sessions_and_works_once(ctx):
    client, _, mails = ctx
    session = headers(register(client))
    client.post("/api/auth/password/forgot", json={"email": "anna@example.ch", "lang": "en"})
    token = reset_token(mails)
    assert client.post("/api/auth/password/reset", json={"token": token, "new_password": "kurz"}).status_code == 400
    assert client.post("/api/auth/password/reset", json={"token": token, "new_password": "neuesPasswort1", "lang": "en"}).status_code == 200
    assert mails[-1][1] == "Pension-Pal: password changed"
    assert client.get("/api/auth/me", headers=session).status_code == 401  # alte Sitzung beendet
    assert client.post("/api/auth/login", json={"display_name": "anna", "pin": "neuesPasswort1"}).status_code == 200
    again = client.post("/api/auth/password/reset", json={"token": token, "new_password": "nochEinMal12"})
    assert again.status_code == 400 and again.json()["detail"] == auth_routes.ERR_LINK


def test_expired_reset_link(ctx):
    client, Session, mails = ctx
    register(client)
    client.post("/api/auth/password/forgot", json={"email": "anna@example.ch"})
    with Session() as db:
        db.query(User).update({User.password_reset_expires: datetime.utcnow() - timedelta(minutes=1)})
        db.commit()
    res = client.post("/api/auth/password/reset", json={"token": reset_token(mails), "new_password": "neuesPasswort1"})
    assert res.status_code == 400


def test_change_password_keeps_this_session_only(ctx):
    client, _, mails = ctx
    first = headers(register(client))
    second = headers(client.post("/api/auth/login", json={"display_name": "anna", "pin": "geheim123"}))
    bad = client.post("/api/auth/password/change", headers=first,
                      json={"current_password": "falsch123", "new_password": "neuesPasswort1"})
    assert bad.status_code == 400 and bad.json()["detail"] == auth_routes.ERR_CURRENT_PW
    ok = client.post("/api/auth/password/change", headers=first,
                     json={"current_password": "geheim123", "new_password": "neuesPasswort1"})
    assert ok.status_code == 200
    assert client.get("/api/auth/me", headers=first).status_code == 200
    assert client.get("/api/auth/me", headers=second).status_code == 401
    assert mails[-1][1] == "Pension-Pal: Passwort geändert"


def test_profile_email_change_needs_password(ctx):
    client, _, _ = ctx
    h = headers(register(client))
    register(client, name="bert", email="bert@example.ch", invite=invite_for(client, h))
    assert client.put("/api/auth/me", headers=h, json={"email": "neu@example.ch"}).json()["detail"] == auth_routes.ERR_CURRENT_PW
    ok = client.put("/api/auth/me", headers=h, json={"email": "Neu@Example.ch", "current_password": "geheim123"})
    assert ok.status_code == 200 and ok.json()["email"] == "neu@example.ch"
    # Name aendern braucht kein Passwort, darf aber nicht kollidieren
    assert client.put("/api/auth/me", headers=h, json={"display_name": "bert"}).status_code == 409
    assert client.put("/api/auth/me", headers=h, json={"display_name": "anna-m"}).json()["display_name"] == "anna-m"
