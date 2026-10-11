"""Vollstaendige Passkey-Ceremonies mit einem Software-Authenticator (wie Budget-Pal
tests/test_passkey_ceremony.py). Der Authenticator macht, was Touch ID macht: ein
EC-P-256-Schluessel signiert Registrierung (attestation "none") und Anmeldung.
"""
import base64
import hashlib
import json
import os
import struct
from datetime import datetime, timedelta

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.config import settings
from app.models.user import User, WebAuthnChallenge, WebAuthnCredential
from app.routes import auth as auth_routes

from conftest import headers, register

ORIGIN = settings.webauthn_origins[0]
PASSWORD = "geheim123"


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


class SoftAuthenticator:
    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.cred_id = os.urandom(32)
        self.count = 0
        self.user_handle = b""

    @staticmethod
    def _rp_hash(rp_id):
        return hashlib.sha256(rp_id.encode()).digest()

    def create(self, options):
        self.user_handle = base64.urlsafe_b64decode(options["user"]["id"] + "==")
        client_data = json.dumps({"type": "webauthn.create", "challenge": options["challenge"],
                                  "origin": ORIGIN, "crossOrigin": False}).encode()
        nums = self.key.public_key().public_numbers()
        cose = cbor2.dumps({1: 2, 3: -7, -1: 1, -2: nums.x.to_bytes(32, "big"), -3: nums.y.to_bytes(32, "big")})
        auth_data = (self._rp_hash(options["rp"]["id"]) + bytes([0x45]) + struct.pack(">I", 0)
                     + b"\0" * 16 + struct.pack(">H", len(self.cred_id)) + self.cred_id + cose)
        att = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {"id": b64(self.cred_id), "rawId": b64(self.cred_id), "type": "public-key",
                "response": {"clientDataJSON": b64(client_data), "attestationObject": b64(att)},
                "clientExtensionResults": {}}

    def get(self, options, *, user_verified=True):
        self.count += 1
        client_data = json.dumps({"type": "webauthn.get", "challenge": options["challenge"],
                                  "origin": ORIGIN, "crossOrigin": False}).encode()
        flags = 0x05 if user_verified else 0x01  # UP (+ UV)
        auth_data = self._rp_hash(options["rpId"]) + bytes([flags]) + struct.pack(">I", self.count)
        sig = self.key.sign(auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256()))
        return {"id": b64(self.cred_id), "rawId": b64(self.cred_id), "type": "public-key",
                "response": {"clientDataJSON": b64(client_data), "authenticatorData": b64(auth_data),
                             "signature": b64(sig), "userHandle": b64(self.user_handle)},
                "clientExtensionResults": {}}


def _options(client, path, **kw):
    return json.loads(client.post(path, **kw).json())  # Options kommen als JSON-String, wie die Spec


def _register(client, h):
    auth = SoftAuthenticator()
    options = _options(client, "/api/auth/webauthn/register/options", headers=h, json={"password": PASSWORD})
    res = client.post("/api/auth/webauthn/register/verify", headers=h,
                      json={"credential": auth.create(options), "device_name": "Test"})
    assert res.status_code == 201, res.text
    return auth


def _login(client, auth, **kw):
    options = _options(client, "/api/auth/webauthn/login/options")
    return client.post("/api/auth/webauthn/login/verify", json={"credential": auth.get(options, **kw)})


def test_register_then_login_with_passkey(ctx):
    client, _, mails = ctx
    h = headers(register(client))
    auth = _register(client, h)
    assert mails[-1][0] == "anna@example.ch" and "Passkey" in mails[-1][1]  # Info-Mail
    res = _login(client, auth)
    assert res.status_code == 200, res.text
    assert client.get("/api/auth/me", headers=headers(res)).json()["display_name"] == "anna"
    listed = client.get("/api/auth/webauthn/credentials", headers=h).json()
    assert listed[0]["device_name"] == "Test" and listed[0]["last_used_at"]


def test_adding_a_passkey_needs_the_password(ctx):
    client, _, _ = ctx
    h = headers(register(client))
    wrong = client.post("/api/auth/webauthn/register/options", headers=h, json={"password": "falsch-falsch"})
    assert wrong.status_code == 400  # 400, nicht 401: ein 401 wuerde das Frontend abmelden
    assert client.post("/api/auth/webauthn/register/options", headers=h).status_code == 422
    assert client.post("/api/auth/webauthn/register/options", json={"password": PASSWORD}).status_code == 401


def test_login_uses_the_challenge_it_was_given(ctx):
    """Zwei Anmeldungen zur selben Zeit: jede geht mit ihrer eigenen Challenge durch."""
    client, _, _ = ctx
    auth = _register(client, headers(register(client)))
    mine = _options(client, "/api/auth/webauthn/login/options")
    _options(client, "/api/auth/webauthn/login/options")  # jemand anders, kurz danach
    res = client.post("/api/auth/webauthn/login/verify", json={"credential": auth.get(mine)})
    assert res.status_code == 200, res.text


def test_replayed_assertion_is_refused(ctx):
    client, _, _ = ctx
    auth = _register(client, headers(register(client)))
    options = _options(client, "/api/auth/webauthn/login/options")
    assertion = auth.get(options)
    assert client.post("/api/auth/webauthn/login/verify", json={"credential": assertion}).status_code == 200
    again = client.post("/api/auth/webauthn/login/verify", json={"credential": assertion})
    assert again.status_code in (400, 401)


def test_login_without_user_verification_is_refused(ctx):
    """Ein Schluessel ohne PIN/Biometrie: Besitz allein reicht nicht."""
    client, _, _ = ctx
    auth = _register(client, headers(register(client)))
    assert _login(client, auth, user_verified=False).status_code == 401


def test_challenge_is_consumed_even_when_signature_fails(ctx):
    client, Session, _ = ctx
    auth = _register(client, headers(register(client)))
    options = _options(client, "/api/auth/webauthn/login/options")
    assertion = auth.get(options)
    assertion["response"]["signature"] = b64(b"\x30\x06\x02\x01\x01\x02\x01\x01")
    assert client.post("/api/auth/webauthn/login/verify", json={"credential": assertion}).status_code == 401
    with Session() as db:
        assert db.query(WebAuthnChallenge).filter_by(challenge=options["challenge"]).count() == 0


def test_login_options_are_rate_limited(ctx):
    client, _, _ = ctx
    codes = [client.post("/api/auth/webauthn/login/options").status_code for _ in range(31)]
    assert codes[:30] == [200] * 30 and codes[30] == 429


def test_remove_only_own_passkey(ctx):
    client, _, _ = ctx
    anna = headers(register(client))
    _register(client, anna)
    pid = client.get("/api/auth/webauthn/credentials", headers=anna).json()[0]["id"]
    bert = headers(register(client, name="bert", email="bert@example.ch",
                            invite=client.post("/api/auth/invites", headers=anna).json()["code"]))
    assert client.delete(f"/api/auth/webauthn/credentials/{pid}", headers=bert).status_code == 404
    assert client.delete(f"/api/auth/webauthn/credentials/{pid}", headers=anna).status_code == 204
    assert client.get("/api/auth/webauthn/credentials", headers=anna).json() == []


def test_password_reset_removes_passkeys(ctx):
    """"Passwort vergessen" rettet ein Konto — ein Passkey eines Eindringlings muss mit raus."""
    client, Session, _ = ctx
    _register(client, headers(register(client)))
    raw = "reset-token-for-passkey-test-0123456789"
    with Session() as db:
        user = db.query(User).one()
        user.password_reset_hash = auth_routes._token_hash(raw)
        user.password_reset_expires = datetime.utcnow() + timedelta(minutes=5)
        db.commit()
    assert client.post("/api/auth/password/reset", json={"token": raw, "new_password": "neuesPasswort1"}).status_code == 200
    with Session() as db:
        assert db.query(WebAuthnCredential).count() == 0
