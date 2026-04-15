-- 038: Undo / restore support (Issue #114)
--
-- 1. Add `deleted_at` timestamps to tasks and inbox_items so we can:
--    - show a restore window in the UI ("deleted 3 minutes ago")
--    - purge rows older than 30 days via the startup cleanup job
--    Backfill existing is_deleted=true rows so they're not immediately purged.
--
-- 2. New table `se_assignment_history` records prior SE owners for each
--    opportunity whenever se_owner_id changes. One-way audit log used
--    as the source of truth for the "undo reassignment" feature.

ALTER TABLE tasks        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE inbox_items  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill: existing soft-deleted rows get `deleted_at = updated_at` so the
-- 30-day purge window starts from their last-known change.
UPDATE tasks       SET deleted_at = updated_at WHERE is_deleted = true AND deleted_at IS NULL;
UPDATE inbox_items SET deleted_at = updated_at WHERE is_deleted = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tasks_deleted_at_idx
  ON tasks(deleted_at) WHERE is_deleted = true;
CREATE INDEX IF NOT EXISTS inbox_items_deleted_at_idx
  ON inbox_items(deleted_at) WHERE is_deleted = true;

CREATE TABLE IF NOT EXISTS se_assignment_history (
  id                SERIAL PRIMARY KEY,
  opportunity_id    INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  previous_owner_id INTEGER REFERENCES users(id),
  new_owner_id      INTEGER REFERENCES users(id),
  changed_by_id     INTEGER REFERENCES users(id),
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  undone_at         TIMESTAMPTZ       -- set when an "undo" action reverts this change
);

CREATE INDEX IF NOT EXISTS se_assignment_history_opp_idx
  ON se_assignment_history(opportunity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS se_assignment_history_actor_idx
  ON se_assignment_history(changed_by_id, changed_at DESC) WHERE undone_at IS NULL;
