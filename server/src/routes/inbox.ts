import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireWriteAccess } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const write = requireWriteAccess as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /inbox — list current user's inbox items (open + recent done)
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const rows = await query(
    `SELECT * FROM inbox_items
     WHERE user_id = $1 AND is_deleted = false
     ORDER BY created_at DESC`,
    [userId]
  );
  res.json(ok(rows));
});

// POST /inbox — create jot
router.post('/', auth, write, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { text, type } = req.body as { text?: string; type?: string };

  if (!text?.trim()) { res.status(400).json(err('text is required')); return; }
  const itemType = type === 'todo' ? 'todo' : 'note';

  const item = await queryOne(
    `INSERT INTO inbox_items (user_id, text, type) VALUES ($1, $2, $3) RETURNING *`,
    [userId, text.trim(), itemType]
  );

  res.status(201).json(ok(item));
});

// PATCH /inbox/:id — update text or status
router.patch('/:id', auth, write, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const id = parseInt(req.params.id);
  const { text, status } = req.body as { text?: string; status?: string };

  const item = await queryOne(
    `SELECT * FROM inbox_items WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
    [id, userId]
  );
  if (!item) { res.status(404).json(err('not found')); return; }

  const updated = await queryOne(
    `UPDATE inbox_items
     SET text = COALESCE($1, text),
         status = COALESCE($2, status),
         updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [text?.trim() ?? null, status ?? null, id]
  );
  res.json(ok(updated));
});

// DELETE /inbox/:id — soft delete (undoable within 30 days)
router.delete('/:id', auth, write, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const id = parseInt(req.params.id);

  await queryOne(
    `UPDATE inbox_items SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  res.json(ok(null));
});

// POST /inbox/:id/restore — undo a soft delete within the 30-day window.
router.post('/:id/restore', auth, write, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const id = parseInt(req.params.id);
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
  res.json(ok(restored));
});

// POST /inbox/:id/convert — link to opportunity and convert to task or note
router.post('/:id/convert', auth, write, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const id = parseInt(req.params.id);
  const { opportunity_id, convert_as } = req.body as {
    opportunity_id?: number;
    convert_as?: 'task' | 'note';
  };

  if (!opportunity_id) { res.status(400).json(err('opportunity_id required')); return; }

  const item = await queryOne(
    `SELECT * FROM inbox_items WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
    [id, userId]
  );
  if (!item) { res.status(404).json(err('not found')); return; }

  const asType = convert_as ?? (item.type === 'todo' ? 'task' : 'note');

  if (asType === 'task') {
    await queryOne(
      `INSERT INTO tasks (opportunity_id, title, assigned_to_id, created_by_id)
       VALUES ($1, $2, $3, $3)`,
      [opportunity_id, item.text, userId]
    );
  } else {
    await queryOne(
      `INSERT INTO notes (opportunity_id, author_id, content) VALUES ($1, $2, $3)`,
      [opportunity_id, userId, item.text]
    );
  }

  // Mark converted and remove from inbox
  await queryOne(
    `UPDATE inbox_items SET status = 'converted', is_deleted = true, updated_at = now() WHERE id = $1`,
    [id]
  );

  res.json(ok({ converted_as: asType }));
});

export default router;
