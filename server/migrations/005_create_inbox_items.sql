CREATE TABLE IF NOT EXISTS inbox_items (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) NOT NULL,
  text            TEXT NOT NULL,
  type            TEXT DEFAULT 'note' CHECK (type IN ('note', 'todo')),
  status          TEXT DEFAULT 'open' CHECK (status IN ('open', 'done', 'converted')),
  opportunity_id  INTEGER REFERENCES opportunities(id),
  converted_to    TEXT,
  converted_id    INTEGER,
  source          TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'email', 'slack')),
  source_ref      TEXT,
  is_deleted      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_user_id ON inbox_items(user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_status  ON inbox_items(status);
