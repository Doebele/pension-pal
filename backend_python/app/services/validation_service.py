from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


ValidationStatus = Literal["passed", "warning", "error"]


class PensionCalculationError(Exception):
    """Business-level calculation/validation error with structured details."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "CALCULATION_ERROR",
        details: Optional[list[dict[str, Any]]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or []


class ValidationIssue(BaseModel):
    code: str
    message: str
    severity: Literal["warning", "error"]
    field: Optional[str] = None
    context: dict[str, Any] = Field(default_factory=dict)


class AgeValidator(BaseModel):
    current_age: int = Field(ge=18, le=100)
    retirement_age: int = Field(ge=58, le=75)
    ahv_reference_age: int = Field(ge=58, le=70, default=65)

    @model_validator(mode="after")
    def validate_age_consistency(self) -> "AgeValidator":
        if self.retirement_age < 60:
            raise PensionCalculationError(
                "BVG-Pensionierungsalter unter 60 ist ohne Sonderfall nicht gueltig.",
                code="INVALID_RETIREMENT_AGE",
                details=[
                    {
                        "field": "retirement_age",
                        "value": self.retirement_age,
                    }
                ],
            )
        if self.current_age > self.retirement_age:
            raise PensionCalculationError(
                "Aktuelles Alter liegt ueber dem Rentenalter.",
                code="AGE_INCONSISTENT",
                details=[
                    {
                        "field": "current_age",
                        "value": self.current_age,
                    }
                ],
            )
        if self.ahv_reference_age < 64 or self.ahv_reference_age > 65:
            raise PensionCalculationError(
                "AHV-Referenzalter muss im Standardmodell 64 oder 65 sein.",
                code="AHV_REFERENCE_AGE_INVALID",
                details=[
                    {
                        "field": "ahv_reference_age",
                        "value": self.ahv_reference_age,
                    }
                ],
            )
        return self


class CapitalValidator(BaseModel):
    base_capital: float = Field(ge=0)
    annual_repayment: float = Field(ge=0, default=0)
    years_to_retirement: int = Field(ge=0, le=60)
    minimum_remaining_capital: float = Field(ge=0, default=0)

    @field_validator("base_capital", "annual_repayment", "minimum_remaining_capital")
    @classmethod
    def validate_finite(cls, value: float) -> float:
        if value != value:
            raise ValueError("NaN is not allowed.")
        return value


class YearPlausibilityData(BaseModel):
    year: int
    age: int = Field(ge=18, le=110)
    annual_income_chf: float = Field(ge=0, le=1_000_000)
    bvg_insured_salary_chf: float = Field(ge=0, le=300_000)
    ahv_contribution_years: float = Field(ge=0, le=50)
    is_retired: bool = False


class ValidationProfile(BaseModel):
    minimum_remaining_capital: float = Field(default=50_000, ge=0)
    max_income_warning_chf: float = Field(default=350_000, ge=0)
    bvg_max_insured_salary_chf: float = Field(default=90_720, ge=0)


class ValidationResult(BaseModel):
    validation_status: ValidationStatus
    issues: list[ValidationIssue] = Field(default_factory=list)


def run_plausibility_checks(
    year_data: YearPlausibilityData,
    profile: ValidationProfile,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if year_data.annual_income_chf > profile.max_income_warning_chf:
        issues.append(
            ValidationIssue(
                code="INCOME_UNUSUAL",
                message="Einkommen ist ungewöhnlich hoch, bitte Eingaben prüfen.",
                severity="warning",
                field="annual_income_chf",
                context={"value": year_data.annual_income_chf},
            )
        )
    if year_data.bvg_insured_salary_chf > profile.bvg_max_insured_salary_chf:
        issues.append(
            ValidationIssue(
                code="BVG_LIMIT_EXCEEDED",
                message="BVG-versicherter Lohn liegt über der Bemessungsgrenze.",
                severity="warning",
                field="bvg_insured_salary_chf",
                context={"value": year_data.bvg_insured_salary_chf},
            )
        )
    if year_data.is_retired and year_data.ahv_contribution_years < 44:
        issues.append(
            ValidationIssue(
                code="AHV_CONTRIBUTION_GAP",
                message="Mögliche AHV-Beitragslücke erkannt.",
                severity="warning",
                field="ahv_contribution_years",
                context={"value": year_data.ahv_contribution_years},
            )
        )
    return issues


def evaluate_validation_status(issues: list[ValidationIssue]) -> ValidationStatus:
    if any(issue.severity == "error" for issue in issues):
        return "error"
    if any(issue.severity == "warning" for issue in issues):
        return "warning"
    return "passed"


def check_minimum_remaining_capital(
    *,
    age: int,
    capital: float,
    minimum_required: float,
) -> Optional[ValidationIssue]:
    if capital < minimum_required:
        return ValidationIssue(
            code="MINIMUM_REMAINING_CAPITAL_UNDERRUN",
            message="Mindestrestkapital unterschritten.",
            severity="warning",
            field="minimum_remaining_capital",
            context={
                "age": age,
                "capital": round(capital, 2),
                "minimum_required": minimum_required,
            },
        )
    return None
