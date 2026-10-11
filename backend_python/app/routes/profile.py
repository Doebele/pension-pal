from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from ..core.config import settings
from ..db import get_db
from ..models.user import (
    User,
    PersonProfile,
    Session as UserSession,
    ThreeAMarkingState,
    MaritalStatus,
)
from ..models.pension import (
    PropertyAsset,
    PensionFundSnapshot,
    ThirdPillar,
    AhvProjection,
    AhvContributionYear,
    LifeInsurancePolicy,
    SeverancePlan,
    Scenario,
)
from ..models.schemas import SwissLocationSelection
from ..services.ahv_contribution_parser import (
    AhvContributionRow,
    parse_ahv_pdf_import,
    parse_ahv_contributions_from_text,
    parse_ahv_contributions_from_xlsx,
    validate_ahv_contributions,
)
from ..services import ai as ai_service
from ..services.life_insurance_import_parser import parse_life_insurance_pdf_import
from ..services.profile_csv_import import MAX_FILE_SIZE_BYTES as MAX_IMPORT_BYTES


router = APIRouter(prefix="/api", tags=["profile"])


def get_authenticated_user(
    db: DbSession = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None),
    x_session_token: Optional[str] = Header(default=None),
) -> User:
    if not x_user_id or not x_session_token:
        raise HTTPException(status_code=401, detail="Missing authentication headers")

    try:
        user_id = int(x_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid user id header") from exc

    session = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == user_id,
            UserSession.token == x_session_token,
            UserSession.is_active.is_(True),
            UserSession.expires_at > datetime.utcnow(),
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


class PersonalUpdate(BaseModel):
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    marital_status_year: Optional[int] = None
    has_property: Optional[bool] = None
    property_details: Optional[dict] = None
    pillar_3a_accounts: Optional[list[dict]] = None
    foreign_currency_assets: Optional[list[dict]] = None
    cash_assets: Optional[list[dict]] = None
    investment_assets: Optional[list[dict]] = None


@router.put("/personal")
def update_personal(
    data: PersonalUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
    if profile is None:
        profile = PersonProfile(user_id=user.id)
        db.add(profile)

    profile.date_of_birth = data.date_of_birth
    if data.gender is not None:
        if data.gender == "":
            profile.gender = None
        elif data.gender in {"male", "female", "other"}:
            profile.gender = data.gender
        else:
            raise HTTPException(status_code=400, detail="Ungültiges Geschlecht.")
    if data.marital_status is not None:
        if data.marital_status == "":
            profile.marital_status = None
        elif data.marital_status in {status.value for status in MaritalStatus}:
            profile.marital_status = MaritalStatus(data.marital_status)
        else:
            raise HTTPException(status_code=400, detail="Ungültiger Zivilstand.")
    if data.marital_status_year is not None:
        if data.marital_status_year < 1900 or data.marital_status_year > (datetime.utcnow().year + 1):
            raise HTTPException(status_code=400, detail="Ungültiges Jahr für den Zivilstand.")
        profile.marital_status_year = data.marital_status_year
    if profile.marital_status in {None, MaritalStatus.SINGLE}:
        profile.marital_status_year = None
    if data.has_property is not None:
        profile.has_property = data.has_property
    if data.property_details is not None:
        profile.property_details = data.property_details
    if data.pillar_3a_accounts is not None:
        profile.pillar_3a_accounts = data.pillar_3a_accounts
    if data.foreign_currency_assets is not None:
        profile.foreign_currency_assets = data.foreign_currency_assets
    if data.cash_assets is not None:
        profile.cash_assets = data.cash_assets
    if data.investment_assets is not None:
        profile.investment_assets = data.investment_assets
    db.commit()
    db.refresh(profile)
    return {"status": "ok", "user_id": user.id, "profile_id": profile.id}


class PropertyUpdate(BaseModel):
    name: str
    canton: Optional[str] = None
    canton_code: Optional[str] = None
    municipality: Optional[str] = None
    municipality_id: Optional[str] = None
    zip_code: Optional[str] = None
    estimated_market_value: Optional[float] = None
    mortgage_amount: Optional[float] = None
    land_area_sqm: Optional[float] = None
    building_volume_cubic_m: Optional[float] = None
    imputed_rent_per_year: Optional[float] = None
    usage: Optional[str] = None
    location: Optional[SwissLocationSelection] = None


@router.put("/property")
def upsert_property(
    data: PropertyUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    prop = (
        db.query(PropertyAsset)
        .filter(PropertyAsset.user_id == user.id, PropertyAsset.scenario_id.is_(None))
        .first()
    )
    if prop is None:
        prop = PropertyAsset(user_id=user.id, name=data.name or "Haupteigentum")
        db.add(prop)

    prop.name = data.name or prop.name
    prop.canton = data.canton
    prop.municipality = data.municipality
    prop.zip_code = data.zip_code
    prop.estimated_market_value = data.estimated_market_value
    prop.mortgage_amount = data.mortgage_amount
    prop.land_area_sqm = data.land_area_sqm
    prop.building_volume_cubic_m = data.building_volume_cubic_m
    prop.imputed_rent_per_year = data.imputed_rent_per_year
    if data.usage:
        prop.usage = data.usage  # type: ignore[assignment]

    if data.location:
        location_payload = data.location.model_dump()
    elif data.canton_code and data.municipality_id:
        location_payload = SwissLocationSelection(
            canton_code=data.canton_code,
            municipality_id=data.municipality_id,
        ).model_dump()
    else:
        location_payload = None

    extra_attributes = prop.extra_attributes or {}
    if location_payload:
        extra_attributes["location"] = location_payload
    else:
        extra_attributes.pop("location", None)
    prop.extra_attributes = extra_attributes

    db.commit()
    db.refresh(prop)
    return {"status": "ok", "property_id": prop.id}


class PensionFundUpdate(BaseModel):
    provider: Optional[str] = None
    as_of_date: Optional[date] = None
    annual_salary: Optional[float] = None
    insured_salary_total: Optional[float] = None
    bvg_insured_salary: Optional[float] = None
    current_oldage_capital: Optional[float] = None
    bvg_oldage_capital: Optional[float] = None
    vested_benefits_total: Optional[float] = None
    max_buyin_total: Optional[float] = None
    wef_available: Optional[float] = None
    coordination_deduction: Optional[float] = None
    insured_salary_rentenplan: Optional[float] = None
    insured_salary_bonusplan: Optional[float] = None
    max_buyin_rentenplan: Optional[float] = None
    max_buyin_bonusplan: Optional[float] = None


@router.put("/pension-fund")
def upsert_pension_fund(
    data: PensionFundUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    snap = (
        db.query(PensionFundSnapshot)
        .filter(PensionFundSnapshot.user_id == user.id)
        .order_by(PensionFundSnapshot.created_at.desc())
        .first()
    )
    if snap is None:
        snap = PensionFundSnapshot(user_id=user.id)
        db.add(snap)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(snap, field, value)

    db.commit()
    db.refresh(snap)
    return {"status": "ok", "snapshot_id": snap.id}


class ThirdPillarUpdate(BaseModel):
    provider: Optional[str] = None
    capital_3a: Optional[float] = None
    annual_contribution_3a: Optional[float] = None
    capital_3b: Optional[float] = None
    annual_contribution_3b: Optional[float] = None
    expected_return_percent: Optional[float] = None
    securities_chf: Optional[float] = None
    real_estate_equity_chf: Optional[float] = None
    monthly_savings_chf: Optional[float] = None
    account_count: Optional[int] = None
    accounts_json: Optional[list[dict]] = None
    withdrawal_tax_rate_percent: Optional[float] = None
    tax_model: Optional[str] = None
    tax_canton: Optional[str] = None


class CashAssetRowPayload(BaseModel):
    account_name: Optional[str] = None
    account_type: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = "CHF"
    amount_chf: Optional[float] = None
    source: Optional[str] = "manual"
    updated_at: Optional[datetime] = None


class InvestmentAssetPayload(BaseModel):
    etf_chf: Optional[float] = None
    stocks_chf: Optional[float] = None
    savings_plan_chf: Optional[float] = None
    real_estate_etf_chf: Optional[float] = None
    source: Optional[str] = "manual"
    updated_at: Optional[datetime] = None


class UserAssetsPayload(BaseModel):
    cash_assets: Optional[list[CashAssetRowPayload]] = None
    investment_assets: Optional[InvestmentAssetPayload] = None


def _normalize_cash_asset_row(item: dict) -> dict:
    account_name = str(item.get("account_name") or "").strip()
    account_type_raw = str(item.get("account_type") or "bank").strip().lower()
    if account_type_raw in {"konto", "bankkonto", "bank", "account", "checking", "savings"}:
        account_type = "bank"
    elif account_type_raw in {"cash", "bar", "bargeld"}:
        account_type = "cash"
    elif account_type_raw in {"depot", "wertschriftendepot", "brokerage"}:
        account_type = "depot"
    elif account_type_raw in {"3a", "säule 3a", "saeule 3a", "pillar3a"}:
        account_type = "pillar3a"
    elif account_type_raw in {"freizügigkeit", "freizuegigkeit", "vested_benefits"}:
        account_type = "vested_benefits"
    elif account_type_raw in {"bank", "cash", "depot", "pillar3a", "vested_benefits", "other"}:
        account_type = account_type_raw
    else:
        account_type = "other"
    currency = str(item.get("currency") or "CHF").strip().upper()[:8]
    amount_raw = item.get("amount")
    amount_chf_raw = item.get("amount_chf")
    source = str(item.get("source") or "manual").strip().lower()
    if source not in {"manual", "import"}:
        source = "manual"
    updated_at = item.get("updated_at")
    if not updated_at:
        updated_at = datetime.utcnow().isoformat()
    amount = float(amount_raw) if amount_raw is not None else 0.0
    amount_chf = float(amount_chf_raw) if amount_chf_raw is not None else amount
    return {
        "account_name": account_name,
        "account_type": account_type,
        "amount": amount,
        "currency": currency or "CHF",
        "amount_chf": amount_chf,
        "source": source,
        "updated_at": updated_at,
    }


def _merge_cash_asset_rows(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}

    def key_for(item: dict) -> str:
        return f"{str(item.get('account_name') or '').strip().lower()}|{str(item.get('currency') or 'CHF').upper()}"

    for raw in existing:
        normalized = _normalize_cash_asset_row(raw)
        merged[key_for(normalized)] = normalized

    for raw in incoming:
        normalized = _normalize_cash_asset_row(raw)
        key = key_for(normalized)
        existing_item = merged.get(key)
        if existing_item and existing_item.get("source") == "manual" and normalized.get("source") != "manual":
            continue
        merged[key] = normalized

    return list(merged.values())


def _normalize_investment_asset(payload: dict) -> dict:
    source = str(payload.get("source") or "manual").strip().lower()
    if source not in {"manual", "import"}:
        source = "manual"
    updated_at = payload.get("updated_at") or datetime.utcnow().isoformat()
    return {
        "etf_chf": float(payload.get("etf_chf") or 0),
        "stocks_chf": float(payload.get("stocks_chf") or 0),
        "savings_plan_chf": float(payload.get("savings_plan_chf") or 0),
        "real_estate_etf_chf": float(payload.get("real_estate_etf_chf") or 0),
        "source": source,
        "updated_at": updated_at,
    }


@router.put("/user/assets")
def upsert_user_assets(
    data: UserAssetsPayload,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
    if profile is None:
        profile = PersonProfile(user_id=user.id)
        db.add(profile)

    if data.cash_assets is not None:
        incoming_cash = [row.model_dump(exclude_unset=True) for row in data.cash_assets]
        existing_cash = profile.cash_assets if isinstance(profile.cash_assets, list) else []
        profile.cash_assets = _merge_cash_asset_rows(existing_cash, incoming_cash)

    if data.investment_assets is not None:
        normalized_investment = _normalize_investment_asset(
            data.investment_assets.model_dump(exclude_unset=True)
        )
        existing_investment = (
            profile.investment_assets[0]
            if isinstance(profile.investment_assets, list) and profile.investment_assets
            else None
        )
        if (
            isinstance(existing_investment, dict)
            and existing_investment.get("source") == "manual"
            and normalized_investment.get("source") != "manual"
        ):
            pass
        else:
            profile.investment_assets = [normalized_investment]

    db.commit()
    db.refresh(profile)
    return {
        "status": "ok",
        "cash_assets": profile.cash_assets or [],
        "investment_assets": profile.investment_assets[0] if profile.investment_assets else None,
    }


@router.post("/user/assets")
def post_user_assets(
    data: UserAssetsPayload,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    return upsert_user_assets(data=data, db=db, user=user)


@router.get("/user/assets")
def get_user_assets(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
    return {
        "status": "ok",
        "cash_assets": profile.cash_assets if profile and isinstance(profile.cash_assets, list) else [],
        "investment_assets": (
            profile.investment_assets[0]
            if profile and isinstance(profile.investment_assets, list) and profile.investment_assets
            else None
        ),
    }


@router.put("/third-pillar")
def upsert_third_pillar(
    data: ThirdPillarUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    record = db.query(ThirdPillar).filter(ThirdPillar.user_id == user.id).first()
    if record is None:
        record = ThirdPillar(user_id=user.id)
        db.add(record)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(record, field, value)

    db.commit()
    db.refresh(record)
    return {"status": "ok", "third_pillar_id": record.id}


class AhvUpdate(BaseModel):
    reference_age: Optional[int] = None
    gender: Optional[str] = None
    estimated_average_income_chf: Optional[float] = None
    contribution_estimate_chf: Optional[float] = None
    expected_annual_pension: Optional[float] = None
    contribution_years: Optional[float] = None
    early_retirement_years: Optional[float] = None
    late_retirement_years: Optional[float] = None


class AhvContributionRowPayload(BaseModel):
    year: int
    annual_income_chf: Optional[float] = None
    contribution_total_chf: Optional[float] = None
    age_end_of_year: Optional[int] = None
    ahv_rent_share_chf: Optional[float] = None
    source: Optional[str] = "manual"


class AhvContributionUpdate(BaseModel):
    rows: list[AhvContributionRowPayload]


class ThreeAMarkingItem(BaseModel):
    year: int
    status: str
    source: str = "auto"
    manual_override: bool = False
    updated_at: Optional[datetime] = None


class ThreeAMarkingPayload(BaseModel):
    markings: list[ThreeAMarkingItem]


def _normalize_marking(item: dict) -> dict:
    year = int(item.get("year", 0))
    status = str(item.get("status", "open"))
    source = str(item.get("source", "auto"))
    if status not in {"completed", "open"}:
        status = "open"
    if source not in {"auto", "manual"}:
        source = "auto"
    manual_override = bool(item.get("manual_override", False))
    updated_at = item.get("updated_at")
    if not updated_at:
        updated_at = datetime.utcnow().isoformat()
    return {
        "year": year,
        "status": status,
        "source": source,
        "manual_override": manual_override,
        "updated_at": updated_at,
    }


def _merge_three_a_markings(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged: dict[int, dict] = {}
    for raw in existing:
        normalized = _normalize_marking(raw)
        if normalized["year"] > 0:
            merged[normalized["year"]] = normalized

    for raw in incoming:
        normalized = _normalize_marking(raw)
        year = normalized["year"]
        if year <= 0:
            continue

        existing_item = merged.get(year)
        # Conflict strategy:
        # If server already has a manual override for this year, ignore non-manual incoming updates.
        if (
            existing_item
            and bool(existing_item.get("manual_override"))
            and not bool(normalized.get("manual_override"))
        ):
            continue
        merged[year] = normalized

    return [merged[year] for year in sorted(merged.keys())]


@router.put("/ahv")
def upsert_ahv(
    data: AhvUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    record = db.query(AhvProjection).filter(AhvProjection.user_id == user.id).first()
    if record is None:
        record = AhvProjection(user_id=user.id)
        db.add(record)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(record, field, value)

    db.commit()
    db.refresh(record)
    return {"status": "ok", "ahv_id": record.id}


@router.put("/ahv/contributions")
def upsert_ahv_contributions(
    data: AhvContributionUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    existing = db.query(AhvContributionYear).filter(AhvContributionYear.user_id == user.id).all()
    for row in existing:
        db.delete(row)

    rows = [
        AhvContributionRow(
            year=item.year,
            annual_income_chf=item.annual_income_chf,
            contribution_total_chf=item.contribution_total_chf,
            age_end_of_year=item.age_end_of_year,
            ahv_rent_share_chf=item.ahv_rent_share_chf,
            source=item.source or "manual",
        )
        for item in data.rows
    ]
    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
    issues = validate_ahv_contributions(rows, profile.date_of_birth if profile else None)

    for item in rows:
        db.add(
            AhvContributionYear(
                user_id=user.id,
                year=item.year,
                annual_income_chf=item.annual_income_chf,
                contribution_total_chf=item.contribution_total_chf,
                age_end_of_year=item.age_end_of_year,
                ahv_rent_share_chf=item.ahv_rent_share_chf,
                source=item.source,
            )
        )
    db.commit()
    return {"status": "ok", "count": len(rows), "issues": issues}


@router.post("/ahv/import")
async def import_ahv_contributions(
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    payload = await file.read()
    filename = (file.filename or "").lower()
    import_metadata: dict[str, object] = {}
    if filename.endswith(".xlsx"):
        parsed = parse_ahv_contributions_from_xlsx(payload)
    elif filename.endswith(".pdf"):
        parsed, import_metadata = parse_ahv_pdf_import(payload)
    elif filename.endswith(".txt"):
        parsed = parse_ahv_contributions_from_text(payload.decode("utf-8", errors="ignore"))
    else:
        raise HTTPException(status_code=400, detail="Nur XLSX oder PDF/TXT für AHV-Import erlaubt.")

    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
    issues = validate_ahv_contributions(parsed, profile.date_of_birth if profile else None)
    field_mapping_suggestions = [
        {
            "source_field_id": "year",
            "source_label": "Jahr",
            "target_field_id": "year",
            "target_label": "Jahr",
            "confidence": 0.99,
        },
        {
            "source_field_id": "annual_income_chf",
            "source_label": "Jahreseinkommen",
            "target_field_id": "annual_income_chf",
            "target_label": "Jahreseinkommen (CHF)",
            "confidence": 0.98,
        },
        {
            "source_field_id": "contribution_total_chf",
            "source_label": "Total",
            "target_field_id": "contribution_total_chf",
            "target_label": "Total (CHF)",
            "confidence": 0.95,
        },
        {
            "source_field_id": "age_end_of_year",
            "source_label": "Alter",
            "target_field_id": "age_end_of_year",
            "target_label": "Alter",
            "confidence": 0.9,
        },
        {
            "source_field_id": "ahv_rent_share_chf",
            "source_label": "AHV Rente Anteil",
            "target_field_id": "ahv_rent_share_chf",
            "target_label": "AHV Rente Anteil",
            "confidence": 0.9,
        },
    ]
    return {
        "status": "ok",
        "rows": [
            {
                "year": row.year,
                "annual_income_chf": row.annual_income_chf,
                "contribution_total_chf": row.contribution_total_chf,
                "age_end_of_year": row.age_end_of_year,
                "ahv_rent_share_chf": row.ahv_rent_share_chf,
                "source": row.source,
            }
            for row in parsed
        ],
        "issues": issues,
        "import_metadata": import_metadata,
        "field_mapping_suggestions": field_mapping_suggestions,
    }


class LifeInsuranceUpdate(BaseModel):
    insurance_type: Optional[str] = None
    insurer: Optional[str] = None
    policy_number: Optional[str] = None
    insured_name: Optional[str] = None
    currency: Optional[str] = None
    surrender_value: Optional[float] = None
    annual_premium: Optional[float] = None
    monthly_premium: Optional[float] = None
    sum_at_death: Optional[float] = None
    entry_age: Optional[int] = None
    maturity_date: Optional[date] = None
    maturity_year: Optional[int] = None
    monthly_pension_at_retirement: Optional[float] = None
    capital_payout_at_maturity: Optional[float] = None


@router.put("/life-insurance")
def upsert_life_insurance(
    data: LifeInsuranceUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    record = db.query(LifeInsurancePolicy).filter(LifeInsurancePolicy.user_id == user.id).first()
    if record is None:
        record = LifeInsurancePolicy(user_id=user.id)
        db.add(record)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(record, field, value)

    db.commit()
    db.refresh(record)
    return {"status": "ok", "life_insurance_id": record.id}


@router.post("/life-insurance/import")
async def import_life_insurance_policy(
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    filename = (file.filename or "").lower()
    if not (filename.endswith(".pdf") or filename.endswith(".txt")):
        raise HTTPException(status_code=400, detail="Nur PDF/TXT für Lebensversicherungs-Import erlaubt.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Leere Datei kann nicht importiert werden.")

    if len(payload) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail=f"Datei grösser als {MAX_IMPORT_BYTES // (1024 * 1024)} MB.")

    # Same AI model as the document import (settings → AI); re-check the endpoint like there
    from .ai import load_ai_settings  # local: routes/ai imports this module

    ai = load_ai_settings(db, user.id)
    if ai_service.is_active(ai):
        try:
            ai_service.check_endpoint(ai["endpoint"], settings.app_env == "production")
        except ai_service.AiError:
            ai = None
    else:
        ai = None
    # Threadpool: OCR of a scanned policy and the AI call can take a while
    parsed = await run_in_threadpool(
        parse_life_insurance_pdf_import, payload, ai, settings.mistral_api_key
    )
    return {
        "status": "ok",
        "filename": file.filename,
        "document_type": "life_insurance",
        "fields": parsed["fields"],
        "issues": parsed["issues"],
        "import_metadata": parsed["import_metadata"],
        "field_mapping_suggestions": parsed["field_mapping_suggestions"],
    }


class SeveranceUpdate(BaseModel):
    amount: Optional[float] = None
    is_gross_amount: Optional[bool] = None
    client_name: Optional[str] = None
    employer: Optional[str] = None
    canton_code: Optional[str] = None
    payout_year: Optional[int] = None
    tax_rate_percent: Optional[float] = None
    tax_amount_chf: Optional[float] = None
    net_amount_chf: Optional[float] = None
    severance_type: Optional[str] = None
    provider_preset: Optional[str] = None
    formula_model: Optional[str] = None
    formula_v2_enabled: Optional[bool] = None
    start_calculation_day: Optional[int] = None
    start_calculation_month: Optional[int] = None
    start_calculation_year: Optional[int] = None
    employment_start_date: Optional[date] = None
    employment_end_date: Optional[date] = None
    last_annual_salary_chf: Optional[float] = None
    formula_day_factor: Optional[float] = None
    formula_month_factor: Optional[float] = None
    months_until_reference_age: Optional[int] = None
    formula_part1_chf: Optional[float] = None
    formula_part2_chf: Optional[float] = None
    calculated_abfindung_chf: Optional[float] = None
    formula_used: Optional[str] = None
    computed_tenure_years: Optional[float] = None
    gender_context: Optional[str] = None
    usage_purpose: Optional[str] = None
    etf_risk_level: Optional[str] = None
    ubs_product_type: Optional[str] = None
    estimated_return_percent: Optional[float] = None
    plan_duration_years: Optional[int] = None
    allocation_bvg_buyin: Optional[float] = None
    allocation_pillar3a: Optional[float] = None
    allocation_private_3b: Optional[float] = None


@router.put("/severance")
def upsert_severance(
    data: SeveranceUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    record = db.query(SeverancePlan).filter(SeverancePlan.user_id == user.id).first()
    if record is None:
        record = SeverancePlan(user_id=user.id)
        db.add(record)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(record, field, value)

    db.commit()
    db.refresh(record)
    return {"status": "ok", "severance_id": record.id}


@router.get("/profile-state")
def get_profile_state(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
    pension = (
        db.query(PensionFundSnapshot)
        .filter(PensionFundSnapshot.user_id == user.id)
        .order_by(PensionFundSnapshot.created_at.desc())
        .first()
    )
    property_asset = (
        db.query(PropertyAsset)
        .filter(PropertyAsset.user_id == user.id, PropertyAsset.scenario_id.is_(None))
        .first()
    )
    third_pillar = db.query(ThirdPillar).filter(ThirdPillar.user_id == user.id).first()
    life_insurance = (
        db.query(LifeInsurancePolicy).filter(LifeInsurancePolicy.user_id == user.id).first()
    )
    severance = db.query(SeverancePlan).filter(SeverancePlan.user_id == user.id).first()
    ahv = db.query(AhvProjection).filter(AhvProjection.user_id == user.id).first()
    ahv_contributions = (
        db.query(AhvContributionYear)
        .filter(AhvContributionYear.user_id == user.id)
        .order_by(AhvContributionYear.year.asc())
        .all()
    )
    scenario = (
        db.query(Scenario)
        .filter(Scenario.user_id == user.id, Scenario.name == "baseline")
        .order_by(Scenario.id.desc())
        .first()
    )
    three_a_marking_state = (
        db.query(ThreeAMarkingState)
        .filter(ThreeAMarkingState.user_id == user.id)
        .first()
    )

    return {
        "personal": {
            "date_of_birth": profile.date_of_birth.isoformat() if profile and profile.date_of_birth else None,
            "gender": profile.gender if profile else None,
            "marital_status": profile.marital_status.value if profile and profile.marital_status else None,
            "marital_status_year": profile.marital_status_year if profile else None,
            "has_property": profile.has_property if profile else None,
            "property_details": profile.property_details if profile else None,
            "pillar_3a_accounts": profile.pillar_3a_accounts if profile else None,
            "foreign_currency_assets": profile.foreign_currency_assets if profile else None,
            "cash_assets": profile.cash_assets if profile else None,
            "investment_assets": profile.investment_assets if profile else None,
        },
        "pension_fund": {
            "provider": pension.provider if pension else None,
            "as_of_date": pension.as_of_date.isoformat() if pension and pension.as_of_date else None,
            "annual_salary": pension.annual_salary if pension else None,
            "insured_salary_total": pension.insured_salary_total if pension else None,
            "bvg_insured_salary": pension.bvg_insured_salary if pension else None,
            "current_oldage_capital": pension.current_oldage_capital if pension else None,
            "bvg_oldage_capital": pension.bvg_oldage_capital if pension else None,
            "vested_benefits_total": pension.vested_benefits_total if pension else None,
            "max_buyin_total": pension.max_buyin_total if pension else None,
            "wef_available": pension.wef_available if pension else None,
            "coordination_deduction": pension.coordination_deduction if pension else None,
            "insured_salary_rentenplan": pension.insured_salary_rentenplan if pension else None,
            "insured_salary_bonusplan": pension.insured_salary_bonusplan if pension else None,
            "max_buyin_rentenplan": pension.max_buyin_rentenplan if pension else None,
            "max_buyin_bonusplan": pension.max_buyin_bonusplan if pension else None,
        },
        "property": {
            "name": property_asset.name if property_asset else None,
            "canton": property_asset.canton if property_asset else None,
            "canton_code": (
                (property_asset.extra_attributes or {}).get("location", {}).get("canton_code")
                if property_asset
                else None
            ),
            "municipality": property_asset.municipality if property_asset else None,
            "municipality_id": (
                (property_asset.extra_attributes or {}).get("location", {}).get("municipality_id")
                if property_asset
                else None
            ),
            "zip_code": property_asset.zip_code if property_asset else None,
            "estimated_market_value": property_asset.estimated_market_value if property_asset else None,
            "mortgage_amount": property_asset.mortgage_amount if property_asset else None,
            "land_area_sqm": property_asset.land_area_sqm if property_asset else None,
            "building_volume_cubic_m": property_asset.building_volume_cubic_m if property_asset else None,
            "imputed_rent_per_year": property_asset.imputed_rent_per_year if property_asset else None,
            "usage": property_asset.usage.value if property_asset else None,
        },
        "third_pillar": {
            "provider": third_pillar.provider if third_pillar else None,
            "capital_3a": third_pillar.capital_3a if third_pillar else None,
            "annual_contribution_3a": third_pillar.annual_contribution_3a if third_pillar else None,
            "capital_3b": third_pillar.capital_3b if third_pillar else None,
            "annual_contribution_3b": third_pillar.annual_contribution_3b if third_pillar else None,
            "expected_return_percent": third_pillar.expected_return_percent if third_pillar else None,
            "securities_chf": third_pillar.securities_chf if third_pillar else None,
            "real_estate_equity_chf": third_pillar.real_estate_equity_chf if third_pillar else None,
            "monthly_savings_chf": third_pillar.monthly_savings_chf if third_pillar else None,
            "account_count": third_pillar.account_count if third_pillar else None,
            "accounts_json": third_pillar.accounts_json if third_pillar else None,
            "withdrawal_tax_rate_percent": (
                third_pillar.withdrawal_tax_rate_percent if third_pillar else None
            ),
            "tax_model": third_pillar.tax_model if third_pillar else None,
            "tax_canton": third_pillar.tax_canton if third_pillar else None,
        },
        "life_insurance": {
            "insurance_type": life_insurance.insurance_type.value if life_insurance else None,
            "insurer": life_insurance.insurer if life_insurance else None,
            "policy_number": life_insurance.policy_number if life_insurance else None,
            "insured_name": life_insurance.insured_name if life_insurance else None,
            "currency": life_insurance.currency if life_insurance else None,
            "surrender_value": life_insurance.surrender_value if life_insurance else None,
            "annual_premium": life_insurance.annual_premium if life_insurance else None,
            "monthly_premium": life_insurance.monthly_premium if life_insurance else None,
            "sum_at_death": life_insurance.sum_at_death if life_insurance else None,
            "entry_age": life_insurance.entry_age if life_insurance else None,
            "maturity_date": (
                life_insurance.maturity_date.isoformat()
                if life_insurance and life_insurance.maturity_date
                else None
            ),
            "maturity_year": life_insurance.maturity_year if life_insurance else None,
            "monthly_pension_at_retirement": life_insurance.monthly_pension_at_retirement if life_insurance else None,
            "capital_payout_at_maturity": life_insurance.capital_payout_at_maturity if life_insurance else None,
        },
        "severance": {
            "amount": severance.amount if severance else None,
            "is_gross_amount": severance.is_gross_amount if severance else None,
            "client_name": severance.client_name if severance else None,
            "employer": severance.employer if severance else None,
            "canton_code": severance.canton_code if severance else None,
            "payout_year": severance.payout_year if severance else None,
            "tax_rate_percent": severance.tax_rate_percent if severance else None,
            "tax_amount_chf": severance.tax_amount_chf if severance else None,
            "net_amount_chf": severance.net_amount_chf if severance else None,
            "severance_type": severance.severance_type if severance else None,
            "provider_preset": severance.provider_preset if severance else None,
            "formula_model": severance.formula_model if severance else None,
            "formula_v2_enabled": severance.formula_v2_enabled if severance else None,
            "start_calculation_day": severance.start_calculation_day if severance else None,
            "start_calculation_month": severance.start_calculation_month if severance else None,
            "start_calculation_year": severance.start_calculation_year if severance else None,
            "employment_start_date": (
                severance.employment_start_date.isoformat()
                if severance and severance.employment_start_date
                else None
            ),
            "employment_end_date": (
                severance.employment_end_date.isoformat()
                if severance and severance.employment_end_date
                else None
            ),
            "last_annual_salary_chf": severance.last_annual_salary_chf if severance else None,
            "formula_day_factor": severance.formula_day_factor if severance else None,
            "formula_month_factor": severance.formula_month_factor if severance else None,
            "months_until_reference_age": severance.months_until_reference_age if severance else None,
            "formula_part1_chf": severance.formula_part1_chf if severance else None,
            "formula_part2_chf": severance.formula_part2_chf if severance else None,
            "calculated_abfindung_chf": severance.calculated_abfindung_chf if severance else None,
            "formula_used": severance.formula_used if severance else None,
            "computed_tenure_years": severance.computed_tenure_years if severance else None,
            "gender_context": severance.gender_context if severance else None,
            "usage_purpose": severance.usage_purpose if severance else None,
            "etf_risk_level": severance.etf_risk_level if severance else None,
            "ubs_product_type": severance.ubs_product_type if severance else None,
            "estimated_return_percent": severance.estimated_return_percent if severance else None,
            "plan_duration_years": severance.plan_duration_years if severance else None,
            "allocation_bvg_buyin": severance.allocation_bvg_buyin if severance else None,
            "allocation_pillar3a": severance.allocation_pillar3a if severance else None,
            "allocation_private_3b": severance.allocation_private_3b if severance else None,
        },
        "ahv": {
            "reference_age": ahv.reference_age if ahv else None,
            "gender": ahv.gender if ahv else None,
            "estimated_average_income_chf": ahv.estimated_average_income_chf if ahv else None,
            "contribution_estimate_chf": ahv.contribution_estimate_chf if ahv else None,
            "expected_annual_pension": ahv.expected_annual_pension if ahv else None,
            "contribution_years": ahv.contribution_years if ahv else None,
            "early_retirement_years": ahv.early_retirement_years if ahv else None,
            "late_retirement_years": ahv.late_retirement_years if ahv else None,
            "contribution_rows": [
                {
                    "year": row.year,
                    "annual_income_chf": row.annual_income_chf,
                    "contribution_total_chf": row.contribution_total_chf,
                    "age_end_of_year": row.age_end_of_year,
                    "ahv_rent_share_chf": row.ahv_rent_share_chf,
                    "source": row.source,
                }
                for row in ahv_contributions
            ],
        },
        "scenario": {
            "name": scenario.name if scenario else "baseline",
            "bvg_mortgage_repayment_amount_per_year": (
                scenario.bvg_mortgage_repayment_amount_per_year if scenario else None
            ),
            "bvg_mortgage_repayment_total_amount": (
                scenario.bvg_mortgage_repayment_total_amount if scenario else None
            ),
            "analysis_state": (
                (scenario.parameters or {}).get("analysis_state")
                if scenario
                else None
            ),
        },
        "three_a_markings": (
            sorted(
                [
                    _normalize_marking(item)
                    for item in (three_a_marking_state.markings or [])
                ],
                key=lambda item: item["year"],
            )
            if three_a_marking_state
            else []
        ),
        "preferences": {
            "uiTheme": (profile.ui_theme if profile else None) or "dark",
            "uiLanguage": (profile.ui_language if profile else None) or "de",
            "uiDensity": (profile.ui_density if profile else None) or "comfort",
        },
    }


@router.get("/profile/three-a-markings")
def get_three_a_markings(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    state = (
        db.query(ThreeAMarkingState)
        .filter(ThreeAMarkingState.user_id == user.id)
        .first()
    )
    markings = sorted(
        [_normalize_marking(item) for item in (state.markings or [])],
        key=lambda item: item["year"],
    ) if state else []
    return {"status": "ok", "markings": markings}


@router.put("/profile/three-a-markings")
def upsert_three_a_markings(
    data: ThreeAMarkingPayload,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    state = (
        db.query(ThreeAMarkingState)
        .filter(ThreeAMarkingState.user_id == user.id)
        .first()
    )
    if state is None:
        state = ThreeAMarkingState(user_id=user.id, markings=[])
        db.add(state)

    existing = state.markings or []
    incoming = [
        {
            "year": item.year,
            "status": item.status,
            "source": item.source,
            "manual_override": item.manual_override,
            "updated_at": (
                item.updated_at.isoformat()
                if item.updated_at
                else datetime.utcnow().isoformat()
            ),
        }
        for item in data.markings
    ]
    merged = _merge_three_a_markings(existing=existing, incoming=incoming)
    state.markings = merged
    db.commit()
    db.refresh(state)
    return {"status": "ok", "markings": merged}


@router.get("/profile")
def get_profile(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    # Backward-compatible alias used by frontend profile loader.
    return get_profile_state(db=db, user=user)


VALID_UI_THEMES = {"dark", "light"}
VALID_UI_LANGUAGES = {"de", "en"}
VALID_UI_DENSITIES = {"comfort", "pro"}


class PreferencesUpdate(BaseModel):
    ui_theme: Optional[str] = None
    ui_language: Optional[str] = None
    ui_density: Optional[str] = None


@router.put("/preferences")
def update_preferences(
    data: PreferencesUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
    if profile is None:
        profile = PersonProfile(user_id=user.id)
        db.add(profile)

    if data.ui_theme is not None:
        if data.ui_theme not in VALID_UI_THEMES:
            raise HTTPException(status_code=400, detail="Ungültiges Theme.")
        profile.ui_theme = data.ui_theme
    if data.ui_language is not None:
        if data.ui_language not in VALID_UI_LANGUAGES:
            raise HTTPException(status_code=400, detail="Ungültige Sprache.")
        profile.ui_language = data.ui_language
    if data.ui_density is not None:
        if data.ui_density not in VALID_UI_DENSITIES:
            raise HTTPException(status_code=400, detail="Ungültige Dichte.")
        profile.ui_density = data.ui_density

    db.commit()
    db.refresh(profile)
    return {
        "status": "ok",
        "preferences": {
            "uiTheme": profile.ui_theme or "dark",
            "uiLanguage": profile.ui_language or "de",
            "uiDensity": profile.ui_density or "comfort",
        },
    }

