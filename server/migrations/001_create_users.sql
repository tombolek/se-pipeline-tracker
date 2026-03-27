CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('manager', 'se')),
  is_active       BOOLEAN DEFAULT true,
  show_qualify    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);
