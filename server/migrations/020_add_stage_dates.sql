-- Migration 020: Add per-stage date columns ingested from SF export
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS stage_date_qualify              DATE,
  ADD COLUMN IF NOT EXISTS stage_date_build_value          DATE,
  ADD COLUMN IF NOT EXISTS stage_date_develop_solution     DATE,
  ADD COLUMN IF NOT EXISTS stage_date_proposal_sent        DATE,
  ADD COLUMN IF NOT EXISTS stage_date_negotiate            DATE,
  ADD COLUMN IF NOT EXISTS stage_date_submitted_for_booking DATE,
  ADD COLUMN IF NOT EXISTS stage_date_closed_won           DATE,
  ADD COLUMN IF NOT EXISTS stage_date_closed_lost          DATE;
