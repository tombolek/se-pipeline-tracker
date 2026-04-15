-- 041: Seed role_page_access rows for pages added after migration 034.
--
-- Migration 034 seeded role_page_access for the set of pages that existed
-- at the time. Since then we've added:
--   - Win Rate insight (#92)       → /insights/win-rate
--   - Task & Note Templates (#132) → /settings/templates
--
-- Without rows in role_page_access, the sidebar filter in
-- `client/src/components/Sidebar.tsx` drops the entry (empty allowedPages ⇒
-- "show nothing" once a role has any entries at all). Seed manager-only
-- access for both, matching the pattern used by every other insights page
-- and every other settings page.

INSERT INTO role_page_access (page_key, role) VALUES
  ('insights/win-rate',   'manager'),
  ('settings/templates',  'manager')
ON CONFLICT DO NOTHING;
