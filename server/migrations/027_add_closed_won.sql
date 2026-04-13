-- Migration 027: Track Closed Won separately from Closed Lost.
--
-- An opportunity that disappears from the SF import while in "Submitted for
-- Booking" stage is actually Won (booking submitted = sale closed), not Lost.
-- Previously every disappearing deal was lumped into is_closed_lost = true,
-- which inflated loss stats with deals that actually won.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS is_closed_won   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_won_seen BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any deal currently flagged closed_lost whose last known stage was
-- "Submitted for Booking" should be re-classified as Won.
UPDATE opportunities
SET is_closed_won   = true,
    is_closed_lost  = false,
    closed_won_seen = closed_lost_seen,
    stage           = 'Closed Won',
    updated_at      = now()
WHERE is_closed_lost = true
  AND stage = 'Submitted for Booking';
