-- Remove the over-restrictive CHECK constraint on field_name so the import
-- service can track additional fields (manager_comments, close_date,
-- poc_status, agentic_qual, technical_blockers) without a schema migration
-- every time a new field is added to history tracking.
ALTER TABLE opportunity_field_history
  DROP CONSTRAINT IF EXISTS opportunity_field_history_field_name_check;
