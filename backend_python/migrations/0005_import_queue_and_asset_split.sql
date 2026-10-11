ALTER TABLE person_profiles
ADD COLUMN IF NOT EXISTS cash_assets JSONB;

ALTER TABLE person_profiles
ADD COLUMN IF NOT EXISTS investment_assets JSONB;

CREATE TABLE IF NOT EXISTS import_queue_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  suggested_doc_type VARCHAR(100),
  target_field_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_queue_items_user_id
ON import_queue_items(user_id);
