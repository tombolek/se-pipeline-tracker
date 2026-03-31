import { Router, Request, Response } from 'express';
import { queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;

// POST /inbox
router.post('/', auth, async (req: Request, res: Response): Promise<void> => {
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

export default router;
