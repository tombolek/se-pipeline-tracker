-- 036: Track when each user last opened the in-app changelog.
-- Used to badge "What's New" in the sidebar when new entries have been published
-- since the user's last visit. NULL = user has never opened it.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_changelog_seen_at TIMESTAMPTZ;
