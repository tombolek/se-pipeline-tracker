-- Add territory team to users (managers only, but column exists on all rows)
ALTER TABLE users ADD COLUMN IF NOT EXISTS team TEXT;
