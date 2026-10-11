from __future__ import annotations

import base64
import io
import logging
from dataclasses import dataclass
import re

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OcrPattern:
    field_id: str
    label: str
    priority: str
    pattern: str
    is_amount: bool = False


@dataclass
class OcrField:
    field_id: str
    label: str
    value: str
    confidence_score: float
    priority: str = "essential"
    source_pattern: str | None = None


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def fix_cid(text: str) -> str:
    """pdfplumber writes glyphs it cannot map as "(cid:N)". Fonts with a MacRoman encoding (seen in ERGO
    policies) use N 128–255 for umlauts: 159 → ü, 138 → ä, 154 → ö, 134 → Ü. Other codes are dropped."""
    def repl(match: re.Match) -> str:
        code = int(match.group(1))
        return bytes([code]).decode("mac_roman") if 128 <= code <= 255 else ""
    return re.sub(r"\(cid:(\d+)\)", repl, text)


def _extract_text_from_pdf(data: bytes) -> str:
    """Extract text from a PDF using pdfplumber.
    Falls back to pytesseract if the PDF contains no selectable text (scanned)."""
    import pdfplumber

    try:
        text_parts: list[str] = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                page_text = fix_cid(page.extract_text() or "")
                text_parts.append(page_text)

        text = "\n".join(text_parts).strip()

        if len(text) < 50:
            # Likely a scanned PDF — convert pages to images and OCR them
            logger.info("pdfplumber returned little text; falling back to pytesseract")
            text = _ocr_scanned_pdf(data)

        return text
    except Exception:
        # Not a valid PDF binary (e.g. plain-text bytes in tests) — decode directly
        return data.decode("utf-8", errors="ignore")


def _ocr_scanned_pdf(data: bytes) -> str:
    """Render PDF pages as images and run pytesseract on each."""
    try:
        from pdf2image import convert_from_bytes
        import pytesseract

        images = convert_from_bytes(data, dpi=200)
        return "\n\n".join(
            pytesseract.image_to_string(img, lang="deu+fra+eng") for img in images
        )
    except Exception as exc:
        logger.warning("pytesseract fallback failed: %s", exc)
        return ""


def _extract_text_from_image(data: bytes) -> str:
    """Extract text from a JPEG/PNG image using pytesseract."""
    try:
        import pytesseract
        from PIL import Image

        image = Image.open(io.BytesIO(data))
        return pytesseract.image_to_string(image, lang="deu+fra+eng")
    except Exception as exc:
        logger.warning("pytesseract image extraction failed: %s", exc)
        return ""


def _extract_text_via_mistral(data: bytes, mime_type: str, api_key: str) -> str:
    """Extract text using the Mistral OCR API (mistral-ocr-latest).

    Returns the concatenated markdown text of all pages.
    If the API call fails the function logs a warning and returns an empty string
    so the caller can fall back to the local extraction path.
    """
    try:
        import httpx

        data_url = f"data:{mime_type};base64,{base64.b64encode(data).decode()}"
        response = httpx.post(
            "https://api.mistral.ai/v1/ocr",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "mistral-ocr-latest",
                "document": {"type": "document_url", "document_url": data_url},
            },
            timeout=60.0,
        )
        response.raise_for_status()
        pages = response.json().get("pages", [])
        return "\n\n".join(p.get("markdown", "") for p in pages)
    except Exception as exc:
        logger.warning("Mistral OCR API call failed: %s", exc)
        return ""


def _get_text(data: bytes, mime_type: str, mistral_api_key: str | None) -> str:
    """Return extracted text for a PDF or image payload.

    Priority:
    1. Mistral OCR (if api key is configured) — highest quality
    2. pdfplumber (PDFs with selectable text)
    3. pytesseract (images or scanned PDFs)
    """
    if mistral_api_key:
        text = _extract_text_via_mistral(data, mime_type, mistral_api_key)
        if text.strip():
            return text
        logger.info("Mistral OCR returned no text; falling back to local extraction")

    is_pdf = mime_type in ("application/pdf", "application/x-pdf")
    if is_pdf:
        return _extract_text_from_pdf(data)

    return _extract_text_from_image(data)


# ---------------------------------------------------------------------------
# Document type detection
# ---------------------------------------------------------------------------

_LIFE_WORDS = re.compile(r"lebensversicherung|versicherung|police|policy|(?<![a-z])life(?![a-z])|erlebensfall|r(?:ü|ue)ckkaufswert", re.I)
_PENSION_WORDS = re.compile(r"pensionskasse|vorsorgeausweis|vorsorgestiftung|(?<![a-z])(?:bvg|pk)(?![a-z])|altersguthaben|freiz(?:ü|ue)gigkeit|pension", re.I)


def detect_document_type(filename: str, text: str = "") -> str:
    """Filename first (the user's own naming is the strongest hint), then the document content."""
    name = filename.lower()
    if _LIFE_WORDS.search(name):
        return "life_insurance"
    if _PENSION_WORDS.search(name):
        return "pension_fund"
    if re.search(r"(?<![a-z])ahv(?![a-z])", name):
        return "ahv"
    head = text[:4000]
    if re.search(r"vorsorgeausweis|altersguthaben|umwandlungssatz", head, re.I):
        return "pension_fund"
    if re.search(r"lebensversicherung|erlebensfall|r(?:ü|ue)ckkaufswert|police", head, re.I):
        return "life_insurance"
    return "generic_pdf"


# ---------------------------------------------------------------------------
# Amounts
# ---------------------------------------------------------------------------

# Swiss 1'234.50 / 1’234.50 / 1 234.50, German 1.234,50, plain 1234.50
AMOUNT = r"(?<![\d.,'])(\d{1,3}(?:['’ \u00a0]\d{3})+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![.,]?\d)"  # not part of a date like 31.12.2024
# Between label and amount: up to 60 chars on the next line at most, may hold "per 31.12.2024:" or "CHF"
GAP = r"(?:\d{1,2}\.\d{1,2}\.\d{2,4}|[^\d\n]|\n(?!\n)){0,60}?"


def parse_amount(raw: str | None) -> float | None:
    """'1'234.50', '1.234,50', '1 234', 'CHF 80'000' -> float; None if no number."""
    if not raw:
        return None
    s = re.sub(r"[^0-9.,]", "", raw.replace("'", "").replace("’", ""))
    if not s:
        return None
    if "," in s and "." in s:  # the later separator is the decimal one
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".") if re.search(r",\d{1,2}$", s) else s.replace(",", "")
    elif s.count(".") > 1 or re.fullmatch(r"\d{1,3}\.\d{3}", s):
        s = s.replace(".", "")  # German thousands separator
    try:
        return float(s)
    except ValueError:
        return None


def format_amount(raw: str | None) -> str:
    amount = parse_amount(raw)
    return "" if amount is None else str(round(amount, 2))


# ---------------------------------------------------------------------------
# Field extraction
# ---------------------------------------------------------------------------

def _extract_with_patterns(text: str, patterns: list[OcrPattern]) -> list[OcrField]:
    """Unmatched fields stay empty with confidence 0 — never a made-up example value."""
    fields: list[OcrField] = []
    for item in patterns:
        match = re.search(item.pattern, text, flags=re.IGNORECASE)
        value = (match.group(1) or "").strip() if match else ""
        if value and item.is_amount:
            value = format_amount(value)
        confidence = (0.88 if item.priority == "essential" else 0.68) if value else 0.0
        fields.append(OcrField(item.field_id, item.label, value, confidence, item.priority, item.pattern))
    return fields


def refine_with_ai(ai: dict, text: str, fields: list[OcrField]) -> list[OcrField]:
    """Let the configured AI model read the field values; keeps the regex result on failure."""
    from . import ai as ai_service

    if not text.strip():
        return fields
    wanted = "\n".join(f'- "{f.field_id}": {f.label}' for f in fields)
    prompt = (
        "Extrahiere aus diesem Schweizer Vorsorge-/Versicherungsdokument die folgenden Felder und gib NUR "
        "ein JSON-Objekt {feldId: wert} zurück, keine Erklärung. Beträge als Zahl ohne Tausendertrennzeichen "
        "(\"1'234.50\" → 1234.50), Prozentsätze als Zahl ohne %. Nicht gefundene Felder weglassen.\n\n"
        f"Felder:\n{wanted}\n\nDokument:\n{text[:8000]}"
    )
    try:
        raw, model = ai_service.chat(
            ai, "You are a precise financial document parser. Return only valid JSON, no explanation.",
            prompt, 8000, 170.0,  # generous: reasoning models count thinking against this
        )
        values = ai_service.parse_json_object(raw)
    except Exception as exc:  # AI failure must never break the import — regex result stays
        logger.warning("AI extraction failed: %s", exc)
        return fields
    for field in fields:
        value = values.get(field.field_id)
        if value not in (None, ""):
            field.value = str(value).strip()
            field.confidence_score = 0.95
            field.source_pattern = f"ai:{model}"
    return fields


def extract_fields(
    filename: str,
    payload: bytes | None = None,
    mime_type: str = "application/pdf",
    mistral_api_key: str | None = None,
    ai: dict | None = None,
) -> tuple[str, list[OcrField]]:
    text = _get_text(payload, mime_type, mistral_api_key) if payload else ""
    document_type = detect_document_type(filename, text)

    # Life insurance has its own parser (life_insurance_import_parser); the frontend sends those
    # files to /api/life-insurance/import with a review drawer, so nothing is extracted here.
    if document_type == "pension_fund":
        patterns = [
            OcrPattern("currentOldageCapital", "Aktueller Kontostand", "essential",
                       r"Altersguthaben(?!\s*mit)" + GAP + AMOUNT, True),
            OcrPattern("conversionRate", "Umwandlungssatz", "essential",
                       r"Umwandlungssatz[^\n]{0,40}?(?<![\d.,])(\d{1,2}[.,]\d{1,3})(?![.,]?\d)"),
            OcrPattern("entryAge", "Eintrittsalter", "essential", r"Eintrittsalter[:\s]+([0-9]{1,3})"),
            OcrPattern("ahvNumber", "AHV-Nr.", "essential", r"(756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2})"),
            OcrPattern("contributionAge", "Beitragsalter", "secondary", r"Beitragsalter[:\s]+([0-9]{1,3})"),
            OcrPattern("insurancePeriod", "Versicherungszeitraum", "secondary", r"Versicherungszeitraum[:\s]+([0-9\-./ ]+)"),
            OcrPattern("pensionerCapital", "Rentnerkapital", "secondary", r"Rentnerkapital" + GAP + AMOUNT, True),
            OcrPattern("deathBenefit", "Todesfallleistung", "secondary", r"Todesfall(?:leistung|kapital)" + GAP + AMOUNT, True),
        ]
        fields = _extract_with_patterns(text, patterns)
        return (document_type, refine_with_ai(ai, text, fields) if ai else fields)

    return (document_type, [])
