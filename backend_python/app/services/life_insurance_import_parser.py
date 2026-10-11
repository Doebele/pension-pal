from __future__ import annotations

import io
import re

import pdfplumber

from .ocr import AMOUNT, GAP, OcrField, _get_text, fix_cid, format_amount, parse_amount, refine_with_ai


_INSURER_CANDIDATES = (
    "Zürich",
    "AXA",
    "Generali",
    "ERGO",
    "Swiss Life",
    "Manuia",
)


def _extract_pdf_text_and_tables(data: bytes, mistral_api_key: str | None) -> str:
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            chunks: list[str] = []
            for page in pdf.pages:
                page_text = fix_cid(page.extract_text() or "")
                if page_text.strip():
                    chunks.append(page_text)
                for table in page.extract_tables() or []:
                    for row in table or []:
                        safe = [fix_cid(str(cell or "")).strip() for cell in row]
                        if any(safe):
                            chunks.append(" | ".join(safe))
            text = "\n".join(chunks)
    except Exception:
        return data.decode("utf-8", errors="ignore")  # .txt upload
    if len(text.strip()) < 50:
        # Scanned policy without a text layer: same OCR chain as the document import (Mistral → tesseract)
        text = _get_text(data, "application/pdf", mistral_api_key)
    return text


def _find_first(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    return (match.group(1) or "").strip() or None


def _amount(labels: str, text: str) -> str:
    return format_amount(_find_first(rf"(?:{labels})" + GAP + AMOUNT, text))


_PER_YEAR = {"jährlich": 1, "jaehrlich": 1, "halbjährlich": 2, "halbjaehrlich": 2,
             "vierteljährlich": 4, "vierteljaehrlich": 4, "monatlich": 12}


def _annual_premium(text: str) -> str:
    """'Jährliche Prämie CHF 2'400' or, as in ERGO policies, 'Beitrag auf halbjährlich 7.225,39 EUR' (× 2)."""
    direct = _amount(r"Jährliche(?:r)? Beiträge?|Jaehrliche(?:r)? Beitraege?|Jahresprämie|Jahrespraemie|Jährliche Prämie|Jaehrliche Praemie", text)
    if direct:
        return direct
    match = re.search(
        r"(?:Beitrag|Prämie|Praemie)[^\n\d]{0,40}?\b(halbjährlich|halbjaehrlich|vierteljährlich|vierteljaehrlich|jährlich|jaehrlich|monatlich)\b"
        + GAP + AMOUNT,
        text, flags=re.IGNORECASE,
    )
    amount = parse_amount(match.group(2)) if match else None
    return "" if amount is None else str(round(amount * _PER_YEAR[match.group(1).lower()], 2))


def _extract_currency(text: str) -> str:
    upper = text.upper()
    if " EUR" in upper or "€" in text:
        return "EUR"
    if " USD" in upper or "$" in text:
        return "USD"
    if " GBP" in upper or "£" in text:
        return "GBP"
    return "CHF"


def _detect_insurer(text: str) -> str:
    lowered = text.lower()
    for insurer in _INSURER_CANDIDATES:
        if insurer.lower() in lowered:
            return insurer
    return "Weitere"


def parse_life_insurance_pdf_import(
    data: bytes, ai: dict | None = None, mistral_api_key: str | None = None
) -> dict[str, object]:
    # Line structure is kept: a value ends at the line end instead of running into the next label
    text = _extract_pdf_text_and_tables(data, mistral_api_key).replace("\xa0", " ")

    insurer_name = _detect_insurer(text)
    policy_number = _find_first(
        r"(?:Versicherungs-?(?:nummer|nr\.?)|Policen-?(?:nummer|nr\.?)|Vertrags-?(?:nummer|nr\.?)|Police[- ]Nr\.?)"
        r"[:\s]*([A-Z0-9][A-Z0-9.\-/ ]{2,30}[A-Z0-9])",
        text,
    )
    insured_name = _find_first(
        r"(?:Versicherte Person|Versicherungsnehmer(?:in)?)[:\s]+([A-ZÄÖÜ][^\n|:\d]{2,60})", text
    )
    maturity_date = _find_first(
        r"(?:Ablauf(?:datum|termin)?|Vertragsende|Leistungsbeginn)[^\n\d]{0,20}"
        r"([0-3]?\d\.[0-1]?\d\.[12]\d{3}|[12]\d{3}-[01]\d-[0-3]\d|[12]\d{3})",
        text,
    )
    currency = _extract_currency(text)

    # (id, label, value, priority)
    found = [
        ("insurer", "Versicherer", insurer_name if insurer_name != "Weitere" else "", "essential"),
        ("policyNumber", "Versicherungsnummer", policy_number or "", "essential"),
        ("insuredName", "Versichertenname", insured_name or "", "essential"),
        ("capitalPayoutAtMaturity", "Garantiertes Erlebensfallkapital",
         _amount(r"Garantiertes Erlebensfallkapital|Erlebensfallkapital|Kapitalleistung(?: bei Ablauf)?|Ablaufleistung|Kapitalsumme", text),
         "essential"),
        ("annualPensionChf", "Jährliche Rente",
         _amount(r"Jährliche Rente|Jaehrliche Rente|Jahresrente|Rente pro Jahr|Altersrente", text), "secondary"),
        ("annualPremium", "Jährliche Beiträge",
         _annual_premium(text), "essential"),
        ("monthlyPremium", "Monatliche Prämie",
         _amount(r"Monatliche(?:r)? Beitrag|Monatliche(?:r)? Prämie|Monatliche(?:r)? Praemie", text), "secondary"),
        ("surrenderValue", "Rückkaufswert", _amount(r"Rückkaufswert|Rueckkaufswert", text), "secondary"),
        ("sumAtDeath", "Todesfallkapital",
         _amount(r"Todesfallkapital|Leistung im Todesfall|Todesfallleistung", text), "secondary"),
        ("maturityDate", "Ablaufdatum", maturity_date or "", "secondary"),
    ]
    fields = [
        OcrField(field_id, label, value, (0.9 if priority == "essential" else 0.85) if value else 0.0, priority, field_id)
        for field_id, label, value, priority in found
    ]
    if ai:
        fields = refine_with_ai(ai, text, fields)
    insurer = next(f for f in fields if f.field_id == "insurer")
    if insurer.value not in _INSURER_CANDIDATES:  # the card only knows these (the AI may name others)
        insurer.value = "Weitere"
    fields.append(OcrField("currency", "Währung", currency, 0.93, "essential", "currency"))

    issues: list[dict[str, object]] = []
    for field_id, label in (("surrenderValue", "Rückkaufswert"), ("sumAtDeath", "Todesfallkapital")):
        if not next(f for f in fields if f.field_id == field_id).value:
            issues.append({"field_id": field_id, "code": "MISSING_OPTIONAL_VALUE", "message": f"{label} wurde nicht erkannt."})
    if not text.strip():
        issues.append({"field_id": None, "code": "NO_TEXT", "message": "Im Dokument wurde kein Text gefunden."})

    return {
        "fields": [
            {
                "id": f.field_id,
                "label": f.label,
                "value": f.value,
                "confidence_score": f.confidence_score,
                "priority": f.priority,
                "source_pattern": f.source_pattern,
            }
            for f in fields
        ],
        "issues": issues,
        "import_metadata": {
            "detected_insurer": insurer_name,
            "currency": currency,
            "text_length": len(text),
            "fields_detected": len([f for f in fields if f.value]),
        },
        "field_mapping_suggestions": [
            {
                "source_field_id": f.field_id,
                "source_label": f.label,
                "target_field_id": f.field_id,
                "target_label": f.label,
                "confidence": f.confidence_score,
            }
            for f in fields
        ],
    }
