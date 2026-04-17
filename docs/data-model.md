# Data Model

The core hierarchy: **Opportunity** (from Salesforce) → **Tasks / Next Steps** + **Notes**

## Key design rules

- `sf_opportunity_id` is the immutable reconciliation key for imports — never changes, never gets wiped.
- Imports update SF-owned fields only; tasks and notes are never touched by imports.
- The import contains **Open + Closed Won + Closed Lost** opportunities. Closed status is taken directly from SF: `Stage = 'Closed Won'` / `'Closed Lost'` + `Stage Date: Closed - Won/Lost`. An SF ID absent from a new import does **not** mean Closed Lost — it is treated as stale (SF delete/merge) and the opp is soft-hidden via `is_active=false` + `stale_since=now()`.
- `stage_changed_at` is tracked on every import — powers the Stage Movement view.
- `last_note_at` is updated only when a user adds a note — powers the Missing Notes view.
- `first_seen_at` records when a Closed Lost opp disappeared from imports — powers the "newest closed" sort.
- The `sf_raw_fields` JSONB column stores all 55 current SF fields plus any future additions — the schema never needs a migration just because a new SF field appears.
- `notes` is **append-only**: no UPDATE or DELETE is ever issued on that table.
- Soft deletes only for users, opportunities, and tasks — never `DELETE` from DB.

## Pipeline Stages (in order)

```
Qualify → Develop Solution → Build Value → Proposal Sent →
Submitted for Booking → Negotiate → Closed Won | Closed Lost
```

The default pipeline view shows **Build Value and above** (excluding Qualify). Users can toggle to include Qualify opportunities via a persistent preference (`users.show_qualify`).

## Tables

> Source of truth for column names and types is the migrations under `server/migrations/`. This section captures the *shape* and *why* — check migrations for current exact DDL.

### users
```sql
id              SERIAL PRIMARY KEY
email           TEXT UNIQUE NOT NULL
name            TEXT NOT NULL
password_hash   TEXT NOT NULL
role            TEXT NOT NULL CHECK (role IN ('manager', 'se'))
is_active       BOOLEAN DEFAULT true
show_qualify    BOOLEAN DEFAULT false   -- per-user pipeline filter preference
created_at      TIMESTAMPTZ DEFAULT now()
last_login_at   TIMESTAMPTZ
```

### opportunities
```sql
id                  SERIAL PRIMARY KEY
sf_opportunity_id   TEXT UNIQUE NOT NULL        -- immutable SF record ID
-- Core SF fields (always updated on import)
name                TEXT NOT NULL
account_id          TEXT                        -- SF Account ID
account_name        TEXT
account_segment     TEXT                        -- Enterprise / Commercial / etc.
account_industry    TEXT
stage               TEXT NOT NULL
record_type         TEXT                        -- New Logo / Upsell / Cross-Sell / Services / Renewal
close_date          DATE
close_month         DATE
fiscal_period       TEXT
fiscal_year         TEXT
arr                 NUMERIC(15,2)               -- Annualized ARR
arr_currency        TEXT DEFAULT 'USD'
arr_converted       NUMERIC(15,2)               -- Annualized ARR (converted)
ae_owner_name       TEXT                        -- Opportunity Owner
team                TEXT                        -- NA Enterprise / EMEA / etc.
deploy_mode         TEXT                        -- PaaS+ / SaaS / etc.
deploy_location     TEXT
key_deal            BOOLEAN DEFAULT false
sales_plays         TEXT
lead_source         TEXT
opportunity_source  TEXT
channel_source      TEXT
biz_dev             TEXT
-- MEDDPICC & deal context fields
next_step_sf        TEXT                        -- SF "Next Step" field (free text from AE)
manager_comments    TEXT
se_comments             TEXT                    -- Sales Engineering Comments
se_comments_updated_at  TIMESTAMPTZ             -- set on import when se_comments value changes; drives freshness signal
manager_comments_updated_at TIMESTAMPTZ         -- same for manager comments
psm_comments        TEXT
technical_blockers  TEXT                        -- "Technical Blockers/Risk" field — not in current export, will auto-populate from sf_raw_fields when present
budget              TEXT
authority           TEXT
need                TEXT
timeline            TEXT
metrics             TEXT
economic_buyer      TEXT
decision_criteria   TEXT
decision_process    TEXT
paper_process       TEXT
implicate_pain      TEXT
champion            TEXT
engaged_competitors TEXT
agentic_qual        TEXT
-- Partner fields
sourcing_partner    TEXT
sourcing_partner_tier TEXT
influencing_partner TEXT
partner_manager     TEXT
-- PoC fields
poc_status          TEXT
poc_start_date      DATE
poc_end_date        DATE
poc_type            TEXT
poc_deploy_type     TEXT
-- RFx
rfx_status          TEXT
-- Extensibility: all raw SF fields stored as JSONB for future fields
sf_raw_fields       JSONB
-- App-managed fields (never overwritten by import)
se_owner_id         INTEGER REFERENCES users(id)
stage_changed_at    TIMESTAMPTZ
previous_stage      TEXT
last_note_at        TIMESTAMPTZ
first_seen_at       TIMESTAMPTZ DEFAULT now()   -- when opp first appeared in an import
-- Closed Lost tracking
is_closed_lost      BOOLEAN DEFAULT false
closed_at           TIMESTAMPTZ                 -- when it disappeared from import (= closed date)
closed_lost_seen    BOOLEAN DEFAULT false       -- false = "unread" on Closed Lost tab
-- Soft delete safety net
is_active           BOOLEAN DEFAULT true
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
```

### tasks
```sql
id              SERIAL PRIMARY KEY
opportunity_id  INTEGER REFERENCES opportunities(id) NOT NULL
title           TEXT NOT NULL
description     TEXT
status          TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','done','blocked'))
is_next_step    BOOLEAN DEFAULT false
due_date        DATE
assigned_to_id  INTEGER REFERENCES users(id)
created_by_id   INTEGER REFERENCES users(id)
is_deleted      BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

### notes
```sql
id              SERIAL PRIMARY KEY
opportunity_id  INTEGER REFERENCES opportunities(id) NOT NULL
author_id       INTEGER REFERENCES users(id) NOT NULL
content         TEXT NOT NULL
created_at      TIMESTAMPTZ DEFAULT now()
-- Append-only: no UPDATE or DELETE ever issued on this table
```

### inbox_items
```sql
id              SERIAL PRIMARY KEY
user_id         INTEGER REFERENCES users(id) NOT NULL   -- always personal, not shared
text            TEXT NOT NULL
type            TEXT DEFAULT 'note' CHECK (type IN ('note', 'todo'))
status          TEXT DEFAULT 'open' CHECK (status IN ('open', 'done', 'converted'))
opportunity_id  INTEGER REFERENCES opportunities(id)    -- set when linked
converted_to    TEXT                                    -- 'task' | 'note' — set when promoted
converted_id    INTEGER                                 -- FK to tasks.id or notes.id after conversion
source          TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'email', 'slack'))
source_ref      TEXT                                    -- original message ID for email/slack (v2)
is_deleted      BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

### imports
```sql
imported_at                 TIMESTAMPTZ DEFAULT now()
filename                    TEXT
row_count                   INTEGER
opportunities_added         INTEGER DEFAULT 0
opportunities_updated       INTEGER DEFAULT 0
opportunities_closed_lost   INTEGER DEFAULT 0
status                      TEXT CHECK (status IN ('success','partial','failed'))
error_log                   TEXT
```
