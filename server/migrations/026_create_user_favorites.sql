-- Per-user opportunity favorites
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id        INTEGER NOT NULL REFERENCES users(id),
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);
