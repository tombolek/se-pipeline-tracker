# Data Model

The core hierarchy: **Opportunity** (from Salesforce) → **Tasks / Next Steps** + **Notes**.

> **Canonical schema lives in [`server/migrations/`](../server/migrations/).** This file captures the *design rules* and the *shape* of each table — not the current column list. Read the migrations (numbered `001_…` through `042_…` and counting) for exact DDL. Newer migrations frequently add columns, indexes, and whole tables beyond what's described here; the design rules below remain true.

## Key design rules

- `sf_opportunity_id` is the **immutable reconciliation key** for imports — never changes, never gets wiped.
- Imports update SF-owned fields only; tasks, notes, `se_owner_id`, and `last_note_at` are never touched by imports.
- The import contains **Open + Closed Won + Closed Lost** opportunities. Closed status is taken directly from SF (`Stage` + `Stage Date: Closed - Won/Lost`). An SF ID absent from a new import does **not** mean Closed Lost — it's stale (SF delete/merge), soft-hidden via `is_active=false` + `stale_since=now()`. See [gotchas.md](gotchas.md#sf-id-missing-from-an-import--closed-lost).
- **Timestamp-triggered freshness fields** are the engine behind several manager views — they must be set by the code path indicated, not by generic `updated_at` logic:
  - `stage_changed_at` / `previous_stage` — set on import when `stage` value changes. Powers Stage Movement view.
  - `se_comments_updated_at` / `manager_comments_updated_at` — set on import when the respective SF text field value changes. Powers SE Comments freshness dot + Missing Notes view.
  - `next_step_updated_at` — set on import when `next_step_sf` (the AE's Next Step) value changes. Uses the same `parseSeCommentDate` heuristic as `se_comments_updated_at`: AEs stamp Next Step with the same date prefixes ("20260219: …", "BM_26SEPT: …"), so the explicit date wins over `now()` when parseable. Powers the Stale Deals filters on Weekly Digest + Home digest so a fresh AE Next Step keeps a deal off the stale list.
  - `last_note_at` — set only when a user adds a note. Powers the Missing Notes threshold.
  - `first_seen_at` — set on insert; records when the opp first appeared in any import.
  - `closed_at` — set from SF's `Stage Date: Closed - Won/Lost`, never from import time.
- **`sf_raw_fields` JSONB** stores the complete raw import row on every import. The schema never needs a migration just because SF adds a new column — see [gotchas.md](gotchas.md#sf_raw_fields-jsonb--add-first-promote-later) for the "add first, promote later" pattern.
- **`notes` is append-only**: no UPDATE or DELETE is ever issued on that table.
- **Soft deletes only** for users, opportunities, tasks, inbox — never `DELETE` from DB. Users and opportunities use `is_active=false`; tasks/inbox use `is_deleted=true`.
- **Offline-aware writes** use optimistic concurrency: `expected_updated_at` in the PATCH body + 409 on mismatch. Canonical pattern in `server/src/routes/tasks.ts`. See [api.md](api.md#offline-aware-writes).

## Pipeline Stages (in order)

```
Qualify → Develop Solution → Build Value → Proposal Sent →
Submitted for Booking → Negotiate → Closed Won | Closed Lost
```

Default pipeline view shows **Build Value and above** (excludes Qualify). Users can toggle to include Qualify via a persistent preference (`users.show_qualify`).

## Core tables

Each row here is one table. For columns, read the migration file named in brackets.

| Table | Purpose | First introduced |
|-------|---------|------------------|
| `users` | SE team members. `role` determines access (`manager` / `se` / `viewer`). Holds per-user preferences (e.g. `show_qualify`). | [`001_create_users.sql`](../server/migrations/001_create_users.sql) |
| `opportunities` | The central record. SF-owned fields + app-managed fields + `sf_raw_fields` JSONB. Grows through many migrations (products, forecast, closed-won flags, stage dates…). | [`002_create_opportunities.sql`](../server/migrations/002_create_opportunities.sql) |
| `tasks` | App-managed tasks and next steps on an opportunity. `is_next_step=true` surfaces in the Work tab Next Steps area. Soft-deleted via `is_deleted`. | [`003_create_tasks.sql`](../server/migrations/003_create_tasks.sql) |
| `notes` | Append-only user notes on an opportunity. Never UPDATEd or DELETEd. | [`004_create_notes.sql`](../server/migrations/004_create_notes.sql) |
| `inbox_items` | Per-user scratch pad for quick-capture. Converts to a task or note when linked to an opportunity. `source` tracks origin (`manual` / `email` / `slack`). | [`005_create_inbox_items.sql`](../server/migrations/005_create_inbox_items.sql) |
| `imports` | Log of every SF import run — counts added/updated/closed-lost, status, error log. | [`006_create_imports.sql`](../server/migrations/006_create_imports.sql) |

## Supporting subsystems

These tables exist and are worth knowing about, but their design lives next to the feature that uses them. Read the migration when you need detail.

| Subsystem | Tables | Migration(s) |
|-----------|--------|--------------|
| **Field history** (audit of opportunity field changes) | `opportunity_field_history` | `008_create_field_history.sql`, `019_expand_field_history.sql` |
| **AI summary cache** (stores last generation per opp, freshness signal) | `ai_summary_cache` | `010_create_ai_summary_cache.sql` |
| **Events audit log** (generic audit trail) | events audit tables | `017_add_events_audit_log.sql` |
| **Deploy log** | `deploy_log` | `018_create_deploy_log.sql` |
| **Salesforce KB / product tables** | kb tables, products on opportunities | `022_create_kb_tables.sql`, `023_add_products_to_opportunities.sql` |
| **Deal Info config** (admin-editable Deal Info tab layout) | `deal_info_config` | `024_create_deal_info_config.sql` |
| **User favorites** (offline-pinning + quick access) | `user_favorites` | `026_create_user_favorites.sql` |
| **AI jobs queue** (async AI work) | `ai_jobs` | `031_ai_jobs.sql` |
| **Quota groups** (manager quota management) | `quota_groups` | `032_quota_groups.sql` |
| **Role access** (page-level permissions per role) | `role_page_access` | `034_role_access.sql`, `041_seed_role_access_for_new_pages.sql` — **see [gotchas.md three-place checklist](gotchas.md#adding-a-new-page-requires-touching-three-places)** |
| **Changelog seen** (per-user "new features" dot) | `changelog_seen` | `036_add_changelog_seen.sql` |
| **Templates** (reusable text templates) | `templates` | `037_create_templates.sql` |
| **Assignment history** | assignment history + soft-delete timestamps | `038_soft_delete_timestamps_and_assignment_history.sql` |
| **SE contributors** (multi-SE on a deal) | `opportunity_se_contributors` | `039_add_se_contributors.sql` |
| **Note mentions** (@mentions in notes) | `note_mentions` | `042_create_note_mentions.sql` |

## Non-obvious columns worth flagging

These are the fields where "just look at the migration" isn't enough — the *meaning* matters.

- `opportunities.sf_opportunity_id` — join key for every import reconciliation. Treat as immutable.
- `opportunities.sf_raw_fields` (JSONB) — always written on import with the full raw row. New SF columns land here automatically; promote to a dedicated column only when needed (see gotchas).
- `opportunities.stale_since` — set when an SF ID disappears from an import while still open. `NULL` once the opp reappears. Not the same as Closed Lost.
- `opportunities.closed_lost_seen` / `closed_won_seen` — the "unread dot" on the Closed Lost / Won tabs. Flip to `false` when the transition happens on import; flip to `true` when the user views.
- `opportunities.technical_blockers` — intentionally defined even though the field isn't in the current SF export. Will auto-populate from `sf_raw_fields` when SF adds it.
- `tasks.is_next_step` — distinguishes "Next Step" (shown prominently on the Work tab) from a regular task.
- `inbox_items.converted_to` / `converted_id` — after promotion, points at the created `tasks.id` or `notes.id`. The inbox item row itself stays for audit.
- Any `*_updated_at` on SF text columns (`se_comments_updated_at`, etc.) — **value-change trigger**, not row-update trigger. Set only when the actual SF field value differs from the previous import.

## When schema changes

- Add a new numbered migration under `server/migrations/`. Migration files run in order on boot.
- Update this file **only** if the change affects a design rule, a non-obvious column, or a new subsystem. Don't mirror every column-add here — that's what the migrations are for.
- If the change introduces a new page, follow the [three-place checklist](gotchas.md#adding-a-new-page-requires-touching-three-places) *and* seed `role_page_access` in the same migration.
