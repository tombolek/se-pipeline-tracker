-- 052: AI Agents — first-class registry for the app's AI features.
--
-- Each feature string previously used in ai_jobs.feature + callAnthropic({feature:...})
-- now has a matching row in agents. Admins can:
--   • toggle the agent on/off
--   • edit an optional system_prompt_extra appended to the ground-rules prompt
--   • toggle log_io (whether prompt + response are persisted on each job)
--   • adjust default model and max_tokens per agent
--
-- Prompts stay authored in code for now; agent_prompt_versions captures the
-- history of admin edits to system_prompt_extra + settings, with who / when /
-- an optional note. The active version is pointed to by agents.active_version_id.
--
-- ai_jobs is extended with columns needed for the admin surface:
--   agent_id, model, input/output tokens, duration, PII counts, prompt/response
--   text (only populated when the owning agent has log_io = true), and a
--   'killed' status for jobs aborted via the admin Running Jobs view.

CREATE TABLE IF NOT EXISTS agents (
  id                   SERIAL PRIMARY KEY,
  feature              TEXT NOT NULL UNIQUE,  -- matches callAnthropic({feature}) and ai_jobs.feature
  name                 TEXT NOT NULL,
  description          TEXT NOT NULL,
  default_model        TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  default_max_tokens   INTEGER NOT NULL DEFAULT 800,
  is_enabled           BOOLEAN NOT NULL DEFAULT true,
  log_io               BOOLEAN NOT NULL DEFAULT false,
  -- Edited system-prompt extra, appended to the shared SYSTEM_PROMPT in aiClient.ts.
  -- Empty string = no extra guidance (default).
  system_prompt_extra  TEXT NOT NULL DEFAULT '',
  active_version_id    INTEGER,               -- FK added after agent_prompt_versions exists
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agents_feature_idx ON agents (feature);

-- Version history for admin-authored edits. Every change to
-- system_prompt_extra / default_model / default_max_tokens / is_enabled / log_io
-- creates a new row, so audit + revert is trivial.
CREATE TABLE IF NOT EXISTS agent_prompt_versions (
  id                    SERIAL PRIMARY KEY,
  agent_id              INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  system_prompt_extra   TEXT NOT NULL DEFAULT '',
  default_model         TEXT NOT NULL,
  default_max_tokens    INTEGER NOT NULL,
  is_enabled            BOOLEAN NOT NULL,
  log_io                BOOLEAN NOT NULL,
  note                  TEXT,                      -- optional "why I changed this" from admin
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS agent_prompt_versions_agent_idx
  ON agent_prompt_versions (agent_id, created_at DESC);

ALTER TABLE agents
  ADD CONSTRAINT agents_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES agent_prompt_versions(id) ON DELETE SET NULL;

-- ── Extend ai_jobs ────────────────────────────────────────────────────────────

ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS agent_id          INTEGER REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS model             TEXT;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS input_tokens      INTEGER;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS output_tokens     INTEGER;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS duration_ms       INTEGER;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS prompt_text       TEXT;   -- only set when agent.log_io = true
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS response_text     TEXT;   -- only set when agent.log_io = true
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS pii_counts        JSONB;  -- { email: N, phone: N }
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS stop_reason       TEXT;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS killed_at         TIMESTAMPTZ;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS killed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Widen status to allow 'killed'. Drop the old constraint if it exists
-- (name chosen by PG when the table was created without an explicit name).
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
    FROM pg_constraint
    WHERE conrelid = 'ai_jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_jobs DROP CONSTRAINT %I', con_name);
  END IF;
END$$;

ALTER TABLE ai_jobs
  ADD CONSTRAINT ai_jobs_status_check
  CHECK (status IN ('running', 'done', 'failed', 'killed'));

CREATE INDEX IF NOT EXISTS ai_jobs_agent_id_idx ON ai_jobs (agent_id, started_at DESC);

-- ── Seed agents for every AI feature currently in the codebase ────────────────

INSERT INTO agents (feature, name, description, default_max_tokens) VALUES
  ('summary',                'Opportunity Summary',           'Three-paragraph summary (status / risks / recommended next action) shown on the opportunity drawer.',               400),
  ('meddpicc-coach',         'MEDDPICC Gap Coach',            'Identifies weak or missing MEDDPICC slots for an opportunity and suggests discovery actions.',                      1200),
  ('process-notes',          'Process Call Notes',            'Turns a raw call / meeting transcript into structured notes, tasks, and MEDDPICC updates.',                          2400),
  ('call-prep',              'Pre-call Brief',                'Generates a briefing document the SE uses to prep for an upcoming customer call.',                                    1800),
  ('demo-prep',              'Demo Prep',                     'Preps a scripted demo tailored to the opportunity''s stage, products, and known champions.',                         1800),
  ('similar-deals-insights', 'Similar Deals Insights',        'Finds closed-won/lost deals resembling the current one and extracts patterns worth applying.',                        1200),
  ('kb-playbook',            'Knowledge-Base Playbook',       'Pulls the relevant KB articles for a situation and composes a step-by-step playbook the SE can follow.',              1600),
  ('tech-blockers',          'Tech Blockers Rollup',          'Manager-level summary of technical blockers across the open pipeline.',                                                1600),
  ('agentic-qual',           'Agentic Qualification',         'Manager-level view scoring each open deal on qualification health signals.',                                           1600),
  ('one-on-one-narrative',   '1:1 Prep Narrative',            'Per-SE narrative used to prep the manager for a 1:1 — what moved, what''s stuck, what to discuss.',                   1800),
  ('forecast-narrative',     'Forecast Narrative',            'Narrative commentary for the manager''s forecasting brief — overall pipeline health and risks.',                      1800),
  ('forecast-bulk-summary',  'Forecast Per-Deal Summary',     'Short per-deal summaries used inside the Forecasting Brief to avoid re-running the full Opportunity Summary.',       300)
ON CONFLICT (feature) DO NOTHING;

-- Seed an initial version row per agent so agents.active_version_id always
-- points somewhere — simpler than having NULL-handling everywhere in the UI.
INSERT INTO agent_prompt_versions (agent_id, system_prompt_extra, default_model, default_max_tokens, is_enabled, log_io, note)
SELECT a.id, a.system_prompt_extra, a.default_model, a.default_max_tokens, a.is_enabled, a.log_io, 'Seeded on first migration'
FROM agents a
WHERE NOT EXISTS (SELECT 1 FROM agent_prompt_versions v WHERE v.agent_id = a.id);

UPDATE agents a
SET active_version_id = v.id
FROM (
  SELECT DISTINCT ON (agent_id) id, agent_id
  FROM agent_prompt_versions
  ORDER BY agent_id, created_at DESC, id DESC
) v
WHERE v.agent_id = a.id AND a.active_version_id IS NULL;

-- Backfill ai_jobs.agent_id from ai_jobs.feature for rows predating this migration.
UPDATE ai_jobs j
SET agent_id = a.id
FROM agents a
WHERE j.agent_id IS NULL AND j.feature = a.feature;

-- ── Role access: admin-only pages ────────────────────────────────────────────
INSERT INTO role_page_access (page_key, role) VALUES
  ('settings/agents',   'manager'),
  ('settings/ai-jobs',  'manager'),
  ('settings/ai-usage', 'manager')
ON CONFLICT DO NOTHING;
