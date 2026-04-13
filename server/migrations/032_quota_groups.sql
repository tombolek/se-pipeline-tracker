-- Quota groups for the % to Target report (Issue #94).
-- A "group" is a named bucket with a target ARR (USD) and a rule that decides
-- which Closed Won deals count toward it. Same deal can count in multiple groups.

CREATE TABLE IF NOT EXISTS quota_groups (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  rule_type     TEXT NOT NULL CHECK (rule_type IN ('global','teams','ae_owners')),
  rule_value    JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quota_groups_sort_idx ON quota_groups (sort_order);

-- Seed the four groups requested in #94. ON CONFLICT keeps re-runs idempotent.
INSERT INTO quota_groups (name, rule_type, rule_value, target_amount, sort_order) VALUES
  ('Global', 'global',    '[]'::jsonb,                              16000000, 1),
  ('NA',     'teams',     '["NA Enterprise","NA Strategic"]'::jsonb, 11400000, 2),
  ('INTL',   'teams',     '["EMEA","ANZ"]'::jsonb,                    6120000, 3),
  ('DACH',   'ae_owners', '["Thomas Miebach"]'::jsonb,                1500000, 4)
ON CONFLICT (name) DO NOTHING;
