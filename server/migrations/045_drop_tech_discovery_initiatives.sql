-- 045: Drop the `initiatives` column from opportunity_tech_discovery.
--
-- The Data Initiatives checklist (Data Mesh / Cloud Migration / privacy-laws
-- flags etc.) was part of migration 044 but didn't pull its weight — it
-- overlapped heavily with information already captured via MEDDPICC and SF
-- fields, and the SE workflow on it was thin. We're keeping Tech Discovery
-- focused strictly on the technical stack + prose discovery notes, so drop
-- the column and its GIN index. Similar Deals scoring loses the 5-point
-- initiatives-overlap signal; tech-stack overlap (10 pts) stays.

DROP INDEX IF EXISTS idx_tech_discovery_initiatives;

ALTER TABLE opportunity_tech_discovery
  DROP COLUMN IF EXISTS initiatives;
