/**
 * Recent Actions / Undo (Issue #114)
 *
 * Surfaces a user's recently destructive actions in one place so they can undo
 * within a 30-day window:
 *   - deleted tasks they created/assigned
 *   - deleted inbox items (per-user by construction)
 *   - SE reassignments they made
 *
 * Read model is scoped to `current user did this` — a manager can't undo
 * another manager's SE reassignment from this surface. Admins who want broader
 * undo should go through backup/restore.
 */
import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireWriteAccess } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';

const router = Router();
const auth  = requireAuth        as unknown as (req: Request, res: Response, next: () => void) => void;
const write = requireWriteAccess as unknown as (req: Request, res: Response, next: () => void) => void;

interface ActionRow {
  kind: 'task' | 'inbox' | 'assignment';
  id: number;
  at: string;
  title: string;
  subtitle: string | null;
  opportunity_id: number | null;
  opportunity_name: string | null;
  undoable: boolean;
  reason_if_not_undoable: string | null;
}

// GET /api/v1/recent-actions?limit=50
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const limit = Math.min(parseInt((req.query.limit as string) ?? '50') || 50, 200);

  // Deleted tasks — include anything the user created OR was assigned to,
  // filtered to the 30-day restore window.
  const tasks = await query<{
    id: number; title: string; opportunity_id: number; opportunity_name: string;
    deleted_at: string | null; updated_at: string;
  }>(
    `SELECT t.id, t.title, t.opportunity_id,
            o.name AS opportunity_name,
            t.deleted_at, t.updated_at
       FROM tasks t
       JOIN opportunities o ON o.id = t.opportunity_id
      WHERE t.is_deleted = true
        AND (t.created_by_id = $1 OR t.assigned_to_id = $1)
        AND (t.deleted_at IS NULL OR t.deleted_at > now() - interval '30 days')
      ORDER BY COALESCE(t.deleted_at, t.updated_at) DESC
      LIMIT $2`,
    [userId, limit],
  );

  // Deleted inbox items — always owned by the user.
  const inbox = await query<{
    id: number; text: string; opportunity_id: number | null;
    opportunity_name: string | null;
    deleted_at: string | null; updated_at: string; status: string;
  }>(
    `SELECT i.id, i.text, i.opportunity_id, o.name AS opportunity_name,
            i.deleted_at, i.updated_at, i.status
       FROM inbox_items i
       LEFT JOIN opportunities o ON o.id = i.opportunity_id
      WHERE i.is_deleted = true
        AND i.user_id = $1
        AND i.status != 'converted'  -- converted items are not undoable (they produced a task/note)
        AND (i.deleted_at IS NULL OR i.deleted_at > now() - interval '30 days')
      ORDER BY COALESCE(i.deleted_at, i.updated_at) DESC
      LIMIT $2`,
    [userId, limit],
  );

  // SE reassignments by this user. Undoable when not already undone AND the
  // opp's current owner still matches the `new_owner_id` (otherwise reverting
  // would clobber someone else's later reassignment).
  const assignments = await query<{
    id: number; opportunity_id: number; opportunity_name: string;
    previous_owner_id: number | null; previous_owner_name: string | null;
    new_owner_id: number | null; new_owner_name: string | null;
    current_owner_id: number | null;
    changed_at: string; undone_at: string | null;
  }>(
    `SELECT h.id, h.opportunity_id, o.name AS opportunity_name,
            h.previous_owner_id, pu.name AS previous_owner_name,
            h.new_owner_id,      nu.name AS new_owner_name,
            o.se_owner_id AS current_owner_id,
            h.changed_at, h.undone_at
       FROM se_assignment_history h
       JOIN opportunities o ON o.id = h.opportunity_id
       LEFT JOIN users pu ON pu.id = h.previous_owner_id
       LEFT JOIN users nu ON nu.id = h.new_owner_id
      WHERE h.changed_by_id = $1
        AND h.changed_at > now() - interval '30 days'
      ORDER BY h.changed_at DESC
      LIMIT $2`,
    [userId, limit],
  );

  const out: ActionRow[] = [];

  for (const t of tasks) {
    out.push({
      kind: 'task',
      id: t.id,
      at: t.deleted_at ?? t.updated_at,
      title: `Deleted task: ${t.title}`,
      subtitle: null,
      opportunity_id: t.opportunity_id,
      opportunity_name: t.opportunity_name,
      undoable: true,
      reason_if_not_undoable: null,
    });
  }
  for (const i of inbox) {
    out.push({
      kind: 'inbox',
      id: i.id,
      at: i.deleted_at ?? i.updated_at,
      title: `Deleted inbox item: ${i.text.slice(0, 60)}${i.text.length > 60 ? '…' : ''}`,
      subtitle: null,
      opportunity_id: i.opportunity_id,
      opportunity_name: i.opportunity_name,
      undoable: true,
      reason_if_not_undoable: null,
    });
  }
  for (const a of assignments) {
    const undoable = !a.undone_at && a.current_owner_id === a.new_owner_id;
    const reason = a.undone_at
      ? 'Already undone'
      : a.current_owner_id !== a.new_owner_id
        ? 'Opportunity has been reassigned since'
        : null;
    const newName = a.new_owner_name ?? 'Unassigned';
    const prevName = a.previous_owner_name ?? 'Unassigned';
    out.push({
      kind: 'assignment',
      id: a.id,
      at: a.changed_at,
      title: `Assigned SE: ${prevName} → ${newName}`,
      subtitle: null,
      opportunity_id: a.opportunity_id,
      opportunity_name: a.opportunity_name,
      undoable,
      reason_if_not_undoable: reason,
    });
  }

  out.sort((x, y) => x.at < y.at ? 1 : -1);

  res.json(ok(out.slice(0, limit)));
});

// POST /api/v1/recent-actions/undo
// body: { kind: 'task' | 'inbox' | 'assignment', id: number }
router.post('/undo', auth, write, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { kind, id } = req.body as { kind?: string; id?: number };
  if (!kind || !Number.isFinite(id)) {
    res.status(400).json(err('kind and id are required')); return;
  }

  if (kind === 'task') {
    const restored = await queryOne(
      `UPDATE tasks
          SET is_deleted = false, deleted_at = NULL, updated_at = now()
        WHERE id = $1
          AND is_deleted = true
          AND (created_by_id = $2 OR assigned_to_id = $2)
          AND (deleted_at IS NULL OR deleted_at > now() - interval '30 days')
        RETURNING *`,
      [id, userId],
    );
    if (!restored) { res.status(404).json(err('Task not found or beyond restore window')); return; }
    logAudit(req, { action: 'RESTORE_TASK', resourceType: 'task', resourceId: id });
    res.json(ok({ kind: 'task', restored }));
    return;
  }

  if (kind === 'inbox') {
    const restored = await queryOne(
      `UPDATE inbox_items
          SET is_deleted = false, deleted_at = NULL, updated_at = now()
        WHERE id = $1 AND user_id = $2
          AND is_deleted = true
          AND (deleted_at IS NULL OR deleted_at > now() - interval '30 days')
        RETURNING *`,
      [id, userId],
    );
    if (!restored) { res.status(404).json(err('Item not found or beyond restore window')); return; }
    logAudit(req, { action: 'RESTORE_INBOX', resourceType: 'inbox_item', resourceId: id });
    res.json(ok({ kind: 'inbox', restored }));
    return;
  }

  if (kind === 'assignment') {
    const h = await queryOne<{
      id: number; opportunity_id: number; previous_owner_id: number | null;
      new_owner_id: number | null; changed_by_id: number | null;
      undone_at: string | null;
      current_owner_id: number | null;
      opp_name: string;
    }>(
      `SELECT h.id, h.opportunity_id, h.previous_owner_id, h.new_owner_id,
              h.changed_by_id, h.undone_at,
              o.se_owner_id AS current_owner_id, o.name AS opp_name
         FROM se_assignment_history h
         JOIN opportunities o ON o.id = h.opportunity_id
        WHERE h.id = $1`,
      [id],
    );
    if (!h) { res.status(404).json(err('Assignment history not found')); return; }
    if (h.changed_by_id !== userId) { res.status(403).json(err('Can only undo your own reassignments')); return; }
    if (h.undone_at) { res.status(409).json(err('Already undone')); return; }
    if (h.current_owner_id !== h.new_owner_id) {
      res.status(409).json(err('Opportunity has been reassigned since')); return;
    }

    await queryOne(
      `UPDATE opportunities SET se_owner_id = $1, updated_at = now() WHERE id = $2`,
      [h.previous_owner_id, h.opportunity_id],
    );
    await queryOne(
      `UPDATE se_assignment_history SET undone_at = now() WHERE id = $1`,
      [id],
    );
    // Also record the revert as a new (non-history) assignment event so audit log has it.
    await queryOne(
      `INSERT INTO se_assignment_history (opportunity_id, previous_owner_id, new_owner_id, changed_by_id)
         VALUES ($1, $2, $3, $4)`,
      [h.opportunity_id, h.new_owner_id, h.previous_owner_id, userId],
    );
    logAudit(req, {
      action: 'UNDO_ASSIGN_SE', resourceType: 'opportunity',
      resourceId: h.opportunity_id, resourceName: h.opp_name,
      before: { se_owner_id: h.new_owner_id },
      after:  { se_owner_id: h.previous_owner_id },
    });
    res.json(ok({ kind: 'assignment', opportunity_id: h.opportunity_id, previous_owner_id: h.previous_owner_id }));
    return;
  }

  res.status(400).json(err(`Unknown kind: ${kind}`));
});

export default router;
