CREATE TABLE IF NOT EXISTS opportunity_field_history (
  id             SERIAL PRIMARY KEY,
  opportunity_id INTEGER REFERENCES opportunities(id) NOT NULL,
  import_id      INTEGER REFERENCES imports(id) ON DELETE CASCADE,
  field_name     TEXT NOT NULL CHECK (field_name IN ('se_comments', 'next_step_sf')),
  old_value      TEXT,
  new_value      TEXT,
  changed_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_history_opp_field
  ON opportunity_field_history (opportunity_id, field_name, changed_at DESC);
