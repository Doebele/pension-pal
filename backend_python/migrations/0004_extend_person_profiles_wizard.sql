ALTER TABLE person_profiles
ADD COLUMN IF NOT EXISTS has_property BOOLEAN;

ALTER TABLE person_profiles
ADD COLUMN IF NOT EXISTS property_details JSONB;

ALTER TABLE person_profiles
ADD COLUMN IF NOT EXISTS pillar_3a_accounts JSONB;

ALTER TABLE person_profiles
ADD COLUMN IF NOT EXISTS foreign_currency_assets JSONB;
