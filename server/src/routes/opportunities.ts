import { Router, Request, Response } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { parseImportFile, reconcileImport, previewImport } from '../services/importService.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Middleware adapters for TypeScript
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const mgr  = requireManager as unknown as (req: Request, res: Response, next: () => void) => void;

// ── IMPORTANT: static routes MUST come before /:id ─────────────────────────

// POST /opportunities/import  (Manager only)
router.post('/import', auth, mgr, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json(err('No file uploaded. Send a multipart/form-data request with field name "file".'));
    return;
  }

  try {
    const rows = parseImportFile(req.file.buffer);
    if (rows.length === 0) {
      res.status(400).json(err('File parsed successfully but contained no valid data rows.'));
      return;
    }
    const stats = await reconcileImport(rows, req.file.originalname);
    res.json(ok(stats, { filename: req.file.originalname }));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Import failed';
    res.status(422).json(err(message));
  }
});

// POST /opportunities/import/preview  (Manager only — dry run, no DB writes)
router.post('/import/preview', auth, mgr, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json(err('No file uploaded.'));
    return;
  }
  try {
    const rows = parseImportFile(req.file.buffer);
    if (rows.length === 0) {
      res.status(400).json(err('File parsed successfully but contained no valid data rows.'));
      return;
    }
    const stats = await previewImport(rows);
    res.json(ok(stats));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Preview failed';
    res.status(422).json(err(message));
  }
});

// GET /opportunities/import/history  (Manager only)
router.get('/import/history', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT id, imported_at, filename, row_count, opportunities_added, opportunities_updated,
            opportunities_closed_lost, status, error_log,
            (rollback_data IS NOT NULL) AS has_rollback
     FROM imports ORDER BY imported_at DESC LIMIT 50`
  );
  res.json(ok(rows));
});

// DELETE /opportunities/import/:id  (Manager only — rollback)
router.delete('/import/:id', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const importId = parseInt(req.params.id);
  if (isNaN(importId)) { res.status(400).json(err('Invalid import id')); return; }

  // Only the most recent import can be rolled back
  const latest = await queryOne<{ id: number }>(`SELECT id FROM imports ORDER BY imported_at DESC LIMIT 1`);
  if (!latest || latest.id !== importId) {
    res.status(400).json(err('Only the most recent import can be rolled back'));
    return;
  }

  interface RollbackData { opps: Record<string, unknown>[]; added_ids: number[]; }
  const importRow = await queryOne<{ rollback_data: RollbackData | null }>(
    `SELECT rollback_data FROM imports WHERE id = $1`, [importId]
  );
  if (!importRow) { res.status(404).json(err('Import not found')); return; }
  if (!importRow.rollback_data) {
    res.status(400).json(err('No rollback data for this import'));
    return;
  }

  const { opps, added_ids } = importRow.rollback_data;

  // Restore each snapshotted opportunity to its pre-import state
  for (const snap of opps) {
    const { id, created_at, ...fields } = snap;
    void created_at;
    const fieldKeys = Object.keys(fields);
    const params: unknown[] = [];
    const setClauses = fieldKeys.map(key => {
      params.push(fields[key]);
      return `${key} = $${params.length}`;
    });
    params.push(id);
    await query(
      `UPDATE opportunities SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
      params
    );
  }

  // Soft-delete opportunities that were newly added by this import
  if (added_ids.length > 0) {
    await query(
      `UPDATE opportunities SET is_active = false, updated_at = now() WHERE id = ANY($1::int[])`,
      [added_ids]
    );
  }

  // Remove the import log entry
  await query(`DELETE FROM imports WHERE id = $1`, [importId]);

  res.json(ok({ rolled_back: importId, restored: opps.length, removed: added_ids.length }));
});

// GET /opportunities/closed-lost
router.get('/closed-lost', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;

  const rows = await query(
    `SELECT
       o.id, o.sf_opportunity_id, o.name, o.account_name, o.account_segment,
       o.stage, o.arr, o.arr_currency, o.close_date, o.closed_at, o.closed_lost_seen,
       o.ae_owner_name, o.team, o.record_type,
       u.id AS se_owner_id, u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.is_closed_lost = true
     ORDER BY o.closed_at DESC NULLS LAST`
  );

  const unreadCount = rows.filter(r => !(r as Record<string, unknown>).closed_lost_seen).length;

  const data = rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    sf_opportunity_id: r.sf_opportunity_id,
    name: r.name,
    account_name: r.account_name,
    account_segment: r.account_segment,
    stage: r.stage,
    arr: r.arr,
    arr_currency: r.arr_currency,
    close_date: r.close_date,
    closed_at: r.closed_at,
    closed_lost_seen: r.closed_lost_seen,
    ae_owner_name: r.ae_owner_name,
    team: r.team,
    record_type: r.record_type,
    se_owner: r.se_owner_id ? { id: r.se_owner_id, name: r.se_owner_name } : null,
  }));

  void user; // available for future per-user filtering
  res.json(ok(data, { unread_count: unreadCount }));
});

// POST /opportunities/closed-lost/mark-read
router.post('/closed-lost/mark-read', auth, async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body as { ids?: number[] };

  if (!Array.isArray(ids) || ids.length === 0) {
    // Mark all as read
    await query(`UPDATE opportunities SET closed_lost_seen = true WHERE is_closed_lost = true AND closed_lost_seen = false`);
  } else {
    await query(
      `UPDATE opportunities SET closed_lost_seen = true WHERE id = ANY($1::int[]) AND is_closed_lost = true`,
      [ids]
    );
  }

  res.json(ok({ marked: ids?.length ?? 'all' }));
});

// POST /opportunities/:id/tasks
router.post('/:id/tasks', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const oppId = parseInt(req.params.id);
  if (isNaN(oppId)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const { title, description, status, is_next_step, due_date, assigned_to_id } = req.body as {
    title?: string; description?: string; status?: string;
    is_next_step?: boolean; due_date?: string; assigned_to_id?: number;
  };
  if (!title?.trim()) { res.status(400).json(err('title is required')); return; }

  const opp = await queryOne('SELECT id FROM opportunities WHERE id = $1', [oppId]);
  if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

  const task = await queryOne(
    `INSERT INTO tasks
       (opportunity_id, title, description, status, is_next_step, due_date, assigned_to_id, created_by_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [oppId, title.trim(), description?.trim() ?? null, status ?? 'open',
     is_next_step ?? false, due_date ?? null, assigned_to_id ?? userId, userId]
  );
  res.status(201).json(ok(task));
});

// POST /opportunities/:id/summary  — AI deal summary
router.post('/:id/summary', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const opp = await queryOne<Record<string, unknown>>(
    `SELECT o.*, u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.id = $1`,
    [id]
  );
  if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

  const tasks = await query(
    `SELECT t.title, t.status, t.due_date, t.is_next_step
     FROM tasks t WHERE t.opportunity_id = $1 AND t.is_deleted = false AND t.status != 'done'
     ORDER BY t.is_next_step DESC, t.due_date ASC NULLS LAST`,
    [id]
  );

  const notes = await query(
    `SELECT n.content, u.name AS author_name, n.created_at
     FROM notes n JOIN users u ON u.id = n.author_id
     WHERE n.opportunity_id = $1 ORDER BY n.created_at DESC LIMIT 10`,
    [id]
  );

  const formatDate = (d: unknown) => d ? new Date(d as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  const formatARR = (a: unknown) => a ? `$${(Number(a) / 1000).toFixed(0)}K` : 'N/A';

  const taskLines = tasks.length
    ? tasks.map((t: Record<string, unknown>) =>
        `- [${t.is_next_step ? 'NEXT STEP' : t.status}] ${t.title}${t.due_date ? ` (due ${formatDate(t.due_date)})` : ''}`
      ).join('\n')
    : 'No open tasks.';

  const noteLines = notes.length
    ? [...notes].reverse().map((n: Record<string, unknown>) =>
        `[${formatDate(n.created_at)} — ${n.author_name}]: ${n.content}`
      ).join('\n')
    : 'No notes yet.';

  const prompt = `You are an SE deal intelligence assistant. Provide a concise 3-5 sentence deal summary covering: current status and momentum, key risks or blockers, and the recommended next action.

Opportunity: ${opp.name}
Account: ${opp.account_name ?? 'N/A'}
Stage: ${opp.stage}
ARR: ${formatARR(opp.arr)}
Close Date: ${formatDate(opp.close_date)}
AE Owner: ${opp.ae_owner_name ?? 'N/A'}
SE Owner: ${opp.se_owner_name ?? 'Unassigned'}

Next Step (from SF): ${opp.next_step_sf ?? 'N/A'}

SE Comments: ${opp.se_comments ?? 'None'}

Manager Comments: ${opp.manager_comments ?? 'None'}

Open Tasks:
${taskLines}

Recent Notes (oldest to newest):
${noteLines}

Write a concise 3-5 sentence deal summary.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const summaryBlock = response.content.find(b => b.type === 'text');
  const summary = summaryBlock && summaryBlock.type === 'text' ? summaryBlock.text : '';
  res.json(ok({ summary }));
});

// GET /opportunities  (list)
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  const { stage, se_owner, search, sort, include_qualify } = req.query as Record<string, string>;

  let showQualify = false;
  if (include_qualify === 'true') {
    showQualify = true;
  } else if (include_qualify !== 'false') {
    const userRow = await queryOne<{ show_qualify: boolean }>(
      'SELECT show_qualify FROM users WHERE id = $1',
      [user.userId]
    );
    showQualify = userRow?.show_qualify ?? false;
  }

  const conditions: string[] = ['o.is_active = true', 'o.is_closed_lost = false'];
  const params: unknown[] = [];

  if (!showQualify) conditions.push(`o.stage != 'Qualify'`);

  if (stage) {
    params.push(stage);
    conditions.push(`o.stage = $${params.length}`);
  }
  if (se_owner) {
    params.push(parseInt(se_owner));
    conditions.push(`o.se_owner_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(o.name ILIKE $${params.length} OR o.account_name ILIKE $${params.length})`);
  }

  const orderMap: Record<string, string> = {
    close_date:      'o.close_date ASC',
    arr:             'o.arr DESC',
    stage:           'o.stage ASC',
    se_comments_age: 'o.se_comments_updated_at ASC NULLS FIRST',
  };
  const orderBy = orderMap[sort] ?? 'o.close_date ASC';
  const whereClause = conditions.map(c => `(${c})`).join(' AND ');

  const rows = await query(
    `SELECT
       o.id, o.sf_opportunity_id, o.name, o.account_name, o.account_segment,
       o.stage, o.record_type, o.arr, o.arr_currency, o.close_date, o.close_month,
       o.fiscal_year, o.team, o.deploy_mode, o.key_deal,
       o.ae_owner_name, o.se_owner_id,
       o.se_comments_updated_at, o.stage_changed_at, o.last_note_at,
       o.poc_status, o.engaged_competitors,
       u.name  AS se_owner_name,
       u.email AS se_owner_email,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.status != 'done') AS open_task_count,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.is_next_step = true AND t.status != 'done') AS next_step_count
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     LEFT JOIN tasks t ON t.opportunity_id = o.id
     WHERE ${whereClause}
     GROUP BY o.id, u.id
     ORDER BY ${orderBy}`,
    params
  );

  const data = rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    sf_opportunity_id: r.sf_opportunity_id,
    name: r.name,
    account_name: r.account_name,
    account_segment: r.account_segment,
    stage: r.stage,
    record_type: r.record_type,
    arr: r.arr,
    arr_currency: r.arr_currency,
    close_date: r.close_date,
    close_month: r.close_month,
    fiscal_year: r.fiscal_year,
    team: r.team,
    deploy_mode: r.deploy_mode,
    key_deal: r.key_deal,
    ae_owner_name: r.ae_owner_name,
    se_owner: r.se_owner_id ? { id: r.se_owner_id, name: r.se_owner_name, email: r.se_owner_email } : null,
    open_task_count: Number(r.open_task_count),
    next_step_count: Number(r.next_step_count),
    se_comments_updated_at: r.se_comments_updated_at,
    stage_changed_at: r.stage_changed_at,
    last_note_at: r.last_note_at,
    poc_status: r.poc_status,
    engaged_competitors: r.engaged_competitors,
  }));

  res.json(ok(data, { total: data.length }));
});

// GET /opportunities/:id/field-history?field=se_comments|next_step_sf
router.get('/:id/field-history', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const { field } = req.query as { field?: string };
  const allowed = ['se_comments', 'next_step_sf'];
  if (!field || !allowed.includes(field)) {
    res.status(400).json(err('field must be se_comments or next_step_sf'));
    return;
  }

  const rows = await query(
    `SELECT id, field_name, old_value, new_value, changed_at
     FROM opportunity_field_history
     WHERE opportunity_id = $1 AND field_name = $2
     ORDER BY changed_at DESC
     LIMIT 30`,
    [id, field]
  );
  res.json(ok(rows));
});

// GET /opportunities/:id
router.get('/:id', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const opp = await queryOne<Record<string, unknown>>(
    `SELECT o.*, u.name AS se_owner_name, u.email AS se_owner_email
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.id = $1`,
    [id]
  );
  if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

  const tasks = await query(
    `SELECT t.*, u.name AS assigned_to_name
     FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to_id
     WHERE t.opportunity_id = $1 AND t.is_deleted = false
     ORDER BY t.is_next_step DESC, t.due_date ASC NULLS LAST, t.created_at ASC`,
    [id]
  );

  const notes = await query(
    `SELECT n.*, u.name AS author_name
     FROM notes n JOIN users u ON u.id = n.author_id
     WHERE n.opportunity_id = $1 ORDER BY n.created_at ASC`,
    [id]
  );

  const { se_owner_id, se_owner_name, se_owner_email, ...oppFields } = opp;
  res.json(ok({
    ...oppFields,
    se_owner: se_owner_id ? { id: se_owner_id, name: se_owner_name, email: se_owner_email } : null,
    tasks,
    notes,
  }));
});

// PATCH /opportunities/:id  (Manager only — se_owner_id)
router.patch('/:id', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const { se_owner_id } = req.body as { se_owner_id?: number | null };

  if (se_owner_id != null) {
    const seUser = await queryOne<{ role: string }>(
      `SELECT role FROM users WHERE id = $1 AND is_active = true`,
      [se_owner_id]
    );
    if (!seUser) { res.status(400).json(err('User not found')); return; }
    if (seUser.role !== 'se') { res.status(400).json(err('Can only assign SE role users')); return; }
  }

  const updated = await queryOne<Record<string, unknown>>(
    `UPDATE opportunities SET se_owner_id = $1, updated_at = now()
     WHERE id = $2 RETURNING id, name, se_owner_id`,
    [se_owner_id ?? null, id]
  );
  if (!updated) { res.status(404).json(err('Opportunity not found')); return; }

  const se_owner = updated.se_owner_id
    ? await queryOne<{ id: number; name: string; email: string }>(
        'SELECT id, name, email FROM users WHERE id = $1', [updated.se_owner_id])
    : null;

  res.json(ok({ ...updated, se_owner }));
});

export default router;
