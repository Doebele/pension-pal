"""E-Mails per SMTP — "Passwort vergessen" und die Info nach einem Passwortwechsel.

Wie Budget-Pal (backend/app/services/mailer.py): Standardbibliothek, kein
Mail-Dienst-SDK; produktiv das No-Reply-Postfach auf Strato.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

from ..core.config import settings

logger = logging.getLogger(__name__)


def _send_blocking(to: str, subject: str, text: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=(settings.smtp_from or "pensionpal").split("@")[-1])
    msg.set_content(text)

    context = ssl.create_default_context()
    if settings.smtp_port == 465:
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=20)
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
        server.starttls(context=context)
    with server:
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


def send_mail(to: str, subject: str, text: str) -> None:
    """Verschickt eine Klartext-Mail. Wirft nie: laeuft als Hintergrundaufgabe
    (FastAPI fuehrt sie im Threadpool aus), ein Fehler landet im Log."""
    if not settings.smtp_host:
        if settings.app_env == "production":
            logger.warning("Kein SMTP konfiguriert — Mail an %s nicht versendet (%s)", to, subject)
        else:
            # Lokal ohne Postfach: Inhalt ins Log, damit der Link testbar ist
            logger.warning("Kein SMTP konfiguriert — Mail an %s:\n%s\n%s", to, subject, text)
        return
    try:
        _send_blocking(to, subject, text)
    except Exception as e:
        # Kein Mailinhalt ins Log: er kann einen Reset-Link enthalten
        logger.error("Mail an %s fehlgeschlagen: %s: %s", to, type(e).__name__, e)
