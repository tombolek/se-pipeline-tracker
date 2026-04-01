ALTER TABLE users
  ADD COLUMN IF NOT EXISTS column_prefs JSONB DEFAULT NULL;

COMMENT ON COLUMN users.column_prefs IS
  'Per-user column visibility per page. Shape: { pipeline: string[], closed_lost: string[], se_mapping: string[] }. NULL = use app defaults.';
