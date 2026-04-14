import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireWriteAccess } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';

const router = Router({ mergeParams: true });
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const write = requireWriteAccess as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /opportunities/:id/notes
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const oppId = parseInt(req.params.id);
  if (isNaN(oppId)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const notes = await query(
    `SELECT n.*, u.name AS author_name
     FROM notes n
     JOIN users u ON u.id = n.author_id
     WHERE n.opportunity_id = $1
     ORDER BY n.created_at ASC`,
    [oppId]
  );

  res.json(ok(notes));
});

// POST /opportunities/:id/notes  (append-only)
router.post('/', auth, write, async (req: Request, res: Response): Promise<void> => {
  const { userId, role } = (req as AuthenticatedRequest).user;
  const oppId = parseInt(req.params.id);
  if (isNaN(oppId)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json(err('content is required')); return; }

  const opp = await queryOne('SELECT id FROM opportunities WHERE id = $1', [oppId]);
  if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

  const note = await queryOne(
    `INSERT INTO notes (opportunity_id, author_id, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [oppId, userId, content.trim()]
  );

  // Update last_note_at on the opportunity
  await queryOne(
    `UPDATE opportunities SET last_note_at = now(), updated_at = now() WHERE id = $1`,
    [oppId]
  );

  // Return with author name
  const full = await queryOne(
    `SELECT n.*, u.name AS author_name
     FROM notes n JOIN users u ON u.id = n.author_id
     WHERE n.id = $1`,
    [(note as Record<string, unknown>).id]
  );

  logAudit(req, {
    userId, userRole: role,
    action: 'CREATE_NOTE', resourceType: 'note',
    resourceId: (note as Record<string, number>).id,
    resourceName: `Opportunity #${oppId}`,
    after: { content: content.trim() },
    success: true,
  });

  res.status(201).json(ok(full));
});

export default router;
