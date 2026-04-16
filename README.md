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
| See upcoming PoC timelines, RFx deadlines, and task due dates | Calendar page |
| Quickly jot something down without leaving the current view | Quick Capture (Ctrl+K) |
| Link a jot to a deal and convert it to a task or note | Inbox page |
| See when my SE comments are going stale | Pipeline — freshness indicator on each row |
| See the health score of my deals and drill into at-risk ones | Pipeline — Health Score column + At-risk filter |
| Reassign the SE Owner on a deal without leaving the drawer | Opportunity header — SE Owner pill |
| Add myself as a contributor on a teammate's deal | Opportunity header — Contributors strip |
| Apply a reusable task pack or note template to a deal | Opportunity Work tab — **Use template** picker |
| Undo a recent delete or reassignment | Sidebar footer — **Recent actions** |
| See what changed in the latest release | Sidebar footer — **What's New** |
| Review my favorited deals without VPN or internet | Any cached page — data served from local IndexedDB cache (see [Offline mode (PWA)](#offline-mode-pwa)) |
| Add a note / complete a task / reassign an SE while offline | Normal drawer actions — edits queue locally and flush on reconnect |

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
| Analyse closed lost deals by competitor, industry, segment, and stage | Insights → Loss Analysis |
| Reassign SE Owner on a closed (Won or Lost) deal | Insights → Loss Analysis → Filtered Deals table (Manager only) |
| Run the weekly SE forecast call | Insights → Forecasting Brief |
| Assign or reassign SE owners across deals | Insights → SE Deal Mapping |
| Generate an AI analysis of pipeline blockers | Insights → Tech Blockers → AI Insights |
| Drill into a specific SE's workload or overdue tasks | Team Workload — click any stat |
| Prep for an SE 1:1 with a ready-made brief | Insights → 1:1 Prep |
| Track Closed Won ARR for bonus calculation | Insights → Closed Won |
| See Closed Won progress against quota targets | Insights → % to Target |
| Compare team and per-SE win rates (overall / technical / negotiate) | Insights → Win Rate (work in progress) |
| Visualise the pipeline with funnel + charts | Insights → Pipeline Analytics |
| Define reusable task packs and note templates for SEs | Settings → Templates |
| Configure quota groups used by % to Target | Settings → Quotas |
| Control which roles can see which pages | Settings → Role Access |
| Manage team members and their roles | Settings → Users |
| View Salesforce import history and roll back imports | Settings → Import History |
| Customize which Insights and nav pages appear in the sidebar | Settings → Menu Settings |
| Trigger a Salesforce data import | Settings → Import (file upload) |
| Back up or restore all app data | Settings → Backup |
| Deploy a new frontend build from the browser | Settings → Deploy |
| Test the offline experience without disconnecting from VPN | Settings → Developer — **Simulate offline mode** |
| Review team usage and track system actions | Audit |

---

## Features

### Pipeline View (`/pipeline`)
- Paginated list of active (open) opportunities
- Default view: **Build Value and above** — Qualify stage hidden by default
- Qualify toggle: per-user preference (stored in DB), shows count of hidden Qualify deals
- Columns: configurable via **Column Picker** — reorderable, saveable per user
- **SE Comments freshness indicator**: green dot (≤7 days), amber (8–21 days), red (>21 days), grey (never)
- **Deal Health Score**: 0–100 computed score per opportunity; green (70–100), amber (40–69), red (0–39). Hover for a factor breakdown tooltip. Five factors: MEDDPICC completeness (−30 max), overdue tasks (−20 max, primary signal), SE Comments freshness (−25 max), note freshness (−20 max), time in current stage (−15 max). **At-risk only** filter button surfaces all red and amber deals instantly
- Filters: Stage (multi-select), Fiscal Period (multi-select), text search, At-risk health score; deep-link filter `?se_id=<n>` pre-filters by SE owner (used from Team Workload drill-through)
- Sort: any column, click header to cycle asc/desc/off
- Quick Capture button on each row (hover to reveal)

### Calendar (`/calendar`)
- Month-by-month view consolidating PoC timelines, RFx submission dates, and task due dates
- **PoC events**: multi-day bars spanning PoC start → end date; overdue end dates highlighted red
- **RFx events**: single-day markers on the RFx submission date
- **Tasks**: open tasks appear on their due date
- Team scope selector to switch between personal and full-team view
- Click any event to open the opportunity detail drawer

### Closed Lost (`/closed-lost`)
- Deals that disappeared from the SF import (= Closed Lost)
- Sorted by closed date, newest first
- **Unread badge** on sidebar nav item — count of deals not yet seen
- Auto-marks as read when navigating to the tab
- Still shows tasks and notes on closed deals (read-only)
- **Closed Won detection**: if a deal disappears from SF while in the *Submitted for Booking* stage, it is classified as **Closed Won** (new `is_closed_won` / `closed_won_seen` columns) instead of Closed Lost — Won deals do not appear in Closed Lost or Loss Analysis

### Opportunity Detail (slide-in drawer)
- Opens from any deal row in Pipeline, Closed Lost, or Insights views
- **Header**: opp name, account name (clickable — opens Account History panel), stage, ARR, close date, "Health" score pill, "MEDDPICC" score pill, lightbulb coach button, Summarize button
- **Inline SE Owner pill** — click the SE Owner next to the title to open a compact search popover and reassign without a drawer round-trip. Managers can assign any active SE or unassign; SE owners can hand off or unassign themselves; SEs can self-assign an unassigned opp. Permissions mirror the server PATCH handler
- **Contributors strip** — zero-or-more SE teammates who also work on the deal, in addition to the single SE Owner. Add/remove via the `+` chip. Managers and the current SE Owner can manage anyone; any SE can add or remove themselves. Data lives in the `opportunity_se_contributors` table and is also surfaced in the Deal Info tab when the Contributors section is enabled in the Deal Info Layout
- **AI Summary** — collapsible panel below the header. Shows freshness indicator (green <=3d, amber <=14d, red 14d+). Summary is persisted server-side. Regenerate button to refresh on demand
- **MEDDPICC Gap Coach** — lightbulb button triggers AI analysis of all 9 MEDDPICC elements (Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Implicate Pain, Champion, Budget, Authority). Shows Green/Amber/Red per element with evidence, gaps, and suggested discovery questions. Collapsible panel below AI Summary with freshness indicator. Results cached server-side
- **4 tabs** replacing the previous two-column layout:
  - **Work** — Next Steps, Tasks, Notes, Meeting Notes Processor (paste raw call notes, AI extracts action items and creates tasks/notes)
  - **Timeline** — unified reverse-chronological event history (tasks, notes, stage changes, imports, AI summaries)
  - **Call Prep** — AI-generated pre-call brief with CSV/DIFF/KB source badges, PDF export button, Slack send placeholder
  - **Demo Prep** — AI-generated demo readiness brief (6 critical questions with evidence, missing items, suggested commitments, coaching tips, overall assessment, Before-You-Demo checklist). Persisted server-side. PDF export and Slack send buttons mirror Call Prep
  - **Deal Info** — configurable layout of SF fields (sections reorderable by manager in Settings). Includes MEDDPICC section with "Show AI notes" toggle that overlays coach insights inline next to each field
- **Account History panel**: click the account name in the header to see all deals (open and closed) for that account in a side panel

### Home / Daily Digest (`/home`)
- Landing page shown after login
- **Summary KPI cards**: Overdue, Due Today, PoC Alerts, New Closed Lost, **Needs Attention** (data hygiene count)
- **Sections**: Today's Tasks, PoC Alerts, Recent Activity, Stale Deals, Upcoming This Week, **Needs Attention**
- **AI Quick Links**: Pre-Call Brief, Process Call Notes, Opp Summary, and Demo Prep — each lets you pick an opportunity via search, then opens the drawer with that AI feature activated
- **SE Data Hygiene ("Needs Attention")**: surfaces deals with SE-responsibility issues. Each flagged deal shows issue badges. Detection rules:
  - **Stale SE Comments** — `se_comments_updated_at` > 21 days or never set
  - **PoC not started on time** — past PoC Start Date but status still Identified/In Deployment
  - **PoC overrunning** — status In Progress but past PoC End Date
  - **PoC wrap-up overdue** — status Wrapping Up but past PoC End Date
  - **PoC timeline too long** — Start-to-End span exceeds 6 weeks
  - **Missing PoC planning** — Develop Solution stage with no PoC Status or Start Date
  - **Missing Tech Blockers** — Develop Solution or later with empty Technical Blockers/Risk
  - **Demo mentioned, no follow-up** — "demo" keyword in SE Comments/Next Step but no note in 7 days

### My Pipeline (`/my-pipeline`)
- Personal pipeline view scoped to the logged-in user's deals
- Same columns, filters, sort, and column picker as the global Pipeline view
- SE Owner filter is locked to the current user (cannot be changed)

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

### Offline mode (PWA)

The app keeps a local copy of the data you've recently viewed so it continues to work off VPN or on a dropped connection. Designed for the common case of a laptop on a train, a conference Wi-Fi that's strict about routing, or working briefly without reconnecting to the corporate VPN.

**Storage layers**

| Layer | What | How long |
|---|---|---|
| Service Worker Cache | App shell (HTML/JS/CSS/fonts/icons) | Replaced on each deploy |
| IndexedDB | Opportunity list, opp drawer payloads, favorites, users, mentions, Home digest, Calendar events | Capped at 500 MB; oldest drawer payloads evicted first (favorites never evicted); wiped on logout |

**What's cached automatically**
- Your team's pipeline list and any opp drawer you've opened, across all pages.
- Favorites, users list, `@`-mention feed, Home digest, Calendar events.
- Pages other than the above are cached **on-demand** — visit a page once while online and it'll be available offline afterwards.

**Installable**
- Chrome / Edge will offer an "Install app" prompt — optional. When installed, the app launches in its own window with the Ataccama symbol, no address bar.
- Same codepath online or installed — no native binary.

**Connection indicator** (sidebar footer)

| State | Meaning |
|---|---|
| 🟢 Live | Connected, latest data |
| 🟣 Syncing… | Background refresh in progress |
| 🟡 Cached N min ago | Online but last successful fetch is > 5 min old — click to see detail + Sync now |
| 🟣 Offline | Network unreachable — data is being served from cache; pending writes queue locally |

**Offline banner** appears above page content when the app can't reach the server. Non-cached rows on the Pipeline are dimmed to signal they need a reconnect to open.

**Favorites = your offline pin**
The Favorites page carries an info banner explaining that favoriting a deal also keeps it available offline. No separate pin-for-offline primitive — one action, two meanings. Cache size and last-synced timestamp shown in the banner; **Sync now** / **Clear offline cache** buttons next to them.

**Queued writes (Phase 2)**

Four write types are queued when you're offline and flushed automatically on reconnect:

| Kind | Conflict risk | Handling |
|---|---|---|
| **Add note** | None — notes are append-only | Fire-and-forget flush. Shows as `(you — pending sync)` in the drawer until synced |
| **Create task** | None — new rows can't conflict | Fire-and-forget flush |
| **Edit task** | Real — someone else may have edited in the meantime | Optimistic-concurrency version guard: client captures `updated_at` at edit time; server rejects with HTTP 409 if the row has moved |
| **Reassign SE Owner** | Real — another manager may have reassigned | Same version-guard protocol |

**Conflict review**
When a queued write is rejected on flush, it lands in a conflict queue and surfaces via:
- A small **amber toast** after the flush completes ("Synced N · M need review") with a direct link to the review page.
- The **connection indicator dropdown** showing "N changes need review".
- A dedicated **Review Offline Changes** page (`/review-offline-changes`) showing per-conflict cards with:
  - What you tried to do (captured at queue time)
  - The current server state (captured when the flush was rejected)
  - Who made the conflicting change, if known
  - Per-card actions: **Re-apply my change** (force-overwrite without the version guard), **Keep current** (discard your queued edit), or **View opportunity**

**Reconnect toast**
When a flush completes cleanly, a brief green "Synced N changes" chip appears at the bottom of the screen and dismisses after 8 seconds. No interruption for the all-clean path — the chip is informational, not a modal.

**Optimistic UI**
Offline writes update the UI immediately. Notes render with a "(you — pending sync)" author label; reassign pills turn amber; task edits merge the patch onto the current view. When the flush succeeds, the next refetch replaces the optimistic row with the real server data.

**Security & storage notes**
- Logout wipes the entire local cache so a shared laptop can't leak previous users' deals.
- The app calls `navigator.storage.persist()` so the browser won't evict the cache under disk pressure.
- Cached data is readable by anyone with access to your browser profile — OS-level disk encryption (BitLocker / FileVault, standard on corporate laptops) is the right layer for that.
- Cache is per-browser-profile — Chrome at the office and Edge at home are separate caches.

**Testing offline without dropping VPN**
Admins can flip **Settings → Developer → Simulate offline mode** to short-circuit every request with a synthetic Network Error. A persistent red `SIMULATED OFFLINE` chip pins to the bottom-right corner while it's on so you can't accidentally leave it running; click the chip to turn it off.

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

#### Loss Analysis (`/insights/closed-lost-stats`)
- Renamed from "Closed Lost Stats" / "Win/Loss Analysis" — includes Closed Lost deals only (Closed Won deals are detected and excluded)
- Pie-chart dimensions: **By Stage at Close, By Competitor, By Industry, By Segment, By Record Type, By Team, By SE Owner, By AE Owner**
- KPI cards: Deals Lost, ARR Lost, Avg Deal Size, **Avg Days in Pipeline** (first-seen → closed-lost)
- Metric toggle: `# Deals` / `ARR`; Time filter: 30d / 90d / 1yr / All
- Click any pie slice to cross-filter across every chart
- Competitors parsed from comma/semicolon/slash/pipe/` and `/` & `-delimited strings into per-competitor slices
- Deals lost in Qualify stage are excluded (not "qualified pipeline")
- **Filtered Deals table** (always visible) with an editable **SE Owner** column — Manager users can reassign SE ownership on Closed Won / Closed Lost deals inline; SEs see it read-only

#### Forecasting Brief (`/insights/forecasting-brief`)
- Manager-only SE forecast call prep page
- **Current FQ tab**: KPI cards (pipeline total, commit+ML, SE engagement health), forecast table with expandable rows showing inline AI summary, SE comments, tech status & MEDDPICC gaps, plus an AI-generated forecast narrative
- **Key Deals tab**: collapsible deal cards for must-discuss opportunities
- Expanded rows open the full Opportunity Detail drawer
- Thursday stale-comment alerts; Friday auto-refresh of the AI narrative
- Includes `forecast_category` field backed by the SF import

#### Agentic Qual (`/insights/agentic-qual`)
- Table of active opportunities with an Agentic Qualification value set in Salesforce
- **Recently Changed tab**: field history for `agentic_qual` with 14/30/60/90d window
- Filter by SE owner, stage, and text search

#### Team Tasks (`/insights/team-tasks`)
- Kanban and List views for all tasks across the team
- Filters: status, assignee, due date, text search
- Kanban columns map to task statuses (open, in progress, done, blocked)
- List view with sortable columns

#### Weekly Pipeline Digest (`/insights/weekly-digest`)
- Manager-facing weekly summary of pipeline activity
- **Period toggle**: 7d / 14d / 30d
- **Summary stat cards**: ARR moved forward, ARR closed lost, net pipeline, new qualified, stale deals
- **Collapsible sections**: Stage Progressions, Stale Deals, PoCs Started/Ended, Deals Flagged At-Risk, Closed Lost This Period

#### SE Deal Mapping (`/insights/se-deal-mapping`)
- Kanban or table view for assigning/reassigning SE owners across all active opportunities
- Drag-and-drop between SE columns in kanban view
- Sortable table view with column picker
- Filter by SE, stage, text search

#### 1:1 Prep (`/insights/one-on-one`)
- Manager-only one-page brief for 1:1 meetings with each SE
- SE picker dropdown; deep-link via `?se=<id>`
- **Stat cards**: Open Opps, Total ARR, Health RAG breakdown, Overdue Tasks, Stale Comments, **Hygiene Issues**
- **Sections**: AI Coaching Brief (collapsible), Overdue Tasks, Due This Week, Deals Missing SE Notes, **Data Hygiene — Needs Attention** (table of flagged deals with issue badges, same 8 rules as the Home page), Deals with No Next Step, Recent Stage Movements, All Open Opportunities

#### Closed Won (`/insights/closed-won`)
- Closed Won report for SE bonus calculation. Aggregates Closed Won ARR in USD (`arr_converted`)
- **View toggle**: **By Territory** (Team → SE) or **By SE** (SE → Team breakdown; SE totals are global across territories)
- Filter by fiscal year (dropdown) and quarter (All / Q1-Q4). Bucketing uses `closed_at`-based months — aligned with `/insights/percent-to-target`
- New-business only — New Logo + Upsell + Cross-Sell (Services + Renewal excluded)
- Rows expand to show underlying deals; click a deal to open the opp drawer

#### % to Target (`/insights/percent-to-target`)
- Manager-only report showing Closed Won progress against configured quota targets
- Each configured quota group renders as a donut + month-over-month sparkline; a combined chart compares all groups against the linear FY pace line
- Filter by FY and quarter (All YTD / Q1-Q4) — switching the quarter changes the "as-of" point used by all charts
- New business only, USD via `arr_converted`. Groups are configured in Settings → Quotas

#### Win Rate (`/insights/win-rate`) — work in progress
- Team-level and per-SE win-rate metrics. The page renders an amber "Work in progress" banner at the top because the numbers are still being validated
- **Three metrics**:
  - **Overall Win Rate** — Won / (Won + Lost)
  - **Technical Win Rate** — share of closed deals that reached Negotiate; proxies "did the SE earn a technical win?"
  - **Negotiate Win Rate** — share of Negotiate-reaching deals that Closed Won; proxies "once the technical side was solved, did we commercial-close?"
- Filterable by FY and quarter (All / Q1-Q4), same bucketing as Closed Won and % to Target
- Per-SE rows expand to show the underlying deals with "reached Negotiate" and Won/Lost badges
- New business only (New Logo + Upsell + Cross-Sell)

#### Pipeline Analytics (`/insights/analytics`)
- Visual dashboard of the active pipeline
- **Charts**: Funnel chart (ARR by stage), ARR by SE owner (stacked by stage), ARR by record type (donut), ARR by close month (bar chart), Stage velocity (avg days in stage with RAG colouring)
- **Summary KPI cards**: total pipeline, converted ARR, key deals, average deal size

### Settings (Manager only)

#### Users (`/settings/users`)
- List all team members with role badge, last login, active/inactive status
- Add new user; toggle role; deactivate/reactivate

#### Import (`/settings/import`)
- Upload a Salesforce Opportunities `.xls` export to sync deal data
- Dry-run preview before confirming

#### Import History (`/settings/import-history`)
- Log of all imports with rollback capability (most recent import can be undone)

#### Backup & Restore (`/settings/backup`)
- **Back Up Now** — creates a full JSON snapshot (users, tasks, notes, SE assignments) and uploads to a private S3 bucket (90-day retention)
- **S3 backup list** — browse all available backups; download any backup as a JSON file
- **Restore from file** — upload a local backup, preview what will be restored, confirm to apply
- Restore handles circular FK dependencies (manager_id) and resets PostgreSQL sequences; SE assignments are matched by email so they survive a wipe-and-restore

#### Deploy (`/settings/deploy`)
- Shows **current deployed SHA** vs **latest GitHub commit** — highlights when an update is available
- **Deploy button** triggers the server to download the latest GitHub tarball, rebuild the React frontend in-process (npm ci + Vite build) on EC2, upload the built `dist/` to S3, and submit a CloudFront cache invalidation
- **Live log terminal** auto-polls every 2 seconds and auto-scrolls as build lines arrive
- **Commit history panel** — lists the 20 most recent GitHub commits with deploy-scope badges (`[fe]`, `[be]`, `[fe+be]`, `[infra]`)

#### Deal Info Layout (`/settings/deal-info-config`)
- Manager settings page to configure the Deal Info tab layout in Opportunity Detail
- Sections can be reordered and toggled on/off
- Individual fields can be added from any SF column available in the opportunities table
- Configuration stored server-side (applies to all users)
- **Live preview panel** showing the configured layout with real opportunity data

#### Menu Settings (`/settings/menu-settings`)
- **Main nav**: toggle visibility and reorder Calendar, SE Mapping, PoC Board, RFx Board
- **Insights nav**: toggle and reorder manager Insights pages in the sidebar
- Drag-and-drop reorder; reset to default

#### Templates (`/settings/templates`)
- Reusable **task packs** and **note templates** SEs can apply in one click from the Work tab of any opportunity
- **Task packs**: ordered list of tasks with per-task due-date offsets (`+Nd`) and optional `is_next_step` flags. Example: "PoC Kickoff" → 6 tasks staggered across a week
- **Notes**: prefilled note body (e.g. a "Call Recap" structure)
- Each template can be scoped to a specific stage or left global
- SEs see a **Use template** picker next to "+ Add task" and "+ Add note" on the opportunity drawer, filtered to the deal's current stage plus any global templates
- List shows kind, scope, author, item count, and a short content preview per template

#### Quotas (`/settings/quotas`)
- Configure quota groups used by the **% to Target** Insights page
- Three rule types: **All Closed Won (Global)**, **By team(s)**, or **By AE owner(s)**. The same deal can count toward multiple groups
- Seeded with Global ($16M), NA ($11.4M, NA Enterprise + NA Strategic), INTL ($6.12M, EMEA + ANZ), and DACH ($1.5M, AE = Thomas Miebach)

#### Role Access (`/settings/role-access`)
- Admin-only matrix that controls which roles (Manager / SE / Viewer) can see each page
- Pages grouped into **Main Navigation**, **Insights**, and **Administration** — section-level checkboxes toggle a whole group at once
- Admin users always see Administration pages regardless of the matrix
- Backed by the `role_page_access` table; every new page must also be added to `PAGE_REGISTRY` in `RoleAccessPage.tsx` and seeded via migration (see CLAUDE.md for the three-place checklist)

#### Developer (`/settings/developer`)
- Admin-only debug surface. Affects only your browser — other users are unaffected.
- **Simulate offline mode** toggle — short-circuits every API request with a synthetic `ERR_NETWORK` so the offline codepaths (cache fallback, offline banner, queued writes) exercise end-to-end without dropping VPN. Persists in `localStorage`. A floating red "SIMULATED OFFLINE" chip pins to the bottom-right corner while it's on; click to disable
- **Offline cache storage** readout — current IndexedDB usage vs browser quota, with a **Clear offline cache** button for resetting between tests

### Audit (`/audit`)
Manager-only usage analytics and activity log.

#### Usage tab
- **Page view counts** — how many times each route was visited, unique users, last seen
- **Feature usage** — non-navigation events (opportunity opens, task creates, imports, etc.) grouped by action and entity type
- **Per-user activity** — total event count and last-seen per team member (180-day window)

#### Activity Log tab
- Paginated, append-only log of every significant server-side action: logins, user management, imports, SE assignments, task changes, backups, deploys
- Filterable by time window (7–180 days), user, and action type
- Expandable rows show before/after JSON diff for mutations

### Sidebar Navigation
- Collapsible **Insights** and **Settings** sections (manager only)
- Main nav items (Calendar, SE Mapping, PoC Board, RFx Board) are user-configurable
- Insights nav order is user-configurable (see Menu Settings above)

### Sidebar Footer — Connection indicator, Recent Actions, What's New

Always-visible controls pinned in the sidebar footer:

#### Connection indicator
- Shows the app's current network state: 🟢 Live / 🟣 Syncing… / 🟡 Cached N min ago / 🟣 Offline
- Click the pill (when cached or offline) to see last-synced time and a **Sync now** / **Try reconnect** button
- Full details in [Offline mode (PWA)](#offline-mode-pwa)

#### Recent Actions (Undo)
- Lists destructive actions you've taken in the **last 30 days** and lets you undo them inline
- Covers: deleted tasks, deleted Inbox items, SE Owner reassignments
- Reassignment history is tracked in a new `se_assignment_history` table; tasks and inbox items now carry `deleted_at` timestamps to bound the restore window
- Actions that can no longer be safely reverted (e.g. the opp was reassigned again by someone else after you) are shown as **Not undoable** with the reason
- A startup cleanup job hard-deletes soft-deleted rows past the 30-day window

#### What's New
- Opens a drawer with the full release history parsed from `CHANGELOG.md`
- Entries published since your last visit are highlighted with a **New** badge; the sidebar button shows an unread count
- Opening the panel marks entries as seen so the badge clears until the next release

---

## Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 19 + TypeScript + Vite | Strict TS |
| Styling | Tailwind CSS 4 | Custom Ataccama brand token configuration |
| State management | Zustand | Auth store, pipeline store |
| HTTP client | Axios | Typed API functions per domain |
| Backend | Node.js + Express + TypeScript | REST API |
| Database | PostgreSQL 16 | Docker locally; AWS RDS in production |
| ORM | Raw SQL via `pg` | Parameterized queries throughout — no ORM |
| Auth | JWT + bcrypt | Stateless sessions |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) | AI Summary, MEDDPICC Gap Coach, Call Prep, Demo Prep, Meeting Notes Processor, Forecasting Brief narrative, Tech Blockers AI Insights |
| Containerization | Docker + Docker Compose | One-command local start |
| Hosting | AWS EC2 + CloudFront + S3 | EC2 runs the backend container; S3/CloudFront serves the frontend |

### Key frontend libraries
- `react-router-dom` v7 — client-side routing
- `zustand` — lightweight global state
- `axios` — HTTP client
- `tailwindcss` — utility-first CSS
- `idb` — typed wrapper around IndexedDB for the offline data cache
- `vite-plugin-pwa` (+ Workbox) — service worker, web manifest, and installable PWA shell

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
│       │   ├── backup.ts
│       │   ├── deploy.ts
│       │   └── users.ts
│       ├── components/
│       │   ├── Sidebar.tsx          # Nav with collapsible sections, dynamic insights nav
│       │   ├── Drawer.tsx           # Slide-in panel used by all list views
│       │   ├── OpportunityDetail.tsx
│       │   ├── CallPrepTab.tsx         # AI pre-call brief with source badges + PDF export
│       │   ├── MeetingNotesModal.tsx   # Paste call notes → AI extracts tasks/notes
│       │   ├── AccountTimelinePanel.tsx # Account History side panel
│       │   ├── OpportunityTimeline.tsx  # Unified reverse-chronological event history
│       │   ├── ProtectedRoute.tsx
│       │   ├── QuickCapture.tsx     # Ctrl+K global modal
│       │   ├── RowCapture.tsx       # Inline quick-capture on list rows
│       │   ├── ColumnPicker.tsx     # Reorderable column selector
│       │   ├── opportunity/
│       │   │   ├── TaskSection.tsx
│       │   │   ├── NoteSection.tsx
│       │   │   └── DealInfoTab.tsx      # Configurable SF fields layout + MEDDPICC AI overlay
│       │   └── shared/
│       │       ├── StageBadge.tsx
│       │       ├── StatusChip.tsx
│       │       ├── FreshnessDot.tsx
│       │       ├── MultiSelectFilter.tsx  # Generic multi-select dropdown
│       │       ├── SortableHeader.tsx     # Clickable sortable table header
│       │       └── TruncatedCell.tsx
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── ChangePasswordPage.tsx
│       │   ├── HomePage.tsx            # Daily Digest landing page
│       │   ├── PipelinePage.tsx
│       │   ├── MyPipelinePage.tsx       # Personal pipeline (SE owner locked)
│       │   ├── ClosedLostPage.tsx
│       │   ├── MyTasksPage.tsx
│       │   ├── CalendarPage.tsx     # Month view: PoC timelines, RFx dates, task due dates
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
│       │   │   ├── AgenticQualPage.tsx
│       │   │   ├── WeeklyDigestPage.tsx  # Manager weekly pipeline summary
│       │   │   ├── TeamTasksPage.tsx     # Kanban + List task views
│       │   │   └── shared.tsx       # Loading, Empty shared components
│       │   └── settings/
│       │       ├── UsersPage.tsx
│       │       ├── ImportPage.tsx
│       │       ├── ImportHistoryPage.tsx
│       │       ├── BackupPage.tsx        # Backup & Restore
│       │       ├── DeployPage.tsx        # In-app frontend deploy
│       │       ├── InsightsMenuPage.tsx  # Menu Settings — main nav + insights nav config
│       │       ├── DealInfoConfigPage.tsx # Deal Info tab layout configuration
│       │       └── HowToPage.tsx
│       ├── pages/
│       │   └── AuditPage.tsx            # Usage stats + activity log (manager only)
│       ├── store/
│       │   ├── auth.ts
│       │   └── pipeline.ts
│       ├── types/
│       │   └── index.ts
│       └── utils/
│           ├── formatters.ts
│           ├── insightsNav.ts       # Insights nav config — localStorage + defaults
│           ├── mainNav.ts           # Main nav config — localStorage + defaults
│           └── sortRows.ts          # Generic multi-type sort utility
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
│   │   ├── 010_create_ai_summary_cache.sql
│   │   ├── 011_add_user_deleted.sql
│   │   ├── 012_add_force_password_change.sql
│   │   ├── 013_add_manager_id.sql
│   │   ├── 014_add_rfx_submission_date.sql
│   │   ├── 015_add_user_team.sql
│   │   ├── 016_users_team_to_teams_array.sql
│   │   ├── 017_add_events_audit_log.sql
│   │   ├── 018_create_deploy_log.sql
│   │   ├── 019_create_meeting_notes.sql
│   │   ├── 020_create_call_prep_cache.sql
│   │   ├── 021_create_meddpicc_coach_cache.sql
│   │   ├── 022_create_opportunity_timeline.sql
│   │   ├── 023_create_weekly_digest_cache.sql
│   │   └── 024_create_deal_info_config.sql
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
│           ├── users.ts
│           ├── backup.ts
│           ├── deploy.ts
│           ├── audit.ts
│           └── settings.ts         # Deal Info layout config endpoints
│
├── kb/                              # Knowledge base files for Call Prep AI context
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
- `stage_changed_at`, `previous_stage` — import-tracked fallback; all stage transitions across the app (Timeline, Stage Movement, Weekly Digest, Recent Activity, Forecasting Brief) are now derived primarily from SF's per-stage date columns (`stage_date_qualify`, `stage_date_build_value`, `stage_date_proposal_sent`, etc.) so multi-stage jumps produce one row per move
- `is_closed_won`, `closed_won_seen` — Closed Won tracking (deals disappearing from SF while in *Submitted for Booking* stage)
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

#### `events`
Frontend usage telemetry — page views and feature interactions. Append-only by convention; purged after 180 days.

| Column | Notes |
|--------|-------|
| `user_id` | FK to users |
| `session_id` | UUID generated on login, stored in sessionStorage |
| `page` | Route path |
| `action` | `view` for page visits; named action otherwise |
| `entity_type`, `entity_id` | Optional context (e.g. `opportunity`, `42`) |
| `metadata` | JSONB for extra context |
| `timestamp` | Client-supplied or server now() |

#### `audit_log`
Server-side action log — significant mutations (logins, imports, user changes, etc.). Append-only; purged after 180 days.

| Column | Notes |
|--------|-------|
| `user_id` | FK to users |
| `action` | e.g. `LOGIN`, `CREATE_TASK`, `IMPORT`, `BACKUP_RESTORE` |
| `resource_type`, `resource_id`, `resource_name` | What was affected |
| `before_value`, `after_value` | JSON strings for diff |
| `ip_address`, `session_id` | Request context |
| `success`, `failure_reason` | Outcome |
| `user_role` | Snapshotted at time of action |

#### `deploy_log`
Tracks in-app frontend deploy runs triggered from Settings → Deploy.

| Column | Notes |
|--------|-------|
| `triggered_by` | FK to users |
| `triggered_at` | When the deploy started |
| `completed_at` | When it finished (null while running) |
| `status` | `pending` → `running` → `success` \| `failed` |
| `current_sha`, `target_sha` | SHAs at start and end |
| `log` | TEXT[] of streamed build output lines |
| `error` | Error message if failed |

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
| GET | `/insights/agentic-qual` | Active opps with `agentic_qual` set |
| GET | `/insights/agentic-qual/recent` | `?days=14\|30\|60\|90` — field history for `agentic_qual` |

### Users (Manager only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | All users |
| POST | `/users` | Create user |
| PATCH | `/users/me/preferences` | Update `show_qualify`, `column_prefs`, main nav config |
| PATCH | `/users/:id` | Update name, email, role, is_active |
| DELETE | `/users/:id` | Soft deactivate |

### Backup (Manager only)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/backup` | Generate and upload a full backup to S3 |
| GET | `/backup` | List available S3 backups |
| GET | `/backup/download` | Download a specific backup by S3 key (`?key=`) |
| POST | `/backup/restore` | Restore from uploaded JSON backup file (multipart) |

### Deploy (Manager only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/deploy/status` | Compare current SHA with latest GitHub commit |
| POST | `/deploy/trigger` | Kick off an async frontend deploy |
| GET | `/deploy/log/:id` | Poll deploy progress by log ID |
| GET | `/deploy/commits` | Fetch 20 most recent GitHub commits |

### Audit (Manager only)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/audit/events` | Batch-ingest frontend usage events (fire-and-forget) |
| GET | `/audit/log` | Paginated audit log; `?days=&user_id=&action=` |
| GET | `/audit/usage` | Aggregated page views, feature usage, per-user stats |
| GET | `/audit/actions` | Distinct action types (for filter dropdown) |
| GET | `/audit/users` | Users appearing in the audit log |

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
| Backup and restore data | — | ✓ |
| Trigger in-app deploy | — | ✓ |
| View Audit log and usage analytics | — | ✓ |

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

- **Frontend**: built with Vite, uploaded to S3, served via CloudFront. Ships as a PWA — the build emits `manifest.webmanifest`, `sw.js` (service worker), and the Ataccama icons. Clients see an "Install app" prompt in Chrome / Edge on the next visit
- **Service worker update strategy**: `registerType: 'prompt'` — on a new deploy, users see an in-app "A new version is available · Reload" chip rather than being force-refreshed mid-task. Ignoring the chip is fine; the new SW activates on next full navigation
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
