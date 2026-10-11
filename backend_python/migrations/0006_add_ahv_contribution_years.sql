CREATE TABLE IF NOT EXISTS ahv_contribution_years (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  annual_income_chf DOUBLE PRECISION,
  contribution_total_chf DOUBLE PRECISION,
  age_end_of_year INTEGER,
  ahv_rent_share_chf DOUBLE PRECISION,
  source VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ahv_contribution_years_user_id
ON ahv_contribution_years(user_id);

CREATE INDEX IF NOT EXISTS idx_ahv_contribution_years_user_year
ON ahv_contribution_years(user_id, year);
