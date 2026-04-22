-- Migration 047: Capture Salesforce Lost Reason fields on Closed Lost deals.
--
-- The SF Opportunities export now includes four new columns that give
-- structured context on why a deal was lost:
--   * Lost Reason              (top-level category)
--   * Lost Sub Reason          (more specific reason within the category)
--   * Lost Reason (Comments)   (free-text explanation)
--   * (Lost to) Competitor     (the competitor that won, when applicable)
--
-- Persist each to its own column so the Closed Lost Stats page (and future
-- win/loss analytics) can aggregate and filter on them without parsing JSON.
-- sf_raw_fields still captures the originals on every import.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS lost_reason          TEXT,
  ADD COLUMN IF NOT EXISTS lost_sub_reason      TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason_comments TEXT,
  ADD COLUMN IF NOT EXISTS lost_to_competitor   TEXT;
