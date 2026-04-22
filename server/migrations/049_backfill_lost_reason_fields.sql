-- Migration 049: Backfill Lost Reason columns from sf_raw_fields.
--
-- Migration 047 added the four lost_* columns but only populated them via the
-- import mapper going forward. Any Closed Lost row captured before the new
-- mapper deployed (or imported before SF added these headers to the report
-- filter) had the data sitting inside sf_raw_fields but NULL on the typed
-- columns — which made Weekly Digest's new Lost Reason / Lost To / Comment
-- cells render as "—" even though the Deal Info tab (which reads
-- sf_raw_fields directly) could clearly display the values.
--
-- The import pipeline lowercases every SF column header before writing into
-- sf_raw_fields (see importService buildParsedRows), so the JSON keys are:
--   "lost reason"
--   "lost sub reason"
--   "lost reason (comments)"
--   "(lost to) competitor"
--
-- COALESCE keeps any value a subsequent import already populated — we only
-- fill NULLs. NULLIF(..., '') collapses empty-string cells (SF exports a lot
-- of those) back to NULL so the "empty" em-dash keeps rendering correctly.

UPDATE opportunities
SET lost_reason          = COALESCE(lost_reason,          NULLIF(TRIM(sf_raw_fields->>'lost reason'),            '')),
    lost_sub_reason      = COALESCE(lost_sub_reason,      NULLIF(TRIM(sf_raw_fields->>'lost sub reason'),        '')),
    lost_reason_comments = COALESCE(lost_reason_comments, NULLIF(TRIM(sf_raw_fields->>'lost reason (comments)'), '')),
    lost_to_competitor   = COALESCE(lost_to_competitor,   NULLIF(TRIM(sf_raw_fields->>'(lost to) competitor'),   ''))
WHERE sf_raw_fields ?| ARRAY['lost reason', 'lost sub reason', 'lost reason (comments)', '(lost to) competitor'];
