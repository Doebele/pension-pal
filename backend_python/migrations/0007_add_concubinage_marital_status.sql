-- Add support for Swiss "Konkubinat" in personal status.
-- Safe to run multiple times.

ALTER TABLE person_profiles
ADD COLUMN IF NOT EXISTS marital_status_year INTEGER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maritalstatus') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'maritalstatus'
        AND e.enumlabel = 'concubinage'
    ) THEN
      ALTER TYPE maritalstatus ADD VALUE 'concubinage';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marital_status') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'marital_status'
        AND e.enumlabel = 'concubinage'
    ) THEN
      ALTER TYPE marital_status ADD VALUE 'concubinage';
    END IF;
  END IF;
END
$$;
