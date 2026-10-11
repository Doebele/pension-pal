ALTER TABLE severance_plans
ADD COLUMN IF NOT EXISTS provider_preset VARCHAR(32);
