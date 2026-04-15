import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager, requireWriteAccess } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';

const router = Router();
const auth    = requireAuth          as unknown as (req: Request, res: Response, next: () => void) => void;
const manager = requireManager       as unknown as (req: Request, res: Response, next: () => void) => void;
const write   = requireWriteAccess   as unknown as (req: Request, res: Response, next: () => void) => void;

type TemplateKind = 'task_pack' | 'note';

interface TaskPackItem {
  title: string;
  description?: string | null;
  is_next_step?: boolean;
  due_offset_days?: number;
}

function validateItems(items: unknown): TaskPackItem[] {
  if (!Array.isArray(items)) throw new Error('items must be an array');
  if (items.length === 0) throw new Error('task_pack must have at least one item');
  return items.map((raw, i) => {
    const it = raw as Record<string, unknown>;
    const title = typeof it.title === 'string' ? it.title.trim() : '';
    if (!title) throw new Error(`items[${i}].title is required`);
    return {
      title,
      description: typeof it.description === 'string' ? it.description.trim() : null,
      is_next_step: !!it.is_next_step,
      due_offset_days: Number.isFinite(it.due_offset_days as number)
        ? Number(it.due_offset_days)
        : 7,
    };
  });
}

// GET /api/v1/templates?kind=task_pack|note&stage=Build%20Value
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const { kind, stage } = req.query as { kind?: string; stage?: string };
  const where: string[] = ['is_deleted = false'];
  const params: unknown[] = [];
  if (kind) { params.push(kind); where.push(`kind = $${params.length}`); }
  if (stage) {
    params.push(stage);
    // Either matches the stage exactly, or is un-scoped (NULL = any stage)
    where.push(`(stage = $${params.length} OR stage IS NULL)`);
  }
  const rows = await query(
    `SELECT t.*, u.name AS created_by_name
       FROM templates t
       LEFT JOIN users u ON u.id = t.created_by_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.kind, t.name`,
    params,
  );
  res.json(ok(rows));
});

// POST /api/v1/templates  (manager only)
router.post('/', auth, manager, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { kind, name, description, body, items, stage } = req.body as {
    kind?: TemplateKind; name?: string; description?: string;
    body?: string; items?: unknown; stage?: string | null;
  };

  if (kind !== 'task_pack' && kind !== 'note') {
    res.status(400).json(err('kind must be "task_pack" or "note"'));
    return;
  }
  if (!name?.trim()) { res.status(400).json(err('name is required')); return; }

  let normalizedItems: TaskPackItem[] | null = null;
  let normalizedBody: string | null = null;

  try {
    if (kind === 'task_pack') normalizedItems = validateItems(items);
    else {
      if (typeof body !== 'string' || !body.trim()) throw new Error('body is required for note templates');
      normalizedBody = body;
    }
  } catch (e) {
    res.status(400).json(err((e as Error).message));
    return;
  }

  const row = await queryOne<{ id: number }>(
    `INSERT INTO templates (kind, name, description, body, items, stage, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
    [
      kind,
      name.trim(),
      description?.trim() || null,
      normalizedBody,
      normalizedItems ? JSON.stringify(normalizedItems) : null,
      stage?.trim() || null,
      userId,
    ],
  );

  logAudit(req, {
    action: 'TEMPLATE_CREATE', resourceType: 'template',
    resourceId: row?.id, resourceName: name,
    userId, userRole: (req as AuthenticatedRequest).user.role,
    after: { kind, stage: stage || null },
  });

  res.json(ok(row));
});

// PATCH /api/v1/templates/:id  (manager only)
router.patch('/:id', auth, manager, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid template id')); return; }

  const existing = await queryOne<Record<string, unknown>>(
    'SELECT * FROM templates WHERE id = $1 AND is_deleted = false',
    [id],
  );
  if (!existing) { res.status(404).json(err('Template not found')); return; }

  const { name, description, body, items, stage } = req.body as {
    name?: string; description?: string | null;
    body?: string | null; items?: unknown; stage?: string | null;
  };

  let newItems: string | null | undefined;
  let newBody: string | null | undefined;

  try {
    if (items !== undefined) {
      newItems = items === null ? null : JSON.stringify(validateItems(items));
    }
    if (body !== undefined) {
      newBody = typeof body === 'string' ? body : null;
    }
  } catch (e) {
    res.status(400).json(err((e as Error).message));
    return;
  }

  const updated = await queryOne(
    `UPDATE templates SET
        name        = COALESCE($1, name),
        description = $2,
        body        = COALESCE($3, body),
        items       = COALESCE($4, items),
        stage       = $5,
        updated_at  = now()
      WHERE id = $6
      RETURNING *`,
    [
      name !== undefined ? name.trim() : null,
      description !== undefined ? (description ?? null) : existing.description,
      newBody ?? null,
      newItems ?? null,
      stage !== undefined ? (stage?.trim() || null) : existing.stage,
      id,
    ],
  );

  logAudit(req, {
    action: 'TEMPLATE_UPDATE', resourceType: 'template',
    resourceId: id, resourceName: (updated as Record<string, unknown>)?.name as string,
    userId: (req as AuthenticatedRequest).user.userId,
    userRole: (req as AuthenticatedRequest).user.role,
  });

  res.json(ok(updated));
});

// DELETE /api/v1/templates/:id  (manager only, soft delete)
router.delete('/:id', auth, manager, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid template id')); return; }
  const row = await queryOne<{ name: string }>(
    `UPDATE templates SET is_deleted = true, updated_at = now()
       WHERE id = $1 AND is_deleted = false
       RETURNING name`,
    [id],
  );
  if (!row) { res.status(404).json(err('Template not found')); return; }
  logAudit(req, {
    action: 'TEMPLATE_DELETE', resourceType: 'template',
    resourceId: id, resourceName: row.name,
    userId: (req as AuthenticatedRequest).user.userId,
    userRole: (req as AuthenticatedRequest).user.role,
  });
  res.json(ok({ deleted: true }));
});

// POST /api/v1/templates/:id/apply
// Body: { opportunity_id: number, assigned_to_id?: number, start_date?: string (YYYY-MM-DD) }
// For task_pack: creates one task per item, due = start_date + due_offset_days
// For note:      appends the template body as a new note
router.post('/:id/apply', auth, write, async (req: Request, res: Response): Promise<void> => {
  const { userId, role } = (req as AuthenticatedRequest).user;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid template id')); return; }

  const { opportunity_id, assigned_to_id, start_date } = req.body as {
    opportunity_id?: number; assigned_to_id?: number | null; start_date?: string;
  };
  if (!opportunity_id) { res.status(400).json(err('opportunity_id is required')); return; }

  const tmpl = await queryOne<{
    id: number; kind: TemplateKind; name: string; body: string | null; items: TaskPackItem[] | null;
  }>(
    'SELECT id, kind, name, body, items FROM templates WHERE id = $1 AND is_deleted = false',
    [id],
  );
  if (!tmpl) { res.status(404).json(err('Template not found')); return; }

  const opp = await queryOne<{ id: number; se_owner_id: number | null; name: string }>(
    'SELECT id, se_owner_id, name FROM opportunities WHERE id = $1',
    [opportunity_id],
  );
  if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

  // Parse start_date or default to today (UTC date string)
  const baseDate = start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)
    ? new Date(start_date + 'T00:00:00Z')
    : new Date();

  if (tmpl.kind === 'task_pack') {
    const items = tmpl.items ?? [];
    const assignee = assigned_to_id ?? opp.se_owner_id ?? userId;
    const createdTasks: unknown[] = [];

    for (const item of items) {
      const due = new Date(baseDate);
      due.setUTCDate(due.getUTCDate() + (item.due_offset_days ?? 7));
      const dueIso = due.toISOString().slice(0, 10);

      const task = await queryOne(
        `INSERT INTO tasks
           (opportunity_id, title, description, status, is_next_step, due_date,
            assigned_to_id, created_by_id)
         VALUES ($1, $2, $3, 'open', $4, $5, $6, $7)
         RETURNING *`,
        [
          opp.id,
          item.title,
          item.description ?? null,
          !!item.is_next_step,
          dueIso,
          assignee,
          userId,
        ],
      );
      createdTasks.push(task);
    }

    logAudit(req, {
      action: 'TEMPLATE_APPLY', resourceType: 'opportunity',
      resourceId: opp.id, resourceName: opp.name,
      userId, userRole: role,
      after: { template_id: tmpl.id, template_name: tmpl.name, task_count: createdTasks.length },
    });

    res.json(ok({ kind: 'task_pack', tasks: createdTasks }));
    return;
  }

  // kind === 'note'
  const content = tmpl.body ?? '';
  if (!content.trim()) { res.status(400).json(err('Note template body is empty')); return; }

  const note = await queryOne(
    `INSERT INTO notes (opportunity_id, author_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
    [opp.id, userId, content],
  );
  await query(
    'UPDATE opportunities SET last_note_at = now(), updated_at = now() WHERE id = $1',
    [opp.id],
  );
  const full = await queryOne(
    `SELECT n.*, u.name AS author_name
       FROM notes n JOIN users u ON u.id = n.author_id
       WHERE n.id = $1`,
    [(note as Record<string, unknown>).id],
  );

  logAudit(req, {
    action: 'TEMPLATE_APPLY', resourceType: 'opportunity',
    resourceId: opp.id, resourceName: opp.name,
    userId, userRole: role,
    after: { template_id: tmpl.id, template_name: tmpl.name, note_created: true },
  });

  res.json(ok({ kind: 'note', note: full }));
});

export default router;
