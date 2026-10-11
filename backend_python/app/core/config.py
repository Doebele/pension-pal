from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "SwissPensionCalc API"
    app_env: str = "development"

    database_url: str = "postgresql://swisspension:change_me_securely@db/swiss_pension"

    secret_key: str = "please_change_me"
    access_token_expire_minutes: int = 120

    mistral_api_key: str | None = None

    # Mails (Passwort vergessen / Passwort geaendert) per SMTP, produktiv das
    # No-Reply-Postfach auf Strato wie bei Budget-Pal. Leeres smtp_host: es geht
    # nichts raus; in der Entwicklung steht der Link im Log.
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    # Links in Mails kommen nur von hier, nie aus dem Host-Header der Anfrage
    app_base_url: str = "http://localhost:5173"

    # Passkeys (WebAuthn). Ein Passkey ist fest an die Domain gebunden: rp_id ist die nackte
    # Domain, origins die vollstaendigen Adressen. Passt das nicht zur aufgerufenen Seite,
    # lehnt schon der Browser ab. Produktiv in docker-compose.prod.yml gesetzt.
    webauthn_rp_id: str = "localhost"
    webauthn_rp_name: str = "Pension-Pal"
    webauthn_origins_raw: str = "http://localhost:5173"

    @property
    def webauthn_origins(self) -> list[str]:
        return [o.strip() for o in self.webauthn_origins_raw.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

