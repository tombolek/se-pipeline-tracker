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
12. [Future Roadmap](#future-roadmap)

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
| See team workload at a glance | Insights → Team Workload |
| Find overdue tasks across the team | Insights → Overdue Tasks |
| Track active PoCs | Insights → PoC Board |
| Track RFx responses | Insights → RFx Board |
| See pipeline breakdown by deployment model (PaaS+ vs SaaS) | Insights → DeployMode Overview |
| Filter DeployMode view by fiscal quarter | DeployMode — quarter multi-select |
| Manage team members and their roles | Settings → Users |
| View Salesforce import history | Settings → Import History |
| Customize which Insights pages appear in the sidebar | Settings → Insights Menu |
| Trigger a Salesforce data import | Settings → Import (file upload) |

---

## Features

### Pipeline View (`/pipeline`)
- Paginated list of active (open) opportunities
- Default view: **Build Value and above** — Qualify stage hidden by default
- Qualify toggle: per-user preference (stored in DB), shows count of hidden Qualify deals
- Columns: Opportunity name, Account, Stage, ARR, Close Date, AE Owner, SE Owner, Open Tasks, SE Comments freshness
- **SE Comments freshness indicator**: green dot (≤7 days), amber (8–21 days), red (>21 days), grey (never)
- Filters: Stage, SE Owner, text search
- Sort: Close Date, ARR, Stage, SE Comments age
- Quick Capture button on each row (hover to reveal) — creates a note or task without opening the full detail view

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
- **AI Summary** button — calls Claude API with all deal context (tasks, notes, SF fields) to produce a one-click summary
- Inline task creation, editing (pencil icon), status changes, deletion
- Append-only notes with author and timestamp

### My Tasks (`/my-tasks`)
- All open tasks assigned to the logged-in user across all deals
- Grouped sections: Overdue → Today → This Week → Later → No Due Date → Completed (collapsible)
- Inline edit (pencil icon), status change, delete
- Completed section collapsed by default

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

### Manager Insights

#### Stage Movement (`/insights/stage-movement`)
- Deals where the stage changed in the last 7 / 14 / 30 days (configurable)
- Shows previous stage → new stage, date, SE owner

#### Missing Notes (`/insights/missing-notes`)
- Deals where `se_comments_updated_at` is null or older than a threshold (14 / 21 / 30 days, configurable)
- Sorted most stale first
- Clickable rows open the Opportunity Detail drawer
- Quick Capture button per row for fast note entry

#### Team Workload (`/insights/team-workload`)
- Per-SE summary: deal count, open tasks, overdue tasks, next steps

#### Overdue Tasks (`/insights/overdue-tasks`)
- All overdue tasks across the team, grouped by SE

#### PoC Board (`/insights/poc-board`)
- Kanban-style board of all deals with a PoC Status set
- Columns by PoC status

#### RFx Board (`/insights/rfx-board`)
- Kanban-style board of deals with an RFx Status set

#### DeployMode Overview (`/insights/deploy-mode`)
- Stat cards per deployment model (PaaS+, SaaS, other) showing deal count and total ARR
- Clicking a stat card filters the deal table below
- **Quarter filter**: multi-select dropdown derived from `fiscal_period` field (e.g. Q2-2026, Q3-2026)
- Deal table columns: Opportunity, Stage, ARR, Close Date, SE Comments, Agentic Qualification, Technical Blockers, AE/SE Owner
- Clicking a row opens the Opportunity Detail drawer

### Settings (Manager only)

#### Users (`/settings/users`)
- List all team members with role badge, last login, active/inactive status
- Add new user (name, email, role, temporary password)
- Toggle role (Manager ↔ SE) per row
- Deactivate / Reactivate users (soft delete — own account is protected)

#### Import History (`/settings/import`)
- Log of all Salesforce data imports: date, filename, rows processed, added/updated/closed lost counts, status badge

#### Insights Menu (`/settings/insights-menu`)
- Drag-and-drop reorder of Insights sidebar items
- Show/hide individual pages
- Up/Down arrow buttons as an alternative to drag
- Reset to default button
- Changes apply instantly to the sidebar via localStorage + custom event

### Sidebar Navigation
- Collapsible **Insights** and **Settings** sections (collapsed by default)
- Main nav order: Pipeline → My Tasks → Inbox → Closed Lost
- Insights nav order is user-configurable (see Insights Menu above)

---

## Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 18 + TypeScript + Vite | Component-based, strict TS |
| Styling | Tailwind CSS | Custom Ataccama brand token configuration |
| State management | Zustand | Auth store, pipeline store |
| HTTP client | Axios | Typed API functions per domain |
| Backend | Node.js + Express + TypeScript | REST API, compiled with `tsx` |
| Database | PostgreSQL 16 | Via Docker; production-ready (maps directly to RDS/Azure DB) |
| ORM | Raw SQL via `pg` | Parameterized queries throughout — no ORM |
| Auth | JWT + bcrypt | Stateless sessions; Google SSO slot built into architecture |
| AI | Anthropic Claude API (`claude-sonnet-4-5`) | Opportunity summarization |
| Containerization | Docker + Docker Compose | One-command local start |
| Dev environment | Windows + WSL2 | WSL2 mirrored networking mode required |

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
- `multer` — file upload handling (for SF imports)
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
│       │   ├── OpportunityDetail.tsx # Full deal detail panel
│       │   ├── ProtectedRoute.tsx   # Auth guard
│       │   ├── QuickCapture.tsx     # Ctrl+K global modal
│       │   ├── RowCapture.tsx       # Inline quick-capture on list rows
│       │   ├── opportunity/
│       │   │   ├── TaskSection.tsx  # Task list + add + inline edit
│       │   │   └── NoteSection.tsx  # Append-only notes list + add
│       │   └── shared/
│       │       ├── StageBadge.tsx   # Colored stage pill
│       │       └── StatusChip.tsx   # Task status chip
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── PipelinePage.tsx
│       │   ├── ClosedLostPage.tsx
│       │   ├── MyTasksPage.tsx
│       │   ├── InsightsPage.tsx     # Pathname-based sub-router for all insight views
│       │   ├── SettingsPage.tsx     # Pathname-based sub-router for settings
│       │   ├── insights/
│       │   │   ├── StageMovementPage.tsx
│       │   │   ├── MissingNotesPage.tsx
│       │   │   ├── TeamWorkloadPage.tsx
│       │   │   ├── OverdueTasksPage.tsx
│       │   │   ├── PocBoardPage.tsx
│       │   │   ├── RfxBoardPage.tsx
│       │   │   ├── DeployModePage.tsx
│       │   │   └── shared.tsx       # Loading, Empty shared components
│       │   └── settings/
│       │       ├── UsersPage.tsx
│       │       ├── ImportHistoryPage.tsx
│       │       └── InsightsMenuPage.tsx
│       ├── store/
│       │   ├── auth.ts              # User + token state, login/logout
│       │   └── pipeline.ts          # Closed lost unread count, quick capture open state
│       ├── types/
│       │   └── index.ts             # Shared TypeScript interfaces (User, Task, Note, etc.)
│       └── utils/
│           ├── formatters.ts        # formatARR, formatDate, daysSinceLabel
│           └── insightsNav.ts       # Insights nav config — localStorage persistence + defaults
│
├── server/                          # Node.js + Express + TypeScript
│   ├── package.json
│   ├── tsconfig.json
│   ├── migrations/                  # Numbered SQL files — run in order
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_opportunities.sql
│   │   ├── 003_create_tasks.sql
│   │   ├── 004_create_notes.sql
│   │   ├── 005_create_inbox_items.sql
│   │   └── 006_create_imports.sql
│   ├── scripts/
│   │   ├── migrate.ts               # Runs all migrations in order
│   │   ├── seed.ts                  # Creates sample users + opportunities
│   │   └── sample-import.xls        # Sample SF export for testing imports
│   └── src/
│       ├── index.ts                 # Express app entry point + route registration
│       ├── db/
│       │   └── index.ts             # pg Pool, query(), queryOne() helpers
│       ├── middleware/
│       │   └── auth.ts              # requireAuth, requireManager JWT middleware
│       ├── types/
│       │   └── index.ts             # AuthenticatedRequest, User, ok(), err() helpers
│       ├── services/
│       │   └── importService.ts     # SF file parser + reconciliation logic
│       └── routes/
│           ├── auth.ts              # POST /auth/login, POST /auth/logout, GET /auth/me
│           ├── opportunities.ts     # GET/PATCH opportunities, POST import, GET import/history
│           ├── tasks.ts             # POST/PATCH/DELETE tasks
│           ├── notes.ts             # GET/POST notes (append-only)
│           ├── inbox.ts             # GET/POST/PATCH/DELETE inbox items, POST convert
│           ├── insights.ts          # All GET /insights/* endpoints
│           └── users.ts             # GET/POST/PATCH/DELETE users, PATCH me/preferences
│
├── docker-compose.yml               # PostgreSQL 16 service
├── .env.example                     # Template — commit this
├── .env                             # Real secrets — never commit
└── CLAUDE.md                        # Full project specification for AI-assisted development
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
| `show_qualify` | boolean | Pipeline filter preference (per-user) |
| `last_login_at` | timestamptz | Updated on each login |

#### `opportunities`
The central table. SF-owned fields are updated on every import; app-managed fields are never overwritten.

Key columns:
- `sf_opportunity_id` — immutable SF record ID, reconciliation key
- `name`, `account_name`, `stage`, `arr`, `close_date` — core SF fields
- `deploy_mode`, `fiscal_period` — deployment model and fiscal quarter
- `se_comments`, `se_comments_updated_at` — SE comments + freshness tracking
- `technical_blockers`, `agentic_qual` — MEDDPICC fields
- `poc_status`, `poc_start_date`, `poc_end_date`, `poc_type` — PoC tracking
- `rfx_status` — RFx tracking
- `stage_changed_at`, `previous_stage` — powers Stage Movement insight
- `se_owner_id` — app-managed SE assignment (not from SF)
- `is_closed_lost`, `closed_at`, `closed_lost_seen` — closed lost tracking
- `sf_raw_fields` JSONB — all 55 SF columns stored raw (future columns auto-captured)

#### `tasks`
| Column | Notes |
|--------|-------|
| `opportunity_id` | FK to opportunities |
| `title`, `description` | Task content |
| `status` | `open`, `in_progress`, `done`, `blocked` |
| `is_next_step` | Promoted to Next Steps section in detail view |
| `due_date` | Drives grouping in My Tasks |
| `assigned_to_id` | FK to users |
| `is_deleted` | Soft delete |

#### `notes`
Append-only — no UPDATE or DELETE ever issued on this table.

#### `inbox_items`
Personal scratch pad per user. Supports conversion to tasks or notes on an opportunity.

#### `imports`
Log of every SF import: filename, row counts, added/updated/closed-lost counts, status, error log.

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
| GET | `/opportunities` | Auth | Pipeline list; supports `?search=`, `?stage=`, `?se_owner=`, `?include_qualify=` |
| GET | `/opportunities/:id` | Auth | Full detail with tasks + notes |
| PATCH | `/opportunities/:id` | Manager | Update `se_owner_id` |
| POST | `/opportunities/import` | Manager | Upload SF export (multipart or raw POST) |
| GET | `/opportunities/import/history` | Manager | Last 50 imports |
| GET | `/opportunities/closed-lost` | Auth | Closed lost list with unread count |
| POST | `/opportunities/closed-lost/mark-read` | Auth | Mark records as seen |

### Tasks
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/tasks` | Auth | Current user's tasks |
| POST | `/opportunities/:id/tasks` | Auth | Create task on an opportunity |
| PATCH | `/tasks/:id` | Auth | Update title, description, status, due_date, is_next_step |
| DELETE | `/tasks/:id` | Auth | Soft delete |

### Notes
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/opportunities/:id/notes` | Auth | All notes for an opportunity |
| POST | `/opportunities/:id/notes` | Auth | Append a note |

### Inbox
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/inbox` | Auth | Current user's open inbox items |
| POST | `/inbox` | Auth | Create jot |
| PATCH | `/inbox/:id` | Auth | Edit text, mark done |
| POST | `/inbox/:id/convert` | Auth | Link to opportunity, convert to task or note |
| DELETE | `/inbox/:id` | Auth | Soft delete |

### Insights (Manager only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/insights/stage-movement` | `?days=7\|14\|30` |
| GET | `/insights/missing-notes` | `?threshold_days=` |
| GET | `/insights/team-workload` | Per-SE task/deal counts |
| GET | `/insights/overdue-tasks` | Grouped by SE |
| GET | `/insights/rfx` | All deals with rfx_status set |
| GET | `/insights/poc` | All deals with poc_status set |
| GET | `/insights/deploy-mode` | All active deals with deploy_mode |

### Users (Manager only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | All users |
| POST | `/users` | Create user |
| PATCH | `/users/me/preferences` | Update `show_qualify` for current user |
| PATCH | `/users/:id` | Update name, email, role, is_active |
| DELETE | `/users/:id` | Soft deactivate (can't self-deactivate) |

### AI
| Method | Path | Description |
|--------|------|-------------|
| POST | `/opportunities/:id/summary` | Generate AI summary via Claude API |

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
docker ps   # look for 'se-pipeline-tracker-db-1' with status 'healthy'

# 5. Run migrations
cd server && npm install && npm run migrate

# 6. Seed sample data (1 manager, 3 SEs, 5 opportunities)
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
| `POSTGRES_USER` | DB user (default: `pipeline_user`) |
| `POSTGRES_PASSWORD` | DB password |
| `POSTGRES_PORT` | DB port (default: `5432`) |
| `DATABASE_URL` | Full connection string for the backend |
| `PORT` | Backend server port (default: `3001`) |
| `JWT_SECRET` | Secret for signing JWTs — use a long random string in production |
| `JWT_EXPIRES_IN` | Token TTL (default: `7d`) |
| `ANTHROPIC_API_KEY` | API key for AI summary feature |
| `VITE_API_URL` | Backend base URL seen by the browser (default: `http://localhost:3001/api/v1`) |

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

The Insights sidebar section is hidden for SE role. All `/insights/*` and `/users` API routes enforce `requireManager` middleware — a 403 is returned if an SE attempts to call them directly.

---

## Salesforce Import Pipeline

Salesforce data comes in as an XLS export of an Opportunities report. The file is actually HTML-in-XLS format (Salesforce's default export) — it is parsed as an HTML table, not a native XLS binary.

### Import flow

1. Upload via `POST /api/v1/opportunities/import` (multipart file upload or raw POST — supports future automation)
2. Parse file as HTML table → extract 55 column values per row
3. For each row, match on `sf_opportunity_id`:
   - **Match found**: update all SF-owned fields; if `stage` changed → set `stage_changed_at`, `previous_stage`; if `se_comments` changed → set `se_comments_updated_at`; never touch `se_owner_id`, tasks, or notes
   - **New SF ID**: insert new opportunity record
   - **SF ID absent from this import but previously active**: mark as Closed Lost (`is_closed_lost = true`, `closed_at = now()`, `closed_lost_seen = false`)
4. Store complete raw row in `sf_raw_fields` JSONB — future SF columns are automatically captured without a schema migration
5. Log result to `imports` table

### Important notes

- The import always contains **open opportunities only** — there is no "Closed Lost" status in the SF export feed
- The first import establishes the baseline; from the second import onwards, absent SF IDs are treated as newly Closed Lost
- `technical_blockers` and other fields not yet in the current SF export auto-populate from `sf_raw_fields` once Salesforce includes them — no code change needed

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

## Future Roadmap

Features designed for but not yet implemented (architecture already supports them):

### Near-term
- **Inbox page** — currently a placeholder; backend is complete
- **SE owner assignment UI** — PATCH endpoint exists, frontend control not yet added to opportunity detail
- **Role-based route guard on frontend** — SEs can reach `/insights/*` by typing the URL directly; a redirect guard would close this gap
- **Password change** — users currently can't change their own password; requires a new endpoint

### Medium-term
- **Automated SF import** — `POST /opportunities/import` already accepts programmatic POSTs; a scheduled script or Cowork integration can trigger it without any backend changes
- **Email / Slack forwarding to Inbox** — `inbox_items` table has `source`, `source_ref` columns ready; needs a webhook receiver
- **Slack notifications** — overdue tasks, stage changes; needs a notification service module + Slack bot token
- **Google SSO** — Ataccama Google Workspace login; JWT architecture has the provider-swap slot ready

### Longer-term
- **AE read-only access** — view-only role with no task/note creation
- **Sales leadership dashboard** — cross-team rollup view
- **Mobile layout** — Tailwind breakpoints used from day one; primarily a CSS effort
- **Export to CSV / PDF** — deal lists and insight views
- **Multi-team support** — currently single-team; would require a `team_id` FK on users and opportunities

### Cloud migration path
Everything runs in Docker Compose — cloud deployment is a container lift-and-shift:
- **AWS**: RDS (PostgreSQL) + ECS Fargate (backend) + S3/CloudFront (frontend) + Secrets Manager
- **Azure**: Azure Database for PostgreSQL + Container Apps + Static Web Apps + Key Vault

---

## Development Notes

### Adding a new Insights page
1. Create `client/src/pages/insights/YourPage.tsx`
2. Add a route case in `client/src/pages/InsightsPage.tsx`
3. Add the default entry to `DEFAULT_INSIGHTS_NAV` in `client/src/utils/insightsNav.ts` — it will automatically appear in the sidebar and in the Insights Menu settings page
4. Add a backend endpoint in `server/src/routes/insights.ts`

### Adding a new SF field
If Salesforce adds a column to the export:
1. It is automatically stored in `sf_raw_fields` JSONB on the next import
2. To promote it to a dedicated column: write a numbered migration SQL file, update the column mapping in `server/src/services/importService.ts`, backfill from `sf_raw_fields`

### Running migrations manually
```bash
cd server
npm run migrate
```

### Wiping and re-seeding the database
```bash
docker compose down -v   # destroys the volume
docker compose up -d
cd server && npm run migrate && npm run seed
```
