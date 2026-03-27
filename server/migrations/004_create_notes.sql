-- Append-only: no UPDATE or DELETE ever issued on this table
CREATE TABLE IF NOT EXISTS notes (
  id              SERIAL PRIMARY KEY,
  opportunity_id  INTEGER REFERENCES opportunities(id) NOT NULL,
  author_id       INTEGER REFERENCES users(id) NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_opportunity ON notes(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_notes_author      ON notes(author_id);
