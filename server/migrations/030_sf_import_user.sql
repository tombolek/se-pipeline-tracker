-- Migration 030: Synthetic "SF Import" user used as the author for notes
-- automatically created from SF imports (e.g. when SE Comments changes).
--
-- Marked is_deleted = true and is_active = false so it's hidden from every
-- user-picker and team list, but the FK from notes.author_id still resolves
-- and the JOIN in GET /opportunities/:id/notes returns "SF Import" as the
-- author_name.
--
-- The role is constrained to ('manager', 'se'); we use 'se' since 'sf_import'
-- isn't allowed by the CHECK constraint and adding it would mean updating
-- every role-based filter elsewhere. is_deleted=true is the actual hide flag.

INSERT INTO users (email, name, password_hash, role, is_active, is_deleted)
VALUES (
  'sf-import@system.local',
  'SF Import',
  '!disabled-system-user-cannot-login!',
  'se',
  false,
  true
)
ON CONFLICT (email) DO NOTHING;
