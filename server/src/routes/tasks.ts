import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /tasks  — my open/in-progress tasks (current user)
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;

  const tasks = await query(
    `SELECT
       t.*,
       o.name AS opportunity_name,
       u.name AS assigned_to_name
     FROM tasks t
     JOIN opportunities o ON o.id = t.opportunity_id
     LEFT JOIN users u ON u.id = t.assigned_to_id
     WHERE t.assigned_to_id = $1
       AND t.is_deleted = false
       AND t.status IN ('open', 'in_progress', 'blocked')
     ORDER BY
       CASE WHEN t.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
       t.due_date ASC NULLS LAST,
       t.created_at ASC`,
    [userId]
  );

  res.json(ok(tasks));
});

// PATCH /tasks/:id
router.patch('/:id', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid task id')); return; }

  const { title, description, status, is_next_step, due_date, assigned_to_id } = req.body as {
    title?: string;
    description?: string;
    status?: string;
    is_next_step?: boolean;
    due_date?: string | null;
    assigned_to_id?: number | null;
  };

  const VALID_STATUSES = new Set(['open', 'in_progress', 'done', 'blocked']);
  if (status && !VALID_STATUSES.has(status)) {
    res.status(400).json(err(`Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}`));
    return;
  }

  const existing = await queryOne<Record<string, unknown>>(
    'SELECT * FROM tasks WHERE id = $1 AND is_deleted = false',
    [id]
  );
  if (!existing) { res.status(404).json(err('Task not found')); return; }

  const updated = await queryOne(
    `UPDATE tasks SET
       title          = $1,
       description    = $2,
       status         = $3,
       is_next_step   = $4,
       due_date       = $5,
       assigned_to_id = $6,
       updated_at     = now()
     WHERE id = $7
     RETURNING *`,
    [
      title          !== undefined ? title.trim()        : existing.title,
      description    !== undefined ? (description?.trim() ?? null) : existing.description,
      status         !== undefined ? status               : existing.status,
      is_next_step   !== undefined ? is_next_step         : existing.is_next_step,
      due_date       !== undefined ? (due_date ?? null)   : existing.due_date,
      assigned_to_id !== undefined ? (assigned_to_id ?? null) : existing.assigned_to_id,
      id,
    ]
  );

  res.json(ok(updated));
  logAudit(req, {
    action: 'UPDATE_TASK', resourceType: 'task',
    resourceId: id, resourceName: String(existing.title ?? ''),
    before: { status: existing.status, due_date: existing.due_date },
    after: { status: status ?? existing.status, due_date: due_date !== undefined ? due_date : existing.due_date },
  });
});

// DELETE /tasks/:id  (soft delete)
router.delete('/:id', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid task id')); return; }

  const task = await queryOne(
    `UPDATE tasks SET is_deleted = true, updated_at = now()
     WHERE id = $1 AND is_deleted = false
     RETURNING id`,
    [id]
  );
  if (!task) { res.status(404).json(err('Task not found')); return; }

  res.json(ok({ deleted: true, id }));
  logAudit(req, { action: 'DELETE_TASK', resourceType: 'task', resourceId: id });
});

export default router;
