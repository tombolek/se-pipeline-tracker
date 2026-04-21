# Features

One section per page/route. Describes the behaviour, filters, and data rules — not the components (read the components for rendering details).

## Top App Header (global)

- **Data freshness indicator** — clock icon + relative time next to the connection indicator, showing the age of the last successful SF import. Colour-coded around the expected ~2×/day cadence: green < 6h, amber 6–12h, red > 12h, muted when no import on record. Hover tooltip shows exact timestamp and row counts (added/updated). Managers can click through to `/settings/import-history`; SEs get the tooltip only. Fetches `GET /opportunities/import/latest` on mount + on tab focus; local 60s tick keeps the "Nh ago" label advancing.
- **Connection indicator** — Live / Syncing / Cached / Offline / Pending sync. Hover tooltip explains what each state means for the user's current session (what reads come from where, whether writes queue, etc.). Click opens the existing details dropdown in the non-live states.

## Pipeline View (`/pipeline`)

- Paginated list of active (open) opportunities.
- **Default: shows Build Value and above** — excludes Qualify stage by default.
- **Qualify toggle:** persistent per-user preference (stored in `users.show_qualify`). Toggle button in the filter bar — when off, shows count of hidden Qualify opps.
- Columns: Name, Account, Stage, ARR, Close Date, SE Owner, Open Tasks, SE Comments freshness.
- **SE Comments freshness indicator on each row** — based on `se_comments_updated_at`: green dot (≤7d), amber (8–21d), red (21d+), grey (never updated).
- Filters: Stage, SE Owner, Close Date range, Team, Record Type, text search.
- Sort: Close Date, ARR, Stage, SE Comments age.

## Closed Lost Tab (`/closed-lost`)

- Lists all opportunities that have disappeared from the SF import (= Closed Lost).
- **Sorted by `closed_at` DESC** — most recently closed at the top.
- **Unread badge:** a red dot indicator (iOS-style) on the nav item when `closed_lost_seen = false` for any record. Badge shows the count of unread closures.
- Marking as read: clicking into the tab auto-marks all currently visible records as read; or mark individually.
- Shows: Opportunity name, Account, ARR, SE Owner, AE Owner, Closed date, Stage when closed.
- Still allows viewing notes and tasks on the closed opportunity (read-only).

## Opportunity Detail (`/opportunities/:id`)

**Full-width layout with 7 tabs:** Work, Timeline, Call Prep, Demo Prep, Similar Deals, Tech Discovery, Deal Info.

**Header area** (always visible above tabs):
- SF data (read-only) — name, account (clickable → Account History panel), stage, ARR, close date, AE owner, team, SE owner, deploy mode, PoC status, competitors.
- **AI Summary** — collapsible, persisted open/closed state, freshness indicator showing when last generated.
- **MEDDPICC Gap Coach** — collapsible, persisted open/closed state, AI-powered analysis of MEDDPICC field gaps with coaching recommendations.

**Work tab:** Next Steps (is_next_step = true, shown prominently), Tasks (full list, add/edit/complete), Notes (chronological, append-only, with author + timestamp).

**Timeline tab:** Chronological activity feed for the opportunity (OpportunityTimeline component).

**Call Prep tab:** AI-powered pre-call brief generation with PDF export, uses knowledge base files from `kb/` directory. Prompt also ingests the opportunity's **Tech Discovery** row (stack, enterprise systems, existing DMG tools, 9 discovery-notes prose fields) so talking points anchor to the prospect's real environment and discovery questions target genuine gaps rather than anything already captured.

**Demo Prep tab:** AI-powered demo readiness assessment — classifies the deal into a demo level (D1–D4), scores readiness across a fixed question set, surfaces gaps and suggested commitments. PDF export. Tech Discovery is passed to the prompt as first-class evidence: the AI cites it alongside notes / MEDDPICC / SE comments, calibrates the demo level against Tech Discovery coverage, and avoids suggesting discovery questions on topics already captured there.

**Similar Deals tab:** When field scoring yields ≥ 5 matches, the top 15 candidates are sent to Claude for per-result "why it matches" insights — grounded in the candidate's notes and match chips, one sentence per row. Cached 7 days per opp in `ai_summary_cache` under key `similar-deals-insights-{oppId}`. Inline-rendered on each result row in a purple callout, replacing the default deterministic why-text. Refresh button on the insights status strip. Issue #111 lever 2.

When field scoring yields fewer than 3 matches, the tab auto-synthesizes a short **playbook** (win pattern, positioning, lead-with, anticipate blockers) from the top matching KB proof points using Claude. Cached 7 days per opp in `ai_summary_cache` under key `kb-playbook-{oppId}`. Manual refresh via the Refresh button in the playbook card. Issue #111 lever 3.

Ranks similar deals for the open opportunity from three tiers: (a) closed-won/lost deals in the past 18 months, (b) in-flight deals in advanced stages (Negotiate, Proposal Sent, Submitted for Booking) — those have enough MEDDPICC + notes to be useful playbook material, (c) KB proof points (`kb_proof_points` table) as a reference tier. Each result shows an outcome badge: Won, Lost, **In flight · {stage}**, or **KB reference**. Scoring is pure SQL + TS — no AI, no caching. For opportunity rows: industry, segment, ARR band, products, deploy mode, record type, competitor overlap, and keyword overlap on use-case / MEDDPICC free-text. For KB rows: industry (via vertical→industry mapping), products, proof-point text overlap, and initiative overlap (weights rebalanced since KB rows lack segment/ARR/competitor/deploy). Only shows matches with score ≥ 40; top 8. The playbook summary (wins/losses vs. primary competitor) counts only actual closed deals, not in-flight or KB entries. Filters by outcome type. Issue #111.

**Tech Discovery tab:** Structured storage for the technical side of a deal — inspired by the internal Technical Discovery Document template. Three sections: (1) **Discovery Notes** — nine prose fields (Current Incumbent Solutions, Tier 1 Integrations, Data Details & Users, Ingestion Sources, Planned Ingestion Sources, Data Cleansing & Remediation, Deployment Preference, Technical Constraints, Open Technical Requirements); (2) **Technology Stack** — 10 categorised multi-select groups (Data Infrastructure, Data Lake, Metastore, Data Warehouse, Database, Lake Processing, ETL/ELT, BI, NoSQL, Streaming), each with "Other (specify)" fallback; (3) **Enterprise Systems & Existing Data Mgmt Tools** — specify-value fields (CRM=Salesforce, ERP=SAP, Catalog=Alation, etc.). Auto-saves on blur. Storage = `opportunity_tech_discovery` (migration 044, column dropped in 045): prose fields as TEXT, checklists as JSONB with GIN index on `tech_stack`. Tech Discovery data feeds **Similar Deals scoring** — shared stack items (same Snowflake + dbt) contribute up to 10 extra points, capped at the 100-pt max. Network-only for reads and writes in v1 (no offline cache). Diagram upload deferred to #139. Seed from AI-extracted meeting notes + RFPs in the future.

**Deal Info tab:** Read-only SF fields — deal info, Next Step, Manager Comments, SE Comments (with freshness badge), Technical Blockers/Risk, MEDDPICC fields, partner info, PoC details.

**Account History panel:** Click account name in header to open a slide-out panel showing all opportunities and activity for that account (AccountTimelinePanel).

**Process Call Notes (full page at `/opportunities/:sfid/process-notes`):** Moved out of a modal into a dedicated page so the flow has room to breathe and the SE's work survives accidental clicks / tab closes. Three phases: **Configure** (pick which of the six extraction types to run — Tasks / SE Comment / Tech Blockers / Tech Discovery / MEDDPICC / Next Step — with a separate "Save raw notes as a note" toggle; all preferences persist per user in localStorage; MEDDPICC is off by default), **Processing** (single Claude call with a dynamic prompt built from only the selected sections), **Results** (three user-selectable layout modes: **Tabs** as default, **Wizard** for linear walk-through, **Long scroll**). Per-section review and accept. SE comment prefix uses the current user's initials (`TB_21APR26`) — no longer hardcoded. Tasks start **unselected** with a "Select all" action. MEDDPICC is saved as a structured note on the opp (never patches SF columns) with an explicit "Salesforce is not modified — review and update SF where needed" banner. Server-side Jaccard dedupe drops any MEDDPICC suggestion ≥ 80% similar to the current value. After accepting, a success screen shows a summary of what was applied and a one-click **View deal** button that returns to the drawer. A leave-guard overlay (plus `beforeunload` for browser navigation) warns before discarding unconfirmed AI proposals. Issue #111 follow-up.

## Home / Daily Digest (`/`)

- Landing page with a personalized daily digest for the logged-in user.
- Upcoming meetings/calls, overdue tasks, deals needing attention, recent activity summary.
- AI-generated insights on pipeline health and priority actions.

## My Pipeline (`/my-pipeline`)

- Filtered view showing only opportunities assigned to the current SE.
- Quick access to deal status, upcoming tasks, and call prep for owned deals.

## My Tasks (`/my-tasks`)

- All open/in-progress tasks assigned to logged-in user, across all opportunities.
- Grouped: Overdue → Due Today → This Week → Later.
- Quick-complete inline, click through to parent opportunity.

## Manager Intelligence Views

| View | Route | What it shows |
|------|-------|---------------|
| Stage Movement | `/insights/stage-movement` | Opps where stage changed recently (7/14/30d configurable) — prev stage → new stage, date, SE |
| Missing SE Notes | `/insights/missing-notes` | Opps where `se_comments_updated_at` is null or older than threshold — sorted by most stale first. Threshold configurable (default 21d) |
| Team Workload | `/insights/workload` | Per-SE: # opps, open tasks, overdue tasks, next steps |
| Overdue Tasks | `/insights/overdue-tasks` | All overdue tasks across team, grouped by SE |

## Inbox (`/inbox`)

A personal scratch pad and quick-capture surface. Two entry points:

### 1. Global quick-capture modal

- Triggered by keyboard shortcut (`Cmd/Ctrl + K` or similar — configurable).
- Also accessible via a `+` icon button pinned in the sidebar.
- Opens a lightweight modal overlay from anywhere in the app.
- Fields: text area (note or todo), optional opportunity search/link, type toggle (note | todo).
- Submit saves instantly and dismisses — frictionless, no required fields except the text.
- If an opportunity is linked and type = todo → creates a task on that opportunity directly.
- If an opportunity is linked and type = note → creates a note on that opportunity directly.
- If no opportunity linked → saves as a standalone Inbox item.

### 2. Contextual quick-capture on list rows

- Available on any opportunity list row (pipeline view, closed lost, insights views) via a subtle `+` action that appears on hover.
- Opens a small inline popover (not a full modal) — pre-filled with the opportunity context.
- Toggle: Note or Task.
- One-tap submit → goes straight to that opportunity's notes or tasks list.
- No need to open the full detail view.

### Inbox page

- Lists all standalone jots (not yet linked to an opportunity).
- Sorted by created date, newest first.
- Each item shows: text preview, created time, type badge (note | todo).
- Actions per item:
  - **Link to opportunity** → search and select an opp; if type = todo, converts to a task on that opp and removes from Inbox; if type = note, converts to a note and removes from Inbox.
  - **Mark done** (todos only) — stays in Inbox as completed, doesn't link anywhere.
  - **Delete** — soft delete.
- Inbox nav item shows a count badge of unresolved items (unlinked + incomplete todos).

### Email / Slack forwarding (v2)

- Forward an email or Slack message to a dedicated address/webhook → lands in Inbox as a jot.
- Body becomes the note text, subject/channel becomes a label.
- Architecture slot: Inbox items have a `source` field (manual | email | slack) and `source_ref` for the original message ID.
