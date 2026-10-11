"""Einladungscodes (wie Fintools): Registrierung nur mit Code, das erste Konto ohne."""
from datetime import datetime, timedelta

from app.models.user import Invite
from app.routes import auth as auth_routes

from conftest import headers, invite_for, register


def test_first_account_needs_no_code_later_ones_do(ctx):
    client, _, _ = ctx
    h = headers(register(client))  # leere Datenbank: ohne Code
    no_code = register(client, name="bert", email="bert@example.ch")
    assert no_code.status_code == 403 and no_code.json()["detail"] == auth_routes.ERR_INVITE
    code = invite_for(client, h)
    assert len(code) == 6 and set(code) <= set(auth_routes.INVITE_ALPHABET)
    # Kleinschreibung und Bindestrich wie im geteilten Link "abc-def" werden normalisiert
    ok = register(client, name="bert", email="bert@example.ch", invite=f"{code[:3].lower()}-{code[3:]}")
    assert ok.status_code == 200


def test_code_works_once_and_shows_who_used_it(ctx):
    client, _, _ = ctx
    h = headers(register(client))
    code = invite_for(client, h)
    assert register(client, name="bert", email="bert@example.ch", invite=code).status_code == 200
    again = register(client, name="carla", email="carla@example.ch", invite=code)
    assert again.status_code == 403
    listed = client.get("/api/auth/invites", headers=h).json()
    assert listed[0]["status"] == "used" and listed[0]["used_by"] == "bert"


def test_invalid_code_reveals_nothing_about_existing_names(ctx):
    client, _, _ = ctx
    register(client)
    # Name "anna" gibt es schon — ohne gueltigen Code heisst die Antwort trotzdem nur "Code falsch"
    res = register(client, name="anna", invite="ZZZZZZ")
    assert res.status_code == 403 and res.json()["detail"] == auth_routes.ERR_INVITE


def test_expired_and_revoked_codes(ctx):
    client, Session, _ = ctx
    h = headers(register(client))
    expired, revoked = invite_for(client, h), invite_for(client, h)
    with Session() as db:
        db.get(Invite, expired).expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()
    assert register(client, name="bert", email="bert@example.ch", invite=expired).status_code == 403
    assert client.delete(f"/api/auth/invites/{revoked}", headers=h).status_code == 200
    assert register(client, name="bert", email="bert@example.ch", invite=revoked).status_code == 403
    statuses = {i["code"]: i["status"] for i in client.get("/api/auth/invites", headers=h).json()}
    assert statuses == {expired: "expired"}


def test_only_own_invites_and_at_most_ten_open(ctx):
    client, _, _ = ctx
    anna = headers(register(client))
    bert = headers(register(client, name="bert", email="bert@example.ch", invite=invite_for(client, anna)))
    code = invite_for(client, anna)
    assert client.delete(f"/api/auth/invites/{code}", headers=bert).status_code == 404  # fremder Code
    for _ in range(9):
        invite_for(client, anna)
    assert client.post("/api/auth/invites", headers=anna).status_code == 429
    assert client.get("/api/auth/invites").status_code == 401  # nur angemeldet
