/**
 * Mentions feed (Issue #113).
 *
 *   GET  /api/v1/mentions                 — current user's mentions, newest first
 *   POST /api/v1/mentions/mark-read       — mark ids (or all) as seen
 *
 * Each row surfaces the note + opportunity + author context the Home page
 * needs to render a compact "you were mentioned" entry that links back to
 * the opportunity drawer.
 */
import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /mentions — newest first, includes unseen count in meta
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

  const rows = await query(
    `SELECT nm.id                AS mention_id,
            nm.note_id,
            nm.created_at,
            nm.seen_at,
            n.content,
            n.author_id,
            au.name              AS author_name,
            o.id                 AS opportunity_id,
            o.sf_opportunity_id,
            o.name               AS opportunity_name,
            o.account_name,
            o.stage
     FROM note_mentions nm
     JOIN notes n ON n.id = nm.note_id
     JOIN users au ON au.id = n.author_id
     JOIN opportunities o ON o.id = n.opportunity_id
     WHERE nm.mentioned_user_id = $1
     ORDER BY nm.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  const unreadRows = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM note_mentions
     WHERE mentioned_user_id = $1 AND seen_at IS NULL`,
    [userId],
  );
  const unread = Number(unreadRows[0]?.n ?? '0');

  res.json(ok(rows, { unread }));
});

// POST /mentions/mark-read  { ids?: number[] }
// If ids is omitted or empty, marks ALL unread mentions for the user as read.
router.post('/mark-read', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { ids } = req.body as { ids?: unknown };

  if (Array.isArray(ids) && ids.length > 0) {
    const cleanIds = ids
      .map(x => typeof x === 'number' ? x : parseInt(String(x), 10))
      .filter(n => Number.isFinite(n));
    if (cleanIds.length === 0) { res.status(400).json(err('ids must be numbers')); return; }
    await query(
      `UPDATE note_mentions SET seen_at = now()
       WHERE mentioned_user_id = $1 AND id = ANY($2::int[]) AND seen_at IS NULL`,
      [userId, cleanIds],
    );
  } else {
    await query(
      `UPDATE note_mentions SET seen_at = now()
       WHERE mentioned_user_id = $1 AND seen_at IS NULL`,
      [userId],
    );
  }

  res.json(ok({ marked: true }));
});

export default router;
