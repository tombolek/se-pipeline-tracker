-- Migration 054: per-stage pipeline tracking for imports
--
-- Imports now run asynchronously. The POST /opportunities/import route creates
-- the imports row with status='in_progress' and returns the ID immediately;
-- the pipeline writes per-stage progress (status + startedAt + finishedAt +
-- counts + any stage-level error) to stage_log as each stage runs. The admin
-- UI polls /opportunities/import/history every 5s while any row is
-- in_progress and renders a 5-stage diagram per row (Parse → Validate →
-- Reconcile → Enrich → Finalize).

ALTER TABLE imports
  ADD COLUMN IF NOT EXISTS stage_log   JSONB       DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- Backfill: pre-async imports completed synchronously, so their started_at and
-- finished_at are effectively equal to imported_at.
UPDATE imports SET started_at  = imported_at WHERE started_at  IS NULL;
UPDATE imports SET finished_at = imported_at WHERE finished_at IS NULL;

-- Expand status CHECK to include 'in_progress'.
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_status_check;
ALTER TABLE imports ADD CONSTRAINT imports_status_check
  CHECK (status IN ('in_progress', 'success', 'partial', 'failed'));

-- Polling index — lets the UI quickly find any in-flight imports.
CREATE INDEX IF NOT EXISTS idx_imports_status_in_progress
  ON imports (imported_at DESC) WHERE status = 'in_progress';
