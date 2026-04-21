-- 044: Structured Technical Discovery storage per opportunity.
--
-- Backs the new "Tech Discovery" tab in the opportunity drawer. Inspired by
-- the internal Technical Discovery Document template: prose notes for
-- open-ended discovery topics, boolean-ish flags for data initiatives,
-- JSONB for the tech stack checklists (easy to evolve without migrations),
-- plus per-system "specify which tool" fields for enterprise apps and
-- existing data-management tools.
--
-- 1:1 with opportunities.id. Rows are created lazily on first edit via the
-- PATCH endpoint's INSERT … ON CONFLICT DO UPDATE pattern. No soft-delete —
-- it's 1:1 and cascades with the parent opportunity.
--
-- Diagram storage (current/proposed state) is deliberately out of scope for
-- v1; it ships alongside #139 (RFP document upload) when we have the S3 +
-- signed-URL infrastructure.

CREATE TABLE IF NOT EXISTS opportunity_tech_discovery (
  opportunity_id              INTEGER PRIMARY KEY REFERENCES opportunities(id) ON DELETE CASCADE,

  -- Prose sections (from template slides 3/4)
  current_incumbent_solutions TEXT,
  tier1_integrations          TEXT,
  data_details_and_users      TEXT,
  ingestion_sources           TEXT,
  planned_ingestion_sources   TEXT,
  data_cleansing_remediation  TEXT,
  deployment_preference       TEXT,
  technical_constraints       TEXT,
  open_technical_requirements TEXT,

  -- Structured checklists (slides 5-9)
  -- Shape notes (JSONB to allow the option list to evolve without a migration):
  --   initiatives       → { data_mesh: true, cloud_migration: true, ..., other_text: "..." }
  --   tech_stack        → { data_infrastructure: ["aws","hybrid"], data_warehouse: ["snowflake"],
  --                         database: ["postgres","oracle"], etl: ["dbt"], bi: ["tableau"], ...,
  --                         other_specify: { database: "CockroachDB", ... } }
  --   enterprise_systems → { crm: "Salesforce", erp: "SAP", hr: "Workday", ... }
  --   existing_dmg      → { catalog: "Alation", dq: "Informatica DQ", mdm: "", lineage: "Manta" }
  initiatives       JSONB NOT NULL DEFAULT '{}'::jsonb,
  tech_stack        JSONB NOT NULL DEFAULT '{}'::jsonb,
  enterprise_systems JSONB NOT NULL DEFAULT '{}'::jsonb,
  existing_dmg      JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Bookkeeping
  updated_by_id     INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIN indexes power the "similar deals by tech stack overlap" scoring and
-- future manager insights like "all deals on Snowflake" or "anyone
-- competing against an Informatica PowerCenter incumbent".
CREATE INDEX IF NOT EXISTS idx_tech_discovery_tech_stack  ON opportunity_tech_discovery USING GIN (tech_stack);
CREATE INDEX IF NOT EXISTS idx_tech_discovery_initiatives ON opportunity_tech_discovery USING GIN (initiatives);
