# SE Pipeline Tracker

A browser-based workspace for an SE Manager and their Solutions Engineering team to track tasks, next steps, notes, and deal-level activity against Salesforce opportunities — without living inside Salesforce.

---

## Table of Contents

1. [Purpose & Background](#purpose--background)
2. [Use Cases](#use-cases)
3. [Features](#features)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Data Model](#data-model)
7. [API Reference](#api-reference)
8. [Setup & Running Locally](#setup--running-locally)
9. [User Roles & Access](#user-roles--access)
10. [Salesforce Import Pipeline](#salesforce-import-pipeline)
11. [Brand & Design System](#brand--design-system)
12. [Deployment](#deployment)

---

## Purpose & Background

Salesforce is the system of record for deals, but it's a poor daily workspace for an SE team. SEs need to:

- Track their own tasks and next steps per deal
- Leave technical notes separate from AE-facing CRM fields
- See which deals need attention and which are going stale

This tool pulls deal data from Salesforce via a CSV/XLS export and layers a native task, notes, and manager intelligence layer on top. Salesforce data is **read-only** — all activity (tasks, notes, SE comments) lives in this tool.

**Key design principle:** Salesforce is the source of truth for deal data. This tool is the source of truth for SE activity. Imports update SF-owned fields; they never touch tasks, notes, or SE assignments.

---

## Use Cases

### For SEs (Individual Contributors)

| Use Case | Where |
|----------|-------|
| View my active deals and their stages | Pipeline page |
| Track next steps and tasks per deal | Opportunity detail — Tasks section |
| Add technical notes to a deal | Opportunity detail — Notes section |
| See all my tasks across all deals, grouped by urgency | My Tasks page |
| Quickly jot something down without leaving the current view | Quick Capture (Ctrl+K) |
| Link a jot to a deal and convert it to a task or note | Inbox page |
| See when my SE comments are going stale | Pipeline — freshness indicator on each row |

### For the SE Manager

| Use Case | Where |
|----------|-------|
| See which deals changed stage recently | Insights → Stage Movement |
| Find deals with no recent SE notes | Insights → Missing Notes |
| See team workload and comment freshness at a glance | Insights → Team Workload |
| Find overdue tasks across the team | Insights → Overdue Tasks |
| Track active PoCs | Insights → PoC Board |
| Track RFx responses | Insights → RFx Board |
| See pipeline breakdown by deployment model | Insights → DeployMode Overview |
| Review technical blockers across the pipeline | Insights → Tech Blockers |
| Analyse closed lost deals by reason and stage | Insights → Closed Lost Stats |
| Assign or reassign SE owners across deals | Insights → SE Deal Mapping |
| Generate an AI analysis of pipeline blockers | Insights → Tech Blockers → AI Insights |
| Drill into a specific SE's workload or overdue tasks | Team Workload — click any stat |
| Manage team members and their roles | Settings → Users |
| View Salesforce import history and roll back imports | Settings → Import History |
| Customize which Insights pages appear in the sidebar | Settings → Insights Menu |
| Trigger a Salesforce data import | Settings → Import (file upload) |

---

## Features

### Pipeline View (`/pipeline`)
- Paginated list of active (open) opportunities
- Default view: **Build Value and above** — Qualify stage hidden by default
- Qualify toggle: per-user preference (stored in DB), shows count of hidden Qualify deals
- Columns: configurable via **Column Picker** — reorderable, saveable per user
- **SE Comments freshness indicator**: green dot (≤7 days), amber (8–21 days), red (>21 days), grey (never)
- Filters: Stage (multi-select), Fiscal Period (multi-select), text search; deep-link filter `?se_id=<n>` pre-filters by SE owner (used from Team Workload drill-through)
- Sort: any column, click header to cycle asc/desc/off
- Quick Capture button on each row (hover to reveal)

### Closed Lost (`/closed-lost`)
- Deals that disappeared from the SF import (= Closed Lost)
- Sorted by closed date, newest first
- **Unread badge** on sidebar nav item — count of deals not yet seen
- Auto-marks as read when navigating to the tab
- Still shows tasks and notes on closed deals (read-only)

### Opportunity Detail (slide-in drawer)
- Opens from any deal row in Pipeline, Closed Lost, or Insights views
- Left column (working area): Next Steps (top), Tasks, Notes
- Right column (read-only SF data): stage, ARR, close date, AE owner, deploy mode, PoC status, competitors
- Collapsible SF fields: Next Step, Manager Comments, SE Comments (with freshness badge), Technical Blockers
- **AI Summary** button — calls Claude API with all deal context to produce a one-click summary
- Inline task creation, editing (pencil icon), status changes, deletion
- Append-only notes with author and timestamp

### My Tasks (`/my-tasks`)
- All open tasks assigned to the logged-in user across all deals
- Grouped sections: Overdue → Today → This Week → Later → No Due Date → Completed (collapsible)
- Inline edit, status change, delete

### Inbox (`/inbox`)
- Personal scratch pad — jot things down without linking to a deal yet
- Types: Note or Todo
- Link to an opportunity later → converts to a task or note on that deal and removes from Inbox
- Unread count badge on sidebar nav item

### Quick Capture (`Ctrl+K` or `+` button)
- Global modal triggered from anywhere in the app
- Write a note or todo, optionally search and link to an opportunity
- If linked: goes directly to that deal's tasks or notes
- If unlinked: saves to Inbox

### Column Picker
- Available on Pipeline and SE Deal Mapping views
- Drag-and-drop or arrow buttons to reorder columns
- Saved per user in the database (`column_prefs` JSONB field)
- Reset to default button

### Manager Insights

#### Stage Movement (`/insights/stage-movement`)
- Deals where the stage changed in the last 7 / 14 / 30 days (configurable)
- Shows previous stage → new stage, date, SE owner

#### Missing Notes (`/insights/missing-notes`)
- Deals where `se_comments_updated_at` is null or older than a threshold (14 / 21 / 30 days, configurable)
- Sorted most stale first
- Supports `?se_id=<n>` deep-link filter (used from Team Workload drill-through)
- Clickable rows open the Opportunity Detail drawer; Quick Capture button per row

#### Team Workload (`/insights/team-workload`)
- Per-user cards (all active users, not just SEs) showing 6 stats in a 3×2 grid:
  - **Opps** — active opportunities assigned
  - **Open Tasks** — open/in-progress tasks
  - **Next Steps** — tasks flagged as next steps
  - **Overdue** — overdue tasks (highlighted red when >0)
  - **Stale Notes** — opps with SE comments >21 days old or never updated (highlighted red)
  - **Fresh Notes** — opps with SE comments ≤7 days old (highlighted green)
- All non-zero stats are **clickable links**: Opps/Open Tasks/Next Steps → pipeline filtered by SE; Overdue → overdue tasks filtered by SE; Stale Notes → missing notes filtered by SE

#### Overdue Tasks (`/insights/overdue-tasks`)
- All overdue tasks across the team, grouped by SE
- Supports `?se_id=<n>` deep-link filter from Team Workload

#### PoC Board (`/insights/poc-board`)
- Kanban board of deals with a PoC Status set; unrecognised/empty statuses excluded
- **Status bar** at top: all four columns shown as colored pills with counts (empty ones dimmed)
- **Hide empty columns toggle** (default ON): removes zero-card columns from the board
- **Compact card toggle**: slim 2-row cards showing opp name + end date + SE initials; per-card expand chevron reveals full details inline
- Column width adapts: `w-96` when ≤3 columns visible, `w-72` for 4 columns

#### RFx Board (`/insights/rfx-board`)
- **View switcher**: Kanban (default) or List view
- **Kanban**: In Review = 1 card wide, In Progress + Completed = 2 cards wide
- **List view**: sortable table with filter bar (RFx Status, SE Owner, AE Owner)
- Clicking any card/row opens the Opportunity Detail drawer

#### DeployMode Overview (`/insights/deploy-mode`)
- Stat cards per deployment model showing deal count and total ARR
- Clicking a stat card filters the deal table below
- Quarter filter (multi-select), sortable table

#### Tech Blockers (`/insights/tech-blockers`)
- Table of all active opps with a Technical Blockers/Risk value
- Status badge based on emoji prefix: 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low/None
- Status filter bar (Active blockers / by severity / All)
- **Recently Changed tab**: field history for `technical_blockers` with 14/30/60/90d window
- **AI Insights panel** (collapsible, collapsed by default):
  - Summary cached in DB; freshness badge shows age (green today / yellow ≤3d / red 4d+)
  - Includes all entries, weighted by severity; rendered as structured markdown
  - "Regenerate" button to refresh; "Generate Summary" on first run

#### Closed Lost Stats (`/insights/closed-lost-stats`)
- Analysis of closed lost deals by reason, stage, deployment mode, and time period

#### SE Deal Mapping (`/insights/se-deal-mapping`)
- Kanban or table view for assigning/reassigning SE owners across all active opportunities
- Drag-and-drop between SE columns in kanban view
- Sortable table view with column picker
- Filter by SE, stage, text search

### Settings (Manager only)

#### Users (`/settings/users`)
- List all team members with role badge, last login, active/inactive status
- Add new user; toggle role; deactivate/reactivate

#### Import History (`/settings/import`)
- Log of all imports with rollback capability (most recent import can be undone)

#### Insights Menu (`/settings/insights-menu`)
- Drag-and-drop reorder of Insights sidebar items
- Show/hide individual pages; reset to default

### Sidebar Navigation
- Collapsible **Insights** and **Settings** sections
- Insights nav order is user-configurable (see Insights Menu above)

---

## Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 18 + TypeScript + Vite | Strict TS |
| Styling | Tailwind CSS | Custom Ataccama brand token configuration |
| State management | Zustand | Auth store, pipeline store |
| HTTP client | Axios | Typed API functions per domain |
| Backend | Node.js + Express + TypeScript | REST API |
| Database | PostgreSQL 16 | Docker locally; AWS RDS in production |
| ORM | Raw SQL via `pg` | Parameterized queries throughout — no ORM |
| Auth | JWT + bcrypt | Stateless sessions |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) | Opportunity summarization + Tech Blockers analysis |
| Containerization | Docker + Docker Compose | One-command local start |
| Hosting | AWS EC2 + CloudFront + S3 | EC2 runs the backend container; S3/CloudFront serves the frontend |

### Key frontend libraries
- `react-router-dom` v6 — client-side routing
- `zustand` — lightweight global state
- `axios` — HTTP client
- `tailwindcss` — utility-first CSS

### Key backend libraries
- `express` — HTTP server
- `pg` — PostgreSQL client
- `bcrypt` — password hashing
- `jsonwebtoken` — JWT signing/verification
- `multer` — file upload handling
- `@anthropic-ai/sdk` — Claude API client
- `node-html-parser` — parses Salesforce's HTML-in-XLS export format

---

## Project Structure

```
se-pipeline-tracker/
│
├── client/                          # React + TypeScript + Vite
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts           # Brand color tokens
│   └── src/
│       ├── App.tsx                  # Router, AppShell, ProtectedRoute
│       ├── index.css                # Tailwind imports + Poppins font
│       ├── api/                     # Typed API functions (one file per domain)
│       │   ├── client.ts            # Axios instance with JWT header injection
│       │   ├── auth.ts
│       │   ├── opportunities.ts
│       │   ├── tasks.ts
│       │   ├── notes.ts
│       │   ├── inbox.ts
│       │   └── users.ts
│       ├── components/
│       │   ├── Sidebar.tsx          # Nav with collapsible sections, dynamic insights nav
│       │   ├── Drawer.tsx           # Slide-in panel used by all list views
│       │   ├── OpportunityDetail.tsx
│       │   ├── ProtectedRoute.tsx
│       │   ├── QuickCapture.tsx     # Ctrl+K global modal
│       │   ├── RowCapture.tsx       # Inline quick-capture on list rows
│       │   ├── ColumnPicker.tsx     # Reorderable column selector
│       │   ├── opportunity/
│       │   │   ├── TaskSection.tsx
│       │   │   └── NoteSection.tsx
│       │   └── shared/
│       │       ├── StageBadge.tsx
│       │       ├── StatusChip.tsx
│       │       ├── FreshnessDot.tsx
│       │       ├── MultiSelectFilter.tsx  # Generic multi-select dropdown
│       │       ├── SortableHeader.tsx     # Clickable sortable table header
│       │       └── TruncatedCell.tsx
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── PipelinePage.tsx
│       │   ├── ClosedLostPage.tsx
│       │   ├── MyTasksPage.tsx
│       │   ├── InsightsPage.tsx     # Pathname-based sub-router for all insight views
│       │   ├── SettingsPage.tsx
│       │   ├── insights/
│       │   │   ├── StageMovementPage.tsx
│       │   │   ├── MissingNotesPage.tsx
│       │   │   ├── TeamWorkloadPage.tsx
│       │   │   ├── OverdueTasksPage.tsx
│       │   │   ├── PocBoardPage.tsx
│       │   │   ├── RfxBoardPage.tsx
│       │   │   ├── DeployModePage.tsx
│       │   │   ├── TechBlockersPage.tsx
│       │   │   ├── ClosedLostStatsPage.tsx
│       │   │   ├── SeDealMappingPage.tsx
│       │   │   └── shared.tsx       # Loading, Empty shared components
│       │   └── settings/
│       │       ├── UsersPage.tsx
│       │       ├── ImportHistoryPage.tsx
│       │       ├── InsightsMenuPage.tsx
│       │       └── HowToPage.tsx
│       ├── store/
│       │   ├── auth.ts
│       │   └── pipeline.ts
│       ├── types/
│       │   └── index.ts
│       └── utils/
│           ├── formatters.ts
│           ├── insightsNav.ts       # Insights nav config — localStorage + defaults
│           ├── sortRows.ts          # Generic multi-type sort utility
│           └── renderOpportunityCell.tsx  # Renders any opp column by key
│
├── server/                          # Node.js + Express + TypeScript
│   ├── package.json
│   ├── tsconfig.json
│   ├── migrations/                  # Numbered SQL files — run in order on startup
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_opportunities.sql
│   │   ├── 003_create_tasks.sql
│   │   ├── 004_create_notes.sql
│   │   ├── 005_create_inbox_items.sql
│   │   ├── 006_create_imports.sql
│   │   ├── 007_add_import_rollback.sql
│   │   ├── 008_create_field_history.sql
│   │   ├── 009_add_column_prefs.sql
│   │   └── 010_create_ai_summary_cache.sql
│   ├── scripts/
│   │   ├── migrate.ts
│   │   ├── seed.ts
│   │   ├── backfill-se-comment-dates.ts
│   │   └── sample-import.xls
│   └── src/
│       ├── index.ts
│       ├── db/
│       │   └── index.ts             # pg Pool, query(), queryOne() helpers
│       ├── middleware/
│       │   └── auth.ts              # requireAuth, requireManager
│       ├── types/
│       │   └── index.ts
│       ├── services/
│       │   └── importService.ts     # SF file parser + reconciliation logic
│       └── routes/
│           ├── auth.ts
│           ├── opportunities.ts
│           ├── tasks.ts
│           ├── notes.ts
│           ├── inbox.ts
│           ├── insights.ts          # All GET /insights/* endpoints
│           └── users.ts
│
├── scripts/
│   └── deploy.sh                    # Full deploy or --server-only to AWS EC2 + S3/CloudFront
├── infra/                           # AWS CloudFormation stack definition
├── docker-compose.yml               # Local development (PostgreSQL only)
├── docker-compose.prod.yml          # Production (server + DB containers on EC2)
├── .env.example
└── CLAUDE.md                        # Project specification for AI-assisted development
```

---

## Data Model

### Core tables

#### `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `email` | text unique | Login identifier |
| `name` | text | Display name |
| `password_hash` | text | bcrypt, cost 10 |
| `role` | text | `manager` or `se` |
| `is_active` | boolean | Soft delete flag |
| `show_qualify` | boolean | Pipeline filter preference |
| `column_prefs` | JSONB | Saved column layouts per page |
| `last_login_at` | timestamptz | Updated on each login |

#### `opportunities`
The central table. SF-owned fields are updated on every import; app-managed fields are never overwritten.

Key columns:
- `sf_opportunity_id` — immutable SF record ID, reconciliation key
- `name`, `account_name`, `stage`, `arr`, `close_date` — core SF fields
- `deploy_mode`, `fiscal_period` — deployment model and fiscal quarter
- `se_comments`, `se_comments_updated_at` — SE comments + freshness tracking (timestamp derived from date written in the comment text, not import time)
- `technical_blockers` — mapped from "Technical Blockers/Risk" SF field; emoji prefix (🔴/🟠/🟡/🟢) denotes severity
- `poc_status`, `poc_start_date`, `poc_end_date`, `poc_type` — PoC tracking
- `rfx_status` — RFx tracking
- `stage_changed_at`, `previous_stage` — powers Stage Movement insight
- `se_owner_id` — app-managed SE assignment (not from SF)
- `is_closed_lost`, `closed_at`, `closed_lost_seen` — closed lost tracking
- `sf_raw_fields` JSONB — all SF columns stored raw; future columns auto-captured

#### `tasks`
| Column | Notes |
|--------|-------|
| `opportunity_id` | FK to opportunities |
| `title`, `description` | Task content |
| `status` | `open`, `in_progress`, `done`, `blocked` |
| `is_next_step` | Promoted to Next Steps section |
| `due_date` | Drives grouping in My Tasks |
| `assigned_to_id` | FK to users |
| `is_deleted` | Soft delete |

#### `notes`
Append-only — no UPDATE or DELETE ever issued on this table.

#### `inbox_items`
Personal scratch pad per user. Supports conversion to tasks or notes on an opportunity.

#### `imports`
Log of every SF import: filename, row counts, added/updated/closed-lost counts, status, error log. Supports rollback of the most recent import.

#### `opportunity_field_history`
Tracks value changes for key SF fields (stage, se_comments, technical_blockers, etc.) on every import. Powers the Stage Movement and Tech Blockers Recently Changed views.

| Column | Notes |
|--------|-------|
| `opportunity_id` | FK to opportunities |
| `import_id` | FK to imports |
| `field_name` | e.g. `stage`, `technical_blockers` |
| `old_value`, `new_value` | String values before/after |
| `changed_at` | Timestamp of the import |

#### `ai_summary_cache`
Stores the last generated AI summary per key (currently `tech-blockers`).

| Column | Notes |
|--------|-------|
| `key` | TEXT PRIMARY KEY — e.g. `tech-blockers` |
| `content` | Full summary text |
| `generated_at` | When it was generated |

---

## API Reference

All routes require `Authorization: Bearer <token>` except `/auth/login`.
Base path: `/api/v1/`
Response envelope: `{ "data": ..., "error": null, "meta": {} }`

### Auth
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/auth/login` | Public | Returns JWT + user object |
| POST | `/auth/logout` | Auth | Stateless — client discards token |
| GET | `/auth/me` | Auth | Returns current user |

### Opportunities
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/opportunities` | Auth | Pipeline list; `?search=`, `?stage=`, `?include_qualify=` |
| GET | `/opportunities/:id` | Auth | Full detail with tasks + notes |
| PATCH | `/opportunities/:id` | Manager | Update `se_owner_id` |
| POST | `/opportunities/import` | Manager | Upload SF export (multipart) |
| GET | `/opportunities/import/history` | Manager | Last 50 imports |
| POST | `/opportunities/import/:id/rollback` | Manager | Roll back a specific import |
| GET | `/opportunities/closed-lost` | Auth | Closed lost list with unread count |
| POST | `/opportunities/closed-lost/mark-read` | Auth | Mark records as seen |
| POST | `/opportunities/:id/summary` | Auth | Generate AI summary via Claude API |

### Tasks
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/tasks` | Auth | Current user's tasks |
| POST | `/opportunities/:id/tasks` | Auth | Create task |
| PATCH | `/tasks/:id` | Auth | Update task |
| DELETE | `/tasks/:id` | Auth | Soft delete |

### Notes
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/opportunities/:id/notes` | Auth | All notes for an opportunity |
| POST | `/opportunities/:id/notes` | Auth | Append a note |

### Inbox
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/inbox` | Auth | Current user's open items |
| POST | `/inbox` | Auth | Create jot |
| PATCH | `/inbox/:id` | Auth | Edit or mark done |
| POST | `/inbox/:id/convert` | Auth | Convert to task or note on an opportunity |
| DELETE | `/inbox/:id` | Auth | Soft delete |

### Insights (Manager only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/insights/stage-movement` | `?days=7\|14\|30` |
| GET | `/insights/missing-notes` | `?threshold_days=&se_id=` |
| GET | `/insights/team-workload` | Per-user task/deal/comment counts |
| GET | `/insights/overdue-tasks` | Grouped by user; `?se_id=` |
| GET | `/insights/rfx` | All deals with `rfx_status` set |
| GET | `/insights/poc` | All deals with a known `poc_status` |
| GET | `/insights/deploy-mode` | Active deals with `deploy_mode` |
| GET | `/insights/closed-lost-stats` | Closed lost breakdown by reason/stage |
| GET | `/insights/tech-blockers` | Active opps with `technical_blockers`; includes computed `blocker_status` |
| GET | `/insights/tech-blockers/recent` | `?days=14\|30\|60\|90` — field history for `technical_blockers` |
| GET | `/insights/tech-blockers/ai-summary/cached` | Returns persisted AI summary or null |
| POST | `/insights/tech-blockers/ai-summary` | Generate + persist new AI summary |

### Users (Manager only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | All users |
| POST | `/users` | Create user |
| PATCH | `/users/me/preferences` | Update `show_qualify`, `column_prefs` |
| PATCH | `/users/:id` | Update name, email, role, is_active |
| DELETE | `/users/:id` | Soft deactivate |

---

## Setup & Running Locally

### Prerequisites (one-time)

1. **WSL2** with Ubuntu 22.04: `wsl --install -d Ubuntu-22.04` in PowerShell (Admin), then restart
2. **Docker Desktop for Windows** — enable WSL2 backend + Ubuntu-22.04 integration
3. **Node.js v20+** inside WSL2 via nvm
4. **WSL2 mirrored networking** — required for the preview browser to reach WSL-hosted servers:

```ini
# C:\Users\<your-name>\.wslconfig
[wsl2]
networkingMode=mirrored
```
Then restart WSL: `wsl --shutdown` in PowerShell, reopen Ubuntu.

### First-time setup

All commands run inside **Ubuntu (WSL2) terminal**.

```bash
# 1. Clone and enter the project
git clone <repo-url>
cd se-pipeline-tracker

# 2. Set up environment
cp .env.example .env
# Edit .env: set JWT_SECRET (openssl rand -hex 32) and ANTHROPIC_API_KEY

# 3. Start PostgreSQL
docker compose up -d

# 4. Verify DB is healthy
docker ps   # look for container with status 'healthy'

# 5. Run migrations
cd server && npm install && npm run migrate

# 6. Seed sample data
npm run seed

# 7. Start the backend
npm run dev   # runs on http://localhost:3001

# 8. In a new terminal, start the frontend
cd ../client && npm install && npm run dev   # runs on http://localhost:5173
```

### Default credentials (after seeding)

| Email | Password | Role |
|-------|----------|------|
| `tomas.bolek@ataccama.com` | `password123` | Manager |
| `alex.rivera@ataccama.com` | `password123` | SE |
| `jan.novak@ataccama.com` | `password123` | SE |

### Daily workflow

```bash
docker compose up -d          # start DB if not running
cd server && npm run dev       # backend (terminal 1)
cd client && npm run dev       # frontend (terminal 2)
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `POSTGRES_DB` | Database name (default: `se_pipeline`) |
| `POSTGRES_USER` | DB user |
| `POSTGRES_PASSWORD` | DB password |
| `DATABASE_URL` | Full connection string for the backend |
| `PORT` | Backend server port (default: `3001`) |
| `JWT_SECRET` | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | Token TTL (default: `7d`) |
| `ANTHROPIC_API_KEY` | API key for AI summary features |
| `VITE_API_URL` | Backend base URL seen by the browser |

---

## User Roles & Access

| Feature | SE | Manager |
|---------|----|---------|
| View pipeline, closed lost, opportunities | ✓ | ✓ |
| Add tasks, notes on any opportunity | ✓ | ✓ |
| Edit/complete own tasks | ✓ | ✓ |
| Use Quick Capture and Inbox | ✓ | ✓ |
| View My Tasks | ✓ | ✓ |
| Assign SE owner to opportunity | — | ✓ |
| Access all Insights views | — | ✓ |
| Upload Salesforce import | — | ✓ |
| Manage users | — | ✓ |
| Configure Insights menu | — | ✓ |

All `/insights/*` and `/users` API routes enforce `requireManager` middleware — a 403 is returned if an SE attempts to call them directly.

---

## Salesforce Import Pipeline

Salesforce data comes in as an XLS export of an Opportunities report. The file is **HTML-in-XLS format** (Salesforce's default export) — it is parsed as an HTML table, not a native XLS binary.

### Import flow

1. **Upload** the file via Settings → Import
2. **Preview** — dry-run diff: rows parsed, new deals, updated deals, removed from open pipeline
3. **Confirm** — apply the changes
4. The server processes each row:
   - **Match found**: update all SF-owned fields; if `stage` changed → record in `opportunity_field_history`; if `se_comments` changed → update `se_comments_updated_at` (parsed from the date written inside the comment text, not import time); if `technical_blockers` changed → record in field history
   - **New SF ID**: insert new opportunity record
   - **SF ID absent**: mark as Closed Lost (`is_closed_lost = true`, `closed_at = now()`)
5. Every raw row is stored in `sf_raw_fields` JSONB — future SF columns auto-captured
6. Import logged to `imports` table; most recent import can be rolled back

### SE Comments freshness

`se_comments_updated_at` is derived from the **date written inside the comment text** (e.g. "BM_26SEPT", "Jan 15, 2026") using a 14-pattern regex cascade with "nearest past date" year inference. This gives an accurate freshness signal even for comments that haven't changed in recent imports. Coverage: ~97% of real comment entries.

### Field reference

The expected SF export contains columns mapped per `server/src/services/importService.ts`. All columns are also stored in `sf_raw_fields` JSONB regardless — new SF columns never cause import failures.

---

## Brand & Design System

The app uses the Ataccama brand palette configured as Tailwind custom tokens:

| Token | Color | Usage |
|-------|-------|-------|
| `brand-purple` | `#6A2CF5` | Primary — buttons, active nav, section headers |
| `brand-purple-70` | `#9C72F8` | Hover states |
| `brand-purple-30` | `#DED0FD` | Selected row backgrounds |
| `brand-pink` | `#F10090` | Accent — active nav item |
| `brand-navy` | `#1A0C42` | Page titles, high-emphasis text |
| `brand-navy-70` | `#665D81` | Muted body text |
| `brand-navy-30` | `#CCC9D5` | Borders, dividers |
| `status-overdue` | `#FF464C` | Overdue tasks, error states |
| `status-warning` | `#FFAB00` | Due-soon, amber freshness |
| `status-info` | `#00DDFF` | Info badges |
| `status-success` | `#00E5B6` | Completed, green freshness |

Typography: **Poppins** (Google Fonts) — 300/400/500/600 weights.

---

## Deployment

The app runs on AWS infrastructure deployed via `scripts/deploy.sh`:

- **Frontend**: built with Vite, uploaded to S3, served via CloudFront
- **Backend**: Docker container running on EC2, proxied from CloudFront
- **Database**: PostgreSQL 16 in a Docker container on the same EC2 instance (data volume persisted)
- **Migrations**: run automatically on every server container start

```bash
# Full deploy (frontend + backend)
bash scripts/deploy.sh

# Server only (skip frontend build + S3 upload)
bash scripts/deploy.sh --server-only
```

Infrastructure is defined in `infra/` as a CloudFormation stack (EC2 instance, S3 bucket, CloudFront distribution, security groups).

---

## Development Notes

### Adding a new Insights page
1. Create `client/src/pages/insights/YourPage.tsx`
2. Add a route case in `client/src/pages/InsightsPage.tsx`
3. Add the default entry to `DEFAULT_INSIGHTS_NAV` in `client/src/utils/insightsNav.ts`
4. Add a backend endpoint in `server/src/routes/insights.ts`

### Adding a new SF field
If Salesforce adds a column to the export:
1. It is automatically stored in `sf_raw_fields` JSONB on the next import
2. To promote it to a dedicated column: write a numbered migration SQL file, update the column mapping in `server/src/services/importService.ts`, backfill from `sf_raw_fields`

### Running migrations manually
```bash
cd server && npm run migrate
```

### Wiping and re-seeding the database
```bash
docker compose down -v   # destroys the volume
docker compose up -d
cd server && npm run migrate && npm run seed
```
