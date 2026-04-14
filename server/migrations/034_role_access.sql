-- 034: Role-based page access control + admin flag

-- 1. Add is_admin flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 2. Expand role CHECK constraint to include 'read-only'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('manager', 'se', 'read-only'));

-- 3. Create role_page_access table
CREATE TABLE IF NOT EXISTS role_page_access (
  page_key TEXT NOT NULL,
  role     TEXT NOT NULL,
  PRIMARY KEY (page_key, role)
);

-- 4. Seed default mappings matching current behaviour
-- Base pages: all roles
INSERT INTO role_page_access (page_key, role) VALUES
  ('home', 'manager'), ('home', 'se'), ('home', 'read-only'),
  ('pipeline', 'manager'), ('pipeline', 'se'), ('pipeline', 'read-only'),
  ('my-pipeline', 'manager'), ('my-pipeline', 'se'), ('my-pipeline', 'read-only'),
  ('favorites', 'manager'), ('favorites', 'se'), ('favorites', 'read-only'),
  ('my-tasks', 'manager'), ('my-tasks', 'se'), ('my-tasks', 'read-only'),
  ('calendar', 'manager'), ('calendar', 'se'), ('calendar', 'read-only'),
  -- manager + se
  ('closed-lost', 'manager'), ('closed-lost', 'se'),
  ('insights/se-mapping', 'manager'), ('insights/se-mapping', 'se'),
  ('insights/poc-board', 'manager'), ('insights/poc-board', 'se'),
  ('insights/rfx-board', 'manager'), ('insights/rfx-board', 'se'),
  -- Insights: manager only
  ('insights/forecasting-brief', 'manager'),
  ('insights/one-on-one', 'manager'),
  ('insights/weekly-digest', 'manager'),
  ('insights/stage-movement', 'manager'),
  ('insights/missing-notes', 'manager'),
  ('insights/team-workload', 'manager'),
  ('insights/overdue-tasks', 'manager'),
  ('insights/team-tasks', 'manager'),
  ('insights/deploy-mode', 'manager'),
  ('insights/closed-lost-stats', 'manager'),
  ('insights/closed-won', 'manager'),
  ('insights/percent-to-target', 'manager'),
  ('insights/tech-blockers', 'manager'),
  ('insights/agentic-qual', 'manager'),
  ('insights/analytics', 'manager'),
  -- Administration: manager only (admin flag controls section visibility, these control individual pages)
  ('settings/users', 'manager'),
  ('settings/import', 'manager'),
  ('settings/import-history', 'manager'),
  ('settings/menu-settings', 'manager'),
  ('settings/backup', 'manager'),
  ('settings/deploy', 'manager'),
  ('settings/deal-info-layout', 'manager'),
  ('settings/quotas', 'manager'),
  ('settings/role-access', 'manager'),
  ('audit', 'manager')
ON CONFLICT DO NOTHING;

-- 5. Bootstrap: promote tomas.bolek as admin (primary admin user)
UPDATE users SET is_admin = true WHERE email = 'tomas.bolek@ataccama.com';

-- Also promote first active manager as fallback (in case the above email doesn't exist)
UPDATE users SET is_admin = true
WHERE id = (SELECT id FROM users WHERE role = 'manager' AND is_active = true ORDER BY id LIMIT 1)
  AND is_admin = false;
