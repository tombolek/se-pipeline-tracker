CREATE TABLE IF NOT EXISTS opportunities (
  id                          SERIAL PRIMARY KEY,
  sf_opportunity_id           TEXT UNIQUE NOT NULL,

  -- Core SF fields (updated on every import)
  name                        TEXT NOT NULL,
  account_id                  TEXT,
  account_name                TEXT,
  account_segment             TEXT,
  account_industry            TEXT,
  stage                       TEXT NOT NULL,
  record_type                 TEXT,
  close_date                  DATE,
  close_month                 DATE,
  fiscal_period               TEXT,
  fiscal_year                 TEXT,
  arr                         NUMERIC(15,2),
  arr_currency                TEXT DEFAULT 'USD',
  arr_converted               NUMERIC(15,2),
  ae_owner_name               TEXT,
  team                        TEXT,
  deploy_mode                 TEXT,
  deploy_location             TEXT,
  key_deal                    BOOLEAN DEFAULT false,
  sales_plays                 TEXT,
  lead_source                 TEXT,
  opportunity_source          TEXT,
  channel_source              TEXT,
  biz_dev                     TEXT,

  -- MEDDPICC & deal context
  next_step_sf                TEXT,
  manager_comments            TEXT,
  manager_comments_updated_at TIMESTAMPTZ,
  se_comments                 TEXT,
  se_comments_updated_at      TIMESTAMPTZ,
  psm_comments                TEXT,
  technical_blockers          TEXT,
  budget                      TEXT,
  authority                   TEXT,
  need                        TEXT,
  timeline                    TEXT,
  metrics                     TEXT,
  economic_buyer              TEXT,
  decision_criteria           TEXT,
  decision_process            TEXT,
  paper_process               TEXT,
  implicate_pain              TEXT,
  champion                    TEXT,
  engaged_competitors         TEXT,
  agentic_qual                TEXT,

  -- Partner fields
  sourcing_partner            TEXT,
  sourcing_partner_tier       TEXT,
  influencing_partner         TEXT,
  partner_manager             TEXT,

  -- PoC fields
  poc_status                  TEXT,
  poc_start_date              DATE,
  poc_end_date                DATE,
  poc_type                    TEXT,
  poc_deploy_type             TEXT,

  -- RFx
  rfx_status                  TEXT,

  -- Extensibility: all raw SF fields stored as JSONB
  sf_raw_fields               JSONB,

  -- App-managed fields (never overwritten by import)
  se_owner_id                 INTEGER REFERENCES users(id),
  stage_changed_at            TIMESTAMPTZ,
  previous_stage              TEXT,
  last_note_at                TIMESTAMPTZ,
  first_seen_at               TIMESTAMPTZ DEFAULT now(),

  -- Closed Lost tracking
  is_closed_lost              BOOLEAN DEFAULT false,
  closed_at                   TIMESTAMPTZ,
  closed_lost_seen            BOOLEAN DEFAULT false,

  -- Soft delete
  is_active                   BOOLEAN DEFAULT true,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_sf_id     ON opportunities(sf_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage     ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_se_owner  ON opportunities(se_owner_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_is_active ON opportunities(is_active);
CREATE INDEX IF NOT EXISTS idx_opportunities_closed    ON opportunities(is_closed_lost);
