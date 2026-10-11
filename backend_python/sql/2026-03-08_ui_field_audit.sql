-- Backup first (production):
--   pg_dump -Fc -U swisspension -d swiss_pension > swiss_pension_pre_ui_audit.dump
--
-- Purpose:
--   1) Fill schema gaps between UI input fields and DB storage.
--   2) Add integrity constraints for 1:1 user tables.
--   3) Improve monetary precision for newly added fields.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Third pillar: persist all active UI fields (currently only partial fields
--    are persisted by API payload).
-- ---------------------------------------------------------------------------
ALTER TABLE third_pillars
  ADD COLUMN IF NOT EXISTS securities_chf NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS real_estate_equity_chf NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS monthly_savings_chf NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS account_count SMALLINT,
  ADD COLUMN IF NOT EXISTS accounts_json JSONB,
  ADD COLUMN IF NOT EXISTS withdrawal_tax_rate_percent NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS tax_model VARCHAR(64),
  ADD COLUMN IF NOT EXISTS tax_canton VARCHAR(2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'third_pillars_account_count_chk'
  ) THEN
    ALTER TABLE third_pillars
      ADD CONSTRAINT third_pillars_account_count_chk
      CHECK (account_count IS NULL OR account_count BETWEEN 1 AND 3) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'third_pillars_nonnegative_money_chk'
  ) THEN
    ALTER TABLE third_pillars
      ADD CONSTRAINT third_pillars_nonnegative_money_chk
      CHECK (
        (securities_chf IS NULL OR securities_chf >= 0) AND
        (real_estate_equity_chf IS NULL OR real_estate_equity_chf >= 0) AND
        (monthly_savings_chf IS NULL OR monthly_savings_chf >= 0) AND
        (withdrawal_tax_rate_percent IS NULL OR withdrawal_tax_rate_percent >= 0)
      ) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Cash + investment cards: dedicated columns for exact field mapping.
-- ---------------------------------------------------------------------------
ALTER TABLE person_profiles
  ADD COLUMN IF NOT EXISTS cash_account_balance_chf NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS cash_reserve_chf NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS cash_notes TEXT,
  ADD COLUMN IF NOT EXISTS investment_etf_chf NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS investment_stocks_chf NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS investment_savings_plan_chf NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS investment_real_estate_etf_chf NUMERIC(18,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'person_profiles_nonnegative_assets_chk'
  ) THEN
    ALTER TABLE person_profiles
      ADD CONSTRAINT person_profiles_nonnegative_assets_chk
      CHECK (
        (cash_account_balance_chf IS NULL OR cash_account_balance_chf >= 0) AND
        (cash_reserve_chf IS NULL OR cash_reserve_chf >= 0) AND
        (investment_etf_chf IS NULL OR investment_etf_chf >= 0) AND
        (investment_stocks_chf IS NULL OR investment_stocks_chf >= 0) AND
        (investment_savings_plan_chf IS NULL OR investment_savings_plan_chf >= 0) AND
        (investment_real_estate_etf_chf IS NULL OR investment_real_estate_etf_chf >= 0)
      ) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Life insurance: preserve original UI values (avoid conversion/rounding loss).
-- ---------------------------------------------------------------------------
ALTER TABLE life_insurance_policies
  ADD COLUMN IF NOT EXISTS annual_rent_payment_chf NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS capital_sum_chf NUMERIC(18,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'life_insurance_nonnegative_chk'
  ) THEN
    ALTER TABLE life_insurance_policies
      ADD CONSTRAINT life_insurance_nonnegative_chk
      CHECK (
        (annual_rent_payment_chf IS NULL OR annual_rent_payment_chf >= 0) AND
        (capital_sum_chf IS NULL OR capital_sum_chf >= 0)
      ) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) One-row-per-user constraints for logical 1:1 tables.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_third_pillars_user_id
  ON third_pillars(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ahv_projections_user_id
  ON ahv_projections(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_life_insurance_policies_user_id
  ON life_insurance_policies(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_severance_plans_user_id
  ON severance_plans(user_id);

-- ---------------------------------------------------------------------------
-- 5) Validate constraints after data cleanup (recommended in a maintenance
--    window). Keep NOT VALID for zero-downtime rollout.
-- ---------------------------------------------------------------------------
-- ALTER TABLE third_pillars VALIDATE CONSTRAINT third_pillars_account_count_chk;
-- ALTER TABLE third_pillars VALIDATE CONSTRAINT third_pillars_nonnegative_money_chk;
-- ALTER TABLE person_profiles VALIDATE CONSTRAINT person_profiles_nonnegative_assets_chk;
-- ALTER TABLE life_insurance_policies VALIDATE CONSTRAINT life_insurance_nonnegative_chk;

COMMIT;

-- Optional precision hardening (review before execution):
-- Many existing monetary columns are DOUBLE PRECISION. For financial accuracy,
-- migrate them to NUMERIC(18,2) in dedicated migrations with data validation.
