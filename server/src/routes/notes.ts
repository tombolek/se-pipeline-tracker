import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireWriteAccess } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';
import { parseMentions } from '../services/mentions.js';

const router = Router({ mergeParams: true });
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const write = requireWriteAccess as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /opportunities/:id/notes
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const oppId = parseInt(req.params.id);
  if (isNaN(oppId)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const notes = await query(
    `SELECT n.*, u.name AS author_name,
            COALESCE(
              (SELECT json_agg(json_build_object('id', mu.id, 'name', mu.name, 'email', mu.email))
               FROM note_mentions nm JOIN users mu ON mu.id = nm.mentioned_user_id
               WHERE nm.note_id = n.id), '[]'::json
            ) AS mentions
     FROM notes n
     JOIN users u ON u.id = n.author_id
     WHERE n.opportunity_id = $1
       AND n.is_deleted = false
     ORDER BY n.created_at ASC`,
    [oppId]
  );

  res.json(ok(notes));
});

// DELETE /opportunities/:id/notes/:noteId — soft delete.
// Permission: note author OR manager. Authored the audit log.
router.delete('/:noteId', auth, write, async (req: Request, res: Response): Promise<void> => {
  const { userId, role } = (req as AuthenticatedRequest).user;
  const oppId = parseInt(req.params.id);
  const noteId = parseInt(req.params.noteId);
  if (isNaN(oppId) || isNaN(noteId)) { res.status(400).json(err('Invalid id')); return; }

  const note = await queryOne<{ id: number; author_id: number; content: string; is_deleted: boolean; opportunity_id: number }>(
    `SELECT id, author_id, content, is_deleted, opportunity_id FROM notes WHERE id = $1`,
    [noteId]
  );
  if (!note || note.opportunity_id !== oppId) { res.status(404).json(err('Note not found')); return; }
  if (note.is_deleted) { res.status(410).json(err('Note was already deleted')); return; }

  const canDelete = role === 'manager' || note.author_id === userId;
  if (!canDelete) {
    logAudit(req, {
      userId, userRole: role,
      action: 'DELETE_NOTE_DENIED', resourceType: 'note',
      resourceId: noteId,
      resourceName: `Opportunity #${oppId}`,
      before: { author_id: note.author_id },
      success: false,
      failureReason: 'Not author and not manager',
    });
    res.status(403).json(err('You can only delete your own notes. Managers can delete any note.'));
    return;
  }

  await query(
    `UPDATE notes SET is_deleted = true, deleted_at = now(), deleted_by_id = $1 WHERE id = $2`,
    [userId, noteId]
  );

  logAudit(req, {
    userId, userRole: role,
    action: 'DELETE_NOTE', resourceType: 'note',
    resourceId: noteId,
    resourceName: `Opportunity #${oppId}`,
    before: {
      author_id: note.author_id,
      content_preview: note.content.slice(0, 200),
      content_length: note.content.length,
    },
    success: true,
  });

  res.json(ok({ id: noteId, deleted: true }));
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

  const trimmed = content.trim();

  const note = await queryOne(
    `INSERT INTO notes (opportunity_id, author_id, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [oppId, userId, trimmed]
  );

  // ── @mentions (Issue #113) ────────────────────────────────────────────────
  // Parse handles out of the content, resolve to active user ids, and insert
  // one row per unique mention. Self-mentions are dropped (mentioning your
  // own note isn't a useful notification). Failure here is non-fatal — the
  // note is already saved.
  const noteId = (note as Record<string, number>).id;
  const mentionedIds = await parseMentions(trimmed, userId);
  if (mentionedIds.length > 0) {
    try {
      await query(
        `INSERT INTO note_mentions (note_id, mentioned_user_id)
         SELECT $1, uid FROM unnest($2::int[]) AS t(uid)
         ON CONFLICT (note_id, mentioned_user_id) DO NOTHING`,
        [noteId, mentionedIds],
      );
    } catch (e) {
      console.error('[notes] mention insert failed:', e);
    }
  }

  // Update last_note_at on the opportunity
  await queryOne(
    `UPDATE opportunities SET last_note_at = now(), updated_at = now() WHERE id = $1`,
    [oppId]
  );

  // Return with author name + mentions
  const full = await queryOne(
    `SELECT n.*, u.name AS author_name,
            COALESCE(
              (SELECT json_agg(json_build_object('id', mu.id, 'name', mu.name, 'email', mu.email))
               FROM note_mentions nm JOIN users mu ON mu.id = nm.mentioned_user_id
               WHERE nm.note_id = n.id), '[]'::json
            ) AS mentions
     FROM notes n JOIN users u ON u.id = n.author_id
     WHERE n.id = $1`,
    [noteId]
  );

  logAudit(req, {
    userId, userRole: role,
    action: 'CREATE_NOTE', resourceType: 'note',
    resourceId: noteId,
    resourceName: `Opportunity #${oppId}`,
    after: { content: trimmed, mentions: mentionedIds.length },
    success: true,
  });

  res.status(201).json(ok(full));
});

export default router;
