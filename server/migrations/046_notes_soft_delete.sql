-- 046: Soft-delete support for notes.
--
-- Notes were created as append-only (migration 004 comment: "no UPDATE or
-- DELETE ever issued on this table"). That rule held up for a while but users
-- legitimately need to delete their own notes — typos, wrong-deal mistakes,
-- half-finished drafts. Managers additionally need to delete any note so the
-- team isn't stuck with offensive / PII-laden content.
--
-- We switch to soft-delete (same model as tasks / users / opportunities):
-- keep the row for audit + backup, flag it deleted, filter at every read
-- site. The original append-only promise still holds for UPDATE — notes are
-- never mutated in place; `is_deleted=true + deleted_at + deleted_by_id`
-- is the only writable transition.
--
-- Backup/restore keeps all rows (deleted or not) so restoring from a backup
-- of Tuesday's data reproduces Tuesday's deletion state.

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS is_deleted    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id INTEGER REFERENCES users(id);

-- Partial index — the common read path filters is_deleted=false, so a
-- partial index avoids bloating the existing opportunity index.
CREATE INDEX IF NOT EXISTS idx_notes_active_opp ON notes(opportunity_id) WHERE is_deleted = false;
