-- 040: Clean up synthetic se_assignment_history rows created by the buggy
-- undo handler (pre-fix for Issue #114).
--
-- Before the fix, undoing an SE reassignment would INSERT a reverse-direction
-- history row in addition to setting undone_at on the original. That reverse
-- row was never flagged as synthetic, so it cluttered the Recent Actions feed
-- and — worse — looked undoable itself, forming an undo/redo loop.
--
-- This one-shot delete removes any assignment history row that is the exact
-- reverse of another row (same opportunity, same actor) whose undone_at was
-- written within ~5 seconds of this row's changed_at. That's the fingerprint
-- of the synthetic revert. Legitimate reassignments that happen to swap back
-- are not at risk because:
--   - they wouldn't share changed_by_id with an undone row, OR
--   - they wouldn't fall inside the 5-second window
--
-- Safe to re-run: after the code fix deploys, no new synthetic rows are
-- inserted, so subsequent runs match nothing.

DELETE FROM se_assignment_history h
WHERE h.undone_at IS NULL
  AND EXISTS (
    SELECT 1
      FROM se_assignment_history orig
     WHERE orig.opportunity_id = h.opportunity_id
       AND orig.changed_by_id = h.changed_by_id
       AND orig.undone_at IS NOT NULL
       AND orig.previous_owner_id IS NOT DISTINCT FROM h.new_owner_id
       AND orig.new_owner_id      IS NOT DISTINCT FROM h.previous_owner_id
       AND ABS(EXTRACT(EPOCH FROM (orig.undone_at - h.changed_at))) < 5
  );
