-- AI job tracking: lets clients detect and resume in-progress AI generations
-- so a user navigating away mid-generation can come back and pick up the result.

CREATE TABLE IF NOT EXISTS ai_jobs (
  id                  SERIAL PRIMARY KEY,
  key                 TEXT NOT NULL,          -- matches ai_summary_cache.key (e.g. 'summary-123', 'call-prep-456')
  opportunity_id      INTEGER REFERENCES opportunities(id) ON DELETE CASCADE,
  feature             TEXT NOT NULL,          -- 'summary' | 'meddpicc-coach' | 'call-prep' | 'demo-prep' | 'tech-blockers' | 'agentic-qual' | 'one-on-one-narrative' | 'forecast-narrative' | 'forecast-bulk-summary'
  status              TEXT NOT NULL CHECK (status IN ('running','done','failed')),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  error               TEXT,
  started_by_user_id  INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ai_jobs_key_status_idx ON ai_jobs (key, status);
CREATE INDEX IF NOT EXISTS ai_jobs_started_at_idx ON ai_jobs (started_at DESC);
