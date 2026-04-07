import { Router, Request, Response } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { parseImportFile, reconcileImport, previewImport } from '../services/importService.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';

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
    logAudit(req, {
      action: 'IMPORT', resourceType: 'import',
      resourceName: req.file.originalname,
      after: stats,
    });
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
       o.id, o.sf_opportunity_id, o.name, o.account_name, o.account_segment, o.account_industry,
       o.stage, o.record_type, o.key_deal, o.arr, o.arr_currency, o.arr_converted,
       o.close_date, o.close_month, o.fiscal_period, o.fiscal_year,
       o.team, o.deploy_mode, o.deploy_location, o.sales_plays,
       o.lead_source, o.opportunity_source, o.channel_source, o.biz_dev,
       o.ae_owner_name, o.se_owner_id,
       o.se_comments, o.se_comments_updated_at,
       o.manager_comments, o.next_step_sf, o.psm_comments, o.technical_blockers,
       o.engaged_competitors,
       o.budget, o.authority, o.need, o.timeline, o.metrics, o.economic_buyer,
       o.decision_criteria, o.decision_process, o.paper_process, o.implicate_pain,
       o.champion, o.agentic_qual,
       o.poc_status, o.poc_start_date, o.poc_end_date, o.poc_type, o.poc_deploy_type,
       o.rfx_status,
       o.sourcing_partner, o.sourcing_partner_tier, o.influencing_partner, o.partner_manager,
       o.closed_at, o.closed_lost_seen, o.stage_changed_at, o.last_note_at,
       u.id AS se_owner_id, u.name AS se_owner_name, u.email AS se_owner_email
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
    account_industry: r.account_industry,
    stage: r.stage,
    record_type: r.record_type,
    key_deal: r.key_deal,
    arr: r.arr,
    arr_currency: r.arr_currency,
    arr_converted: r.arr_converted,
    close_date: r.close_date,
    close_month: r.close_month,
    fiscal_period: r.fiscal_period,
    fiscal_year: r.fiscal_year,
    team: r.team,
    deploy_mode: r.deploy_mode,
    deploy_location: r.deploy_location,
    sales_plays: r.sales_plays,
    lead_source: r.lead_source,
    opportunity_source: r.opportunity_source,
    channel_source: r.channel_source,
    biz_dev: r.biz_dev,
    ae_owner_name: r.ae_owner_name,
    se_owner: r.se_owner_id ? { id: r.se_owner_id, name: r.se_owner_name, email: r.se_owner_email } : null,
    se_comments: r.se_comments,
    se_comments_updated_at: r.se_comments_updated_at,
    manager_comments: r.manager_comments,
    next_step_sf: r.next_step_sf,
    psm_comments: r.psm_comments,
    technical_blockers: r.technical_blockers,
    engaged_competitors: r.engaged_competitors,
    budget: r.budget,
    authority: r.authority,
    need: r.need,
    timeline: r.timeline,
    metrics: r.metrics,
    economic_buyer: r.economic_buyer,
    decision_criteria: r.decision_criteria,
    decision_process: r.decision_process,
    paper_process: r.paper_process,
    implicate_pain: r.implicate_pain,
    champion: r.champion,
    agentic_qual: r.agentic_qual,
    poc_status: r.poc_status,
    poc_start_date: r.poc_start_date,
    poc_end_date: r.poc_end_date,
    poc_type: r.poc_type,
    poc_deploy_type: r.poc_deploy_type,
    rfx_status: r.rfx_status,
    sourcing_partner: r.sourcing_partner,
    sourcing_partner_tier: r.sourcing_partner_tier,
    influencing_partner: r.influencing_partner,
    partner_manager: r.partner_manager,
    open_task_count: 0,
    next_step_count: 0,
    is_closed_lost: true,
    closed_at: r.closed_at,
    closed_lost_seen: r.closed_lost_seen,
    stage_changed_at: r.stage_changed_at,
    last_note_at: r.last_note_at,
    previous_stage: null,
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

// GET /opportunities/teams — distinct non-null team values (for manager territory assignment)
router.get('/teams', auth, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<{ team: string }>(
    `SELECT DISTINCT team FROM opportunities WHERE team IS NOT NULL AND team != '' ORDER BY team ASC`
  );
  res.json(ok(rows.map(r => r.team)));
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
  logAudit(req, {
    action: 'CREATE_TASK', resourceType: 'task',
    resourceId: (task as Record<string, unknown>).id as number,
    resourceName: title.trim(),
    after: { opportunity_id: oppId, title: title.trim(), status: status ?? 'open' },
  });
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
       o.id, o.sf_opportunity_id, o.name, o.account_name, o.account_segment, o.account_industry,
       o.stage, o.record_type, o.key_deal, o.arr, o.arr_currency, o.arr_converted,
       o.close_date, o.close_month, o.fiscal_period, o.fiscal_year,
       o.team, o.deploy_mode, o.deploy_location, o.sales_plays,
       o.lead_source, o.opportunity_source, o.channel_source, o.biz_dev,
       o.ae_owner_name, o.se_owner_id,
       o.se_comments, o.se_comments_updated_at,
       o.manager_comments, o.next_step_sf, o.psm_comments, o.technical_blockers,
       o.engaged_competitors,
       o.budget, o.authority, o.need, o.timeline, o.metrics, o.economic_buyer,
       o.decision_criteria, o.decision_process, o.paper_process, o.implicate_pain,
       o.champion, o.agentic_qual,
       o.poc_status, o.poc_start_date, o.poc_end_date, o.poc_type, o.poc_deploy_type,
       o.rfx_status,
       o.sourcing_partner, o.sourcing_partner_tier, o.influencing_partner, o.partner_manager,
       o.stage_changed_at, o.last_note_at,
       u.name  AS se_owner_name,
       u.email AS se_owner_email,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.status != 'done') AS open_task_count,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.is_next_step = true AND t.status != 'done') AS next_step_count,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.status != 'done' AND t.due_date < CURRENT_DATE) AS overdue_task_count
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
    account_industry: r.account_industry,
    stage: r.stage,
    record_type: r.record_type,
    key_deal: r.key_deal,
    arr: r.arr,
    arr_currency: r.arr_currency,
    arr_converted: r.arr_converted,
    close_date: r.close_date,
    close_month: r.close_month,
    fiscal_period: r.fiscal_period,
    fiscal_year: r.fiscal_year,
    team: r.team,
    deploy_mode: r.deploy_mode,
    deploy_location: r.deploy_location,
    sales_plays: r.sales_plays,
    lead_source: r.lead_source,
    opportunity_source: r.opportunity_source,
    channel_source: r.channel_source,
    biz_dev: r.biz_dev,
    ae_owner_name: r.ae_owner_name,
    se_owner: r.se_owner_id ? { id: r.se_owner_id, name: r.se_owner_name, email: r.se_owner_email } : null,
    se_comments: r.se_comments,
    se_comments_updated_at: r.se_comments_updated_at,
    manager_comments: r.manager_comments,
    next_step_sf: r.next_step_sf,
    psm_comments: r.psm_comments,
    technical_blockers: r.technical_blockers,
    engaged_competitors: r.engaged_competitors,
    budget: r.budget,
    authority: r.authority,
    need: r.need,
    timeline: r.timeline,
    metrics: r.metrics,
    economic_buyer: r.economic_buyer,
    decision_criteria: r.decision_criteria,
    decision_process: r.decision_process,
    paper_process: r.paper_process,
    implicate_pain: r.implicate_pain,
    champion: r.champion,
    agentic_qual: r.agentic_qual,
    poc_status: r.poc_status,
    poc_start_date: r.poc_start_date,
    poc_end_date: r.poc_end_date,
    poc_type: r.poc_type,
    poc_deploy_type: r.poc_deploy_type,
    rfx_status: r.rfx_status,
    sourcing_partner: r.sourcing_partner,
    sourcing_partner_tier: r.sourcing_partner_tier,
    influencing_partner: r.influencing_partner,
    partner_manager: r.partner_manager,
    open_task_count: Number(r.open_task_count),
    next_step_count: Number(r.next_step_count),
    overdue_task_count: Number(r.overdue_task_count),
    stage_changed_at: r.stage_changed_at,
    last_note_at: r.last_note_at,
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

// PATCH /opportunities/:id  (se_owner_id)
// Manager: can assign anyone with role=se
// SE: can assign themselves if they don't own the opp;
//     can assign any SE (or unassign) if they currently own it
router.patch('/:id', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const user = (req as AuthenticatedRequest).user!;
  const { se_owner_id } = req.body as { se_owner_id?: number | null };

  // Validate target user is an active SE (when assigning)
  if (se_owner_id != null) {
    const seUser = await queryOne<{ role: string }>(
      `SELECT role FROM users WHERE id = $1 AND is_active = true`,
      [se_owner_id]
    );
    if (!seUser) { res.status(400).json(err('User not found')); return; }
  }

  // SE-specific permission check
  if (user.role === 'se') {
    const opp = await queryOne<{ se_owner_id: number | null }>(
      `SELECT se_owner_id FROM opportunities WHERE id = $1 AND is_active = true`,
      [id]
    );
    if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

    const currentlyOwns = opp.se_owner_id === user.userId;
    if (!currentlyOwns && se_owner_id !== user.userId) {
      res.status(403).json(err('You can only assign yourself to this opportunity'));
      return;
    }
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
  logAudit(req, {
    action: 'ASSIGN_SE', resourceType: 'opportunity',
    resourceId: id, resourceName: updated.name as string,
    after: { se_owner_id: se_owner_id ?? null, se_owner_name: se_owner?.name ?? null },
  });
});

// GET /opportunities/:id/timeline
// Returns a reverse-chronological flat list of all events on this opportunity.
router.get('/:id/timeline', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  // Fetch the opp itself for stage-change event and first-seen event
  const opp = await queryOne<{
    stage: string; previous_stage: string | null; stage_changed_at: string | null;
    first_seen_at: string | null;
  }>(
    `SELECT stage, previous_stage, stage_changed_at, first_seen_at FROM opportunities WHERE id = $1`,
    [id]
  );
  if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

  const [notes, tasks, fieldHistory, ownerHistory] = await Promise.all([
    query<{ id: number; content: string; author_name: string; created_at: string }>(
      `SELECT id, content, author_name, created_at FROM notes WHERE opportunity_id = $1 ORDER BY created_at DESC`,
      [id]
    ),
    query<{ id: number; title: string; status: string; is_next_step: boolean; assigned_to_name: string | null; created_at: string; updated_at: string }>(
      `SELECT t.id, t.title, t.status, t.is_next_step, u.name AS assigned_to_name, t.created_at, t.updated_at
       FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to_id
       WHERE t.opportunity_id = $1 AND t.is_deleted = false
       ORDER BY t.created_at DESC`,
      [id]
    ),
    query<{ id: number; field_name: string; old_value: string | null; new_value: string | null; changed_at: string; import_id: number | null }>(
      `SELECT id, field_name, old_value, new_value, changed_at, import_id
       FROM opportunity_field_history WHERE opportunity_id = $1 ORDER BY changed_at DESC`,
      [id]
    ),
    query<{ timestamp: string; after_value: unknown }>(
      `SELECT timestamp, after_value FROM audit_log
       WHERE action = 'ASSIGN_SE' AND resource_type = 'opportunity' AND resource_id = $1
       ORDER BY timestamp DESC`,
      [String(id)]
    ),
  ]);

  type TimelineEvent = {
    id: string;
    type: 'note' | 'task_created' | 'task_completed' | 'stage_change' | 'import_update' | 'owner_change' | 'first_seen';
    timestamp: string;
    payload: Record<string, unknown>;
  };

  const events: TimelineEvent[] = [];

  // Notes
  for (const n of notes) {
    events.push({ id: `note-${n.id}`, type: 'note', timestamp: n.created_at,
      payload: { content: n.content, author: n.author_name } });
  }

  // Tasks — created event + completed event (if done)
  for (const t of tasks) {
    events.push({ id: `task-${t.id}-created`, type: 'task_created', timestamp: t.created_at,
      payload: { task_id: t.id, title: t.title, status: t.status, is_next_step: t.is_next_step, assigned_to: t.assigned_to_name } });
    if (t.status === 'done' && t.updated_at !== t.created_at) {
      events.push({ id: `task-${t.id}-completed`, type: 'task_completed', timestamp: t.updated_at,
        payload: { task_id: t.id, title: t.title, assigned_to: t.assigned_to_name } });
    }
  }

  // Stage change (single most-recent entry from opp record)
  if (opp.stage_changed_at) {
    events.push({ id: 'stage-change', type: 'stage_change', timestamp: opp.stage_changed_at,
      payload: { from: opp.previous_stage, to: opp.stage } });
  }

  // Field history — group fields changed in the same import together
  const importGroups = new Map<string, typeof fieldHistory>();
  for (const h of fieldHistory) {
    const key = h.import_id != null ? `import-${h.import_id}` : `field-${h.id}`;
    if (!importGroups.has(key)) importGroups.set(key, []);
    importGroups.get(key)!.push(h);
  }
  for (const [key, entries] of importGroups) {
    const ts = entries[0].changed_at;
    events.push({ id: key, type: 'import_update', timestamp: ts,
      payload: { fields: entries.map(e => ({ field: e.field_name, old_value: e.old_value, new_value: e.new_value })) } });
  }

  // SE Owner changes from audit log
  for (const a of ownerHistory) {
    const after = a.after_value as { se_owner_name?: string | null } | null;
    events.push({ id: `owner-${a.timestamp}`, type: 'owner_change', timestamp: a.timestamp,
      payload: { se_owner_name: after?.se_owner_name ?? null } });
  }

  // First seen (opp creation)
  if (opp.first_seen_at) {
    events.push({ id: 'first-seen', type: 'first_seen', timestamp: opp.first_seen_at,
      payload: { stage: opp.previous_stage ?? opp.stage } });
  }

  // Sort reverse-chronological
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json(ok(events, { opportunity_id: id, count: events.length }));
});

export default router;
