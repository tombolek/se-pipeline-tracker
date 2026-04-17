-- 043: Seed role_page_access for the Knowledge Base admin page.
--
-- Manager-only page (mirrors every other Administration page). Without this
-- row the sidebar filter drops the entry for every role.

INSERT INTO role_page_access (page_key, role) VALUES
  ('settings/knowledge-base', 'manager')
ON CONFLICT DO NOTHING;
