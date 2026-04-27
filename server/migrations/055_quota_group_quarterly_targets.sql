-- Quarterly quota targets per group, per fiscal year.
-- Annual `quota_groups.target_amount` stays as the fallback when a quarter is
-- blank. Storing per (group, fiscal_year, quarter) so historic FYs are preserved
-- — important for the "% to target by quarter" view across past + current.

CREATE TABLE IF NOT EXISTS quota_group_quarterly_targets (
  id              SERIAL PRIMARY KEY,
  quota_group_id  INTEGER NOT NULL REFERENCES quota_groups(id) ON DELETE CASCADE,
  fiscal_year     TEXT NOT NULL,                                  -- e.g. 'FY2026'
  quarter         SMALLINT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  target_amount   NUMERIC(15,2) NOT NULL CHECK (target_amount >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quota_group_id, fiscal_year, quarter)
);

CREATE INDEX IF NOT EXISTS quota_group_quarterly_targets_group_idx
  ON quota_group_quarterly_targets (quota_group_id);

CREATE INDEX IF NOT EXISTS quota_group_quarterly_targets_fy_idx
  ON quota_group_quarterly_targets (fiscal_year);
