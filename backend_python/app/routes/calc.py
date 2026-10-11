from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from ..db import get_db
from ..models.pension import PensionFundSnapshot, Scenario, ScenarioType
from ..models.user import PersonProfile, User
from ..services.validation_service import (
    AgeValidator,
    CapitalValidator,
    check_minimum_remaining_capital,
    PensionCalculationError,
    ValidationIssue,
    ValidationProfile,
    evaluate_validation_status,
    run_plausibility_checks,
    YearPlausibilityData,
)
from ..services.compliance_calculations import calculate_comprehensive_pension
from .profile import get_authenticated_user


router = APIRouter(prefix="/api", tags=["calc"])


class BvgRepaymentScenarioUpdate(BaseModel):
    scenario_name: str = "baseline"
    bvg_mortgage_repayment_amount_per_year: Optional[float] = Field(default=None, ge=0)
    bvg_mortgage_repayment_total_amount: Optional[float] = Field(default=None, ge=0)
    analysis_state: Optional[dict[str, Any]] = None


class PensionCalcRequest(BaseModel):
    retirement_age: int = Field(default=65, ge=58, le=75)
    max_age: int = Field(default=100, ge=60, le=110)
    bvg_conversion_rate_percent: float = Field(default=6.8, gt=0, le=15)
    bvg_growth_rate_percent: float = Field(default=1.25, ge=0, le=10)
    tax_rate_percent: float = Field(default=20.0, ge=0, le=60)
    inflation_rate_percent: float = Field(default=2.0, ge=0, le=15)
    bvg_mortgage_repayment_amount_per_year: Optional[float] = Field(default=None, ge=0)
    bvg_mortgage_repayment_total_amount: Optional[float] = Field(default=None, ge=0)
    annual_income_chf: float = Field(default=120_000, ge=0, le=1_000_000)
    bvg_insured_salary_chf: float = Field(default=64_260, ge=0, le=300_000)
    minimum_remaining_capital: float = Field(default=50_000, ge=0)
    ahv_reference_age: int = Field(default=65, ge=58, le=70)
    scenario_name: str = "baseline"


class ComprehensivePensionCalcRequest(BaseModel):
    annual_gross_salary_chf: float = Field(..., ge=0, le=1_000_000)
    retirement_age: int = Field(default=65, ge=60, le=70)
    reference_retirement_age: int = Field(default=65, ge=60, le=70)

    ahv_annual_contributions_chf: list[float] = Field(default_factory=list)
    ahv_rentenquote: float = Field(default=1.0, ge=0, le=1.25)

    bvg_capital_at_retirement_chf: float = Field(..., ge=0, le=20_000_000)
    bvg_conversion_rate_percent: float = Field(default=7.4, ge=0, le=15)

    pillar3a_contribution_chf: float = Field(default=0.0, ge=0, le=1_000_000)
    pillar3a_expected_return_percent: float = Field(default=6.0, ge=0, le=20)
    pillar3a_tax_deduction_cap_chf: float = Field(default=7_088.0, ge=0, le=100_000)

    private_products_annual_chf: float = Field(default=0.0, ge=0, le=5_000_000)

    start_capital_chf: float = Field(default=0.0, ge=0, le=100_000_000)
    annual_spending_chf: float = Field(default=0.0, ge=0, le=5_000_000)
    nominal_return_percent: float = Field(default=4.0, ge=-10, le=30)
    inflation_rate_percent: float = Field(default=2.0, ge=0, le=15)
    projection_years: int = Field(default=35, ge=0, le=70)


def _calculate_age(dob: Optional[date]) -> int:
    if not dob:
        return 45
    today = date.today()
    years = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        years -= 1
    return max(18, years)


def _project_bvg_capital_with_repayment(
    current_capital: float,
    years_to_retirement: int,
    annual_growth_rate: float,
    annual_repayment: float,
) -> float:
    capital = max(0.0, current_capital)
    if years_to_retirement <= 0:
        return capital

    for _ in range(years_to_retirement):
        capital = max(0.0, capital - annual_repayment)
        capital = capital * (1 + annual_growth_rate)
    return max(0.0, capital)


def _simulate_bvg_capital_path(
    current_capital: float,
    current_age: int,
    retirement_age: int,
    annual_growth_rate: float,
    annual_repayment: float,
):
    years_to_retirement = max(0, retirement_age - current_age)
    capital = max(0.0, current_capital)
    points = []
    for offset in range(years_to_retirement):
        age = current_age + offset + 1
        capital = max(0.0, capital - annual_repayment)
        capital = capital * (1 + annual_growth_rate)
        points.append({"age": age, "capital": capital})
    return points


def _monthly_rente_from_capital(capital: float, conversion_rate_percent: float) -> float:
    return max(0.0, capital * (conversion_rate_percent / 100.0) / 12.0)


@router.put("/scenario/bvg-mortgage-repayment")
def upsert_bvg_mortgage_repayment_scenario(
    data: BvgRepaymentScenarioUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    scenario = (
        db.query(Scenario)
        .filter(Scenario.user_id == user.id, Scenario.name == data.scenario_name)
        .order_by(Scenario.id.desc())
        .first()
    )
    if scenario is None:
        scenario = Scenario(
            user_id=user.id,
            name=data.scenario_name,
            scenario_type=ScenarioType.BASELINE,
        )
        db.add(scenario)

    scenario.bvg_mortgage_repayment_amount_per_year = data.bvg_mortgage_repayment_amount_per_year
    scenario.bvg_mortgage_repayment_total_amount = data.bvg_mortgage_repayment_total_amount
    if data.analysis_state is not None:
        # Neues dict statt das bestehende zu ändern: SQLAlchemy erkennt Änderungen an JSON-Spalten
        # nur bei neuer Zuweisung — sonst blieb analysis_state nach dem ersten Speichern für immer alt
        scenario.parameters = {**(scenario.parameters or {}), "analysis_state": data.analysis_state}
    db.commit()
    db.refresh(scenario)
    return {
        "status": "ok",
        "scenario_id": scenario.id,
        "updated_parameters": scenario.parameters,
    }


@router.post("/calc/pension")
@router.post("/calculate")
def calculate_pension_with_bvg_repayment(
    data: PensionCalcRequest,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    try:
        pension = (
            db.query(PensionFundSnapshot)
            .filter(PensionFundSnapshot.user_id == user.id)
            .order_by(PensionFundSnapshot.created_at.desc())
            .first()
        )
        if not pension or pension.current_oldage_capital is None:
            raise PensionCalculationError(
                "No BVG capital found. Please save pension fund data first.",
                code="MISSING_BVG_CAPITAL",
            )

        profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
        current_age = _calculate_age(profile.date_of_birth if profile else None)
        years_to_retirement = max(0, data.retirement_age - current_age)
        annual_growth_rate = data.bvg_growth_rate_percent / 100.0

        AgeValidator(
            current_age=current_age,
            retirement_age=data.retirement_age,
            ahv_reference_age=data.ahv_reference_age,
        )

        annual_repayment = data.bvg_mortgage_repayment_amount_per_year or 0.0
        total_repayment = data.bvg_mortgage_repayment_total_amount or 0.0
        if annual_repayment <= 0 and total_repayment > 0 and years_to_retirement > 0:
            annual_repayment = total_repayment / years_to_retirement

        base_capital = float(pension.current_oldage_capital)
        CapitalValidator(
            base_capital=base_capital,
            annual_repayment=annual_repayment,
            years_to_retirement=years_to_retirement,
            minimum_remaining_capital=data.minimum_remaining_capital,
        )

        effective_total_repayment = annual_repayment * years_to_retirement
        if effective_total_repayment > base_capital:
            raise PensionCalculationError(
                "BVG repayment exceeds available BVG capital until retirement.",
                code="BVG_REPAYMENT_EXCEEDS_CAPITAL",
                details=[{"effective_total_repayment": effective_total_repayment}],
            )

        yearly_issues: list[ValidationIssue] = []
        profile_cfg = ValidationProfile(
            minimum_remaining_capital=data.minimum_remaining_capital
        )
        capital_path = _simulate_bvg_capital_path(
            current_capital=base_capital,
            current_age=current_age,
            retirement_age=data.retirement_age,
            annual_growth_rate=annual_growth_rate,
            annual_repayment=annual_repayment,
        )
        for point in capital_path:
            min_cap_issue = check_minimum_remaining_capital(
                age=point["age"],
                capital=point["capital"],
                minimum_required=data.minimum_remaining_capital,
            )
            if min_cap_issue:
                yearly_issues.append(min_cap_issue)
            yearly_issues.extend(
                run_plausibility_checks(
                    YearPlausibilityData(
                        year=date.today().year + (point["age"] - current_age),
                        age=point["age"],
                        annual_income_chf=data.annual_income_chf,
                        bvg_insured_salary_chf=data.bvg_insured_salary_chf,
                        ahv_contribution_years=min(44.0, point["age"] - 20),
                        is_retired=False,
                    ),
                    profile_cfg,
                )
            )

        projected_without = _project_bvg_capital_with_repayment(
            current_capital=base_capital,
            years_to_retirement=years_to_retirement,
            annual_growth_rate=annual_growth_rate,
            annual_repayment=0.0,
        )
        projected_with = _project_bvg_capital_with_repayment(
            current_capital=base_capital,
            years_to_retirement=years_to_retirement,
            annual_growth_rate=annual_growth_rate,
            annual_repayment=annual_repayment,
        )

        monthly_standard = _monthly_rente_from_capital(
            projected_without, data.bvg_conversion_rate_percent
        )
        monthly_reduced = _monthly_rente_from_capital(
            projected_with, data.bvg_conversion_rate_percent
        )
        net_ratio = monthly_reduced / monthly_standard if monthly_standard > 0 else 0.0

        tax_factor = 1.0 - data.tax_rate_percent / 100.0
        inflation = data.inflation_rate_percent / 100.0
        line_projection = []
        for age in range(data.retirement_age, data.max_age + 1):
            years_after_retirement = age - data.retirement_age
            real_discount = (1 + inflation) ** years_after_retirement
            standard_real = (monthly_standard * tax_factor) / real_discount
            reduced_real = (monthly_reduced * tax_factor) / real_discount
            line_projection.append(
                {
                    "age": age,
                    "standard_bvg_monthly": round(monthly_standard, 2),
                    "reduced_bvg_monthly": round(monthly_reduced, 2),
                    "standard_bvg_net_real": round(standard_real, 2),
                    "reduced_bvg_net_real": round(reduced_real, 2),
                }
            )

        validation_status = evaluate_validation_status(yearly_issues)
        return {
            "validation_status": validation_status,
            "validation_issues": [issue.model_dump() for issue in yearly_issues],
            "inputs": data.model_dump(),
            "assumptions": {
                "current_age": current_age,
                "years_to_retirement": years_to_retirement,
                "annual_repayment_used": round(annual_repayment, 2),
                "effective_total_repayment": round(effective_total_repayment, 2),
            },
            "bvg": {
                "capital_without_repayment_at_retirement": round(projected_without, 2),
                "capital_with_repayment_at_retirement": round(projected_with, 2),
                "monthly_rente_standard": round(monthly_standard, 2),
                "monthly_rente_reduced": round(monthly_reduced, 2),
                "netto_rentenverhaeltnis": round(net_ratio, 4),
                "rent_loss_monthly": round(monthly_standard - monthly_reduced, 2),
            },
            "line_projection": line_projection,
        }
    except PensionCalculationError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "validation_status": "error",
                "code": exc.code,
                "message": exc.message,
                "issues": exc.details,
            },
        ) from exc


@router.post("/calc/pension/comprehensive")
def calculate_pension_comprehensive(
    data: ComprehensivePensionCalcRequest,
    user: User = Depends(get_authenticated_user),
):
    # user dependency enforces auth and keeps endpoint aligned with existing security model
    _ = user.id
    if data.retirement_age < data.reference_retirement_age - 10:
        raise HTTPException(
            status_code=422,
            detail={
                "validation_status": "error",
                "code": "INVALID_RETIREMENT_AGE",
                "message": "Retirement age is implausibly early for this model.",
                "issues": [
                    {
                        "field": "retirement_age",
                        "message": "Use an age between 60 and 70.",
                    }
                ],
            },
        )
    return calculate_comprehensive_pension(data.model_dump())
