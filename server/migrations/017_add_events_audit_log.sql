-- Usage events (frontend-tracked: page views, feature interactions)
CREATE TABLE IF NOT EXISTS events (
  id           SERIAL PRIMARY KEY,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id   TEXT NOT NULL DEFAULT '',
  page         TEXT NOT NULL,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  metadata     JSONB
);

CREATE INDEX idx_events_user_id   ON events(user_id);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_page      ON events(page);
CREATE INDEX idx_events_action    ON events(action);

-- Audit log (backend-tracked: all mutations and admin actions)
-- This table is append-only; never UPDATE or DELETE rows.
CREATE TABLE IF NOT EXISTS audit_log (
  id             SERIAL PRIMARY KEY,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_role      TEXT NOT NULL DEFAULT '',
  action         TEXT NOT NULL,
  resource_type  TEXT NOT NULL,
  resource_id    TEXT NOT NULL DEFAULT '',
  resource_name  TEXT,
  before_value   JSONB,
  after_value    JSONB,
  ip_address     TEXT,
  session_id     TEXT,
  success        BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT
);

CREATE INDEX idx_audit_user_id   ON audit_log(user_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_action    ON audit_log(action);
CREATE INDEX idx_audit_resource  ON audit_log(resource_type, resource_id);
