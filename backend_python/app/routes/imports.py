import csv
import io
import json
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session as DbSession

from ..core.config import settings
from ..db import get_db
from ..models.documents import ImportQueueItem, ImportQueueStatus
from ..models.user import User
from ..services import ai as ai_service
from ..services.ocr import OcrField
from ..services.ocr import extract_fields
from ..services.profile_csv_import import (
    MAX_FILE_SIZE_BYTES,
    MAX_FILE_SIZE_MB,
    apply_profile_csv_payload,
    validate_profile_csv_payload,
)
from .ai import load_ai_settings
from .profile import get_authenticated_user


router = APIRouter(prefix="/api/import", tags=["import"])
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/x-pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
}

CSV_LIKE_CONTENT_TYPES = {"text/csv", "application/csv", "application/vnd.ms-excel"}


@router.post("/csv-profile/validate")
async def validate_csv_profile_import(
    file: UploadFile = File(...),
    missing_field_mode: str = Form(default="error"),
    user: User = Depends(get_authenticated_user),
):
    _ = user.id
    lower_filename = (file.filename or "").lower()
    if not lower_filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Nur CSV-Dateien sind erlaubt.")
    payload = await file.read()
    validated = validate_profile_csv_payload(payload=payload, missing_field_mode=missing_field_mode)
    return {
        "status": "ok",
        "filename": file.filename,
        "row": validated["row"],
        "warnings": validated["warnings"],
    }


@router.post("/csv-profile/apply")
async def apply_csv_profile_import(
    file: UploadFile = File(...),
    missing_field_mode: str = Form(default="error"),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    lower_filename = (file.filename or "").lower()
    if not lower_filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Nur CSV-Dateien sind erlaubt.")
    payload = await file.read()
    applied = apply_profile_csv_payload(
        db=db,
        user=user,
        payload=payload,
        missing_field_mode=missing_field_mode,
    )
    return {
        "status": "ok",
        "filename": file.filename,
        "row": applied["row"],
        "warnings": applied["warnings"],
        "imported_sections": applied["imported_sections"],
    }


def _sanitize_csv_cell(value: str | None) -> str:
    raw = (value or "").strip()
    # Remove control chars and neutralize spreadsheet formula prefixes.
    raw = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", "", raw)
    if raw.startswith(("=", "+", "-", "@")):
        raw = raw[1:].strip()
    return raw[:300]


def _to_float(value: str | None) -> float | None:
    if value is None:
        return None
    cleaned = _sanitize_csv_cell(value).replace("'", "").replace(" ", "").replace(",", ".")
    if not cleaned:
        return None
    try:
        parsed = float(cleaned)
    except ValueError:
        return None
    return parsed if parsed >= 0 else None


def _find_matching_key(keys: list[str], pattern: str) -> str | None:
    for key in keys:
        if re.search(pattern, key, flags=re.IGNORECASE):
            return key
    return None


def _extract_fields_from_csv(filename: str, payload: bytes) -> tuple[str, list[OcrField]]:
    text = payload.decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    headers = [_sanitize_csv_cell(h).lower() for h in (reader.fieldnames or []) if h]
    rows = []
    for idx, row in enumerate(reader):
        if idx >= 2000:
            break
        safe_row = {_sanitize_csv_cell(k).lower(): _sanitize_csv_cell(v) for k, v in row.items() if k}
        if any(value for value in safe_row.values()):
            rows.append(safe_row)

    if not headers or not rows:
        # Fallback to index-based parsing when CSV header is missing.
        raw_reader = csv.reader(io.StringIO(text))
        matrix = [row for i, row in enumerate(raw_reader) if i < 2000]
        if len(matrix) >= 2:
            headers = [f"column_{i}" for i in range(len(matrix[0]))]
            rows = []
            for row in matrix[1:]:
                rows.append(
                    {
                        headers[i]: _sanitize_csv_cell(row[i]) if i < len(row) else ""
                        for i in range(len(headers))
                    }
                )

    if not headers:
        return ("asset_csv", [])

    amount_key = _find_matching_key(
        headers, r"(betrag|amount|balance|guthaben|wert|value|saldo|summe)"
    )
    currency_key = _find_matching_key(headers, r"(währung|waehrung|currency|ccy|curr)")
    name_key = _find_matching_key(headers, r"(konto|account|bezeichnung|name|bank)")
    type_key = _find_matching_key(headers, r"(typ|type|asset|klasse|kategorie|category|instrument)")

    cash_total = 0.0
    cash_reserve = 0.0
    etf_total = 0.0
    stock_total = 0.0
    savings_plan_total = 0.0
    real_estate_etf_total = 0.0
    detected_rows = 0

    for row in rows:
        amount = _to_float(row.get(amount_key)) if amount_key else None
        if amount is None and headers:
            # Index-based fallback: first numeric-looking column.
            for key in headers:
                amount = _to_float(row.get(key))
                if amount is not None:
                    break
        if amount is None:
            continue

        descriptor = " ".join(
            [row.get(name_key, "") if name_key else "", row.get(type_key, "") if type_key else ""]
        ).lower()

        is_investment = bool(
            re.search(r"(etf|aktie|stock|wertpapier|fonds|fund|sparplan|anlage|reit|immobil)", descriptor)
        )
        is_reserve = bool(re.search(r"(reserve|bargeld|cash)", descriptor))
        if is_investment:
            if re.search(r"(etf|fonds|fund)", descriptor):
                etf_total += amount
            elif re.search(r"(aktie|stock)", descriptor):
                stock_total += amount
            elif re.search(r"(sparplan)", descriptor):
                savings_plan_total += amount
            elif re.search(r"(reit|immobil)", descriptor):
                real_estate_etf_total += amount
            else:
                etf_total += amount
        else:
            cash_total += amount
            if is_reserve:
                cash_reserve += amount
        detected_rows += 1

    low_confidence = 0.46 if detected_rows > 0 else 0.18
    high_confidence = 0.82 if detected_rows > 0 else 0.22
    fields = [
        OcrField(
            field_id="accountBalanceChf",
            label="Kontoguthaben (Import, CHF)",
            value=f"{cash_total:.2f}",
            confidence_score=high_confidence,
            priority="essential",
            source_pattern="csv:cash_heuristic",
        ),
        OcrField(
            field_id="cashReserveChf",
            label="Bargeldreserve (Import, CHF)",
            value=f"{cash_reserve:.2f}",
            confidence_score=low_confidence,
            priority="secondary",
            source_pattern="csv:reserve_keyword",
        ),
        OcrField(
            field_id="etfChf",
            label="ETF (Import, CHF)",
            value=f"{etf_total:.2f}",
            confidence_score=high_confidence,
            priority="essential",
            source_pattern="csv:investment_heuristic",
        ),
        OcrField(
            field_id="stocksChf",
            label="Aktien (Import, CHF)",
            value=f"{stock_total:.2f}",
            confidence_score=high_confidence,
            priority="essential",
            source_pattern="csv:investment_heuristic",
        ),
        OcrField(
            field_id="savingsPlanChf",
            label="Sparpläne (Import, CHF)",
            value=f"{savings_plan_total:.2f}",
            confidence_score=low_confidence,
            priority="secondary",
            source_pattern="csv:investment_heuristic",
        ),
        OcrField(
            field_id="realEstateEtfChf",
            label="Immobilien-ETF (Import, CHF)",
            value=f"{real_estate_etf_total:.2f}",
            confidence_score=low_confidence,
            priority="secondary",
            source_pattern="csv:investment_heuristic",
        ),
    ]
    return ("asset_csv", fields)


@router.post("/document")
async def import_document(
    file: UploadFile = File(...),
    card_id: str = Form(default=""),
    target_field_id: str | None = Form(default=None),
    batch_mappings: str | None = Form(default=None),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    lower_filename = (file.filename or "").lower()
    is_csv_by_name = lower_filename.endswith(".csv")
    is_csv_by_mime = (file.content_type or "") in CSV_LIKE_CONTENT_TYPES
    if file.content_type not in ALLOWED_CONTENT_TYPES and not is_csv_by_name:
        raise HTTPException(
            status_code=400,
            detail="Nur PDF, CSV, JPG oder PNG Dateien sind erlaubt.",
        )

    payload = await file.read()
    if len(payload) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "PAYLOAD_TOO_LARGE",
                "message": f"Datei grösser als {MAX_FILE_SIZE_MB} MB.",
                "max_size_mb": MAX_FILE_SIZE_MB,
            },
        )
    if not payload:
        raise HTTPException(status_code=400, detail="Leere Datei kann nicht importiert werden.")

    if is_csv_by_name or is_csv_by_mime:
        document_type, extracted = _extract_fields_from_csv(file.filename or "", payload)
    else:
        ai = load_ai_settings(db, user.id)
        if ai_service.is_active(ai):
            try:  # re-checked here too: the host may resolve differently than when it was saved
                ai_service.check_endpoint(ai["endpoint"], settings.app_env == "production")
            except ai_service.AiError:
                ai = None
        else:
            ai = None
        # Threadpool: OCR + a local AI model can take minutes and must not block the event loop
        document_type, extracted = await run_in_threadpool(
            extract_fields,
            file.filename or "",
            payload,
            mime_type=file.content_type or "application/pdf",
            mistral_api_key=settings.mistral_api_key,
            ai=ai,
        )
    parsed_batch_mappings = []
    if batch_mappings:
        try:
            raw_mappings = json.loads(batch_mappings)
            if isinstance(raw_mappings, list):
                parsed_batch_mappings = raw_mappings
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": "BATCH_MAPPING_INVALID", "message": "batch_mappings ist kein valides JSON."},
            ) from exc
    queue_item = ImportQueueItem(
        user_id=user.id,
        original_filename=file.filename or "document",
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(payload),
        status=ImportQueueStatus.PENDING,
        suggested_doc_type=document_type,
        target_field_id=target_field_id,
    )
    db.add(queue_item)
    db.commit()
    db.refresh(queue_item)
    extracted_fields = [
        {
            "id": field.field_id,
            "label": field.label,
            "value": field.value,
            "confidence_score": field.confidence_score,
            "priority": field.priority,
            "source_pattern": field.source_pattern,
        }
        for field in extracted
    ]
    ocr_confidence_scores = {
        field.field_id: field.confidence_score for field in extracted
    }

    return {
        "status": "ok",
        "queue_id": queue_item.id,
        "queue_status": queue_item.status.value,
        "card_id": card_id,
        "target_field_id": target_field_id,
        "batch_mappings": parsed_batch_mappings,
        "filename": file.filename,
        "document_type": document_type,
        "size_bytes": len(payload),
        "extracted_fields": extracted_fields,
        "ocr_confidence_scores": ocr_confidence_scores,
    }
