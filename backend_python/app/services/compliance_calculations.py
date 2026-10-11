from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any


def round_chf(value: float) -> float:
    return round(float(value), 2)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def ahv_age_factor(retirement_age: int) -> float:
    """
    60..65 years: minimum 80%, linear up to 100%.
    >=65 defaults to 100%.
    """
    if retirement_age <= 60:
        return 0.80
    if retirement_age >= 65:
        return 1.00
    # 60->0.80, 61->0.84, ..., 65->1.00
    return 0.80 + ((retirement_age - 60) * 0.04)


def calculate_ahv(
    annual_contributions: list[float],
    retirement_age: int,
    rentenquote: float,
    full_annual_pension_chf: float = 29_400.0,
) -> dict[str, float]:
    sum_contributions = sum(max(0.0, float(v)) for v in annual_contributions)
    contribution_factor = clamp((0.75 * sum_contributions) / 3100.0, 0.0, 1.0)
    age_factor = ahv_age_factor(retirement_age)
    quote_factor = clamp(float(rentenquote), 0.0, 1.25)
    annual = full_annual_pension_chf * contribution_factor * age_factor * quote_factor
    monthly = annual / 12.0
    return {
        "sum_contributions_chf": round_chf(sum_contributions),
        "contribution_factor": round(float(contribution_factor), 6),
        "age_factor": round(float(age_factor), 6),
        "quote_factor": round(float(quote_factor), 6),
        "annual_pension_chf": round_chf(annual),
        "monthly_pension_chf": round_chf(monthly),
    }


def calculate_bvg(
    capital_at_retirement_chf: float,
    conversion_rate_percent: float,
    retirement_age: int,
    reference_age: int = 65,
) -> dict[str, float]:
    capital = max(0.0, float(capital_at_retirement_chf))
    rate = max(0.0, float(conversion_rate_percent)) / 100.0

    base_annual = capital * rate
    years_early = max(0, reference_age - retirement_age)
    early_factor = 1.0 if years_early == 0 else max(0.5, 1.0 - years_early * 0.06)

    adjusted_annual = base_annual * early_factor
    adjusted_monthly = adjusted_annual / 12.0

    # "Alternative interpretation" requested by product brief.
    annual_alt_div_30 = adjusted_annual / 30.0

    return {
        "capital_at_retirement_chf": round_chf(capital),
        "conversion_rate_percent": round(float(conversion_rate_percent), 4),
        "early_retirement_factor": round(float(early_factor), 6),
        "annual_pension_chf": round_chf(adjusted_annual),
        "monthly_pension_chf": round_chf(adjusted_monthly),
        "annual_alt_div_30_chf": round_chf(annual_alt_div_30),
    }


def calculate_pillar3a(
    annual_gross_salary_chf: float,
    annual_contribution_chf: float,
    expected_return_percent: float,
    max_tax_deductible_chf: float = 7_088.0,
    max_salary_share_percent: float = 7.0,
    drawdown_rate_percent: float = 4.0,
) -> dict[str, float]:
    salary = max(0.0, float(annual_gross_salary_chf))
    contribution = max(0.0, float(annual_contribution_chf))
    expected_return = max(0.0, float(expected_return_percent)) / 100.0
    max_salary_share = salary * (max_salary_share_percent / 100.0)
    eligible_contribution = min(contribution, max_tax_deductible_chf, max_salary_share)

    annual_tax_free_return = eligible_contribution * expected_return
    annual_drawdown = eligible_contribution * (drawdown_rate_percent / 100.0)

    return {
        "gross_salary_chf": round_chf(salary),
        "requested_contribution_chf": round_chf(contribution),
        "eligible_contribution_chf": round_chf(eligible_contribution),
        "tax_deduction_cap_chf": round_chf(min(max_tax_deductible_chf, max_salary_share)),
        "expected_return_percent": round(float(expected_return_percent), 4),
        "annual_tax_free_return_chf": round_chf(annual_tax_free_return),
        "annual_drawdown_chf": round_chf(annual_drawdown),
        "monthly_drawdown_chf": round_chf(annual_drawdown / 12.0),
    }


def calculate_inflation_adjusted_capital(
    capital_chf: float,
    inflation_rate_percent: float,
    years: int,
) -> dict[str, float]:
    capital = max(0.0, float(capital_chf))
    inflation = max(0.0, float(inflation_rate_percent)) / 100.0
    years_int = max(0, int(years))
    real = capital / ((1.0 + inflation) ** years_int) if years_int > 0 else capital
    return {
        "nominal_capital_chf": round_chf(capital),
        "inflation_rate_percent": round(float(inflation_rate_percent), 4),
        "years": float(years_int),
        "real_capital_chf": round_chf(real),
    }


def project_wealth_path(
    start_capital_chf: float,
    annual_income_chf: float,
    annual_spending_chf: float,
    nominal_return_percent: float,
    inflation_rate_percent: float,
    years: int,
) -> list[dict[str, float]]:
    nominal_return = float(nominal_return_percent) / 100.0
    inflation = float(inflation_rate_percent) / 100.0
    real_return = nominal_return - inflation

    wealth = max(0.0, float(start_capital_chf))
    points: list[dict[str, float]] = []
    for year in range(0, max(0, int(years)) + 1):
        points.append(
            {
                "year_offset": float(year),
                "nominal_wealth_chf": round_chf(wealth),
                "real_wealth_chf": round_chf(
                    wealth / ((1.0 + max(0.0, inflation)) ** year) if year > 0 else wealth
                ),
                "real_return_percent": round(real_return * 100.0, 4),
            }
        )
        wealth = wealth * (1.0 + nominal_return) + annual_income_chf - annual_spending_chf
        wealth = max(0.0, wealth)
    return points


@dataclass
class ScenarioDefinition:
    name: str
    conversion_rate_delta_percent: float = 0.0
    nominal_return_delta_percent: float = 0.0
    inflation_delta_percent: float = 0.0


SCENARIOS = [
    ScenarioDefinition("baseline"),
    ScenarioDefinition("early_retirement", conversion_rate_delta_percent=-0.5),
    ScenarioDefinition("late_retirement_bonus", conversion_rate_delta_percent=0.4),
    ScenarioDefinition("low_interest", nominal_return_delta_percent=-1.0),
    ScenarioDefinition("high_interest", nominal_return_delta_percent=1.0),
]


def calculate_comprehensive_pension(payload: dict[str, Any]) -> dict[str, Any]:
    started = perf_counter()

    ahv = calculate_ahv(
        annual_contributions=payload["ahv_annual_contributions_chf"],
        retirement_age=payload["retirement_age"],
        rentenquote=payload["ahv_rentenquote"],
    )
    bvg = calculate_bvg(
        capital_at_retirement_chf=payload["bvg_capital_at_retirement_chf"],
        conversion_rate_percent=payload["bvg_conversion_rate_percent"],
        retirement_age=payload["retirement_age"],
        reference_age=payload["reference_retirement_age"],
    )
    pillar3a = calculate_pillar3a(
        annual_gross_salary_chf=payload["annual_gross_salary_chf"],
        annual_contribution_chf=payload["pillar3a_contribution_chf"],
        expected_return_percent=payload["pillar3a_expected_return_percent"],
        max_tax_deductible_chf=payload["pillar3a_tax_deduction_cap_chf"],
    )

    annual_total = (
        ahv["annual_pension_chf"]
        + bvg["annual_pension_chf"]
        + pillar3a["annual_drawdown_chf"]
        + max(0.0, float(payload["private_products_annual_chf"]))
    )
    monthly_total = annual_total / 12.0

    inflation_adjusted = calculate_inflation_adjusted_capital(
        capital_chf=payload["start_capital_chf"],
        inflation_rate_percent=payload["inflation_rate_percent"],
        years=max(0, int(payload["projection_years"])),
    )
    wealth_path = project_wealth_path(
        start_capital_chf=payload["start_capital_chf"],
        annual_income_chf=annual_total,
        annual_spending_chf=payload["annual_spending_chf"],
        nominal_return_percent=payload["nominal_return_percent"],
        inflation_rate_percent=payload["inflation_rate_percent"],
        years=max(0, int(payload["projection_years"])),
    )

    scenario_results: list[dict[str, Any]] = []
    for scenario in SCENARIOS:
        bvg_scenario = calculate_bvg(
            capital_at_retirement_chf=payload["bvg_capital_at_retirement_chf"],
            conversion_rate_percent=payload["bvg_conversion_rate_percent"]
            + scenario.conversion_rate_delta_percent,
            retirement_age=payload["retirement_age"],
            reference_age=payload["reference_retirement_age"],
        )
        nominal_return = payload["nominal_return_percent"] + scenario.nominal_return_delta_percent
        inflation = payload["inflation_rate_percent"] + scenario.inflation_delta_percent
        path = project_wealth_path(
            start_capital_chf=payload["start_capital_chf"],
            annual_income_chf=ahv["annual_pension_chf"]
            + bvg_scenario["annual_pension_chf"]
            + pillar3a["annual_drawdown_chf"]
            + max(0.0, float(payload["private_products_annual_chf"])),
            annual_spending_chf=payload["annual_spending_chf"],
            nominal_return_percent=nominal_return,
            inflation_rate_percent=inflation,
            years=max(0, int(payload["projection_years"])),
        )
        scenario_results.append(
            {
                "scenario": scenario.name,
                "bvg_conversion_rate_percent": round(
                    payload["bvg_conversion_rate_percent"] + scenario.conversion_rate_delta_percent, 4
                ),
                "nominal_return_percent": round(nominal_return, 4),
                "inflation_rate_percent": round(inflation, 4),
                "annual_total_pension_chf": round_chf(
                    ahv["annual_pension_chf"]
                    + bvg_scenario["annual_pension_chf"]
                    + pillar3a["annual_drawdown_chf"]
                    + max(0.0, float(payload["private_products_annual_chf"]))
                ),
                "ending_nominal_wealth_chf": path[-1]["nominal_wealth_chf"] if path else 0.0,
                "ending_real_wealth_chf": path[-1]["real_wealth_chf"] if path else 0.0,
            }
        )

    elapsed_ms = (perf_counter() - started) * 1000.0
    return {
        "meta": {
            "elapsed_ms": round(elapsed_ms, 3),
            "rounded_to_decimals": 2,
            "sources": [
                {
                    "name": "AHV legal basis",
                    "url": "https://www.fedlex.admin.ch/eli/cc/65/837_843_843/de",
                },
                {
                    "name": "BVG legal basis",
                    "url": "https://www.fedlex.admin.ch/eli/cc/1983/797_797_797/de",
                },
                {
                    "name": "Pillar 3a and tax guidance",
                    "url": "https://www.estv.admin.ch/estv/de/home/direkte-bundessteuer/fachinformationen-dbst/steuerperiode.html",
                },
                {
                    "name": "SNB inflation context",
                    "url": "https://www.snb.ch",
                },
            ],
        },
        "ahv": ahv,
        "bvg": bvg,
        "pillar3a": pillar3a,
        "total_pension": {
            "annual_total_chf": round_chf(annual_total),
            "monthly_total_chf": round_chf(monthly_total),
            "private_products_annual_chf": round_chf(
                max(0.0, float(payload["private_products_annual_chf"]))
            ),
        },
        "wealth_decay": {
            "inflation_adjusted_capital": inflation_adjusted,
            "projection": wealth_path,
        },
        "scenario_analysis": scenario_results,
    }
