# Changelog

User-facing changes only. Updated with each feature commit.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## 2026-04-13

### Fixed
- **Closed Won page aligned with % to Target** — quarter filtering now uses the same `closed_at`-based month bucketing as the % to Target page (previously used the `fiscal_period` string from Salesforce, which could disagree with the actual close date). Renamed "All YTD" to "All" since it shows the full fiscal year. Fixed a double-fetch flash on initial load where all-FY data briefly rendered before the FY filter kicked in. (Issue #106)

### Changed
- **Pipeline — "My Team" / "Full View" scope toggle replaces "My deals"** — the Pipeline page filter bar now shows the same `Scope: My Team | Full View` toggle used on the RFx and PoC boards (managers only). Switching to "My Team" sets the teams filter to the manager's territories; "Full View" clears it and shows everything. The old "My deals" button is removed — use the dedicated **My Pipeline** page for an SE-owner-only view. SE users default to their manager's territories as before.
- **Weekly Digest — long sections preview 5 rows instead of fully collapsing** — sections with more than 5 items now always show the first 5 rows with a "Show N more" / "Show less" toggle at the bottom, instead of the previous collapse-to-header behavior. Makes the page scannable without having to expand each section. (Issue #89)
- **Forecasting Brief — AI Forecast Narrative is now per region** — the narrative is generated, cached, and shown separately for NA (NA Enterprise + NA Strategic) and INTL (EMEA + ANZ). Switching the region toggle loads the matching narrative. Each region has its own generation job, so regenerating one doesn't invalidate the other. The panel header now shows the active region alongside the title.
- **Deploy Mode + Agentic Qualification — open deals only** — both pages now exclude Closed Won and Closed Lost opportunities (previously only Closed Lost was excluded). Matches the intent of "currently open deals".

### Added
- **% to Target (Insights)** — new manager-only report showing Closed Won progress against quota targets. Each configured group renders as a donut + month-over-month sparkline; a combined chart compares all groups against the linear FY pace line. Filterable by FY and quarter (All YTD / Q1-Q4) — switching the quarter changes the "as of" point used by all charts so you can see where each group stood at the end of any quarter. New business only (New Logo + Upsell + Cross-Sell), USD via `arr_converted`. (Issue #94)
- **Quotas (Settings)** — new manager-only settings page to configure quota groups for the % to Target report. Three rule types: All Closed Won (Global), By team(s), or By AE owner(s). The same deal can count toward multiple groups. Seeded with Global ($16M), NA ($11.4M, NA Enterprise + NA Strategic), INTL ($6.12M, EMEA + ANZ), and DACH ($1.5M, AE = Thomas Miebach).

### Added
- **Closed Won (Insights)** — new manager-only report for SE bonus calculation. Aggregates Closed Won ARR (USD, `arr_converted`) with a view toggle: **By Territory** (Team → SE) or **By SE** (SE → Team breakdown; SE totals are global across territories). Filterable by fiscal year (dropdown) and quarter (All YTD / Q1-Q4). New business only — New Logo + Upsell + Cross-Sell (Services + Renewal excluded). Rows expand to show the underlying deals; clicking a deal opens the opp drawer. (Issue #94)
- **Shareable opportunity URLs** — opening an opp drawer now reflects in the URL as `?oppId=<sf_opportunity_id>`. Copy the URL and share it; opening it in a new tab auto-opens the drawer for that opp on whichever page you were on. Browser back closes the drawer. Works on Pipeline, Home, Closed Lost, Calendar, 1:1 Prep, Team Tasks, Deploy Mode, Missing Notes, PoC Board, RFx Board, and SE ↔ Deal Mapping. (Issue #99)

### Changed
- **Quick Capture — opportunity search is now the first field** — opening Quick Capture (Ctrl/Cmd-K) now focuses the opportunity search box first, with arrow-key navigation (↑/↓) and Enter to select a result. Selecting an opp auto-jumps focus to the note/task text area. Optimised for the rapid-add flow on 1:1 prep: Ctrl-K → type → ↓ → Enter → type note → Cmd-Enter.

### Added
- **AI generations now survive page navigation** — the 10 AI-powered endpoints (Deal Summary, MEDDPICC Coach, Call Prep, Demo Prep, 1:1 Narrative, Tech Blockers, Agentic Qual, Forecast Narrative, bulk summaries) now track in-progress runs in a new `ai_jobs` table. Server-side generations always persist their result to `ai_summary_cache` on completion, so navigating away mid-generation no longer loses the result — the next visit picks it up from cache. A new `GET /ai-jobs/by-key/:key` lets the client detect a running job and poll for the result without kicking off a duplicate request. Phase 1 of Issue #101 — server-side tracking + client hook (`useAiJob`) + API helper (`api/aiJobs.ts`) are in place; panel-by-panel adoption of the hook to follow.
- **AI panels auto-reattach to in-flight generations** — all 8 AI panels (AI Summary, MEDDPICC Coach, Call Prep, Demo Prep, 1:1 Narrative, Tech Blockers, Agentic Qual, Forecast Narrative) now use `useAiJobAttach` to detect a job already running for their key on mount. If a generation is in flight when you return to a panel, the panel flips to its loading state and polls every 3s until the cached result lands — no duplicate POST is sent. Phase 2 of Issue #101.

### Changed
- **Performance: server-side pagination + filtering on Pipeline** — the Pipeline, My Pipeline, and URL-drill-through views now filter, sort, and paginate on the server (`GET /opportunities/paginated` + new `/opportunities/filter-options`). First page is 100 rows; a "Load more" button at the bottom fetches the next page, keeping totals consistent with active filters. All 9 Pipeline filters (search, stage, fiscal period, team, record type, My Deals, At Risk, MEDDPICC below) — including the two computed ones — are evaluated in SQL, so Load More always stays in sync with the filter bar. Favorites keeps its instant client-side filtering. Minor consumers (HomePage AI picker, Deal Info Config preview, Quick Capture search) now pass `limit` so the full opportunity table never loads by accident. Phase 3 of Issue #102; resolves #102.

### Changed
- **1:1 Prep — AI Coaching Brief now collapsible** — the AI Coaching Brief on the 1:1 Prep page is now collapsed by default and shows a freshness indicator (green ≤3d, amber ≤14d, red >14d) next to the title, matching the AI Summary / MEDDPICC Coach pattern elsewhere. Regenerate and Copy controls live inside the expanded panel.

### Added
- **Pick a manager when creating an SE user** — the Add User dialog in Settings → Users now shows a Manager dropdown (active managers only) whenever the role is set to SE, so a new SE can be assigned to their manager without a follow-up edit. Managers still have no manager of their own. The dropdown defaults to "— No manager —" for cases where you want to assign later.
- **SE Comments now create Notes automatically** — when an SF import detects a new SE Comments value on a deal, the new comment is also appended as a Note on the opportunity. Author shows as **SF Import**; the note's timestamp is taken from the date stamp parsed out of the comment text (e.g. `BM_26SEPT`) when available, falling back to import time. SE Comments behaviour everywhere else (freshness signal, Deal Info display, drives Stale list, etc.) is unchanged.

### Fixed
- **Phantom "Close Date updated" rows on every import** — the field-history change detector was comparing the SF-export string (`11/20/26`) against the Postgres-readback string (`2026-11-20`), so the close date appeared to "change" on every import even when the underlying value was identical. Date strings are now normalised to ISO `YYYY-MM-DD` on both sides before comparison, and stored in ISO form so future field-history reads stay clean. Also backfilled — existing phantom rows were purged from `opportunity_field_history`.

### Changed
- **Performance: faster Pipeline rendering with 1000+ rows** — wrapped pipeline rows in `React.memo`, memoized the filter/sort pipeline + derived filter options, added a 200ms debounce on the search input. Typing in search no longer re-renders every row per keystroke. Phase 2 of Issue #102.
- **Performance: partial indexes on hot opportunity queries** — added partial indexes covering the dominant filter combos (active/open pipeline, closed-lost, closed-won, open tasks). Most pages query `is_active = true AND is_closed_lost = false`; sequential scans on this combo were the main cost past ~1k rows. Also added an explicit `is_closed_won = false` clause to the default `/opportunities` GET (with `include_closed=true` opt-in for future combined views) so Closed Won deals never leak into pipeline lists. Phase 1 of Issue #102.

### Changed
- **1:1 Prep — open Opportunity Detail in drawer + sort by stage** — clicking any deal or task in the 1:1 Prep brief now opens the full Opportunity Detail in a side drawer (instead of navigating away to the Pipeline). Every section (open opps, overdue tasks, due-this-week tasks, missing-notes deals, no-next-step deals, recent stage movements) is now sorted latest stage → earliest stage, so Negotiate / Submitted-for-Booking deals surface at the top and Develop-Solution / Qualify deals sink to the bottom.

### Added
- **1:1 Prep view** — manager-only Insights page (`/insights/one-on-one`) that generates a one-page brief for a chosen SE: pipeline summary (count, ARR, RAG breakdown, overdue tasks, stale comments), overdue + due-this-week task list, deals missing SE notes, deals with no next step, recent stage movements (last 14 days), and a Claude-generated coaching narrative covering wins, coaching focus, risks to flag and a suggested 1:1 agenda. Narrative is cached and re-generatable; copy-to-clipboard supported. (Issue #69)

### Changed
- **SE Deal Mapping filters** — removed *Close Period* and *Opportunity Record Type* filters; added *AE Owner* filter (multi-select) for quickly scoping coverage to a specific AE's book.

### Changed
- **Closed Won / Closed Lost detection is now stage-driven** — SF export filter now includes Closed Won and Closed Lost deals directly, so we no longer infer closed status from a deal disappearing from the feed. Closed status and `closed_at` are taken straight from SF's `Stage` + `Stage Date: Closed - Won/Lost` columns. Deals that vanish from the feed while open are soft-hidden as *stale* (treated as SF deletes/merges), not marked Closed Lost. Historical `closed_at` values were backfilled from SF stage dates.
- **Forecast Status replaces Forecast Category** — the `forecast_category` DB column was historically populated with SF "Forecast Status" values due to an import-mapper collision. Renamed to `forecast_status` to match reality; Forecast Category is no longer imported. Forecasting Brief continues to use Commit / Most Likely / Upside / Pipeline / Omitted as before.
- **Loss Analysis page renamed** — "Win/Loss Analysis" is now just "Loss Analysis" (page heading + sidebar label). The page continues to include Closed Lost deals only. (Closed Won deals live outside this page.)

### Added
- **Edit SE Owner on closed deals** — Win/Loss Analysis now shows the Filtered Deals table at all times (not only when filters are active) and adds an SE Owner column. Manager users can reassign SE ownership on Closed Won / Closed Lost deals inline via a dropdown; SE users see the name read-only. The Filtered Deals table header notes "Manager: SE Owner is editable" when applicable.

### Changed
- **Closed-Won detection** — opportunities that disappear from the SF import while in *Submitted for Booking* stage are now classified as Closed Won, not Closed Lost. New `is_closed_won` / `closed_won_seen` columns; historical data backfilled (deals like VIG and Convex Lineage Upsell that were previously misclassified are now shown as Won).

### Added
- **Win/Loss Analysis** — promoted Closed Lost Stats to a first-class Insights page (`/insights/closed-lost-stats`), now visible by default. Adds three new dimensions (By Competitor, By Industry, By Segment), an Avg Days in Pipeline KPI (first-seen → closed-lost), and parses comma/semicolon/slash-delimited competitor lists into per-competitor slices. Existing cross-chart filtering, count/ARR toggle, and time-range filter still apply. (Issue #85)

### Changed
- **Stage transitions now SF-authoritative everywhere** — Stage Movement, Weekly Digest "Stage Progressions", home-page recent activity, and the per-opportunity timeline now derive transitions from SF's per-stage date columns (`Stage Date: Build Value`, etc.). A deal that jumped multiple stages within the window now produces one row per move (not just the most recent). Pipeline list, opportunity detail, closed-lost list, and Forecasting Brief now report "in current stage since" using the SF stage date for the deal's current stage, falling back to the import-tracked timestamp only when SF data is missing. (Issue #87)

### Added
- **Demo Prep PDF export** — Demo Prep tab now has PDF download (formatted brief with all 6 questions, evidence, missing items, suggested commitments, coaching tips, overall assessment, and Before-You-Demo checklist) and a Slack send button (placeholder, mirroring Call Prep).
- **Demo Prep on home page** — added Demo Prep as a 4th AI quick-action card on the home page so it can be launched directly from the dashboard.

## 2026-04-12

### Added
- **Forecasting Brief** — new manager-only Insights page (`/insights/forecasting-brief`) for SE forecast calls. Two tabs: "Current FQ" with KPI cards (pipeline total, commit+ML, SE engagement health), forecast table with expandable rows showing inline AI summary, SE comments, tech status & MEDDPICC gaps, plus an AI-generated forecast narrative; and "Key Deals" with collapsible deal cards. Expandable rows link to full Opportunity Detail drawer. Thursday stale-comment alerts, Friday auto-refresh of narrative. Includes `forecast_category` DB field + SF import mapping. (Issue #98)

## [Unreleased]

### Added
- **Home / Daily Digest** — new landing page (`/home`) with a personalized SE dashboard: Today's Tasks (overdue + due today + this week), PoC Alerts (ending within 7 days), Recent Activity (notes by others, stage changes, manager comments from last 7 days), Closed Lost (unread), Stale Deals (no activity in 21+ days), and Upcoming This Week (tasks, PoC end dates, RFx deadlines). Every item is clickable to open the Opportunity Detail drawer. (Issue #84)
- **AI MEDDPICC Gap Coach** — lightbulb button next to the MEDDPICC score pill in Opportunity Detail. Reads all notes, tasks, MEDDPICC fields, and comments, then returns a per-element Green/Amber/Red assessment with specific discovery questions for gaps. Results are cached and auto-cleared on SF import. (Issue #82)
- **Team Tasks page** — new Insights view (`/insights/team-tasks`) with Kanban (grouped by status) and List (sortable table) views. Filters: status, assignee, due date quick filters (Overdue/Today/This Week), and search. Clicking "Open Tasks" in Team Workload now navigates here filtered to that SE.

- **Deal Info Layout Settings** — new manager settings page (`/settings/deal-info-layout`) to configure which fields and sections appear in the Deal Info tab. Sections can be reordered, toggled between expanded/collapsed default, and fields can be added from all 55+ SF columns or sf_raw_fields. Config stored server-side, applies globally. Live preview panel shows layout changes with real opportunity data.
- **AI Quick Links on Home Screen** — three action cards (Pre-Call Brief, Process Call Notes, Opp Summary) on the daily digest page. Click a card, search for an opportunity, and the drawer opens with the AI feature ready to go. (Issue #93)
- **Call Prep PDF export** — "PDF" button in the Pre-Call Brief header opens a print-ready page with all sections (deal context, talking points, risks, questions, customer stories, differentiators) formatted for clean PDF download. (Issue #95)
- **Call Prep Slack placeholder** — "Slack" button in the brief header for future Slack integration. (Issue #95)

### Changed
- **Opportunity Detail — full-width tab layout** — removed the 55/45 split layout. SF data now lives in a 4th "Deal Info" tab alongside Work, Timeline, and Call Prep. Tab bar uses a top-border indicator style. MEDDPICC and Health Score header pills are clickable — they navigate to the Deal Info tab and scroll to the relevant section. (Issue #66)
- **Deal Info tab is now config-driven** — renders sections and fields based on the server-stored layout configuration instead of hardcoded JSX.

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
