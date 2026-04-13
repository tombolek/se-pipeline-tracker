-- Migration 028: Stage-driven Closed Won / Closed Lost + Forecast Status rename.
--
-- Context: Salesforce export filter now includes Closed Won and Closed Lost deals
-- directly (rows carry Stage = 'Closed Won' / 'Closed Lost' and a populated
-- "Stage Date: Closed - Won/Lost"). We no longer need to infer closed status
-- from disappearance from the feed, and we want the authoritative closed_at
-- date from SF, not import-time now().
--
-- Schema changes:
--   1. Rename forecast_category -> forecast_status. The DB column was
--      historically named forecast_category but actually stored SF's
--      "Forecast Status" values (Commit / Most Likely / Upside / ...)
--      due to a mapping collision in importService. We only care about
--      Forecast Status going forward; SF's Forecast Category
--      (Most Likely / Omitted / Closed) is ignored.
--   2. Add stale_since to track opportunities that disappear from the SF feed
--      (treated as deleted/merged in SF — soft-hidden, NOT marked Closed Lost).
--   3. Backfill closed_at from authoritative SF stage dates for existing
--      closed deals. Previous import imprinted closed_at = import time.

ALTER TABLE opportunities
  RENAME COLUMN forecast_category TO forecast_status;

ALTER INDEX IF EXISTS idx_opportunities_forecast_category
  RENAME TO idx_opportunities_forecast_status;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS stale_since TIMESTAMPTZ;

-- Backfill closed_at for closed deals using authoritative SF stage dates.
UPDATE opportunities
SET closed_at = (stage_date_closed_won::timestamptz)
WHERE is_closed_won = true
  AND stage_date_closed_won IS NOT NULL;

UPDATE opportunities
SET closed_at = (stage_date_closed_lost::timestamptz)
WHERE is_closed_lost = true
  AND stage_date_closed_lost IS NOT NULL;

-- Additional counters on the imports log for the richer reconciliation.
ALTER TABLE imports
  ADD COLUMN IF NOT EXISTS opportunities_closed_won INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opportunities_stale      INTEGER DEFAULT 0;
