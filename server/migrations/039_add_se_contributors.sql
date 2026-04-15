-- 039: SE Contributors on opportunities (Issue #104).
--
-- Each opportunity has zero or more contributors in addition to its single
-- SE Owner. Used for future ARR-contribution reporting and "who is helping
-- where" visibility. Cross-team by design — contributors are not scoped to
-- the opportunity's region.

CREATE TABLE IF NOT EXISTS opportunity_se_contributors (
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  added_by_id    INTEGER REFERENCES users(id),
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, user_id)
);

CREATE INDEX IF NOT EXISTS opp_se_contributors_user_idx
  ON opportunity_se_contributors(user_id);
