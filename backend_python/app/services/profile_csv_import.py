import csv
import io
import json
import re
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session as DbSession

from ..models.pension import (
    AhvContributionYear,
    AhvProjection,
    InsuranceType,
    LifeInsurancePolicy,
    PensionFundSnapshot,
    PropertyAsset,
    PropertyUsage,
    SeverancePlan,
    ThirdPillar,
)
from ..models.user import MaritalStatus, PersonProfile, User

MAX_FILE_SIZE_MB = 10
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
REQUIRED_HEADERS = {
    "timestamp",
    "exportVersion",
    "birthDate",
    "gender",
    "civilStatus",
    "firstPillarExpectedPension",
    "secondPillarGuthaben",
    "profilePayloadJson",
}
MISSING_FIELD_MODES = {"error", "skip"}


def _sanitize_csv_cell(value: Any) -> str:
    raw = str(value or "").strip()
    raw = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", "", raw)
    if raw.startswith(("=", "+", "-", "@")):
        raw = raw[1:].strip()
    return raw


def _parse_locale_number(value: Any) -> float | None:
    raw = _sanitize_csv_cell(value)
    if not raw:
        return None
    normalized = raw.replace("'", "").replace(" ", "").replace(",", ".")
    try:
        parsed = float(normalized)
    except ValueError:
        return None
    return parsed


def _parse_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return int(float(raw))
    except ValueError:
        return None


def _parse_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _parse_optional_date(value: Any) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw).date()
    except ValueError:
        return None


def _ensure_number_in_range(
    value: float | None,
    min_value: float,
    max_value: float,
    label: str,
) -> None:
    if value is None:
        return
    if value < min_value or value > max_value:
        raise HTTPException(
            status_code=422,
            detail=f"{label} ausserhalb erlaubtem Bereich ({min_value} bis {max_value}).",
        )


def validate_profile_csv_payload(
    payload: bytes,
    missing_field_mode: str,
) -> dict[str, Any]:
    if missing_field_mode not in MISSING_FIELD_MODES:
        raise HTTPException(status_code=400, detail="missing_field_mode muss 'error' oder 'skip' sein.")
    if not payload:
        raise HTTPException(status_code=400, detail="Leere Datei kann nicht importiert werden.")
    if len(payload) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Datei groesser als {MAX_FILE_SIZE_MB} MB.",
        )

    text = payload.decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="CSV Header fehlt oder ist ungültig.")

    row_data: dict[str, str] | None = None
    for row in reader:
        safe_row = {
            _sanitize_csv_cell(key): _sanitize_csv_cell(value)
            for key, value in row.items()
            if key is not None
        }
        if any(value for value in safe_row.values()):
            row_data = safe_row
            break

    if row_data is None:
        raise HTTPException(status_code=422, detail="Die CSV-Datei enthält keine Datensätze.")

    missing_headers = sorted(
        [header for header in REQUIRED_HEADERS if header not in row_data]
    )
    if missing_headers and missing_field_mode == "error":
        raise HTTPException(
            status_code=422,
            detail=f"Fehlende Felder: {', '.join(missing_headers)}",
        )

    version_raw = row_data.get("exportVersion", "")
    version_normalized = re.sub(r"[^\d.]", "", version_raw)
    try:
        version = float(version_normalized) if version_normalized else 0.0
    except ValueError:
        version = 0.0
    if version < 1.0:
        raise HTTPException(
            status_code=422,
            detail="Die CSV-Version ist zu alt. Unterstützt wird exportVersion >= 1.0.",
        )

    first_pillar = _parse_locale_number(row_data.get("firstPillarExpectedPension"))
    second_pillar = _parse_locale_number(row_data.get("secondPillarGuthaben"))
    third_pillar_rate = _parse_locale_number(row_data.get("thirdPillar3aRate"))
    capital_need = _parse_locale_number(row_data.get("capitalNeedPercent"))
    total_assets = _parse_locale_number(row_data.get("totalAssetValue"))

    _ensure_number_in_range(first_pillar, 0, 500000, "AHV-Jahresrente")
    _ensure_number_in_range(second_pillar, 0, 100000000, "BVG-Guthaben")
    _ensure_number_in_range(third_pillar_rate, -50, 50, "3a-Rendite")
    _ensure_number_in_range(capital_need, 0, 100, "Kapitalbedarf in Prozent")
    _ensure_number_in_range(total_assets, 0, 1000000000, "Gesamtvermögen")

    profile_payload_json = row_data.get("profilePayloadJson", "")
    try:
        profile_snapshot = json.loads(profile_payload_json or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail="Import fehlgeschlagen: Das eingebettete Profil ist ungültig.",
        ) from exc
    if not isinstance(profile_snapshot, dict):
        raise HTTPException(
            status_code=422,
            detail="Import fehlgeschlagen: Das eingebettete Profil ist ungültig.",
        )

    warnings: list[str] = []
    if missing_headers and missing_field_mode == "skip":
        warnings.append(f"Fehlende Felder übersprungen: {', '.join(missing_headers)}")

    normalized_row = {
        "timestamp": row_data.get("timestamp", ""),
        "projectId": row_data.get("projectId") or None,
        "exportVersion": "1.0",
        "birthDate": row_data.get("birthDate") or None,
        "gender": row_data.get("gender", "") if row_data.get("gender", "") in {"male", "female"} else "",
        "civilStatus": row_data.get("civilStatus", ""),
        "livingSituation": row_data.get("livingSituation", ""),
        "taxDomicileCanton": (row_data.get("taxDomicileCanton", "") or "").upper(),
        "firstPillarExpectedPension": first_pillar,
        "firstPillarContributionYears": _parse_locale_number(row_data.get("firstPillarContributionYears")),
        "secondPillarGuthaben": second_pillar,
        "secondPillarProvider": row_data.get("secondPillarProvider", ""),
        "thirdPillar3aAccounts": _parse_locale_number(row_data.get("thirdPillar3aAccounts")),
        "thirdPillar3aRate": third_pillar_rate,
        "thirdPillar3bPortfolioValue": _parse_locale_number(row_data.get("thirdPillar3bPortfolioValue")),
        "capitalNeedPercent": capital_need,
        "totalAssetValue": total_assets,
        "severanceAmountChf": _parse_locale_number(row_data.get("severanceAmountChf")),
        "investmentPortfolioTotalChf": _parse_locale_number(row_data.get("investmentPortfolioTotalChf")),
        "profilePayloadJson": profile_payload_json,
    }

    return {
        "row": normalized_row,
        "warnings": warnings,
        "profile_snapshot": profile_snapshot,
    }


def _apply_personal_snapshot(
    db: DbSession,
    user: User,
    profile_snapshot: dict[str, Any],
) -> None:
    personal = profile_snapshot.get("personal") if isinstance(profile_snapshot.get("personal"), dict) else {}
    property_payload = profile_snapshot.get("property") if isinstance(profile_snapshot.get("property"), dict) else {}
    pension_payload = profile_snapshot.get("pension_fund") if isinstance(profile_snapshot.get("pension_fund"), dict) else {}
    third_payload = profile_snapshot.get("third_pillar") if isinstance(profile_snapshot.get("third_pillar"), dict) else {}
    ahv_payload = profile_snapshot.get("ahv") if isinstance(profile_snapshot.get("ahv"), dict) else {}
    life_payload = profile_snapshot.get("life_insurance") if isinstance(profile_snapshot.get("life_insurance"), dict) else {}
    severance_payload = profile_snapshot.get("severance") if isinstance(profile_snapshot.get("severance"), dict) else {}

    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
    if profile is None:
        profile = PersonProfile(user_id=user.id)
        db.add(profile)

    profile.date_of_birth = _parse_optional_date(personal.get("date_of_birth"))
    gender_value = str(personal.get("gender") or "").strip()
    profile.gender = gender_value if gender_value in {"male", "female"} else None
    marital_value = str(personal.get("marital_status") or "").strip()
    profile.marital_status = MaritalStatus(marital_value) if marital_value in {item.value for item in MaritalStatus} else None
    marital_year = _parse_optional_int(personal.get("marital_status_year"))
    if marital_year is not None and 1900 <= marital_year <= datetime.utcnow().year + 1:
        profile.marital_status_year = marital_year
    else:
        profile.marital_status_year = None
    profile.has_property = bool(personal.get("has_property")) if personal.get("has_property") is not None else None
    profile.property_details = personal.get("property_details") if isinstance(personal.get("property_details"), dict) else {}
    profile.pillar_3a_accounts = personal.get("pillar_3a_accounts") if isinstance(personal.get("pillar_3a_accounts"), list) else []
    profile.foreign_currency_assets = personal.get("foreign_currency_assets") if isinstance(personal.get("foreign_currency_assets"), list) else []
    profile.cash_assets = personal.get("cash_assets") if isinstance(personal.get("cash_assets"), list) else []
    profile.investment_assets = personal.get("investment_assets") if isinstance(personal.get("investment_assets"), list) else []

    if property_payload:
        property_record = (
            db.query(PropertyAsset)
            .filter(PropertyAsset.user_id == user.id, PropertyAsset.scenario_id.is_(None))
            .first()
        )
        if property_record is None:
            property_record = PropertyAsset(user_id=user.id, name=str(property_payload.get("name") or "Haupteigentum"))
            db.add(property_record)
        property_record.name = str(property_payload.get("name") or property_record.name or "Haupteigentum")
        property_record.canton = str(property_payload.get("canton") or "")[:2] or None
        property_record.municipality = str(property_payload.get("municipality") or "") or None
        property_record.zip_code = str(property_payload.get("zip_code") or "") or None
        usage_raw = str(property_payload.get("usage") or "").strip()
        if usage_raw in {item.value for item in PropertyUsage}:
            property_record.usage = PropertyUsage(usage_raw)
        property_record.estimated_market_value = _parse_optional_float(property_payload.get("estimated_market_value"))
        property_record.mortgage_amount = _parse_optional_float(property_payload.get("mortgage_amount"))
        property_record.land_area_sqm = _parse_optional_float(property_payload.get("land_area_sqm"))
        property_record.building_volume_cubic_m = _parse_optional_float(property_payload.get("building_volume_cubic_m"))
        property_record.imputed_rent_per_year = _parse_optional_float(property_payload.get("imputed_rent_per_year"))
        canton_code = str(property_payload.get("canton_code") or "").strip().upper()
        municipality_id = str(property_payload.get("municipality_id") or "").strip()
        extra = property_record.extra_attributes or {}
        if canton_code and municipality_id:
            extra["location"] = {"canton_code": canton_code, "municipality_id": municipality_id}
        property_record.extra_attributes = extra

    pension_record = (
        db.query(PensionFundSnapshot)
        .filter(PensionFundSnapshot.user_id == user.id)
        .order_by(PensionFundSnapshot.created_at.desc())
        .first()
    )
    if pension_record is None:
        pension_record = PensionFundSnapshot(user_id=user.id)
        db.add(pension_record)
    for field in [
        "provider",
        "annual_salary",
        "insured_salary_total",
        "bvg_insured_salary",
        "current_oldage_capital",
        "bvg_oldage_capital",
        "vested_benefits_total",
        "max_buyin_total",
        "wef_available",
        "coordination_deduction",
        "insured_salary_rentenplan",
        "insured_salary_bonusplan",
        "max_buyin_rentenplan",
        "max_buyin_bonusplan",
    ]:
        if field in pension_payload:
            setattr(pension_record, field, pension_payload.get(field))
    pension_record.as_of_date = _parse_optional_date(pension_payload.get("as_of_date"))

    third_record = db.query(ThirdPillar).filter(ThirdPillar.user_id == user.id).first()
    if third_record is None:
        third_record = ThirdPillar(user_id=user.id)
        db.add(third_record)
    for field in [
        "provider",
        "capital_3a",
        "annual_contribution_3a",
        "capital_3b",
        "annual_contribution_3b",
        "expected_return_percent",
        "securities_chf",
        "real_estate_equity_chf",
        "monthly_savings_chf",
        "account_count",
        "accounts_json",
        "withdrawal_tax_rate_percent",
        "tax_model",
        "tax_canton",
    ]:
        if field in third_payload:
            setattr(third_record, field, third_payload.get(field))

    ahv_record = db.query(AhvProjection).filter(AhvProjection.user_id == user.id).first()
    if ahv_record is None:
        ahv_record = AhvProjection(user_id=user.id)
        db.add(ahv_record)
    for field in [
        "reference_age",
        "gender",
        "estimated_average_income_chf",
        "contribution_estimate_chf",
        "expected_annual_pension",
        "contribution_years",
        "early_retirement_years",
        "late_retirement_years",
    ]:
        if field in ahv_payload:
            setattr(ahv_record, field, ahv_payload.get(field))

    existing_contribs = db.query(AhvContributionYear).filter(AhvContributionYear.user_id == user.id).all()
    for entry in existing_contribs:
        db.delete(entry)
    contribution_rows = ahv_payload.get("contribution_rows") if isinstance(ahv_payload.get("contribution_rows"), list) else []
    for row in contribution_rows:
        if not isinstance(row, dict):
            continue
        year = _parse_optional_int(row.get("year"))
        if year is None:
            continue
        db.add(
            AhvContributionYear(
                user_id=user.id,
                year=year,
                annual_income_chf=_parse_optional_float(row.get("annual_income_chf")),
                contribution_total_chf=_parse_optional_float(row.get("contribution_total_chf")),
                age_end_of_year=_parse_optional_int(row.get("age_end_of_year")),
                ahv_rent_share_chf=_parse_optional_float(row.get("ahv_rent_share_chf")),
                source=str(row.get("source") or "import"),
            )
        )

    life_record = db.query(LifeInsurancePolicy).filter(LifeInsurancePolicy.user_id == user.id).first()
    if life_record is None:
        life_record = LifeInsurancePolicy(user_id=user.id)
        db.add(life_record)
    insurance_type_raw = str(life_payload.get("insurance_type") or "").strip()
    if insurance_type_raw in {item.value for item in InsuranceType}:
        life_record.insurance_type = InsuranceType(insurance_type_raw)
    for field in [
        "insurer",
        "policy_number",
        "insured_name",
        "currency",
        "surrender_value",
        "annual_premium",
        "monthly_premium",
        "sum_at_death",
        "entry_age",
        "maturity_year",
        "monthly_pension_at_retirement",
        "capital_payout_at_maturity",
    ]:
        if field in life_payload:
            setattr(life_record, field, life_payload.get(field))
    life_record.maturity_date = _parse_optional_date(life_payload.get("maturity_date"))

    severance_record = db.query(SeverancePlan).filter(SeverancePlan.user_id == user.id).first()
    if severance_record is None:
        severance_record = SeverancePlan(user_id=user.id)
        db.add(severance_record)
    for field in [
        "amount",
        "is_gross_amount",
        "client_name",
        "employer",
        "canton_code",
        "payout_year",
        "tax_rate_percent",
        "tax_amount_chf",
        "net_amount_chf",
        "severance_type",
        "provider_preset",
        "formula_model",
        "formula_v2_enabled",
        "start_calculation_day",
        "start_calculation_month",
        "start_calculation_year",
        "last_annual_salary_chf",
        "formula_day_factor",
        "formula_month_factor",
        "months_until_reference_age",
        "formula_part1_chf",
        "formula_part2_chf",
        "calculated_abfindung_chf",
        "formula_used",
        "computed_tenure_years",
        "gender_context",
        "usage_purpose",
        "etf_risk_level",
        "ubs_product_type",
        "estimated_return_percent",
        "plan_duration_years",
        "allocation_bvg_buyin",
        "allocation_pillar3a",
        "allocation_private_3b",
    ]:
        if field in severance_payload:
            setattr(severance_record, field, severance_payload.get(field))
    severance_record.employment_start_date = _parse_optional_date(severance_payload.get("employment_start_date"))
    severance_record.employment_end_date = _parse_optional_date(severance_payload.get("employment_end_date"))


def _detect_imported_sections(profile_snapshot: dict[str, Any]) -> list[str]:
    sections: list[str] = []
    if isinstance(profile_snapshot.get("personal"), dict):
        sections.append("personal")
        personal = profile_snapshot.get("personal")
        if isinstance(personal, dict):
            if personal.get("cash_assets") or personal.get("investment_assets"):
                sections.append("assets")
    if isinstance(profile_snapshot.get("property"), dict):
        sections.append("property")
    if isinstance(profile_snapshot.get("pension_fund"), dict):
        sections.append("pension_fund")
    if isinstance(profile_snapshot.get("third_pillar"), dict):
        sections.append("third_pillar")
    if isinstance(profile_snapshot.get("ahv"), dict):
        sections.append("ahv")
    if isinstance(profile_snapshot.get("life_insurance"), dict):
        sections.append("life_insurance")
    if isinstance(profile_snapshot.get("severance"), dict):
        sections.append("severance")
    return sections


def apply_profile_csv_payload(
    db: DbSession,
    user: User,
    payload: bytes,
    missing_field_mode: str,
) -> dict[str, Any]:
    validated = validate_profile_csv_payload(payload=payload, missing_field_mode=missing_field_mode)
    profile_snapshot = validated["profile_snapshot"]
    imported_sections = _detect_imported_sections(profile_snapshot)
    _apply_personal_snapshot(db=db, user=user, profile_snapshot=profile_snapshot)
    db.commit()
    return {
        "row": validated["row"],
        "warnings": validated["warnings"],
        "imported_sections": imported_sections,
    }
