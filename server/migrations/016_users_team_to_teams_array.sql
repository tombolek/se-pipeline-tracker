-- Migrate users.team (TEXT) to users.teams (TEXT[]) for multi-territory support
ALTER TABLE users ADD COLUMN IF NOT EXISTS teams TEXT[] DEFAULT '{}';
UPDATE users SET teams = ARRAY[team] WHERE team IS NOT NULL AND team != '';
ALTER TABLE users DROP COLUMN IF EXISTS team;
