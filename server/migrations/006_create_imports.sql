CREATE TABLE IF NOT EXISTS imports (
  id                          SERIAL PRIMARY KEY,
  imported_at                 TIMESTAMPTZ DEFAULT now(),
  filename                    TEXT,
  row_count                   INTEGER,
  opportunities_added         INTEGER DEFAULT 0,
  opportunities_updated       INTEGER DEFAULT 0,
  opportunities_closed_lost   INTEGER DEFAULT 0,
  status                      TEXT CHECK (status IN ('success', 'partial', 'failed')),
  error_log                   TEXT
);
