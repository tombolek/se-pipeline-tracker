-- Deploy log: tracks in-app frontend deploys triggered from the admin page.
CREATE TABLE IF NOT EXISTS deploy_log (
  id           SERIAL PRIMARY KEY,
  triggered_by INTEGER REFERENCES users(id),
  triggered_at TIMESTAMPTZ DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'running', 'success', 'failed')),
  current_sha  TEXT,   -- SHA that was current when deploy started (from DEPLOY_SHA env)
  target_sha   TEXT,   -- SHA being deployed (latest GitHub master commit)
  log          TEXT[]  DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  error        TEXT
);
