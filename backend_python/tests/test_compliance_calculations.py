from app.services.compliance_calculations import (
    calculate_ahv,
    calculate_bvg,
    calculate_pillar3a,
    calculate_inflation_adjusted_capital,
    calculate_comprehensive_pension,
)


def test_calculate_ahv_basic():
    result = calculate_ahv(
        annual_contributions=[3100, 3100, 3100, 3100],
        retirement_age=65,
        rentenquote=1.0,
    )
    # contribution factor = 1.0, age factor = 1.0 => full annual pension
    assert result["annual_pension_chf"] == 29400.00
    assert result["monthly_pension_chf"] == 2450.00


def test_calculate_bvg_with_early_retirement_reduction():
    result = calculate_bvg(
        capital_at_retirement_chf=500000,
        conversion_rate_percent=7.4,
        retirement_age=62,
        reference_age=65,
    )
    # Base annual = 37'000, early factor 0.82 => 30'340
    assert result["annual_pension_chf"] == 30340.00
    assert result["monthly_pension_chf"] == 2528.33


def test_calculate_pillar3a_caps_contribution():
    result = calculate_pillar3a(
        annual_gross_salary_chf=100000,
        annual_contribution_chf=10000,
        expected_return_percent=6.0,
        max_tax_deductible_chf=7088.0,
        max_salary_share_percent=7.0,
    )
    # min(10'000, 7'088, 7'000) => 7'000 eligible
    assert result["eligible_contribution_chf"] == 7000.00
    assert result["annual_tax_free_return_chf"] == 420.00


def test_inflation_adjusted_capital():
    result = calculate_inflation_adjusted_capital(
        capital_chf=100000,
        inflation_rate_percent=2.0,
        years=10,
    )
    assert result["real_capital_chf"] == 82034.83


def test_comprehensive_pension_contains_all_sections():
    payload = {
        "annual_gross_salary_chf": 120000,
        "retirement_age": 65,
        "reference_retirement_age": 65,
        "ahv_annual_contributions_chf": [3100.0] * 10,
        "ahv_rentenquote": 1.0,
        "bvg_capital_at_retirement_chf": 600000,
        "bvg_conversion_rate_percent": 7.4,
        "pillar3a_contribution_chf": 7000,
        "pillar3a_expected_return_percent": 6.0,
        "pillar3a_tax_deduction_cap_chf": 7088.0,
        "private_products_annual_chf": 5000,
        "start_capital_chf": 250000,
        "annual_spending_chf": 45000,
        "nominal_return_percent": 4.0,
        "inflation_rate_percent": 2.0,
        "projection_years": 20,
    }
    result = calculate_comprehensive_pension(payload)
    assert "ahv" in result
    assert "bvg" in result
    assert "pillar3a" in result
    assert "total_pension" in result
    assert "wealth_decay" in result
    assert "scenario_analysis" in result
    assert result["meta"]["elapsed_ms"] < 100.0
