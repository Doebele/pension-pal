from datetime import datetime, date
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class ScenarioType(str, PyEnum):
    BASELINE = "baseline"
    EARLY_RETIREMENT = "early_retirement"
    LATE_RETIREMENT = "late_retirement"
    INFLATION_SHOCK = "inflation_shock"


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    scenario_type: Mapped[ScenarioType] = mapped_column(
        Enum(ScenarioType), default=ScenarioType.BASELINE
    )

    # Persistierte Parameter, z.B. Inflationsannahmen, Steuer-Overrides, Rentenalter
    parameters: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(JSONB, "postgresql"), nullable=True
    )
    bvg_mortgage_repayment_amount_per_year: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    bvg_mortgage_repayment_total_amount: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    # Ergebnisse als Zeitreihe (z.B. Jahr → Vermögen/Rentenfluss)
    results: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(JSONB, "postgresql"), nullable=True
    )

    properties: Mapped[list["PropertyAsset"]] = relationship(
        "PropertyAsset", back_populates="scenario", cascade="all, delete-orphan"
    )


class PropertyUsage(str, PyEnum):
    OWNER_OCCUPIED = "owner_occupied"
    RENTED_OUT = "rented_out"
    MIXED = "mixed"


class PropertyAsset(Base):
    """
    Wohneigentum inkl. Hypotheken, Schätzwert, Eigenmietwert etc.
    """

    __tablename__ = "property_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    scenario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Standort / Steuerrelevanz
    canton: Mapped[str | None] = mapped_column(String(2), nullable=True)
    municipality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    zip_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    usage: Mapped[PropertyUsage] = mapped_column(
        Enum(PropertyUsage), default=PropertyUsage.OWNER_OCCUPIED
    )

    # Werte
    estimated_market_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    mortgage_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    interest_rate_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    amortization_per_year: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Grundstücks- / Objektangaben
    land_area_sqm: Mapped[float | None] = mapped_column(Float, nullable=True)
    building_volume_cubic_m: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Steuerliche Grössen
    imputed_rent_per_year: Mapped[float | None] = mapped_column(Float, nullable=True)
    maintenance_costs_per_year: Mapped[float | None] = mapped_column(Float, nullable=True)

    extra_attributes: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(JSONB, "postgresql"), nullable=True
    )

    scenario: Mapped[Scenario | None] = relationship("Scenario", back_populates="properties")


class PensionFundSnapshot(Base):
    """
    Snapshot eines Pensionskassenauszugs pro Benutzer.
    """

    __tablename__ = "pension_fund_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    provider: Mapped[str | None] = mapped_column(String(150), nullable=True)
    as_of_date: Mapped[date | None] = mapped_column(nullable=True)

    annual_salary: Mapped[float | None] = mapped_column(Float, nullable=True)
    insured_salary_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    bvg_insured_salary: Mapped[float | None] = mapped_column(Float, nullable=True)

    current_oldage_capital: Mapped[float | None] = mapped_column(Float, nullable=True)
    bvg_oldage_capital: Mapped[float | None] = mapped_column(Float, nullable=True)
    vested_benefits_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_buyin_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    wef_available: Mapped[float | None] = mapped_column(Float, nullable=True)

    coordination_deduction: Mapped[float | None] = mapped_column(Float, nullable=True)
    insured_salary_rentenplan: Mapped[float | None] = mapped_column(Float, nullable=True)
    insured_salary_bonusplan: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_buyin_rentenplan: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_buyin_bonusplan: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class ThirdPillar(Base):
    """
    Vereinfachtes Modell für Säule 3a/3b und private Vorsorge.
    """

    __tablename__ = "third_pillars"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    provider: Mapped[str | None] = mapped_column(String(150), nullable=True)
    capital_3a: Mapped[float | None] = mapped_column(Float, nullable=True)
    annual_contribution_3a: Mapped[float | None] = mapped_column(Float, nullable=True)
    capital_3b: Mapped[float | None] = mapped_column(Float, nullable=True)
    annual_contribution_3b: Mapped[float | None] = mapped_column(Float, nullable=True)
    expected_return_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    securities_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    real_estate_equity_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    monthly_savings_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    account_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    accounts_json: Mapped[list[dict] | None] = mapped_column(
        JSONB().with_variant(JSONB, "postgresql"), nullable=True
    )
    withdrawal_tax_rate_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    tax_model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tax_canton: Mapped[str | None] = mapped_column(String(2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class AhvProjection(Base):
    """
    Vereinfachte Projektion für AHV-Rente.
    """

    __tablename__ = "ahv_projections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    reference_age: Mapped[int | None] = mapped_column(nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    estimated_average_income_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    contribution_estimate_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    expected_annual_pension: Mapped[float | None] = mapped_column(Float, nullable=True)
    contribution_years: Mapped[float | None] = mapped_column(Float, nullable=True)
    early_retirement_years: Mapped[float | None] = mapped_column(Float, nullable=True)
    late_retirement_years: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class AhvContributionYear(Base):
    __tablename__ = "ahv_contribution_years"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    annual_income_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    contribution_total_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    age_end_of_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ahv_rent_share_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class InsuranceType(str, PyEnum):
    RENTEN = "renten"
    KAPITAL = "kapital"
    GEMISCHT = "gemischt"


class LifeInsurancePolicy(Base):
    __tablename__ = "life_insurance_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    insurance_type: Mapped[InsuranceType] = mapped_column(
        Enum(InsuranceType), default=InsuranceType.GEMISCHT
    )
    insurer: Mapped[str | None] = mapped_column(String(150), nullable=True)
    policy_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    insured_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    surrender_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    annual_premium: Mapped[float | None] = mapped_column(Float, nullable=True)
    monthly_premium: Mapped[float | None] = mapped_column(Float, nullable=True)
    sum_at_death: Mapped[float | None] = mapped_column(Float, nullable=True)
    entry_age: Mapped[int | None] = mapped_column(nullable=True)
    maturity_date: Mapped[date | None] = mapped_column(nullable=True)
    maturity_year: Mapped[int | None] = mapped_column(nullable=True)
    monthly_pension_at_retirement: Mapped[float | None] = mapped_column(Float, nullable=True)
    capital_payout_at_maturity: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class SeverancePlan(Base):
    __tablename__ = "severance_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_gross_amount: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    client_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    employer: Mapped[str | None] = mapped_column(String(150), nullable=True)
    canton_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    payout_year: Mapped[int | None] = mapped_column(nullable=True)
    tax_rate_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    tax_amount_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_amount_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    severance_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    provider_preset: Mapped[str | None] = mapped_column(String(32), nullable=True)
    formula_model: Mapped[str | None] = mapped_column(String(32), nullable=True)
    formula_v2_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    start_calculation_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_calculation_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_calculation_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    employment_start_date: Mapped[date | None] = mapped_column(nullable=True)
    employment_end_date: Mapped[date | None] = mapped_column(nullable=True)
    last_annual_salary_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    formula_day_factor: Mapped[float | None] = mapped_column(Float, nullable=True)
    formula_month_factor: Mapped[float | None] = mapped_column(Float, nullable=True)
    months_until_reference_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    formula_part1_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    formula_part2_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    calculated_abfindung_chf: Mapped[float | None] = mapped_column(Float, nullable=True)
    formula_used: Mapped[str | None] = mapped_column(String(64), nullable=True)
    computed_tenure_years: Mapped[float | None] = mapped_column(Float, nullable=True)
    gender_context: Mapped[str | None] = mapped_column(String(16), nullable=True)
    usage_purpose: Mapped[str | None] = mapped_column(String(32), nullable=True)
    etf_risk_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    ubs_product_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    estimated_return_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    plan_duration_years: Mapped[int | None] = mapped_column(nullable=True)

    allocation_bvg_buyin: Mapped[float | None] = mapped_column(Float, nullable=True)
    allocation_pillar3a: Mapped[float | None] = mapped_column(Float, nullable=True)
    allocation_private_3b: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

