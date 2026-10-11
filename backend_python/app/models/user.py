from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from ..db import Base


class MaritalStatus(str, PyEnum):
    SINGLE = "single"
    MARRIED = "married"
    DIVORCED = "divorced"
    WIDOWED = "widowed"
    CONCUBINAGE = "concubinage"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    pin_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # NULL fuer Konten von vor dem Profil; eindeutig ueber lower(email), Index in main.py
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    # "Passwort vergessen": gespeichert ist nur der SHA-256 des Tokens aus dem Link
    password_reset_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    password_reset_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    profile: Mapped["PersonProfile"] = relationship(
        "PersonProfile", uselist=False, back_populates="user"
    )
    sessions: Mapped[list["Session"]] = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )


class PersonProfile(Base):
    __tablename__ = "person_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )

    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    canton: Mapped[str | None] = mapped_column(String(2), nullable=True)
    municipality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    zip_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    marital_status: Mapped[MaritalStatus | None] = mapped_column(
        Enum(MaritalStatus), nullable=True
    )
    marital_status_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Steuer / Finanz-Parameter
    manual_tax_rate_percent: Mapped[float | None] = mapped_column(nullable=True)
    target_retirement_age: Mapped[int | None] = mapped_column(nullable=True)
    has_property: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    property_details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    pillar_3a_accounts: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    foreign_currency_assets: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    cash_assets: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    investment_assets: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)

    # UI-Praeferenzen
    ui_theme: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ui_language: Mapped[str | None] = mapped_column(String(5), nullable=True)
    ui_density: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # KI-Modell: {provider, endpoint, model, key, profiles: {providerId: {endpoint, model, key, ok}}}
    ai_settings: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="profile")


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("token", name="uq_sessions_token"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    token: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    client_fingerprint: Mapped[str | None] = mapped_column(String(255), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[User] = relationship("User", back_populates="sessions")


class ThreeAMarkingState(Base):
    __tablename__ = "three_a_marking_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    markings: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )



class Invite(Base):
    """Einladungscode fuer ein neues Konto (wie Fintools): 6 Zeichen ohne Verwechsler,
    7 Tage und fuer genau ein Konto gueltig."""

    __tablename__ = "invites"

    code: Mapped[str] = mapped_column(String(6), primary_key=True)  # normalisiert, ohne Bindestrich
    created_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WebAuthnCredential(Base):
    """Ein registrierter Passkey (Face ID, Touch ID, Windows Hello, Sicherheitsschluessel).
    Wie Budget-Pal (backend/app/models/models.py)."""

    __tablename__ = "webauthn_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Base64url-kodierte Credential-ID, wie sie der Authenticator liefert
    credential_id: Mapped[str] = mapped_column(String(512), unique=True, nullable=False, index=True)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    # Zaehler des Authenticators — springt er zurueck, ist der Schluessel geklont
    sign_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    device_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WebAuthnChallenge(Base):
    """Kurzlebige Challenge einer laufenden Passkey-Ceremony. In der Datenbank statt im
    Arbeitsspeicher, damit die Verifikation nicht denselben Prozess treffen muss."""

    __tablename__ = "webauthn_challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    challenge: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    # NULL bei der Anmeldung — da ist der Nutzer noch unbekannt
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    purpose: Mapped[str] = mapped_column(String(16), nullable=False)  # register | login
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
