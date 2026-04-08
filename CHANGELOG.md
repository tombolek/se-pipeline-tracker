# Changelog

User-facing changes only. Updated with each feature commit.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [Unreleased]

---

## 2026-04-09

### Added
- **Meeting Notes Processor** (`Process Call Notes` button in Opportunity Detail) — paste raw call notes (plus an optional source URL to a Notion page, Slack canvas, or any link) and Claude extracts: tasks ready to add to the opportunity, MEDDPICC field updates, a draft SE comment (1–2 sentences focused on SE progress and evaluation risks), technical blockers, and a suggested next step. Each section is independently reviewable and confirmable. Raw notes are auto-saved as a note immediately. Source URL is stored on the note for future reference. (Issue #80)
- **Nightly scheduled backup** — server automatically creates a full JSON backup at 02:00 UTC (9 PM EST) every night and uploads it to S3. Appears in Administration → Backup with "scheduled" as the creator, restorable like any manual backup.

### Changed
- **Administration menu** — Audit log moved inside the Administration section (previously a standalone sidebar item).
- **Backup restore error handling** — restore failures now return a clear error message instead of crashing silently.

---

## 2026-04-08

### Added
- **My Pipeline** — personal pipeline view at `/my-pipeline`, scoped to the logged-in user's deals. New sidebar nav item (visible to all roles) between Pipeline and My Tasks. Shows the same columns, filters, and sort options as the global pipeline, with the owner locked to the current user and the "My deals" / SE owner filter controls hidden. (Issue #67)
- **Account History panel** — click any account name in Opportunity Detail to open a side panel showing all deals (open and closed) for that account, with deal cards grouped by year, expandable notes per deal, and account-level summary stats. Includes a data caveat noting that renewals and PS deals are not yet synced. (Issue #81)

### Changed
- **My Pipeline now independent from "My deals" toggle** — toggling "My deals" off in the main Pipeline view no longer affects the My Pipeline view; My Pipeline always shows only the current user's deals regardless of the toggle state.

---

## 2026-04-07

### Added
- **Deal Activity Timeline** — new "Timeline" tab in Opportunity Detail showing a reverse-chronological unified history of all events: notes, tasks created/completed, stage changes, SF import field updates (SE Comments, Manager Comments, Close Date, PoC Status, etc.), and SE Owner assignments. Filterable by event type. Also fixes field history tracking so `technical_blockers`, `manager_comments`, `close_date`, `poc_status`, and `agentic_qual` changes are recorded on import. (Issue #70)
- **Weekly Pipeline Digest** (`/insights/weekly-digest`) — manager-facing summary of what changed in the last 7/14/30 days: new opportunities, stage progressions, stale deals, PoCs started/ended, at-risk deals (Red health score), and Closed Lost. Includes summary stat cards (ARR moved forward, ARR closed lost, net pipeline change). (Issue #68)

---

## 2026-04-07

### Added
- **Deal Health Score** — 0–100 computed score per opportunity based on five factors: MEDDPICC completeness, SE Comments freshness, note freshness, overdue task count, and time in current stage. Visible as a RAG dot + score in the pipeline list; hover for a factor breakdown tooltip; expand the health bar in the opportunity detail for the full breakdown. (Issue #65)
- **At-risk only filter** — one-click button in the Pipeline filter bar to surface all Red (0–39) and Amber (40–69) deals.
- **Backup & Restore** (Settings → Backup) — generate a full JSON snapshot of users, tasks, notes, and SE assignments; upload to a private S3 bucket (90-day retention); restore from any S3 backup or a local file with a preview step. (Issue #63)
- **In-app Deploy** (Settings → Deploy) — trigger a frontend build and S3/CloudFront deploy from inside the browser without a terminal. Shows current vs latest GitHub SHA, a live streaming log, and the last 20 commits with deploy-scope badges (`[fe]`, `[be]`, `[fe+be]`, `[infra]`).
- **Audit** (`/audit`, manager only) — Usage tab (page view counts, feature interactions, per-user activity over 180 days) and Activity Log tab (paginated, filterable append-only log of all significant server-side actions with before/after JSON diff).
- **Audit logging** on server actions: login, logout, user management, imports, SE assignments, task changes, note creation, backup/restore, deploy.

### Changed
- Health score: overdue tasks are now the primary deduction signal (weight raised); note freshness weight lowered.
- PoC Board: removed status pill bar from header; SE filter now scoped to team view only.
- UI: consistent `rounded-lg` + `shadow-lg` on all modals; standardised focus rings; destructive buttons use red; row selection uses subtle purple tint; fresher dot colours (emerald/amber/rose).

---

## 2026-04-06

### Added
- **Opportunity Detail redesign** — resizable two-column layout (working area left, SF fields right). (Issue #57)
- **Calendar drag-and-drop** — tasks can be rescheduled by dragging them to a new date in the calendar. (Issue #62)
- **Role-change confirmation modal** in Access Management (Users settings).
- **Re-assign workload modal** and sortable Last Login column in Users settings (Org Chart tab).
- **My deals toggle** in Pipeline filter bar — shows only deals assigned to the logged-in user. (Issue #60)
- **Menu Settings renamed** from "Insights Menu"; now also supports reordering main nav items (Calendar, SE Mapping, PoC Board, RFx Board). (Issue #60 area)
- **How To button** made full-width with visible border in the sidebar for easier discovery.

### Changed
- Users settings page redesigned with three tabs: Team, Access Management, Org Chart.
- Managers can now assign themselves as SE owner on a deal.

---

## 2026-03 / 2026-04 (grouped)

### Added
- **Territory scoping** — manager users belong to one or more territories; pipeline, calendar, PoC Board, and RFx Board default to the manager's territory. Cross-territory drill-through bypasses the territory filter. Out-of-territory banner on Calendar, PoC Board, and RFx Board shows opps outside the default scope, expandable to a list.
- **Team scope toggle** (My Team / Full View) across all manager Insights pages. (Issue #44)
- **Calendar** (`/calendar`) — month-by-month view of PoC timelines (multi-day spans), RFx submission dates, and task due dates; 3-month view option; adaptive row height; click any event to open the opportunity detail. (Issue #56)
- **Agentic Qual insights page** with Recently Changed tab and AI summary. (Issue #50)
- **Team filter** on Pipeline, SE Mapping, RFx Board, and Tech Blockers — defaults to EMEA / NA Enterprise / NA Strategic / ANZ. (Issue #52)
- **Type (record_type) filter** on all pages that have filter bars. (Issue #53)
- **Freshness dot as capture trigger** — hovering the freshness dot on a pipeline row morphs it into a `+` Quick Capture button; removes the separate action column. (Issue #51)
- **Inbox merged into My Tasks** — inbox items now appear as a section at the bottom of My Tasks with inline opportunity search for linking/converting. (Issue #2)
- **Temporary password** flag on new users forces a password change on first login.
- **Delete user** and **Reset password** actions on the Users settings page. (Issues #36, #39)
- **Collapsible AI Insights panel** on Tech Blockers page — Claude-powered summary with severity weighting, cached in DB with freshness badge, "Regenerate" button.
- **SE Comments freshness derived from comment text** — date written inside the comment (e.g. "BM_26SEPT") is parsed with a 14-pattern regex cascade; ~97% coverage. (Issue #32)
- **Column picker** — reorderable, saveable per user on Pipeline and SE Mapping pages. (Issues #10–#14, #31)
- **SE Deal Mapping kanban view** — drag-and-drop between SE columns. (Issue #27)
- **How To / User Guide page** in sidebar. (Issue #24)
- **PoC Board improvements** — compact card toggle, hide-empty-columns toggle, 2-row compact layout. (Issue #47)
- **RFx Board list view** with sortable table and filter bar. (Issue #46)
- **Team Workload** — clickable stats deep-link to filtered views; comment freshness stats (fresh/stale counts per SE). (Issues #41, #42, #43)
- **SE Mapping** moved to main nav; defaults to own deals for SE role.
- **PoC Board and RFx Board** moved to main nav.
- **Insights Menu settings** — toggle and reorder Insights nav items.
- **Import preview** — dry-run diff before confirming a Salesforce import.
- **Multi-select Stage and Fiscal Period filters** on Pipeline and SE Mapping. (Issues #15, #16)
- **Sortable column headers** on Pipeline, Closed Lost, Missing Notes, Deploy Mode. (Issue #17)
- **Import History** with rollback of the most recent import.
- **DeployMode Overview** insights page with ARR stat cards and quarter filter.
- **Closed Lost Stats** insights page.
- **Tech Blockers** insights page with severity badges, Recently Changed tab, AI Insights panel. (Issue #34)
- **AWS deployment** — EC2 + S3 + CloudFront via CDK; `scripts/deploy.sh` with `--server-only` and `--frontend-only` modes.
- **XLS, XLSX, and CSV import support** (Salesforce HTML-in-XLS, CSV UTF-8/UTF-16).
- **Qualify toggle** — per-user preference to show/hide Qualify-stage deals. (Issue #6)
- Full initial application: Pipeline, Closed Lost, My Tasks, Inbox, Opportunity Detail, SE Deal Mapping, PoC Board, RFx Board, Stage Movement, Missing Notes, Team Workload, Overdue Tasks, SE Mapping, Settings (Users, Import, Import History), Quick Capture (Ctrl+K), AI Summary.
