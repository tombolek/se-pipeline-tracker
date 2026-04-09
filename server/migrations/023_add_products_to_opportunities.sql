-- Add products array column to opportunities for KB matching
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS products TEXT[] NOT NULL DEFAULT '{}';

-- Index for array overlap queries (e.g. products && ARRAY['DQ','MDM'])
CREATE INDEX IF NOT EXISTS opportunities_products_gin_idx ON opportunities USING GIN (products);
