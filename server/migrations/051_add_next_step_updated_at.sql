-- 051: Add next_step_updated_at column + backfill from field history.
--
-- AEs stamp the Next Step field with a date prefix the same way SEs stamp
-- se_comments ("20260312: met with…", "BM_26SEPT: partner work…", etc.).
-- The Weekly Digest's Stale Deals section — "no notes, tasks, or SE
-- comments update in 7+ days" — ignored this, so deals with a recent AE
-- Next Step update were being flagged stale. Mirroring the se_comments
-- freshness pattern fixes that.
--
-- Backfill: for rows with a prior next_step_sf change recorded in
-- opportunity_field_history, take the most recent changed_at. For rows
-- without history (created before history tracking), leave NULL — the
-- digest query uses GREATEST(..., last_note_at, …) and handles nulls.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS next_step_updated_at TIMESTAMPTZ;

UPDATE opportunities o
SET next_step_updated_at = h.max_changed
FROM (
  SELECT opportunity_id, MAX(changed_at) AS max_changed
  FROM opportunity_field_history
  WHERE field_name = 'next_step_sf'
  GROUP BY opportunity_id
) h
WHERE o.id = h.opportunity_id
  AND o.next_step_updated_at IS NULL;
