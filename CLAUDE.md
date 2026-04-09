# SE Team Pipeline Tracker — Project Specification
> Version 1.0 | Greenfield | For use with Claude Code

---

## 1. What We're Building

A browser-based tool for an SE Manager and their team to track tasks, next steps, and activity against Salesforce opportunities. Salesforce is the source of deal data (read-only, imported via CSV). Everything else — tasks, notes, assignments — lives natively in this tool.

**The problem it solves:** SEs and their manager need a focused, fast workspace to manage deal-level activity without living inside Salesforce. It should surface what needs attention, who owns what, and what's falling through the cracks.

---

## 2. Users & Roles

| Role | Access |
|------|--------|
| **SE Manager** | Full visibility + admin controls: manage users, trigger imports, access all manager intelligence views, assign SEs to deals |
| **SE (Individual)** | Full visibility, manage own tasks and next steps, add notes to any opportunity |

Everyone sees everything. Manager has extra controls on top.

**Auth:** Username/password with JWT session tokens (so users stay logged in). Architecture must support Google SSO later (Ataccama Google Workspace accounts).

---

## 3. Technology Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React + TypeScript + Vite | Fast, typed, excellent Claude Code support |
| Styling | Tailwind CSS | Easy brand theming, no CSS sprawl |
| Backend | Node.js + Express | Lightweight, containerizes trivially |
| Database | PostgreSQL (via Docker) | Production-grade, migrates directly to AWS RDS or Azure DB |
| Auth | JWT + bcrypt | Stateless sessions, provider-agnostic (Google SSO slot built in) |
| AI Summaries | Anthropic Claude API (`claude-sonnet-4-20250514`) | Same API key as Claude Code |
| Containers | Docker + Docker Compose | One command to start everything; same containers go to cloud |
| Version Control | Git + GitHub (private repo) | Standard |

### Dev Environment: Windows + WSL2
Claude Code and Docker both run best on Windows via WSL2. The developer has no prior Docker experience — setup instructions must be explicit and step-by-step.

**Required one-time setup (manual, before Claude Code starts):**
1. Install WSL2: `wsl --install -d Ubuntu-22.04` in PowerShell (Admin), then restart
2. Install Docker Desktop for Windows — enable WSL2 backend, enable Ubuntu-22.04 integration
3. Inside Ubuntu terminal: install nvm → Node.js v20+, Git, GitHub CLI

> **On Docker performance:** PostgreSQL container uses ~50-100MB RAM at idle. Negligible on a modern laptop.

> **First-time Docker user:** Claude Code must include a `README.md` with step-by-step setup instructions written for someone who has never used Docker. Each command should be on its own line with a plain-English explanation of what it does. Setup should be achievable with a single `docker compose up -d` after the one-time WSL2 + Docker Desktop install. Include a verification step (`docker ps`, `psql` connection check) so the user knows it's working before writing any app code.

---

## 4. Data Model

The core hierarchy: **Opportunity** (from Salesforce) → **Tasks / Next Steps** + **Notes**

### Key design rules
- `sf_opportunity_id` is the immutable reconciliation key for imports — never changes, never gets wiped
- Imports update SF-owned fields only; tasks and notes are never touched by imports
- The import always contains **Open opportunities only**. An SF ID absent from a new import = the deal closed (set `closed_at = now()`, `is_closed_lost = true`)
- `stage_changed_at` is tracked on every import — powers the Stage Movement view
- `last_note_at` is updated only when a user adds a note — powers the Missing Notes view
- `first_seen_at` records when a Closed Lost opp disappeared from imports — powers the "newest closed" sort
- The `sf_raw_fields` JSONB column stores all 55 current SF fields plus any future additions — the schema never needs a migration just because a new SF field appears

### Pipeline Stages (in order)
```
Qualify → Develop Solution → Build Value → Proposal Sent →
Submitted for Booking → Negotiate → Closed Won | Closed Lost
```
The default pipeline view shows **Build Value and above** (excluding Qualify). Users can toggle to include Qualify opportunities via a persistent preference.

---

### Tables

**users**
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

**opportunities**
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

**tasks**
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

**notes**
```sql
id              SERIAL PRIMARY KEY
opportunity_id  INTEGER REFERENCES opportunities(id) NOT NULL
author_id       INTEGER REFERENCES users(id) NOT NULL
content         TEXT NOT NULL
created_at      TIMESTAMPTZ DEFAULT now()
-- Append-only: no UPDATE or DELETE ever issued on this table
```

**inbox_items**
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

**imports**
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

---

## 5. Salesforce Import Pipeline

Salesforce data comes in via export of a pre-built Opportunities report (currently `.xls` format — Salesforce exports as HTML-in-XLS, so the parser must use an HTML table reader, not a native XLS parser).

**The import always contains Open opportunities only.** There is no "Closed" status in the feed — a deal is Closed Lost when its SF ID stops appearing.

### Confirmed SF Export Columns (55 fields)
All 55 columns must be ingested. Map them to the `opportunities` table as defined in Section 4. Store the full row as `sf_raw_fields` JSONB regardless, so future new columns are automatically preserved without a schema migration.

| SF Column | DB Field |
|-----------|----------|
| Opportunity ID | `sf_opportunity_id` |
| Account ID | `account_id` |
| Account Name | `account_name` |
| Account Segment | `account_segment` |
| Account Industry | `account_industry` |
| Target Account | `key_deal` |
| Opportunity Name | `name` |
| Close Date | `close_date` |
| Close Month | `close_month` |
| Fiscal Period | `fiscal_period` |
| Fiscal Year | `fiscal_year` |
| Annualized ARR Currency | `arr_currency` |
| Annualized ARR | `arr` |
| Annualized ARR (converted) Currency | _(stored in sf_raw_fields)_ |
| Annualized ARR (converted) | `arr_converted` |
| Opportunity Owner | `ae_owner_name` |
| Opportunity Record Type | `record_type` |
| Team | `team` |
| DeployMode | `deploy_mode` |
| DeployLoc | `deploy_location` |
| Stage | `stage` |
| Key Deal | `key_deal` |
| Potential Pull Forward | _(sf_raw_fields)_ |
| Sales Plays | `sales_plays` |
| Lead Source | `lead_source` |
| Opportunity Source | `opportunity_source` |
| Channel Source (Grouped) | `channel_source` |
| BizDev | `biz_dev` |
| Next Step | `next_step_sf` |
| Manager Comments | `manager_comments` |
| Sales Engineering Comments | `se_comments` |
| PSM Comments | `psm_comments` |
| Budget | `budget` |
| Authority | `authority` |
| Need | `need` |
| Timeline | `timeline` |
| Metrics | `metrics` |
| Economic Buyer | `economic_buyer` |
| Decision Criteria | `decision_criteria` |
| Decision Process | `decision_process` |
| Paper Process | `paper_process` |
| Implicate the Pain | `implicate_pain` |
| Champion | `champion` |
| Engaged Competitors | `engaged_competitors` |
| Agentic Qualification | `agentic_qual` |
| Sourcing Partner | `sourcing_partner` |
| Sourcing Partner - Internal Tier | `sourcing_partner_tier` |
| Influencing Partner | `influencing_partner` |
| Partner Manager | `partner_manager` |
| PoC Status | `poc_status` |
| PoC Estimated Start Date | `poc_start_date` |
| PoC Estimated End Date | `poc_end_date` |
| PoC Type | `poc_type` |
| PoC Deployment Type | `poc_deploy_type` |
| RFx Status | `rfx_status` |

### Reconciliation Logic
1. Parse the file as HTML table (not XLS binary) — Salesforce exports use HTML-in-XLS format
2. Match every incoming row on `sf_opportunity_id`
3. **Match found:** update all SF-owned fields; if `stage` changed → set `stage_changed_at = now()`, `previous_stage = old_stage`; if `se_comments` value changed → set `se_comments_updated_at = now()`; if `manager_comments` changed → set `manager_comments_updated_at = now()`; never touch `se_owner_id`, `last_note_at`, tasks, or notes
4. **New SF ID:** insert new opportunity record, set `first_seen_at = now()`
5. **SF ID missing from import (was present before):** this deal is now Closed Lost → set `is_closed_lost = true`, `closed_at = now()`, `closed_lost_seen = false` (triggers "unread" badge), `is_active = false`
6. Store the complete raw row in `sf_raw_fields` JSONB on every import — this handles future new SF columns automatically
7. Log everything to the `imports` table

### Future New SF Columns
When Salesforce adds new fields to the report, they automatically land in `sf_raw_fields`. To promote a new field to a dedicated column later: add a migration, backfill from `sf_raw_fields`, update the import mapper. No data is ever lost.

**Import endpoint:** `POST /api/v1/opportunities/import` — accepts both manual file upload (multipart/form-data) AND programmatic POST, so future automation (Cowork/scheduled script) can trigger it directly.

### First Import (Bootstrapping)
The very first import should contain **open opportunities only** — no Closed Lost records. This establishes the baseline. From the second import onwards, any SF ID absent from the feed is treated as newly Closed Lost and triggers the unread badge. Claude Code should enforce this expectation in the setup instructions and seed script documentation.

---

## 6. API Routes

All routes require JWT auth except `/auth/login`. Prefix: `/api/v1/`

```
# Auth
POST   /auth/login
POST   /auth/logout
GET    /auth/me

# Opportunities (open pipeline)
GET    /opportunities                    ?stage=&se_owner=&search=&sort=&include_qualify=true|false
GET    /opportunities/:id                (includes tasks + notes)
PATCH  /opportunities/:id                (se_owner only — Manager)
POST   /opportunities/import             (file upload or raw POST — Manager)
GET    /opportunities/import/history     (Manager)

# Closed Lost
GET    /opportunities/closed-lost        sorted by closed_at DESC; includes unread count
POST   /opportunities/closed-lost/mark-read   body: { ids: [...] }  — marks as seen

# Tasks
GET    /tasks                            (my tasks — current user)
POST   /opportunities/:id/tasks
PATCH  /tasks/:id
DELETE /tasks/:id                        (soft delete)

# Notes
GET    /opportunities/:id/notes
POST   /opportunities/:id/notes          (append-only)

# Manager Intelligence
GET    /insights/stage-movement          ?days=7|14|30
GET    /insights/missing-notes           ?threshold_days=
GET    /insights/team-workload
GET    /insights/overdue-tasks

# AI
POST   /opportunities/:id/summary        (calls Claude API)

# Inbox
GET    /inbox                            (current user's items, status=open)
POST   /inbox                            (create jot — text, type, optional opportunity_id)
PATCH  /inbox/:id                        (edit text, mark done)
POST   /inbox/:id/convert                (link to opp + convert to task or note)
DELETE /inbox/:id                        (soft delete)

# Settings (Manager only)
GET    /users
POST   /users
PATCH  /users/:id
DELETE /users/:id                        (deactivate — soft)

# User preferences
PATCH  /users/me/preferences             body: { show_qualify: true|false }
```

**Response envelope** (use consistently everywhere):
```json
{ "data": {}, "error": null, "meta": {} }
```

---

## 7. Features

### Pipeline View (`/pipeline`)
- Paginated list of active (open) opportunities
- **Default: shows Build Value and above** — excludes Qualify stage by default
- **Qualify toggle:** persistent per-user preference (stored in `users.show_qualify`). Toggle button in the filter bar — when off, shows count of hidden Qualify opps
- Columns: Name, Account, Stage, ARR, Close Date, SE Owner, Open Tasks, SE Comments freshness
- **SE Comments freshness indicator on each row** — based on `se_comments_updated_at`: green dot (≤7d), amber (8–21d), red (21d+), grey (never updated)
- Filters: Stage, SE Owner, Close Date range, Team, Record Type, text search
- Sort: Close Date, ARR, Stage, SE Comments age

### Closed Lost Tab (`/closed-lost`)
- Lists all opportunities that have disappeared from the SF import (= Closed Lost)
- **Sorted by `closed_at` DESC** — most recently closed at the top
- **Unread badge:** a red dot indicator (iOS-style) on the nav item when `closed_lost_seen = false` for any record. Badge shows the count of unread closures
- Marking as read: clicking into the tab auto-marks all currently visible records as read; or mark individually
- Shows: Opportunity name, Account, ARR, SE Owner, AE Owner, Closed date, Stage when closed
- Still allows viewing notes and tasks on the closed opportunity (read-only)

### Opportunity Detail (`/opportunities/:id`)
- Header: SF data (read-only) — name, account, stage, ARR, close date, AE owner, team, SE owner, deploy mode, PoC status, competitors
- **Right column — SF fields (all collapsible, click to expand/collapse):**
  - Deal info section (always visible, not collapsible): AE owner, team, stage, record type, ARR, close date, deploy mode, PoC status, competitors
  - **Next Step** — expanded by default
  - **Manager Comments** — collapsed by default
  - **SE Comments** — expanded by default; freshness badge visible in header even when collapsed: green (≤7d), amber (8–21d), red (21d+). Freshness is based on `se_comments_updated_at` — set on import when the field value changes
  - **Technical Blockers / Risk** — collapsed by default; placeholder message shown until field arrives in SF export (auto-populates from `sf_raw_fields` on next import, no code change needed)
- **Left column — working area:**
  - Next Steps section (is_next_step = true tasks, shown prominently at top)
  - Tasks section — full list, add/edit/complete
  - Notes section — chronological, append-only, with author + timestamp
- **AI Summary button** in header — triggers Claude API using opportunity metadata + all tasks + all notes + SE comments as context

### My Tasks (`/my-tasks`)
- All open/in-progress tasks assigned to logged-in user, across all opportunities
- Grouped: Overdue → Due Today → This Week → Later
- Quick-complete inline, click through to parent opportunity

### Manager Intelligence Views
| View | Route | What it shows |
|------|-------|---------------|
| Stage Movement | `/insights/stage-movement` | Opps where stage changed recently (7/14/30d configurable) — prev stage → new stage, date, SE |
| Missing SE Notes | `/insights/missing-notes` | Opps where `se_comments_updated_at` is null or older than threshold — sorted by most stale first. Threshold configurable (default 21d) |
| Team Workload | `/insights/workload` | Per-SE: # opps, open tasks, overdue tasks, next steps |
| Overdue Tasks | `/insights/overdue-tasks` | All overdue tasks across team, grouped by SE |

### Inbox (`/inbox`)

A personal scratch pad and quick-capture surface. Two entry points:

**1. Global quick-capture modal**
- Triggered by keyboard shortcut (`Cmd/Ctrl + K` or similar — configurable)
- Also accessible via a `+` icon button pinned in the sidebar
- Opens a lightweight modal overlay from anywhere in the app
- Fields: text area (note or todo), optional opportunity search/link, type toggle (note | todo)
- Submit saves instantly and dismisses — frictionless, no required fields except the text
- If an opportunity is linked and type = todo → creates a task on that opportunity directly
- If an opportunity is linked and type = note → creates a note on that opportunity directly
- If no opportunity linked → saves as a standalone Inbox item

**2. Contextual quick-capture on list rows**
- Available on any opportunity list row (pipeline view, closed lost, insights views) via a subtle `+` action that appears on hover
- Opens a small inline popover (not a full modal) — pre-filled with the opportunity context
- Toggle: Note or Task
- One-tap submit → goes straight to that opportunity's notes or tasks list
- No need to open the full detail view

**Inbox page (`/inbox`)**
- Lists all standalone jots (not yet linked to an opportunity)
- Sorted by created date, newest first
- Each item shows: text preview, created time, type badge (note | todo)
- Actions per item:
  - **Link to opportunity** → search and select an opp; if type = todo, converts to a task on that opp and removes from Inbox; if type = note, converts to a note and removes from Inbox
  - **Mark done** (todos only) — stays in Inbox as completed, doesn't link anywhere
  - **Delete** — soft delete
- Inbox nav item shows a count badge of unresolved items (unlinked + incomplete todos)

**Email / Slack forwarding (v2)**
- Forward an email or Slack message to a dedicated address/webhook → lands in Inbox as a jot
- Body becomes the note text, subject/channel becomes a label
- Architecture slot: Inbox items have a `source` field (manual | email | slack) and `source_ref` for the original message ID



---

## 8. UI & Design

### 8.1 Theme Direction
- **Light theme** — white/off-white backgrounds, NOT dark mode
- **Dominant color: Electric Purple** — this is the primary brand color for nav, headers, CTAs, and key UI chrome
- **Electric Pink** — used sparingly as a secondary accent (badges, highlights, active states); never as a background
- **Typography: Poppins** — Ataccama's brand font (Poppins for headings, Poppins Light for body). Fall back to `system-ui` sans-serif if Poppins isn't loaded via Google Fonts
- **Component approach:** shadcn/ui or Radix UI primitives, themed with Tailwind CSS custom tokens
- **Responsive:** Desktop-first, but use Tailwind breakpoints from day one so mobile works later without a rewrite

---

### 8.2 Ataccama Brand Color Palette
> Extracted directly from the official Ataccama Master Deck (slide 74). Use these exact values — no approximations.

#### Core Brand Colors

| Name | HEX | RGB | Usage in this app |
|------|-----|-----|-------------------|
| **Electric Purple** | `#6A2CF5` | 106, 44, 245 | **Primary** — sidebar, nav active states, primary buttons, section headers |
| Electric Purple 70% | `#9C72F8` | 156, 114, 248 | Hover states, secondary buttons, icon fills |
| Electric Purple 30% | `#DED0FD` | 222, 208, 253 | Backgrounds for callout boxes, selected row highlights |
| **Electric Pink** | `#F10090` | 241, 0, 144 | **Accent only** — overdue badges, critical alerts, manager-only labels |
| Electric Pink 70% | `#F655B5` | 246, 85, 181 | Hover on pink elements |
| Electric Pink 30% | `#FCC6E6` | 252, 198, 230 | Very light pink tint for warning backgrounds |
| **Navy** | `#1A0C42` | 26, 12, 66 | Page titles, high-emphasis text, dark section backgrounds |
| Navy 70% | `#665D81` | 102, 93, 129 | Muted body text, secondary labels |
| Navy 30% | `#CCC9D5` | 204, 201, 213 | Borders, dividers, disabled states |
| **Plum** | `#33012A` | 51, 4, 42 | Use sparingly — dark decorative elements only |
| Plum 70% | `#775671` | 119, 86, 113 | — |
| Plum 30% | `#D2C7D0` | 210, 199, 208 | — |

#### Highlight / Status Colors

| Name | HEX | RGB | Usage in this app |
|------|-----|-----|-------------------|
| Highlight Red | `#FF464C` | 255, 70, 76 | Overdue tasks, error states |
| Highlight Blue | `#00DDFF` | 0, 221, 255 | Info badges, new/updated indicators |
| Highlight Yellow | `#FFAB00` | 255, 171, 0 | Due-soon warnings, caution states |
| Highlight Green | `#00E5B6` | 0, 229, 182 | Completed tasks, success states |

---

### 8.3 Tailwind Custom Token Configuration
Configure these in `tailwind.config.ts` so Claude Code uses consistent names throughout:

```ts
colors: {
  brand: {
    purple:       '#6A2CF5',  // primary
    'purple-70':  '#9C72F8',
    'purple-30':  '#DED0FD',
    pink:         '#F10090',  // accent only
    'pink-70':    '#F655B5',
    'pink-30':    '#FCC6E6',
    navy:         '#1A0C42',
    'navy-70':    '#665D81',
    'navy-30':    '#CCC9D5',
  },
  status: {
    overdue:      '#FF464C',  // red
    warning:      '#FFAB00',  // yellow
    info:         '#00DDFF',  // blue
    success:      '#00E5B6',  // green
  }
}
```

---

### 8.4 Color Application Rules
1. **Sidebar / top nav** — `brand.navy` background, white text, `brand.purple` active indicator
2. **Primary buttons** — `brand.purple` fill, white text; hover: `brand.purple-70`
3. **Page headers / section titles** — `brand.navy` text
4. **Body text** — standard `gray-800` or `brand.navy-70` for muted labels
5. **Row highlights / selected state** — `brand.purple-30` background
6. **Manager-only UI elements** — `brand.pink` badge/label (use Electric Pink sparingly)
7. **Task status chips** — use the `status.*` tokens above; never use brand colors for status
8. **Backgrounds** — white (`#FFFFFF`) for content areas; `gray-50` or `#F5F5F7` for page shell
9. **Borders and dividers** — `brand.navy-30` (`#CCC9D5`)

---

### 8.5 Typography
| Element | Font | Weight | Size |
|---------|------|--------|------|
| Page / section titles | Poppins | 600 SemiBold | 20–24px |
| Card headers | Poppins | 500 Medium | 16px |
| Body text | Poppins Light | 300–400 | 14px |
| Labels / captions | Poppins Light | 300 | 12px |
| Monospace (IDs, code) | `font-mono` (system) | — | 13px |

Load Poppins via Google Fonts in `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
```

### 8.6 Layout Decisions
- **Navigation:** collapsible sidebar (Linear/Notion style), `#1A0C42` navy background, `#6A2CF5` active indicator
- **Pipeline view:** split view — opportunity list left (~340px), detail panel right. Selecting a row loads detail inline without navigation
- **Opportunity detail:** two-column within the detail panel — left column is the working area (next steps, tasks, notes); right column is read-only SF data (240px)
- **SF right column fields in order:** Deal info (always visible) → Next Step (expanded) → Manager Comments (collapsed) → SE Comments (expanded, freshness badge in header) → Technical Blockers/Risk (collapsed, placeholder until field arrives in export)
- **Closed Lost nav item** shows a pink dot badge with unread count (iOS-style)
- **Quick-capture modal** triggered by `Cmd/Ctrl+K` from anywhere and by `+` button pinned at top of sidebar

```
Sidebar (always visible):
  [+] Quick capture  (Cmd/Ctrl+K)
  ──────────────────
  - Pipeline
  - Closed Lost      ← pink dot badge (unread count)
  - My Tasks
  - Inbox            ← grey count badge (unresolved items)
  ──────────────────
  [Manager only]
  Insights
    Stage Movement
    Missing Notes
    Team Workload
    Overdue Tasks
  Settings
    Users
    Import History
```

---

## 9. Project Structure

```
se-pipeline-tracker/
├── client/                  # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/      # Shared UI components
│   │   ├── pages/           # Route-level page components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── api/             # Axios client + typed API functions
│   │   ├── store/           # Auth state (Context or Zustand)
│   │   └── types/           # Shared TypeScript types
├── server/                  # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── routes/          # Express route handlers
│   │   ├── middleware/       # Auth, error handling
│   │   ├── services/        # Business logic (import, AI, insights)
│   │   ├── db/              # PostgreSQL client + query helpers
│   │   └── types/
│   ├── migrations/          # SQL migration files (numbered)
│   └── scripts/             # seed.ts, etc.
├── docker-compose.yml
├── .env.example             # Committed — placeholder values only
├── .env                     # NOT committed — real values
└── CLAUDE.md                # This file (or link to it)
```

---

## 10. Build Order for Claude Code

Work in this sequence. Don't skip ahead — each step depends on the previous being tested.

1. **Environment check** — verify WSL2, Docker, Node versions
2. **Project scaffold** — create directory structure, git init, push to GitHub
3. **Docker Compose + DB** — get PostgreSQL running, verify connection
4. **Migrations** — run all migration files in order, verify tables
5. **Seed script** — create 1 manager user, 2 SE users, 5 sample opportunities, tasks, notes
6. **Auth endpoints** — POST /auth/login, GET /auth/me, JWT middleware — test with curl before touching frontend
7. **Opportunities endpoints** — GET list, GET detail, PATCH se_owner
8. **Import pipeline** — CSV upload, reconciliation logic, import log — test with sample CSV
9. **Tasks + Notes endpoints**
10. **Insights endpoints** — all 4 manager views
11. **Frontend auth** — login screen, session persistence, protected routes
12. **Frontend pipeline view**
13. **Frontend opportunity detail**
14. **Frontend my tasks**
15. **Frontend manager views**
16. **AI summary integration**
17. **Brand theming** — apply Ataccama colors once slide deck is provided

---

## 11. Coding Standards

- TypeScript strict mode on both frontend and backend
- All DB queries use parameterized statements — no string interpolation (SQL injection)
- Environment variables for ALL URLs, secrets, config — never hardcode, not even localhost
- Consistent API response envelope: `{ data, error, meta }`
- Soft deletes only — never `DELETE` from DB for users, opportunities, or tasks
- `.env` is in `.gitignore` from commit #1; `.env.example` is always up to date

---

## 12. Cloud Migration Path

Because everything runs in Docker Compose, cloud migration is a container lift-and-shift. No code changes — only infra.

**AWS:** RDS for PostgreSQL → ECS Fargate for backend → S3 + CloudFront for frontend → Secrets Manager for env vars

**Azure:** Azure Database for PostgreSQL → Azure Container Apps → Azure Static Web Apps → Key Vault for env vars

---

## 13. Build & Deploy Process

> **This is a manual deploy — there is no CI/CD pipeline.** Deploys are triggered by running a shell script from WSL.

### Environment

- Developer machine: **Windows + WSL2 (Ubuntu)**
- AWS CLI is installed on **Windows** (`C:\Program Files\Amazon\AWSCLIV2\aws.exe`), symlinked into WSL at `~/bin/aws`
- All deploy commands must be run **inside WSL** with the symlink on PATH

### How to deploy

Always run from WSL, not PowerShell or CMD:

```bash
# Full deploy (frontend + server) — use when server code changed
wsl -e bash -ic 'export PATH="$HOME/bin:$PATH" && cd /mnt/c/claude/buddy/se-pipeline-tracker && bash scripts/deploy.sh'

# Frontend only — use for UI/client-only changes (faster, ~60s)
wsl -e bash -ic 'export PATH="$HOME/bin:$PATH" && cd /mnt/c/claude/buddy/se-pipeline-tracker && bash scripts/deploy.sh --frontend-only'

# Server only — use when only server/src changed (skips Vite build + S3 upload)
wsl -e bash -ic 'export PATH="$HOME/bin:$PATH" && cd /mnt/c/claude/buddy/se-pipeline-tracker && bash scripts/deploy.sh --server-only'
```

### What the script does

**Frontend path** (`--frontend-only` or full):
1. Reads CloudFormation outputs (bucket name, CloudFront distribution ID, EC2 IP) via `aws cloudformation describe-stacks`
2. SCPs `client/src` + config files to EC2 (`/app/client/`)
3. Runs `npm ci && npm run build` inside a `node:20-alpine` Docker container on EC2 (avoids WSL/Windows node_modules platform mismatch)
4. Downloads the built `dist/` back to the local machine
5. Syncs `dist/` to the S3 frontend bucket with `--delete`
6. Submits a CloudFront `/*` cache invalidation

**Server path** (`--server-only` or full):
1. SCPs `server/src`, `server/migrations`, `package*.json`, `tsconfig.json`, `Dockerfile` to EC2 (`/app/server/`)
2. SCPs `docker-compose.prod.yml` and `scripts/backup.sh` to EC2
3. SCPs `.env.prod.local` to EC2 as `/app/.env.prod`, then appends `BACKUP_BUCKET` and `APP_BACKUP_BUCKET` from CDK outputs (these are never in `.env.prod.local`)
4. Runs `docker compose build server` on EC2 (compiles TypeScript inside the container)
5. Runs `docker compose up -d` — only the server container is recreated; DB container is left running

### Infrastructure changes (CDK)

When `infra/lib/stack.ts` is modified (new bucket, new IAM permission, new output, etc.):

```bash
wsl -e bash -ic 'export PATH="$HOME/bin:$PATH" && cd /mnt/c/claude/buddy/se-pipeline-tracker/infra && npx cdk deploy --require-approval never'
```

After CDK deploy, always run a full or server-only deploy so EC2's `.env.prod` picks up any new CloudFormation outputs.

### Key files

| File | Purpose |
|------|---------|
| `scripts/deploy.sh` | The only deploy script — all three modes |
| `.env.prod.local` | Production secrets (never committed). Copy from `.env.example` |
| `infra/lib/stack.ts` | CDK stack — EC2, S3 buckets, CloudFront, IAM role |
| `docker-compose.prod.yml` | Production compose (server + postgres) |
| `client/.env.production` | Vite env — sets `VITE_API_URL=/api/v1` for production build |

### What NOT to do

- **Never use `preview_*` tools or start a local dev server unless explicitly asked to do so** — the app is deployed to AWS/CloudFront; local preview tools don't apply
- **Never run `deploy.sh` from PowerShell or CMD** — use WSL only
- **Never run `npm install` on Windows** for the client — the `rolldown` native binding is platform-specific; it must be installed in WSL (`wsl -e bash -ic 'cd /mnt/c/... && npm install'`)
- **Never skip the `export PATH="$HOME/bin:$PATH"` prefix** in WSL commands — non-interactive WSL shells don't load `~/.bashrc`, so `aws` won't be found otherwise
- **No GitHub Actions, no webhooks** — there is intentionally no automated CI. Commit → push → deploy manually.

### Changelog

`CHANGELOG.md` in the repo root must be updated with every user-facing change — add the entry in the same commit as the feature. This keeps docs updates cheap: future README/HowTo updates only require reading the changelog rather than reconstructing history from commits.

**What to include:** new features, behaviour changes, removals. Skip pure bug fixes, TS errors, deploy script tweaks, and refactors that don't change what the user sees.

**Format:**
```markdown
## YYYY-MM-DD

### Added
- Short description of the feature — one line is enough. (Issue #N if applicable)

### Changed
- What changed and why, if the old behaviour was intentional.

### Removed
- What was removed.
```

Add new entries at the top, under `## [Unreleased]` if the date isn't known yet, or directly under a dated heading.

### After any validated feature

Always commit, push, and deploy without being asked. The sequence is:
1. `git add <files> && git commit -m "..."`
2. `git push origin master`
3. Run the appropriate deploy command above (frontend-only if only client changed, full if server changed)

---

## 14. Future Roadmap (Out of Scope for v1)

Keep these in mind so v1 architecture doesn't accidentally block them:

- **Slack notifications** — overdue tasks, stage changes. Needs: notification service module + Slack bot token
- **Google SSO** — Ataccama Google Workspace. Needs: OAuth2 provider swap in auth layer (slot already exists in JWT architecture)
- **Automated SF import** — Cowork or scheduled script POSTs CSV to import endpoint (endpoint already designed to accept this)
- **Mobile layout** — Tailwind breakpoints from day 1 means this is just CSS work
- **Email notifications**
- **Export to CSV / PDF**
- **AE read-only access**
- **Sales leadership dashboard**

---

*This document is the source of truth. Update it as decisions are made. Keep it committed in the repo root as `CLAUDE.md`.*
