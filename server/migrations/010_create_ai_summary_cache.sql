CREATE TABLE IF NOT EXISTS ai_summary_cache (
  key           TEXT PRIMARY KEY,
  content       TEXT NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
