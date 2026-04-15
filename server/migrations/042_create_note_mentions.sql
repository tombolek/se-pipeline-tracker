-- Issue #113 — Inline @mentions on Notes.
--
-- Tracks who was @-mentioned in which note. A row is inserted per unique
-- mentioned user when the note is created (append-only, just like notes).
-- The Home page renders a "Mentions" feed filtered to the current user's
-- unseen mentions; `seen_at` is stamped when the user opens the mention in
-- the Home feed (or clicks through to the note).
--
-- Why a separate table instead of a JSONB column on notes:
--   1. Fast per-user unseen-count query: `WHERE mentioned_user_id = $1 AND seen_at IS NULL`.
--   2. Mentions survive if we ever reshuffle note content — the link between
--      note and mentioned user is persistent and indexable.
--   3. Easy future extension (e.g. email/Slack fan-out) without touching the
--      notes table, which is append-only and hot.
CREATE TABLE IF NOT EXISTS note_mentions (
  id                  SERIAL PRIMARY KEY,
  note_id             INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  mentioned_user_id   INTEGER NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at             TIMESTAMPTZ,
  UNIQUE (note_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_note_mentions_user_unseen
  ON note_mentions (mentioned_user_id, created_at DESC)
  WHERE seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_note_mentions_user
  ON note_mentions (mentioned_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_note_mentions_note
  ON note_mentions (note_id);
