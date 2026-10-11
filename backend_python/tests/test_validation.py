import pytest

from app.services.validation_service import (
    AgeValidator,
    PensionCalculationError,
    ValidationProfile,
    check_minimum_remaining_capital,
    run_plausibility_checks,
    YearPlausibilityData,
)


def test_age_validator_accepts_valid_range():
    validator = AgeValidator(current_age=45, retirement_age=65, ahv_reference_age=65)
    assert validator.retirement_age == 65


def test_age_validator_rejects_retirement_below_60():
    with pytest.raises(PensionCalculationError) as exc_info:
        AgeValidator(current_age=45, retirement_age=59, ahv_reference_age=65)
    assert exc_info.value.code == "INVALID_RETIREMENT_AGE"


def test_minimum_remaining_capital_warning_triggered():
    issue = check_minimum_remaining_capital(
        age=61,
        capital=45_000,
        minimum_required=50_000,
    )
    assert issue is not None
    assert issue.code == "MINIMUM_REMAINING_CAPITAL_UNDERRUN"
    assert issue.severity == "warning"


def test_plausibility_income_extreme_value_creates_warning():
    issues = run_plausibility_checks(
        YearPlausibilityData(
            year=2035,
            age=55,
            annual_income_chf=1_000_000,
            bvg_insured_salary_chf=70_000,
            ahv_contribution_years=30,
            is_retired=False,
        ),
        ValidationProfile(),
    )
    assert any(issue.code == "INCOME_UNUSUAL" for issue in issues)
