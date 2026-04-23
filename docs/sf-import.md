# Salesforce Import Pipeline

Salesforce data comes in via export of a pre-built Opportunities report (currently `.xls` / `.csv` format — Salesforce exports as HTML-in-XLS, so the XLS parser uses an HTML table reader).

**The import contains Open + Closed Won + Closed Lost opportunities.** Closed status is authoritative from SF: a row with `Stage = 'Closed Won'` or `'Closed Lost'` and a populated `Stage Date: Closed - Won/Lost` marks the deal as closed with `closed_at` set from that SF date (not import time). A deal that disappears from the feed while still open is treated as a SF delete/merge — soft-hidden via `is_active=false` + `stale_since=now()`, **not** marked Closed Lost.

## Confirmed SF Export Columns (55 fields)

All 55 columns must be ingested. Map them to the `opportunities` table as defined in [data-model.md](data-model.md). Store the full row as `sf_raw_fields` JSONB regardless, so future new columns are automatically preserved without a schema migration.

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
| Lost Reason | `lost_reason` |
| Lost Sub Reason | `lost_sub_reason` |
| Lost Reason (Comments) | `lost_reason_comments` |
| (Lost to) Competitor | `lost_to_competitor` |

## Reconciliation Logic

1. Parse the file as HTML table (not XLS binary) — Salesforce exports use HTML-in-XLS format.
2. Match every incoming row on `sf_opportunity_id`.
3. **Match found:** update all SF-owned fields; if `stage` changed → set `stage_changed_at = now()`, `previous_stage = old_stage`; if `se_comments` value changed → set `se_comments_updated_at = now()`; if `manager_comments` changed → set `manager_comments_updated_at = now()`; derive `is_closed_won` / `is_closed_lost` + `closed_at` from the row's `Stage` and `Stage Date: Closed - Won/Lost`; when a deal transitions open→Closed Lost, set `closed_lost_seen = false` (unread badge); when a deal transitions open→Closed Won, set `closed_won_seen = false`; clear `stale_since` whenever an opp is seen; never touch `se_owner_id`, `last_note_at`, tasks, or notes.
4. **New SF ID:** insert new opportunity record, set `first_seen_at = now()`; if the row already arrives with `Stage = Closed Won/Lost`, seed the closed flags + `closed_at` from SF stage dates at insert time.
5. **SF ID missing from import (was present before and still open):** treated as a SF delete/merge — set `is_active = false`, `stale_since = now()`. Already-closed opps that stop appearing in the feed are left untouched. Stale opps are **not** marked Closed Lost.
6. Store the complete raw row in `sf_raw_fields` JSONB on every import — this handles future new SF columns automatically.
7. Log everything to the `imports` table.

## Future New SF Columns

When Salesforce adds new fields to the report, they automatically land in `sf_raw_fields`. To promote a new field to a dedicated column later: add a migration, backfill from `sf_raw_fields`, update the import mapper. No data is ever lost.

**Import endpoint:** `POST /api/v1/opportunities/import` — accepts both manual file upload (multipart/form-data) AND programmatic POST, so future automation (Cowork/scheduled script) can trigger it directly. Returns `{ importId }` immediately; the pipeline runs asynchronously (see below).

## Staged Pipeline

`POST /opportunities/import` runs asynchronously as 5 sequential stages. The route creates the `imports` row with `status='in_progress'` and returns the id; the server then runs `runStagedImport(importId, buffer, filename)` in the background, writing per-stage status / counts / duration to `imports.stage_log` (JSONB) as each stage completes. If a stage fails, remaining stages are marked `'skipped'` and the import is marked `'failed'`.

| # | Stage | What runs | Counts emitted |
|---|-------|-----------|----------------|
| 1 | `parse`     | `readRawMatrix(buffer)` — detect format (xlsx/csv/html) and decode to a 2-D string matrix. | `rows`, `format` |
| 2 | `validate`  | `buildParsedRows(matrix)` — check required columns, apply `COLUMN_MAP`, coerce types, drop rows without an `sf_opportunity_id`. | `mapped`, `dropped` |
| 3 | `reconcile` | `doReconcile(rows)` — snapshot active opps, run the row-by-row UPDATE/INSERT loop, soft-hide stale opps. | `added`, `updated`, `stale`, `closedWon`, `closedLost`, `rowErrors` |
| 4 | `enrich`    | `doEnrich(...)` — `deriveProductsForAllOpps()`, write field-history entries, create auto-notes for changed SE Comments. | `productsDerived`, `autoTasksCreated`, `historyEntries`, `notesCreated` |
| 5 | `finalize`  | `doFinalize(...)` — clear MEDDPICC AI caches, write final counts + rollback snapshot to the imports row, set `finished_at`. | `cacheCleared` |

**Admin UI (`/settings/import-history`)** reads `stage_log` and renders a 5-node pipeline diagram per import. While any import is `status='in_progress'`, the page polls `/opportunities/import/history` every 5s until everything has finished.

**Rollback** — `DELETE /opportunities/import/:id` still only applies to the most recent non-in-progress import; rollback_data is written in the `finalize` stage, so a failed import (any stage) cannot be rolled back (nothing to restore to).

## First Import (Bootstrapping)

The very first import should contain **open opportunities only** — no Closed Lost records. This establishes the baseline. From the second import onwards, any SF ID absent from the feed is treated as newly Closed Lost and triggers the unread badge. Setup instructions and the seed script documentation enforce this expectation.
