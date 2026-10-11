-- Adds BVG mortgage repayment parameters to scenarios.
-- Safe to run multiple times on PostgreSQL.

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS bvg_mortgage_repayment_amount_per_year DOUBLE PRECISION;

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS bvg_mortgage_repayment_total_amount DOUBLE PRECISION;
