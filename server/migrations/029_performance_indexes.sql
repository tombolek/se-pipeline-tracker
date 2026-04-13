-- Migration 029: Performance indexes for hot opportunity queries (Issue #102).
--
-- Most pages filter `is_active = true AND is_closed_lost = false`. Closed Won
-- deals already have is_active = false (importService sets it that way), so
-- this same predicate also excludes Closed Won — no need to add a third clause.
--
-- Partial index predicates intentionally MATCH the existing query predicates
-- exactly so the Postgres planner will use them. Adding extra conditions to the
-- index predicate that are not in the query causes the planner to fall back to
-- a sequential scan.

-- Active open pipeline — the dominant filter for /opportunities, insights,
-- PoC/RFx boards, weekly digest, forecasting brief, etc.
CREATE INDEX IF NOT EXISTS idx_opportunities_active_pipeline
  ON opportunities(close_date ASC NULLS LAST)
  WHERE is_active = true AND is_closed_lost = false;

-- Same predicate but indexed on (stage, se_owner_id) for SE Mapping, My
-- Pipeline, and stage-filtered insights queries.
CREATE INDEX IF NOT EXISTS idx_opportunities_active_stage_se
  ON opportunities(stage, se_owner_id)
  WHERE is_active = true AND is_closed_lost = false;

-- Closed Lost view — sorted by closed_at DESC. Matches /opportunities/closed-lost.
CREATE INDEX IF NOT EXISTS idx_opportunities_closed_lost_recent
  ON opportunities(closed_at DESC NULLS LAST)
  WHERE is_closed_lost = true;

-- Closed Won (future Win Analysis page).
CREATE INDEX IF NOT EXISTS idx_opportunities_closed_won_recent
  ON opportunities(closed_at DESC NULLS LAST)
  WHERE COALESCE(is_closed_won, false) = true;

-- Tasks aggregation: the main pipeline GET LEFT JOINs tasks and aggregates
-- open / overdue / next-step counts. A partial index on non-deleted, non-done
-- tasks lets the join skip completed/deleted rows up front.
CREATE INDEX IF NOT EXISTS idx_tasks_open_for_opp
  ON tasks(opportunity_id)
  WHERE is_deleted = false AND status != 'done';
