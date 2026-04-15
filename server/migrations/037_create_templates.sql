-- 037: Task & note templates for opportunities.
--
-- Two kinds:
--   'task_pack' — a set of tasks created in one click; `items` is a JSONB array
--                of { title, description?, is_next_step?, due_offset_days? }.
--                A single-item pack == a single task template.
--   'note'     — a reusable note body; `body` is the text to append.
--
-- Optional `stage` scopes a template to a pipeline stage (NULL = any stage).
-- Soft-deleted rows stay in the DB so in-flight references keep their labels.

CREATE TABLE IF NOT EXISTS templates (
  id             SERIAL PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('task_pack', 'note')),
  name           TEXT NOT NULL,
  description    TEXT,
  body           TEXT,                        -- used for kind='note'
  items          JSONB,                       -- used for kind='task_pack'
  stage          TEXT,
  is_deleted     BOOLEAN NOT NULL DEFAULT false,
  created_by_id  INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS templates_kind_idx  ON templates(kind) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS templates_stage_idx ON templates(stage) WHERE is_deleted = false;
