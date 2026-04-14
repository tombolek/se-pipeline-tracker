-- 035: Rename 'read-only' role to 'viewer'

-- 1. Update existing users
UPDATE users SET role = 'viewer' WHERE role = 'read-only';

-- 2. Update role_page_access table
UPDATE role_page_access SET role = 'viewer' WHERE role = 'read-only';

-- 3. Update CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('manager', 'se', 'viewer'));
