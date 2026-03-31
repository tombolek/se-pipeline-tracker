import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { ok } from '../types/index.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const mgr  = requireManager as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /insights/stage-movement?days=7|14|30
router.get('/stage-movement', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const days = parseInt((req.query.days as string) ?? '14') || 14;

  const rows = await query(
    `SELECT
       o.id, o.name, o.account_name, o.arr, o.arr_currency,
       o.stage         AS current_stage,
       o.previous_stage,
       o.stage_changed_at,
       o.ae_owner_name,
       u.id   AS se_owner_id,
       u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.stage_changed_at >= now() - ($1 || ' days')::interval
       AND o.stage_changed_at IS NOT NULL
     ORDER BY o.stage_changed_at DESC`,
    [days]
  );

  res.json(ok(rows, { days }));
});

// GET /insights/missing-notes?threshold_days=21
router.get('/missing-notes', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const threshold = parseInt((req.query.threshold_days as string) ?? '21') || 21;

  const rows = await query(
    `SELECT
       o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
       o.se_comments_updated_at,
       CASE
         WHEN o.se_comments_updated_at IS NULL THEN NULL
         ELSE EXTRACT(DAY FROM now() - o.se_comments_updated_at)::integer
       END AS days_since_update,
       u.id   AS se_owner_id,
       u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.is_active = true
       AND o.is_closed_lost = false
       AND o.stage != 'Qualify'
       AND (
         o.se_comments_updated_at IS NULL
         OR o.se_comments_updated_at < now() - ($1 || ' days')::interval
       )
     ORDER BY o.se_comments_updated_at ASC NULLS FIRST`,
    [threshold]
  );

  res.json(ok(rows, { threshold_days: threshold }));
});

// GET /insights/team-workload
router.get('/team-workload', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       u.id,
       u.name,
       u.email,
       COUNT(DISTINCT o.id)                                                          AS opp_count,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.status != 'done')        AS open_tasks,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.status != 'done'
                             AND t.due_date < CURRENT_DATE)                          AS overdue_tasks,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.is_next_step = true
                             AND t.status != 'done')                                 AS next_steps
     FROM users u
     LEFT JOIN opportunities o ON o.se_owner_id = u.id
       AND o.is_active = true AND o.is_closed_lost = false
     LEFT JOIN tasks t ON t.assigned_to_id = u.id
     WHERE u.role = 'se' AND u.is_active = true
     GROUP BY u.id, u.name, u.email
     ORDER BY u.name`
  );

  res.json(ok(rows));
});

// GET /insights/overdue-tasks
router.get('/overdue-tasks', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       t.id, t.title, t.due_date, t.status, t.is_next_step,
       t.opportunity_id,
       o.name  AS opportunity_name,
       o.stage AS opportunity_stage,
       u.id    AS assigned_to_id,
       u.name  AS assigned_to_name
     FROM tasks t
     JOIN opportunities o ON o.id = t.opportunity_id
     LEFT JOIN users u ON u.id = t.assigned_to_id
     WHERE t.is_deleted = false
       AND t.status NOT IN ('done')
       AND t.due_date < CURRENT_DATE
     ORDER BY u.name ASC NULLS LAST, t.due_date ASC`
  );

  // Group by SE
  const grouped: Record<string, { se_name: string; se_id: number | null; tasks: unknown[] }> = {};
  for (const row of rows as Record<string, unknown>[]) {
    const key = String(row.assigned_to_id ?? 'unassigned');
    if (!grouped[key]) {
      grouped[key] = {
        se_id: row.assigned_to_id as number | null,
        se_name: (row.assigned_to_name as string) ?? 'Unassigned',
        tasks: [],
      };
    }
    grouped[key].tasks.push(row);
  }

  res.json(ok(Object.values(grouped)));
});

// GET /insights/rfx  — all opps with a rfx_status set
router.get('/rfx', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
       o.rfx_status,
       o.ae_owner_name,
       o.is_closed_lost,
       u.id   AS se_owner_id,
       u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.rfx_status IS NOT NULL AND o.rfx_status != ''
     ORDER BY o.name ASC`
  );

  res.json(ok(rows));
});

// GET /insights/poc  — all opps with a poc_status set
router.get('/poc', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
       o.poc_status, o.poc_start_date, o.poc_end_date, o.poc_type,
       o.ae_owner_name,
       o.is_closed_lost,
       u.id   AS se_owner_id,
       u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.poc_status IS NOT NULL AND o.poc_status != ''
     ORDER BY o.poc_start_date ASC NULLS LAST, o.name ASC`
  );

  res.json(ok(rows));
});

// GET /insights/deploy-mode — all active opps grouped by deploy mode
router.get('/deploy-mode', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
       o.deploy_mode, o.deploy_location,
       o.close_date, o.fiscal_period,
       o.se_comments, o.se_comments_updated_at,
       o.agentic_qual,
       o.technical_blockers,
       o.ae_owner_name,
       u.id   AS se_owner_id,
       u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.is_active = true AND o.is_closed_lost = false
     ORDER BY o.deploy_mode ASC NULLS LAST, o.arr DESC NULLS LAST`
  );
  res.json(ok(rows));
});

export default router;
