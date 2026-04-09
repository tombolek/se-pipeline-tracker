-- Knowledge Base tables for CVS/CPP proof points and platform differentiators

CREATE TABLE IF NOT EXISTS kb_proof_points (
  id              SERIAL PRIMARY KEY,
  customer_name   TEXT NOT NULL,
  about           TEXT,
  vertical        TEXT NOT NULL,          -- e.g. 'Finance — Banking & Credit Unions'
  sub_vertical    TEXT,                   -- e.g. 'Banking'
  products        TEXT[] NOT NULL DEFAULT '{}',  -- e.g. {'DQ','MDM','RDM'}
  initiatives     TEXT[] NOT NULL DEFAULT '{}',  -- e.g. {'Regulatory Compliance Reporting','Customer 360'}
  proof_point_text TEXT NOT NULL,         -- full narrative
  region          TEXT,                   -- derived from customer/about if available
  outcomes_summary TEXT,                  -- key metrics/outcomes extracted
  source_file     TEXT,                   -- which MD file this came from
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kb_proof_points_customer_name_idx ON kb_proof_points (customer_name);

CREATE TABLE IF NOT EXISTS kb_differentiators (
  id                      SERIAL PRIMARY KEY,
  name                    TEXT NOT NULL,        -- e.g. 'Data Quality at Scale'
  tagline                 TEXT,
  core_message            TEXT,
  capabilities_text       TEXT,                 -- full capabilities section as text
  need_signals            TEXT[] NOT NULL DEFAULT '{}',  -- prospect signals array
  proof_points_json       JSONB,               -- proof points table as JSON array
  competitive_positioning TEXT,                 -- competitive context
  source_file             TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kb_differentiators_name_idx ON kb_differentiators (name);

CREATE TABLE IF NOT EXISTS kb_import_log (
  id              SERIAL PRIMARY KEY,
  file_name       TEXT NOT NULL,
  record_type     TEXT NOT NULL CHECK (record_type IN ('proof_point', 'differentiator')),
  record_count    INTEGER NOT NULL DEFAULT 0,
  imported_at     TIMESTAMPTZ DEFAULT now()
);
