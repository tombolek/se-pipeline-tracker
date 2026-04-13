import { Router, Request, Response } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { parseImportFile, reconcileImport, previewImport } from '../services/importService.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';
import { runAiJob, startJob, completeJob, failJob } from '../services/aiJobs.js';

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

// ── Favorites ──────────────────────────────────────────────────────────────

// GET /opportunities/favorites — list current user's favorited opportunities
router.get('/favorites', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  const rows = await query(
    `SELECT
       o.id, o.sf_opportunity_id, o.name, o.account_name, o.account_segment, o.account_industry,
       o.stage,
       -- Prefer SF per-stage date for the deal's CURRENT stage
       COALESCE(
         CASE o.stage
           WHEN 'Qualify'                THEN o.stage_date_qualify
           WHEN 'Develop Solution'       THEN o.stage_date_develop_solution
           WHEN 'Build Value'            THEN o.stage_date_build_value
           WHEN 'Proposal Sent'          THEN o.stage_date_proposal_sent
           WHEN 'Submitted for Booking'  THEN o.stage_date_submitted_for_booking
           WHEN 'Negotiate'              THEN o.stage_date_negotiate
           WHEN 'Closed Won'             THEN o.stage_date_closed_won
           WHEN 'Closed Lost'            THEN o.stage_date_closed_lost
         END::timestamptz,
         o.stage_changed_at
       ) AS stage_changed_at,
       o.previous_stage, o.arr, o.arr_currency, o.close_date,
       o.record_type, o.team, o.deploy_mode, o.key_deal, o.fiscal_period,
       o.se_comments, o.se_comments_updated_at, o.next_step_sf, o.technical_blockers,
       o.forecast_status,
       json_build_object('id', u.id, 'name', u.name, 'email', u.email) AS se_owner,
       o.ae_owner_name,
       COALESCE(
         (SELECT COUNT(*) FROM tasks t
          WHERE t.opportunity_id = o.id AND t.is_deleted = false
            AND t.status IN ('open','in_progress','blocked')), 0
       )::integer AS open_task_count,
       COALESCE(
         (SELECT COUNT(*) FROM tasks t
          WHERE t.opportunity_id = o.id AND t.is_deleted = false
            AND t.status IN ('open','in_progress','blocked')
            AND t.due_date < CURRENT_DATE), 0
       )::integer AS overdue_task_count,
       o.last_note_at,
       f.created_at AS favorited_at
     FROM user_favorites f
     JOIN opportunities o ON o.id = f.opportunity_id
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE f.user_id = $1 AND o.is_active = true
     ORDER BY f.created_at DESC`,
    [user.userId]
  );
  res.json(ok(rows));
});

// GET /opportunities/favorites/ids — just the IDs (for star state checks)
router.get('/favorites/ids', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  const rows = await query(
    `SELECT opportunity_id FROM user_favorites WHERE user_id = $1`,
    [user.userId]
  );
  res.json(ok(rows.map((r: Record<string, unknown>) => r.opportunity_id)));
});

// POST /opportunities/:id/favorite — add to favorites
router.post('/:id/favorite', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  const oppId = parseInt(req.params.id);
  if (isNaN(oppId)) { res.status(400).json(err('Invalid opportunity id')); return; }
  await query(
    `INSERT INTO user_favorites (user_id, opportunity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [user.userId, oppId]
  );
  res.json(ok({ favorited: true }));
});

// DELETE /opportunities/:id/favorite — remove from favorites
router.delete('/:id/favorite', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  const oppId = parseInt(req.params.id);
  if (isNaN(oppId)) { res.status(400).json(err('Invalid opportunity id')); return; }
  await query(
    `DELETE FROM user_favorites WHERE user_id = $1 AND opportunity_id = $2`,
    [user.userId, oppId]
  );
  res.json(ok({ favorited: false }));
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
       o.closed_at, o.closed_lost_seen,
       COALESCE(
         CASE o.stage
           WHEN 'Qualify'                THEN o.stage_date_qualify
           WHEN 'Develop Solution'       THEN o.stage_date_develop_solution
           WHEN 'Build Value'            THEN o.stage_date_build_value
           WHEN 'Proposal Sent'          THEN o.stage_date_proposal_sent
           WHEN 'Submitted for Booking'  THEN o.stage_date_submitted_for_booking
           WHEN 'Negotiate'              THEN o.stage_date_negotiate
           WHEN 'Closed Won'             THEN o.stage_date_closed_won
           WHEN 'Closed Lost'            THEN o.stage_date_closed_lost
         END::timestamptz,
         o.stage_changed_at
       ) AS stage_changed_at,
       o.last_note_at,
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

// GET /opportunities/filter-options — distinct values for Pipeline filter dropdowns.
// Scoped to open pipeline (is_active, not closed won/lost) because that's the
// only view that uses these filters.
router.get('/filter-options', auth, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<{ col: string; val: string }>(
    `WITH base AS (
       SELECT fiscal_period, team, record_type, stage
       FROM opportunities
       WHERE is_active = true AND is_closed_lost = false AND COALESCE(is_closed_won, false) = false
     )
     SELECT 'fiscal_period' AS col, fiscal_period AS val FROM base WHERE fiscal_period IS NOT NULL AND fiscal_period != ''
     UNION
     SELECT 'team' AS col, team AS val FROM base WHERE team IS NOT NULL AND team != ''
     UNION
     SELECT 'record_type' AS col, record_type AS val FROM base WHERE record_type IS NOT NULL AND record_type != ''
     UNION
     SELECT 'stage' AS col, stage AS val FROM base WHERE stage IS NOT NULL AND stage != ''`
  );
  const options: Record<string, string[]> = { fiscal_period: [], team: [], record_type: [], stage: [] };
  for (const r of rows) if (options[r.col]) options[r.col].push(r.val);
  for (const k of Object.keys(options)) options[k].sort();
  res.json(ok(options));
});

// GET /opportunities/paginated — server-side filter + sort + pagination for the
// Pipeline view (Issue #102 phase 3). Supports multi-select filters and the
// two computed filters (at_risk, meddpicc_max) evaluated in SQL so pagination
// is consistent across Load More.
router.get('/paginated', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  const q = req.query as Record<string, string | undefined>;

  function csvArr(v: string | undefined): string[] {
    if (!v) return [];
    return v.split(',').map(s => s.trim()).filter(Boolean);
  }
  function parseIntSafe(v: string | undefined): number | null {
    if (v === undefined || v === '') return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  const limit = Math.min(Math.max(parseIntSafe(q.limit) ?? 100, 1), 500);
  const offset = Math.max(parseIntSafe(q.offset) ?? 0, 0);

  // include_qualify: explicit param > user pref.
  let showQualify = false;
  if (q.include_qualify === 'true') showQualify = true;
  else if (q.include_qualify !== 'false') {
    const userRow = await queryOne<{ show_qualify: boolean }>(
      'SELECT show_qualify FROM users WHERE id = $1', [user.userId]
    );
    showQualify = userRow?.show_qualify ?? false;
  }

  const params: unknown[] = [];
  const baseConditions: string[] = ['o.is_active = true'];
  if (q.include_closed !== 'true') {
    baseConditions.push('o.is_closed_lost = false');
    baseConditions.push('COALESCE(o.is_closed_won, false) = false');
  }
  if (!showQualify) baseConditions.push(`o.stage != 'Qualify'`);

  const stages = csvArr(q.stage);
  if (stages.length) {
    params.push(stages);
    baseConditions.push(`o.stage = ANY($${params.length}::text[])`);
  }
  const teams = csvArr(q.team);
  if (teams.length) {
    params.push(teams);
    baseConditions.push(`o.team = ANY($${params.length}::text[])`);
  }
  const recordTypes = csvArr(q.record_type);
  if (recordTypes.length) {
    params.push(recordTypes);
    baseConditions.push(`o.record_type = ANY($${params.length}::text[])`);
  }
  const fiscalPeriods = csvArr(q.fiscal_period);
  if (fiscalPeriods.length) {
    params.push(fiscalPeriods);
    baseConditions.push(`o.fiscal_period = ANY($${params.length}::text[])`);
  }
  const seOwner = parseIntSafe(q.se_owner);
  if (seOwner !== null) {
    params.push(seOwner);
    baseConditions.push(`o.se_owner_id = $${params.length}`);
  }
  if (q.my_deals === 'true') {
    params.push(user.userId);
    baseConditions.push(`o.se_owner_id = $${params.length}`);
  }
  if (q.key_deal === 'true') baseConditions.push(`o.key_deal = true`);
  if (q.search) {
    params.push(`%${q.search}%`);
    baseConditions.push(`(o.name ILIKE $${params.length} OR o.account_name ILIKE $${params.length})`);
  }

  // Computed filters. SQL-equivalent of client-side computeMeddpicc / computeHealthScore.
  const atRiskOnly = q.at_risk === 'true';
  const meddpiccMax = parseIntSafe(q.meddpicc_max);

  // MEDDPICC placeholder set — must mirror client utils/meddpicc.ts PLACEHOLDERS.
  const PLACEHOLDERS = ['tbd','n/a','na','unknown','yes','no','-','--','---','none','tbc','todo','not applicable','not yet','pending','x'];
  params.push(PLACEHOLDERS);
  const phIdx = params.length;

  // Build strong/filled count expressions over the 9 MEDDPICC fields.
  const MEDDPICC_COLS = ['metrics','economic_buyer','decision_criteria','decision_process','paper_process','implicate_pain','champion','authority','need'];
  const strongExpr = MEDDPICC_COLS.map(c =>
    `CASE WHEN o.${c} IS NOT NULL AND LENGTH(TRIM(o.${c})) >= 30 AND LOWER(TRIM(o.${c})) <> ALL($${phIdx}::text[]) THEN 1 ELSE 0 END`
  ).join(' + ');
  const filledExpr = MEDDPICC_COLS.map(c =>
    `CASE WHEN o.${c} IS NOT NULL AND TRIM(o.${c}) <> '' THEN 1 ELSE 0 END`
  ).join(' + ');

  // Effective stage_changed_at — matches existing route logic.
  const stageChangedEffExpr = `COALESCE(
       CASE o.stage
         WHEN 'Qualify'                THEN o.stage_date_qualify
         WHEN 'Develop Solution'       THEN o.stage_date_develop_solution
         WHEN 'Build Value'            THEN o.stage_date_build_value
         WHEN 'Proposal Sent'          THEN o.stage_date_proposal_sent
         WHEN 'Submitted for Booking'  THEN o.stage_date_submitted_for_booking
         WHEN 'Negotiate'              THEN o.stage_date_negotiate
         WHEN 'Closed Won'             THEN o.stage_date_closed_won
         WHEN 'Closed Lost'            THEN o.stage_date_closed_lost
       END::timestamptz,
       o.stage_changed_at
     )`;

  const whereClause = baseConditions.map(c => `(${c})`).join(' AND ');

  // Sort allow-list. Value is the ORDER BY expression (computed expressions reference CTE aliases).
  const ORDER_MAP: Record<string, string> = {
    close_date:                 'o.close_date',
    close_month:                'o.close_month',
    arr:                        'o.arr',
    arr_converted:              'o.arr_converted',
    stage:                      'o.stage',
    name:                       'o.name',
    account_name:               'o.account_name',
    fiscal_period:              'o.fiscal_period',
    team:                       'o.team',
    record_type:                'o.record_type',
    poc_start_date:             'o.poc_start_date',
    poc_end_date:               'o.poc_end_date',
    closed_at:                  'o.closed_at',
    se_comments_updated_at:     'o.se_comments_updated_at',
    manager_comments_updated_at:'o.manager_comments_updated_at',
    last_note_at:               'o.last_note_at',
    key_deal:                   'o.key_deal',
    se_owner:                   'se_owner_name',
    se_comments_freshness:      'o.se_comments_updated_at',
    health_score:               'health_score',
    meddpicc_score:             'meddpicc_strong_count',
    open_task_count:            'open_task_count',
  };
  const sortKey = q.sort && ORDER_MAP[q.sort] ? q.sort : 'close_date';
  const sortDir = q.dir === 'desc' ? 'DESC' : 'ASC';
  const orderBy = `${ORDER_MAP[sortKey]} ${sortDir} NULLS LAST, o.id ASC`;

  // Full query with CTE so computed columns are available to outer WHERE (at_risk, meddpicc_max) and ORDER BY.
  const sql = `
    WITH filtered AS (
      SELECT
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
        ${stageChangedEffExpr} AS stage_changed_at,
        o.last_note_at,
        u.name  AS se_owner_name,
        u.email AS se_owner_email,
        COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.status != 'done') AS open_task_count,
        COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.is_next_step = true AND t.status != 'done') AS next_step_count,
        COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.status != 'done' AND t.due_date < CURRENT_DATE) AS overdue_task_count,
        (${strongExpr}) AS meddpicc_strong_count,
        (${filledExpr}) AS meddpicc_filled_count
      FROM opportunities o
      LEFT JOIN users u ON u.id = o.se_owner_id
      LEFT JOIN tasks t ON t.opportunity_id = o.id
      WHERE ${whereClause}
      GROUP BY o.id, u.id
    ),
    scored AS (
      SELECT
        f.*,
        GREATEST(0, 100 - (
          ROUND((9 - meddpicc_filled_count) * (CASE WHEN LOWER(COALESCE(record_type,'')) = 'upsell' THEN 10.0 ELSE 30.0 END) / 9.0)::int
          + CASE WHEN se_comments_updated_at IS NULL THEN 25
                 WHEN se_comments_updated_at < NOW() - INTERVAL '21 days' THEN 20
                 WHEN se_comments_updated_at < NOW() - INTERVAL '7 days'  THEN 10 ELSE 0 END
          + CASE WHEN last_note_at IS NULL THEN 5
                 WHEN last_note_at < NOW() - INTERVAL '60 days' THEN 3 ELSE 0 END
          + LEAST(overdue_task_count * 10, 35)
          + CASE WHEN stage_changed_at IS NULL THEN 0
                 WHEN stage_changed_at < NOW() - INTERVAL '60 days' THEN 15
                 WHEN stage_changed_at < NOW() - INTERVAL '30 days' THEN 10 ELSE 0 END
        )) AS health_score
      FROM filtered f
    ),
    final AS (
      SELECT * FROM scored
      WHERE 1 = 1
        ${atRiskOnly ? 'AND health_score < 70' : ''}
        ${meddpiccMax !== null ? `AND meddpicc_strong_count <= ${meddpiccMax}` : ''}
    )
    SELECT *, (SELECT COUNT(*) FROM final) AS total_count
    FROM final
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const rows = await query<Record<string, unknown>>(sql, params);
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

  const data = rows.map(r => ({
    id: r.id, sf_opportunity_id: r.sf_opportunity_id, name: r.name,
    account_name: r.account_name, account_segment: r.account_segment, account_industry: r.account_industry,
    stage: r.stage, record_type: r.record_type, key_deal: r.key_deal,
    arr: r.arr, arr_currency: r.arr_currency, arr_converted: r.arr_converted,
    close_date: r.close_date, close_month: r.close_month, fiscal_period: r.fiscal_period, fiscal_year: r.fiscal_year,
    team: r.team, deploy_mode: r.deploy_mode, deploy_location: r.deploy_location,
    sales_plays: r.sales_plays, lead_source: r.lead_source, opportunity_source: r.opportunity_source,
    channel_source: r.channel_source, biz_dev: r.biz_dev, ae_owner_name: r.ae_owner_name,
    se_owner: r.se_owner_id ? { id: r.se_owner_id, name: r.se_owner_name, email: r.se_owner_email } : null,
    se_comments: r.se_comments, se_comments_updated_at: r.se_comments_updated_at,
    manager_comments: r.manager_comments, next_step_sf: r.next_step_sf,
    psm_comments: r.psm_comments, technical_blockers: r.technical_blockers,
    engaged_competitors: r.engaged_competitors,
    budget: r.budget, authority: r.authority, need: r.need, timeline: r.timeline,
    metrics: r.metrics, economic_buyer: r.economic_buyer,
    decision_criteria: r.decision_criteria, decision_process: r.decision_process,
    paper_process: r.paper_process, implicate_pain: r.implicate_pain,
    champion: r.champion, agentic_qual: r.agentic_qual,
    poc_status: r.poc_status, poc_start_date: r.poc_start_date, poc_end_date: r.poc_end_date,
    poc_type: r.poc_type, poc_deploy_type: r.poc_deploy_type, rfx_status: r.rfx_status,
    sourcing_partner: r.sourcing_partner, sourcing_partner_tier: r.sourcing_partner_tier,
    influencing_partner: r.influencing_partner, partner_manager: r.partner_manager,
    open_task_count: Number(r.open_task_count),
    next_step_count: Number(r.next_step_count),
    overdue_task_count: Number(r.overdue_task_count),
    stage_changed_at: r.stage_changed_at, last_note_at: r.last_note_at,
  }));

  res.json(ok(data, { total, limit, offset }));
});

// GET /opportunities/by-account?name=X — all opps for a given account (open + closed)
router.get('/by-account', auth, async (req: Request, res: Response): Promise<void> => {
  const name = (req.query.name as string | undefined)?.trim();
  if (!name) { res.status(400).json(err('name query parameter is required')); return; }

  const rows = await query<{
    id: number; name: string; stage: string; is_active: boolean; is_closed_lost: boolean;
    closed_at: string | null; close_date: string | null; first_seen_at: string | null;
    arr: number | null; arr_currency: string | null;
    record_type: string | null; ae_owner_name: string | null; se_owner_name: string | null;
  }>(
    `SELECT o.id, o.name, o.stage, o.is_active, o.is_closed_lost,
            o.closed_at, o.close_date, o.first_seen_at,
            o.arr, o.arr_currency, o.record_type, o.ae_owner_name,
            u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.account_name = $1
     ORDER BY COALESCE(o.closed_at::date, o.close_date, o.first_seen_at::date) DESC NULLS LAST`,
    [name]
  );
  res.json(ok(rows));
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

// GET /opportunities/:id/summary/cached — return cached AI summary
router.get('/:id/summary/cached', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const rows = await query<{ content: string; generated_at: string }>(
    `SELECT content, generated_at FROM ai_summary_cache WHERE key = $1`,
    [`summary-${id}`]
  );
  if (rows.length === 0) { res.json(ok(null)); return; }

  res.json(ok({ summary: rows[0].content, generated_at: rows[0].generated_at }));
});

// POST /opportunities/:id/summary  — AI deal summary
router.post('/:id/summary', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }
  const userId = (req as AuthenticatedRequest).user?.userId ?? null;

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

  const prompt = `You are an SE deal intelligence assistant. Write a concise deal summary in 3 short paragraphs using plain text with **bold** for emphasis on key names, numbers, and actions. Do NOT use markdown headers (#), bullet points, or lists. Keep it conversational and direct.

Paragraph 1: Current deal status and momentum (1-2 sentences).
Paragraph 2: Key risks or blockers (1-2 sentences).
Paragraph 3: Recommended next action starting with "**Recommended next action:**" (1-2 sentences).

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
${noteLines}`;

  const summary = await runAiJob({
    key: `summary-${id}`,
    feature: 'summary',
    opportunityId: id,
    userId,
    work: async () => {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });

      const summaryBlock = response.content.find(b => b.type === 'text');
      const summaryText = summaryBlock && summaryBlock.type === 'text' ? summaryBlock.text : '';

      await query(
        `INSERT INTO ai_summary_cache (key, content, generated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET content = $2, generated_at = now()`,
        [`summary-${id}`, summaryText]
      );
      return summaryText;
    },
  });

  res.json(ok({ summary, generated_at: new Date().toISOString() }));
});

// ── MEDDPICC Gap Coach ──────────────────────────────────────────────────────

const MEDDPICC_KEYS = [
  { key: 'metrics',           label: 'Metrics' },
  { key: 'economic_buyer',    label: 'Economic Buyer' },
  { key: 'decision_criteria', label: 'Decision Criteria' },
  { key: 'decision_process',  label: 'Decision Process' },
  { key: 'paper_process',     label: 'Paper Process' },
  { key: 'implicate_pain',    label: 'Implicate the Pain' },
  { key: 'champion',          label: 'Champion' },
  { key: 'authority',         label: 'Authority' },
  { key: 'need',              label: 'Need / Timeline' },
];

// GET /opportunities/:id/meddpicc-coach/cached
router.get('/:id/meddpicc-coach/cached', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const rows = await query<{ content: string; generated_at: string }>(
    `SELECT content, generated_at FROM ai_summary_cache WHERE key = $1`,
    [`meddpicc-coach-${id}`]
  );
  if (rows.length === 0) { res.json(ok(null)); return; }

  try {
    const parsed = JSON.parse(rows[0].content);
    res.json(ok({ coach: parsed, generated_at: rows[0].generated_at }));
  } catch {
    res.json(ok(null));
  }
});

// POST /opportunities/:id/meddpicc-coach
router.post('/:id/meddpicc-coach', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }
  const userId = (req as AuthenticatedRequest).user?.userId ?? null;
  const jobKey = `meddpicc-coach-${id}`;

  const job = await startJob({ key: jobKey, feature: 'meddpicc-coach', opportunityId: id, userId });

  try {
    const [opp, tasks, notes] = await Promise.all([
      queryOne<Record<string, unknown>>(
        `SELECT o.*, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.id = $1`,
        [id]
      ),
      query(
        `SELECT t.title, t.status, t.due_date, t.is_next_step, t.description
         FROM tasks t WHERE t.opportunity_id = $1 AND t.is_deleted = false
         ORDER BY t.is_next_step DESC, t.due_date ASC NULLS LAST`,
        [id]
      ),
      query(
        `SELECT n.content, u.name AS author_name, n.created_at
         FROM notes n JOIN users u ON u.id = n.author_id
         WHERE n.opportunity_id = $1 ORDER BY n.created_at DESC LIMIT 25`,
        [id]
      ),
    ]);

    if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

    const formatDate = (d: unknown) => d ? new Date(d as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
    const formatARR = (a: unknown) => a ? `$${(Number(a) / 1000).toFixed(0)}K` : 'N/A';

    // Build MEDDPICC fields context
    const meddpiccContext = MEDDPICC_KEYS.map(f => {
      const val = opp[f.key] as string | null;
      return `${f.label}: ${val?.trim() || '(empty)'}`;
    }).join('\n');

    // Build tasks context
    const taskLines = tasks.length
      ? tasks.map((t: Record<string, unknown>) =>
          `- [${t.is_next_step ? 'NEXT STEP' : t.status}] ${t.title}${t.due_date ? ` (due ${formatDate(t.due_date)})` : ''}${t.description ? ` — ${t.description}` : ''}`
        ).join('\n')
      : 'No tasks.';

    // Build notes context (oldest first for chronology)
    const noteLines = notes.length
      ? [...notes].reverse().map((n: Record<string, unknown>) =>
          `[${formatDate(n.created_at)} — ${n.author_name}]: ${n.content}`
        ).join('\n')
      : 'No notes yet.';

    const prompt = `You are an expert MEDDPICC sales methodology coach analyzing a software deal for an SE (Sales Engineer). Your job is NOT to score completeness — a separate tool does that. Your job is to read all available deal context (notes, tasks, comments, field values) and identify what the SE still needs to discover or validate.

For each of the 9 MEDDPICC elements below, produce a verdict:
- GREEN: Meaningful evidence found in the deal context. State what evidence you found.
- AMBER: Partially covered — some signal exists but there are specific gaps. State what's missing and suggest a discovery question.
- RED: No evidence found. Explain why this matters at the current deal stage and suggest a specific discovery question.

Important rules:
- Weight your assessment by deal stage. A "Qualify" stage deal with empty Paper Process is less alarming than a "Proposal Sent" deal with the same gap.
- Look across ALL sources — a champion might be mentioned in notes even if the Champion field is empty.
- A filled MEDDPICC field doesn't automatically mean GREEN — if the content is vague or unsupported by notes, mark it AMBER.
- Be specific and actionable. Generic advice like "identify the champion" is useless. Reference the actual account name, people, and context from the deal.
- Suggested questions should be phrased as the SE would actually ask them in a call — natural, not robotic.

DEAL CONTEXT:
Opportunity: ${opp.name}
Account: ${opp.account_name ?? 'N/A'}
Stage: ${opp.stage}
ARR: ${formatARR(opp.arr)}
Close Date: ${formatDate(opp.close_date)}
Deploy Mode: ${opp.deploy_mode ?? 'N/A'}
PoC Status: ${opp.poc_status ?? 'N/A'}
AE Owner: ${opp.ae_owner_name ?? 'N/A'}
SE Owner: ${opp.se_owner_name ?? 'Unassigned'}
Engaged Competitors: ${opp.engaged_competitors ?? 'None listed'}

MEDDPICC FIELD VALUES:
${meddpiccContext}

Next Step (from SF): ${opp.next_step_sf ?? 'N/A'}
SE Comments: ${opp.se_comments ?? 'None'}
Manager Comments: ${opp.manager_comments ?? 'None'}
PSM Comments: ${opp.psm_comments ?? 'None'}
Technical Blockers: ${opp.technical_blockers ?? 'None'}

TASKS:
${taskLines}

NOTES (oldest to newest):
${noteLines}

Respond in this exact JSON format (no markdown fences, just raw JSON):
{
  "elements": [
    {
      "key": "metrics",
      "label": "Metrics",
      "status": "green",
      "evidence": "What you found supporting this element",
      "gap": null,
      "suggested_question": null
    },
    {
      "key": "economic_buyer",
      "label": "Economic Buyer",
      "status": "amber",
      "evidence": "Partial evidence found",
      "gap": "What's missing",
      "suggested_question": "A natural discovery question the SE can ask"
    }
  ],
  "overall_assessment": "2-3 sentence summary of the deal's qualification posture and the single highest-priority gap to close next.",
  "counts": { "green": 0, "amber": 0, "red": 0 }
}

Include all 9 MEDDPICC elements in the elements array, in this order: metrics, economic_buyer, decision_criteria, decision_process, paper_process, implicate_pain, champion, authority, need.`;

    console.log(`[meddpicc-coach] Calling Anthropic API for opp ${id}...`);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    console.log(`[meddpicc-coach] API response received for opp ${id}, stop_reason=${response.stop_reason}`);

    const text = response.content.find(b => b.type === 'text');
    const raw = text && text.type === 'text' ? text.text : '';

    let parsed: unknown;
    try {
      // Handle case where Claude wraps in ```json ... ```
      const cleaned = raw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error(`[meddpicc-coach] JSON parse failed for opp ${id}:`, parseErr, '\nRaw:', raw.slice(0, 500));
      await failJob(job.id, 'parse_failed');
      res.json(ok({ coach: null, raw, error: 'parse_failed' }));
      return;
    }

    // Cache result
    await query(
      `INSERT INTO ai_summary_cache (key, content, generated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET content = $2, generated_at = now()`,
      [`meddpicc-coach-${id}`, JSON.stringify(parsed)]
    );

    await completeJob(job.id);
    console.log(`[meddpicc-coach] Success for opp ${id}, cached.`);
    res.json(ok({ coach: parsed, generated_at: new Date().toISOString() }));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await failJob(job.id, msg);
    console.error(`[meddpicc-coach] Error for opp ${id}:`, msg);
    res.status(500).json(err(`MEDDPICC Coach failed: ${msg}`));
  }
});

// GET /opportunities  (list)
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  const { stage, se_owner, search, sort, include_qualify, include_closed, limit: limitParam } = req.query as Record<string, string>;
  const limit = (() => {
    if (!limitParam) return null;
    const n = parseInt(limitParam, 10);
    if (isNaN(n) || n <= 0) return null;
    return Math.min(n, 2000);
  })();

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

  // Default: only open pipeline (active, not Closed Won, not Closed Lost).
  // Pass include_closed=true to also include Closed Won + Closed Lost in the
  // result (used by future combined views; current screens never set this).
  const conditions: string[] = ['o.is_active = true'];
  if (include_closed !== 'true') {
    conditions.push('o.is_closed_lost = false');
    conditions.push('COALESCE(o.is_closed_won, false) = false');
  }
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
       COALESCE(
         CASE o.stage
           WHEN 'Qualify'                THEN o.stage_date_qualify
           WHEN 'Develop Solution'       THEN o.stage_date_develop_solution
           WHEN 'Build Value'            THEN o.stage_date_build_value
           WHEN 'Proposal Sent'          THEN o.stage_date_proposal_sent
           WHEN 'Submitted for Booking'  THEN o.stage_date_submitted_for_booking
           WHEN 'Negotiate'              THEN o.stage_date_negotiate
           WHEN 'Closed Won'             THEN o.stage_date_closed_won
           WHEN 'Closed Lost'            THEN o.stage_date_closed_lost
         END::timestamptz,
         o.stage_changed_at
       ) AS stage_changed_at,
       o.last_note_at,
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
     ORDER BY ${orderBy}
     ${limit !== null ? `LIMIT ${limit}` : ''}`,
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

// GET /opportunities/:id/kb-matches
// Returns relevant KB proof points and differentiators for this opportunity.
// Matches on: products overlap, vertical/industry keywords, competitor signals.
router.get('/:id/kb-matches', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const opp = await queryOne<{
    products: string[]; account_industry: string | null; engaged_competitors: string | null;
    name: string; account_name: string | null;
  }>(
    'SELECT products, account_industry, engaged_competitors, name, account_name FROM opportunities WHERE id = $1',
    [id]
  );
  if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

  // 1. Match proof points: product overlap, then score by match quality
  const proofPoints = await query<{
    id: number; customer_name: string; about: string | null; vertical: string;
    products: string[]; initiatives: string[]; proof_point_text: string;
  }>(
    `SELECT id, customer_name, about, vertical, products, initiatives, proof_point_text
     FROM kb_proof_points
     WHERE products && $1
     ORDER BY array_length(
       ARRAY(SELECT unnest(products) INTERSECT SELECT unnest($1::text[])), 1
     ) DESC NULLS LAST
     LIMIT 15`,
    [opp.products.length > 0 ? opp.products : ['DQ']]  // fallback to DQ if no products tagged
  );

  // 2. Match differentiators: check need_signals against competitor and industry keywords
  const searchTerms: string[] = [];
  if (opp.engaged_competitors) {
    // Extract competitor names for signal matching
    searchTerms.push(...opp.engaged_competitors.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean));
  }
  if (opp.account_industry) searchTerms.push(opp.account_industry.toLowerCase());

  const differentiators = await query<{
    id: number; name: string; tagline: string | null; core_message: string | null;
    need_signals: string[]; proof_points_json: unknown; competitive_positioning: string | null;
  }>(
    'SELECT id, name, tagline, core_message, need_signals, proof_points_json, competitive_positioning FROM kb_differentiators',
    []
  );

  // Score differentiators by signal relevance
  const scoredDiffs = differentiators.map(d => {
    let score = 0;
    const signals = d.need_signals.map(s => s.toLowerCase());
    for (const term of searchTerms) {
      for (const signal of signals) {
        if (signal.includes(term)) score += 2;
      }
    }
    // Boost if any product matches a differentiator's domain
    if (opp.products.some(p => ['DQ'].includes(p)) && d.name.includes('Quality')) score += 3;
    if (opp.products.some(p => ['MDM', 'RDM', 'Catalog', 'Lineage', 'Observability'].includes(p)) && d.name.includes('Unified')) score += 3;
    if (d.name.includes('Automated')) score += 1; // always somewhat relevant
    return { ...d, relevance_score: score };
  }).sort((a, b) => b.relevance_score - a.relevance_score);

  res.json(ok({
    proof_points: proofPoints,
    differentiators: scoredDiffs,
    match_context: {
      products: opp.products,
      industry: opp.account_industry,
      competitors: opp.engaged_competitors,
    },
  }));
});

// GET /opportunities/:id/timeline
// Returns a reverse-chronological flat list of all events on this opportunity.
router.get('/:id/timeline', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  // Fetch the opp itself for stage-change events and first-seen event.
  // Stage transitions are derived from per-stage SF date columns so EVERY stage
  // entered shows up in the timeline (not just the most recent).
  const opp = await queryOne<{
    stage: string; previous_stage: string | null; stage_changed_at: string | null;
    first_seen_at: string | null;
    stage_date_qualify: string | null;
    stage_date_develop_solution: string | null;
    stage_date_build_value: string | null;
    stage_date_proposal_sent: string | null;
    stage_date_submitted_for_booking: string | null;
    stage_date_negotiate: string | null;
    stage_date_closed_won: string | null;
    stage_date_closed_lost: string | null;
  }>(
    `SELECT stage, previous_stage, stage_changed_at, first_seen_at,
            stage_date_qualify, stage_date_develop_solution, stage_date_build_value,
            stage_date_proposal_sent, stage_date_submitted_for_booking, stage_date_negotiate,
            stage_date_closed_won, stage_date_closed_lost
       FROM opportunities WHERE id = $1`,
    [id]
  );
  if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

  const [notes, tasks, fieldHistory, ownerHistory] = await Promise.all([
    query<{ id: number; content: string; author_name: string; created_at: string }>(
      `SELECT n.id, n.content, u.name AS author_name, n.created_at
       FROM notes n JOIN users u ON u.id = n.author_id
       WHERE n.opportunity_id = $1 ORDER BY n.created_at DESC`,
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

  // Stage transitions — one event per non-null SF stage_date_*, with previous
  // stage derived from the prior dated stage in pipeline order.
  const stageDateEntries: { stage: string; date: string; order: number }[] = [
    { stage: 'Qualify',               date: opp.stage_date_qualify ?? '',               order: 1 },
    { stage: 'Develop Solution',      date: opp.stage_date_develop_solution ?? '',      order: 2 },
    { stage: 'Build Value',           date: opp.stage_date_build_value ?? '',           order: 3 },
    { stage: 'Proposal Sent',         date: opp.stage_date_proposal_sent ?? '',         order: 4 },
    { stage: 'Submitted for Booking', date: opp.stage_date_submitted_for_booking ?? '', order: 5 },
    { stage: 'Negotiate',             date: opp.stage_date_negotiate ?? '',             order: 6 },
    { stage: 'Closed Won',            date: opp.stage_date_closed_won ?? '',            order: 7 },
    { stage: 'Closed Lost',           date: opp.stage_date_closed_lost ?? '',           order: 8 },
  ].filter(e => e.date);

  if (stageDateEntries.length > 0) {
    // Sort by date, then pipeline order for tiebreaker
    stageDateEntries.sort((a, b) =>
      a.date === b.date ? a.order - b.order : (a.date < b.date ? -1 : 1)
    );
    for (let i = 0; i < stageDateEntries.length; i++) {
      const cur = stageDateEntries[i];
      const prev = i > 0 ? stageDateEntries[i - 1].stage : null;
      events.push({
        id: `stage-change-${cur.stage.replace(/\s+/g, '-').toLowerCase()}`,
        type: 'stage_change',
        timestamp: new Date(cur.date).toISOString(),
        payload: { from: prev, to: cur.stage },
      });
    }
  } else if (opp.stage_changed_at) {
    // Fallback to import-tracked transition for older records with no SF stage dates.
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

// PATCH /opportunities/:id/fields
// Update app-editable text fields (not SF-owned). Allows updating technical_blockers,
// MEDDPICC/qualification fields between SF imports, and products array.
const PATCHABLE_FIELDS = new Set([
  'technical_blockers',
  'metrics', 'economic_buyer', 'decision_criteria', 'decision_process',
  'paper_process', 'implicate_pain', 'champion', 'engaged_competitors',
  'budget', 'authority', 'need', 'timeline', 'agentic_qual',
  'products',
]);

router.patch('/:id/fields', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const body = req.body as Record<string, unknown>;
  const updates = Object.entries(body).filter(([k]) => PATCHABLE_FIELDS.has(k));
  if (updates.length === 0) { res.status(400).json(err('No patchable fields provided')); return; }

  const setClauses = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = [id, ...updates.map(([, v]) => v ?? null)];

  const updated = await queryOne<{ id: number }>(
    `UPDATE opportunities SET ${setClauses}, updated_at = now() WHERE id = $1 RETURNING id`,
    values,
  );
  if (!updated) { res.status(404).json(err('Opportunity not found')); return; }

  res.json(ok({ id, updated_fields: updates.map(([k]) => k) }));
});

// POST /opportunities/:id/process-notes
// Accepts raw call notes, auto-saves them as a note, then calls Claude to extract
// tasks, MEDDPICC updates, a draft SE comment, tech blockers, and a next step.
router.post('/:id/process-notes', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  const { raw_notes, source_url } = req.body as { raw_notes?: string; source_url?: string };
  if (!raw_notes?.trim()) { res.status(400).json(err('raw_notes is required')); return; }

  const userId = (req as AuthenticatedRequest).user!.userId;
  console.log(`[process-notes] START opp=${id} user=${userId}`);

  try {

  // 1. Fetch opportunity context for the prompt
  const opp = await queryOne<Record<string, unknown>>(
    `SELECT name, account_name, stage, se_comments, technical_blockers,
            metrics, economic_buyer, decision_criteria, decision_process,
            paper_process, implicate_pain, champion, engaged_competitors,
            budget, authority, need, timeline, agentic_qual
     FROM opportunities WHERE id = $1 AND is_active = true`,
    [id],
  );
  if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

  // 2. Auto-save raw notes immediately (with source URL)
  const savedNote = await queryOne<{ id: number }>(
    `INSERT INTO notes (opportunity_id, author_id, content, source_url)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [id, userId, raw_notes.trim(), source_url?.trim() || null],
  );
  await query(`UPDATE opportunities SET last_note_at = now() WHERE id = $1`, [id]);

  // 3. Build prompt
  const today = new Date();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const datePrefix = `BM_${today.getDate()}${months[today.getMonth()]}${String(today.getFullYear()).slice(2)}`;

  const meddpiccCtx = [
    ['metrics', 'Metrics'], ['economic_buyer', 'Economic Buyer'],
    ['decision_criteria', 'Decision Criteria'], ['decision_process', 'Decision Process'],
    ['paper_process', 'Paper Process'], ['implicate_pain', 'Implicate the Pain'],
    ['champion', 'Champion'], ['engaged_competitors', 'Competitors'],
    ['budget', 'Budget'], ['authority', 'Authority'],
    ['need', 'Need'], ['timeline', 'Timeline'], ['agentic_qual', 'Agentic Qual'],
  ].map(([k, label]) => `  ${label}: ${(opp[k] as string) || '(not set)'}`).join('\n');

  const prompt = `You are an SE (Sales Engineer) assistant. Analyse the call notes below and return a JSON object. Return ONLY valid JSON — no explanation, no markdown, no code fences.

OPPORTUNITY CONTEXT
Name: ${opp.name}
Account: ${opp.account_name ?? 'N/A'}
Stage: ${opp.stage}
Current SE Comments: ${(opp.se_comments as string) || '(none)'}
Current Technical Blockers: ${(opp.technical_blockers as string) || '(none)'}
Current MEDDPICC / qualification fields:
${meddpiccCtx}

RAW CALL NOTES
${raw_notes.trim()}

INSTRUCTIONS — return a JSON object with exactly these five keys:

{
  "tasks": [ { "title": "...", "due_days": <integer> } ],
  "meddpicc_updates": [ { "field": "<one of: metrics|economic_buyer|decision_criteria|decision_process|paper_process|implicate_pain|champion|engaged_competitors|budget|authority|need|timeline|agentic_qual>", "current": "<current value or empty string>", "suggested": "..." } ],
  "se_comment_draft": "...",
  "tech_blockers": [ "..." ],
  "next_step": "..."
}

Rules:
- tasks: all clearly actionable action items from the notes. due_days = days from today (e.g. 3, 5, 7).
- meddpicc_updates: only fields where the notes add NEW information not already in the current values. Omit fields that are already well-captured.
- se_comment_draft: EXACTLY 1-2 sentences. Start with "${datePrefix} — ". Focus on: (a) the SE's immediate next action toward the technical win; (b) any notable risks from the technical evaluation, competitive situation, or evaluation process that could block progress (e.g. unresolved tech gap, competitor actively evaluating, blocked process). Do NOT mention buyer names, budget figures, or summarise MEDDPICC fields.
- tech_blockers: ONLY technical/integration blockers — unvalidated connector or API support, missing product capabilities, infrastructure or security constraints, required technical information not yet obtained. Exclude business risks, timeline pressure, NDA/legal/commercial items. Return empty array if none.
- next_step: single sentence — the most important next SE action to move toward the technical win.`;

  console.log(`[process-notes] calling Claude API, prompt length=${prompt.length} chars`);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const rawJson = (textBlock && textBlock.type === 'text' ? textBlock.text : '{}').trim()
    .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  console.log(`[process-notes] Claude raw response (first 500 chars): ${rawJson.slice(0, 500)}`);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawJson);
  } catch (parseErr) {
    console.error('[process-notes] JSON parse failed:', parseErr, '\nRaw:', rawJson);
    res.status(500).json(err('Failed to parse Claude response — try again'));
    return;
  }

  res.json(ok({
    saved_note_id: savedNote?.id ?? null,
    tasks:            Array.isArray(parsed.tasks)            ? parsed.tasks            : [],
    meddpicc_updates: Array.isArray(parsed.meddpicc_updates) ? parsed.meddpicc_updates : [],
    se_comment_draft: typeof parsed.se_comment_draft === 'string' ? parsed.se_comment_draft : '',
    tech_blockers:    Array.isArray(parsed.tech_blockers)    ? parsed.tech_blockers    : [],
    next_step:        typeof parsed.next_step === 'string'   ? parsed.next_step        : '',
  }));

  } catch (e) {
    console.error('[process-notes] error:', e);
    res.status(500).json(err(e instanceof Error ? e.message : 'Unexpected error processing notes'));
  }
});

// ── CALL PREP ──────────────────────────────────────────────────────

// GET /opportunities/:id/call-prep
// Returns cached brief (if fresh) + KB matches. If brief is missing or stale (>30 days), returns brief: null.
router.get('/:id/call-prep', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  try {
    // 1. Check for cached brief
    const cached = await queryOne<{ content: string; generated_at: string }>(
      `SELECT content, generated_at FROM ai_summary_cache WHERE key = $1`,
      [`call-prep-${id}`]
    );

    let brief: unknown = null;
    let generatedAt: string | null = null;
    let isStale = true;

    if (cached) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      isStale = age > 30 * 24 * 60 * 60 * 1000; // 30 days
      if (!isStale) {
        try { brief = JSON.parse(cached.content); } catch { brief = null; }
        generatedAt = cached.generated_at;
      }
    }

    // 2. Get KB matches (always fresh — cheap DB query)
    const opp = await queryOne<{
      products: string[]; account_industry: string | null; engaged_competitors: string | null;
      name: string; account_name: string | null;
    }>(
      'SELECT products, account_industry, engaged_competitors, name, account_name FROM opportunities WHERE id = $1',
      [id]
    );
    if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

    const proofPoints = opp.products.length > 0 ? await query<{
      id: number; customer_name: string; about: string | null; vertical: string;
      products: string[]; initiatives: string[]; proof_point_text: string;
    }>(
      `SELECT id, customer_name, about, vertical, products, initiatives, proof_point_text
       FROM kb_proof_points
       WHERE products && $1
       ORDER BY array_length(
         ARRAY(SELECT unnest(products) INTERSECT SELECT unnest($1::text[])), 1
       ) DESC NULLS LAST
       LIMIT 10`,
      [opp.products]
    ) : [];

    // Differentiator scoring
    const searchTerms: string[] = [];
    if (opp.engaged_competitors) {
      searchTerms.push(...opp.engaged_competitors.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean));
    }
    if (opp.account_industry) searchTerms.push(opp.account_industry.toLowerCase());

    const allDiffs = await query<{
      id: number; name: string; tagline: string | null; core_message: string | null;
      need_signals: string[]; proof_points_json: unknown; competitive_positioning: string | null;
    }>(
      'SELECT id, name, tagline, core_message, need_signals, proof_points_json, competitive_positioning FROM kb_differentiators',
      []
    );

    const scoredDiffs = allDiffs.map(d => {
      let score = 0;
      const signals = d.need_signals.map(s => s.toLowerCase());
      for (const term of searchTerms) {
        for (const signal of signals) {
          if (signal.includes(term)) score += 2;
        }
      }
      if (opp.products.some(p => ['DQ'].includes(p)) && d.name.includes('Quality')) score += 3;
      if (opp.products.some(p => ['MDM', 'RDM', 'Catalog', 'Lineage', 'Observability'].includes(p)) && d.name.includes('Unified')) score += 3;
      if (d.name.includes('Automated')) score += 1;
      return { ...d, relevance_score: score };
    }).sort((a, b) => b.relevance_score - a.relevance_score);

    res.json(ok({
      brief,
      generated_at: generatedAt,
      is_stale: isStale,
      proof_points: proofPoints,
      differentiators: scoredDiffs,
      match_context: { products: opp.products, industry: opp.account_industry, competitors: opp.engaged_competitors },
    }));
  } catch (e) {
    console.error('[call-prep] error:', e);
    res.status(500).json(err('Failed to load call prep data'));
  }
});

// POST /opportunities/:id/call-prep/generate
// Generates (or regenerates) the AI pre-call brief using deal context + KB matches.
router.post('/:id/call-prep/generate', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }
  const userId = (req as AuthenticatedRequest).user?.userId ?? null;
  const job = await startJob({ key: `call-prep-${id}`, feature: 'call-prep', opportunityId: id, userId });

  try {
    // Gather all deal context
    const opp = await queryOne<Record<string, unknown>>(
      `SELECT o.*, u.name as se_owner_name
       FROM opportunities o
       LEFT JOIN users u ON u.id = o.se_owner_id
       WHERE o.id = $1`,
      [id]
    );
    if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

    const tasks = await query<{ title: string; status: string; due_date: string | null; is_next_step: boolean }>(
      `SELECT title, status, due_date, is_next_step FROM tasks
       WHERE opportunity_id = $1 AND is_deleted = false
       ORDER BY is_next_step DESC, due_date ASC NULLS LAST`,
      [id]
    );

    const notes = await query<{ content: string; created_at: string; author_name: string }>(
      `SELECT n.content, n.created_at, u.name as author_name
       FROM notes n JOIN users u ON u.id = n.author_id
       WHERE n.opportunity_id = $1
       ORDER BY n.created_at DESC LIMIT 10`,
      [id]
    );

    // KB matches for context — full text, no truncation
    const products = (opp.products as string[]) || [];
    const proofPoints = products.length > 0 ? await query<{
      customer_name: string; about: string | null; vertical: string; products: string[]; initiatives: string[]; proof_point_text: string;
    }>(
      `SELECT customer_name, about, vertical, products, initiatives, proof_point_text
       FROM kb_proof_points WHERE products && $1
       ORDER BY array_length(ARRAY(SELECT unnest(products) INTERSECT SELECT unnest($1::text[])), 1) DESC NULLS LAST
       LIMIT 5`,
      [products]
    ) : [];

    const searchTerms: string[] = [];
    const competitors = opp.engaged_competitors as string | null;
    const industry = opp.account_industry as string | null;
    if (competitors) searchTerms.push(...competitors.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean));
    if (industry) searchTerms.push(industry.toLowerCase());

    const allDiffs = await query<{
      name: string; tagline: string | null; core_message: string | null;
      need_signals: string[]; proof_points_json: unknown; competitive_positioning: string | null;
    }>(
      'SELECT name, tagline, core_message, need_signals, proof_points_json, competitive_positioning FROM kb_differentiators', []
    );
    const topDiffs = allDiffs.map(d => {
      let score = 0;
      const signals = d.need_signals.map(s => s.toLowerCase());
      for (const term of searchTerms) { for (const signal of signals) { if (signal.includes(term)) score += 2; } }
      if (products.some(p => ['DQ'].includes(p)) && d.name.includes('Quality')) score += 3;
      if (products.some(p => ['MDM', 'RDM', 'Catalog', 'Lineage', 'Observability'].includes(p)) && d.name.includes('Unified')) score += 3;
      return { ...d, score };
    }).sort((a, b) => b.score - a.score).slice(0, 4);

    // Build prompt
    const today = new Date().toISOString().slice(0, 10);
    const openTasks = tasks.filter(t => t.status !== 'done');
    const overdueTasks = openTasks.filter(t => t.due_date && t.due_date < today);

    // Format proof points with full text for the prompt
    const ppContext = proofPoints.map((p, i) => {
      const overlap = p.products.filter(pr => products.includes(pr));
      return `STORY ${i + 1}: ${p.customer_name}
  Vertical: ${p.vertical}
  Products: ${p.products.join(', ')} (overlaps with this deal: ${overlap.join(', ')})
  About: ${p.about || 'N/A'}
  Proof Point: ${p.proof_point_text}`;
    }).join('\n\n') || 'None available';

    // Format differentiators with their embedded proof points
    const diffContext = topDiffs.map(d => {
      const ppJson = d.proof_points_json as Array<{ customer: string; detail: string }> | null;
      const embeddedPPs = ppJson && Array.isArray(ppJson) ? ppJson.map(p => `    - ${p.customer}: ${p.detail}`).join('\n') : '    None';
      return `DIFFERENTIATOR: ${d.name}
  Tagline: ${d.tagline || 'N/A'}
  Core Message: ${d.core_message || 'N/A'}
  Competitive Positioning: ${d.competitive_positioning || 'N/A'}
  Embedded Proof Points:
${embeddedPPs}`;
    }).join('\n\n') || 'None matched';

    const prompt = `You are an expert Sales Engineering assistant preparing an SE for a customer call. Generate a Pre-Call Brief that TIGHTLY INTEGRATES customer proof points into actionable guidance.

DEAL CONTEXT:
- Opportunity: ${opp.name}
- Account: ${opp.account_name || 'Unknown'}
- Industry: ${industry || 'Unknown'}
- Stage: ${opp.stage}
- ARR: ${opp.arr ? `$${Number(opp.arr).toLocaleString()}` : 'Unknown'}
- Close Date: ${opp.close_date || 'Unknown'}
- AE Owner: ${opp.ae_owner_name || 'Unknown'}
- SE Owner: ${opp.se_owner_name || 'Unassigned'}
- Products: ${products.length > 0 ? products.join(', ') : 'None tagged'}
- Competitors: ${competitors || 'None listed'}
- Deploy Mode: ${opp.deploy_mode || 'Unknown'}
- PoC Status: ${opp.poc_status || 'None'}
- Record Type: ${opp.record_type || 'Unknown'}

MEDDPICC STATUS:
- Metrics: ${opp.metrics || '—'}
- Economic Buyer: ${opp.economic_buyer || '—'}
- Decision Criteria: ${opp.decision_criteria || '—'}
- Decision Process: ${opp.decision_process || '—'}
- Paper Process: ${opp.paper_process || '—'}
- Implicate Pain: ${opp.implicate_pain || '—'}
- Champion: ${opp.champion || '—'}
- Authority: ${opp.authority || '—'}
- Need: ${opp.need || '—'}

SF NEXT STEP: ${opp.next_step_sf || '—'}
SE COMMENTS: ${opp.se_comments || '—'}
SE COMMENTS LAST UPDATED: ${opp.se_comments_updated_at || 'Never'}

OPEN TASKS (${openTasks.length}):
${openTasks.map(t => `- [${t.status}] ${t.title}${t.due_date ? ` (due: ${t.due_date})` : ''}${t.is_next_step ? ' [NEXT STEP]' : ''}`).join('\n') || 'None'}

OVERDUE TASKS: ${overdueTasks.length > 0 ? overdueTasks.map(t => t.title).join(', ') : 'None'}

RECENT NOTES (last 10):
${notes.map(n => `[${n.created_at}] ${n.author_name}: ${n.content.slice(0, 500)}`).join('\n') || 'None'}

===== CUSTOMER VALUE STORIES (use these in talking points!) =====
${ppContext}

===== PLATFORM DIFFERENTIATORS (tie to proof points above!) =====
${diffContext}

Today's date: ${today}

Generate a JSON response with this EXACT structure:
{
  "deal_context": "2-3 sentences summarizing the deal, what's at stake, and what's happening right now.",
  "talking_points": [
    "Each talking point MUST reference a specific customer name and concrete outcome from the stories above when relevant. Example: 'Lead with Scout Motors — same manufacturing vertical, replaced Informatica, 40% fewer DQ incidents in 4 months.' Tie differentiators to the proof point that backs them up.",
    "Another specific, customer-backed talking point.",
    "A MEDDPICC-gap talking point with a suggested question."
  ],
  "proof_point_highlights": [
    {
      "customer": "Customer name from the stories above",
      "role": "primary|scale|backup",
      "why_relevant": "Why this story matters for THIS specific deal (shared products, industry, competitor, SI, etc.)",
      "key_stat": "The single most compelling metric or outcome from their proof point",
      "when_to_use": "Specific moment in the call when the SE should drop this reference"
    }
  ],
  "differentiator_plays": [
    {
      "name": "Differentiator name",
      "positioning": "1 sentence on how to position this against the specific competitor in this deal",
      "backed_by": "Customer name whose proof point validates this differentiator"
    }
  ],
  "risks": [
    { "severity": "high|medium", "text": "Description of risk or gap." }
  ],
  "discovery_questions": [
    "Conversational question tied to an identified gap."
  ]
}

CRITICAL RULES:
- talking_points: 3-5 items. Every point that can reference a customer story MUST do so by name with a specific metric. No generic statements like "emphasize the unified engine" — instead say "reference Volvo Group — 15 facilities, 2M records/day with cross-plant DQ rules."
- proof_point_highlights: Pick the 2-3 BEST stories for this deal. "role" = "primary" (lead story), "scale" (impressive at-scale reference), "backup" (different angle). Only include stories from the CUSTOMER VALUE STORIES section above.
- differentiator_plays: 1-3 items. Each MUST link back to a proof point customer in "backed_by". If a differentiator has no relevant proof point, omit it.
- risks: 2-4 items. Include overdue tasks, stale SE comments, MEDDPICC gaps, timeline concerns.
- discovery_questions: 2-4 natural questions tied to gaps.
- FORMATTING: In all text fields (deal_context, talking_points, risks.text, discovery_questions), wrap customer names, concrete metrics/stats, differentiator names, and MEDDPICC field names in **double asterisks** for emphasis. Example: "Lead with **Scout Motors** — **40% fewer DQ incidents** in **4 months** with **Capgemini**."
- Be concise. No filler. Every sentence actionable.
- Return ONLY valid JSON, no markdown fences.`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const raw = (textBlock && textBlock.type === 'text' ? textBlock.text : '{}').trim()
      .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await failJob(job.id, 'parse_failed');
      res.status(500).json(err('Failed to parse AI response — try again'));
      return;
    }

    // Normalize: ensure arrays exist even if Claude omits them
    if (!Array.isArray(parsed.proof_point_highlights)) parsed.proof_point_highlights = [];
    if (!Array.isArray(parsed.differentiator_plays)) parsed.differentiator_plays = [];

    // Cache the brief
    await query(
      `INSERT INTO ai_summary_cache (key, content, generated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET content = $2, generated_at = now()`,
      [`call-prep-${id}`, JSON.stringify(parsed)]
    );

    await completeJob(job.id);
    res.json(ok({
      brief: parsed,
      generated_at: new Date().toISOString(),
    }));
  } catch (e) {
    await failJob(job.id, e instanceof Error ? e.message : String(e));
    console.error('[call-prep/generate] error:', e);
    res.status(500).json(err(e instanceof Error ? e.message : 'Failed to generate brief'));
  }
});

// ─── Demo Prep ────────────────────────────────────────────────────────────────

// GET /opportunities/:id/demo-prep — cached result + staleness check
router.get('/:id/demo-prep', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }

  try {
    const cached = await queryOne<{ content: string; generated_at: string }>(
      `SELECT content, generated_at FROM ai_summary_cache WHERE key = $1`,
      [`demo-prep-${id}`]
    );

    let demoPrep: unknown = null;
    let generatedAt: string | null = null;
    let isStale = true;

    if (cached) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      isStale = age > 30 * 24 * 60 * 60 * 1000; // 30 days
      try { demoPrep = JSON.parse(cached.content); } catch { demoPrep = null; }
      generatedAt = cached.generated_at;
      if (!demoPrep) isStale = true;
    }

    res.json(ok({ demo_prep: demoPrep, generated_at: generatedAt, is_stale: isStale }));
  } catch (e) {
    console.error('[demo-prep] error:', e);
    res.status(500).json(err('Failed to load demo prep data'));
  }
});

// POST /opportunities/:id/demo-prep/generate — AI-powered demo readiness assessment
router.post('/:id/demo-prep/generate', auth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid opportunity id')); return; }
  const userId = (req as AuthenticatedRequest).user?.userId ?? null;
  const job = await startJob({ key: `demo-prep-${id}`, feature: 'demo-prep', opportunityId: id, userId });

  try {
    const [opp, tasks, notes] = await Promise.all([
      queryOne<Record<string, unknown>>(
        `SELECT o.*, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.id = $1`,
        [id]
      ),
      query(
        `SELECT t.title, t.status, t.due_date, t.is_next_step, t.description
         FROM tasks t WHERE t.opportunity_id = $1 AND t.is_deleted = false
         ORDER BY t.is_next_step DESC, t.due_date ASC NULLS LAST`,
        [id]
      ),
      query(
        `SELECT n.content, u.name AS author_name, n.created_at
         FROM notes n JOIN users u ON u.id = n.author_id
         WHERE n.opportunity_id = $1 ORDER BY n.created_at DESC LIMIT 25`,
        [id]
      ),
    ]);

    if (!opp) { res.status(404).json(err('Opportunity not found')); return; }

    const formatDate = (d: unknown) => d ? new Date(d as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
    const formatARR = (a: unknown) => a ? `$${(Number(a) / 1000).toFixed(0)}K` : 'N/A';

    const meddpiccContext = MEDDPICC_KEYS.map(f => {
      const val = opp[f.key] as string | null;
      return `${f.label}: ${val?.trim() || '(empty)'}`;
    }).join('\n');

    const taskLines = tasks.length
      ? tasks.map((t: Record<string, unknown>) =>
          `- [${t.is_next_step ? 'NEXT STEP' : t.status}] ${t.title}${t.due_date ? ` (due ${formatDate(t.due_date)})` : ''}${t.description ? ` — ${t.description}` : ''}`
        ).join('\n')
      : 'No tasks.';

    const noteLines = notes.length
      ? [...notes].reverse().map((n: Record<string, unknown>) =>
          `[${formatDate(n.created_at)} — ${n.author_name}]: ${n.content}`
        ).join('\n')
      : 'No notes yet.';

    const prompt = `You are an expert presales demo coach for an enterprise B2B data management software company (Ataccama). You are evaluating how prepared a Sales Engineer (SE) is to deliver a high-impact demo.

Your framework is the "Golden Standard Informed Demo (L2)" — the 6-Question Demo Check. For each question, analyze ALL available deal data (MEDDPICC fields, notes, tasks, SF comments) and extract the best possible answer, or identify what's missing.

THE 6-QUESTION DEMO CHECK:
1. "What initiative are we anchoring to?" — Not "data quality." The actual program or business driver. Clearly restate why they are evaluating us, name the specific pains we agreed on, define what "good" looks like before touching the UI. If we can't say this clearly, we're not ready to demo.
2. "What is the primary pain we are addressing?" — Be specific. If we can't say it in one sentence, it's not clear enough. Show the current risk or inefficiency. Let them recognize their own situation. No tension, no impact.
3. "What is the single objective of this demo?" — What must they walk away understanding? One primary objective, one end-to-end flow, no side tracks. Clarity beats coverage.
4. "What job are we solving?" — Name the job first, then show how we solve it. Explain cause and effect. We demo outcomes, not screens.
5. "What is the impact if this works?" — Risk reduced? Cost avoided? Revenue enabled? Make it explicit. Do not assume they connect the dots. If we don't translate, we compete on features.
6. "What commitment are we asking for?" — Shortlist confirmation, validation workshop, executive alignment, defined success criteria, PoC scope agreement. A good demo moves the deal forward.

DEMO LEVEL CALIBRATION:
- D1 Exploratory: Early engagement, limited discovery. Goal: shape initiative, elevate pain, qualify.
- D2 Informed: Confirmed initiative and defined pains. Goal: prove alignment and advance.
- D3 Prescriptive: Shortlist, competitive eval, decision criteria known. Goal: differentiate, reduce decision risk.
- D4 Executive: Investment justification, economic buyer engaged. Goal: secure leadership confidence.

WHAT A HIGH-IMPACT DEMO LOOKS LIKE:
- We demonstrate clear understanding of their business driver from the start
- We show the broken state clearly before introducing the fix
- One primary storyline runs from problem to resolution (avoid feature detours)
- Capability is always tied to impact
- The audience knows what changes if they move forward
- Spend 50% of prep time on the first 20% of the demo flow (the opening and problem framing)

DEAL CONTEXT:
Opportunity: ${opp.name}
Account: ${opp.account_name ?? 'N/A'}
Industry: ${opp.account_industry ?? 'N/A'}
Stage: ${opp.stage ?? 'N/A'}
ARR: ${formatARR(opp.arr)}
Close Date: ${formatDate(opp.close_date)}
Deploy Mode: ${opp.deploy_mode ?? 'N/A'}
Products: ${(opp.products as string[] ?? []).join(', ') || 'N/A'}
Competitors: ${opp.engaged_competitors ?? 'N/A'}
PoC Status: ${opp.poc_status ?? 'N/A'}
Record Type: ${opp.record_type ?? 'N/A'}
SE Owner: ${opp.se_owner_name ?? 'N/A'}
AE Owner: ${opp.ae_owner_name ?? 'N/A'}

SF Next Step: ${opp.next_step_sf ?? '(empty)'}
SE Comments: ${opp.se_comments ?? '(empty)'}
Manager Comments: ${opp.manager_comments ?? '(empty)'}
PSM Comments: ${opp.psm_comments ?? '(empty)'}
Technical Blockers: ${opp.technical_blockers ?? '(empty)'}

MEDDPICC STATUS:
${meddpiccContext}

TASKS:
${taskLines}

NOTES (oldest to newest):
${noteLines}

INSTRUCTIONS:
1. For each of the 6 questions, assess confidence as "strong" (clear evidence from multiple or authoritative sources), "partial" (some signal but gaps), or "missing" (no evidence).
2. Extract the best answer you can from the data. For "partial" or "missing", explain what IS known and what's NOT.
3. Provide specific evidence citations with source labels like "Note (Apr 5)", "MEDDPICC Pain", "SE Comments", "Next Step SF", etc.
4. For gaps, provide actionable coaching: who to ask, what specific question to ask, phrased naturally as an SE would say it.
5. For Q6 (commitment), suggest appropriate commitments for the current deal stage.
6. Determine the demo level (D1-D4) based on HOW MUCH IS ACTUALLY KNOWN, not just the pipeline stage.
7. Generate a "Before You Demo" checklist of 6 items based on the Golden Standard principles, marking each as done (true) or not done (false) based on evidence.
8. Use **double asterisks** for emphasis on key terms, names, numbers, and findings.
9. BE CONCISE. Each answer should be 1-3 sentences max. Evidence items should be short (under 20 words each). Coaching tips should be 1-2 sentences. The overall_assessment should be 2-3 sentences. Do NOT write paragraphs — this is a dashboard, not an essay.

Respond in this exact JSON format (no markdown fences, just raw JSON):
{
  "demo_level": "D1"|"D2"|"D3"|"D4",
  "demo_level_label": "Exploratory"|"Informed"|"Prescriptive"|"Executive",
  "demo_level_reasoning": "One sentence explaining why this level was chosen",
  "questions_answered": <number of questions with confidence "strong">,
  "total_questions": 6,
  "questions": [
    {
      "question_number": 1,
      "question": "What initiative are we anchoring to?",
      "confidence": "strong"|"partial"|"missing",
      "answer": "Full answer text with **bold** emphasis",
      "evidence": [
        { "source": "Note (Apr 5)", "text": "relevant quote or paraphrase" }
      ],
      "missing": [
        { "category": "Cost avoided", "detail": "No estimate of manual effort cost" }
      ],
      "coaching_tip": "Specific actionable advice",
      "suggested_commitments": ["only for Q6"]
    }
  ],
  "overall_assessment": "2-3 sentence narrative summary",
  "before_you_demo": [
    { "text": "Checklist item text", "done": true|false }
  ]
}`;

    console.log(`[demo-prep] Calling Anthropic API for opp ${id}...`);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find(b => b.type === 'text');
    const raw = text && text.type === 'text' ? text.text : '';
    console.log(`[demo-prep] Response received for opp ${id}, length=${raw.length}, stop_reason=${response.stop_reason}`);

    let parsed: unknown;
    try {
      const cleaned = raw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error(`[demo-prep] JSON parse failed for opp ${id}:`, parseErr, '\nRaw:', raw.slice(0, 500));
      await failJob(job.id, 'parse_failed');
      res.json(ok({ demo_prep: null, raw, error: 'parse_failed' }));
      return;
    }

    // Cache result
    await query(
      `INSERT INTO ai_summary_cache (key, content, generated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET content = $2, generated_at = now()`,
      [`demo-prep-${id}`, JSON.stringify(parsed)]
    );

    await completeJob(job.id);
    console.log(`[demo-prep] Success for opp ${id}`);
    res.json(ok({ demo_prep: parsed, generated_at: new Date().toISOString() }));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await failJob(job.id, msg);
    console.error(`[demo-prep] Error for opp ${req.params.id}:`, msg);
    res.status(500).json(err(`Demo Prep failed: ${msg}`));
  }
});

export default router;
