CREATE TABLE IF NOT EXISTS tasks (
  id              SERIAL PRIMARY KEY,
  opportunity_id  INTEGER REFERENCES opportunities(id) NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'blocked')),
  is_next_step    BOOLEAN DEFAULT false,
  due_date        DATE,
  assigned_to_id  INTEGER REFERENCES users(id),
  created_by_id   INTEGER REFERENCES users(id),
  is_deleted      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_opportunity  ON tasks(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned     ON tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date     ON tasks(due_date);
