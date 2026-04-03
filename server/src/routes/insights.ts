import Anthropic from '@anthropic-ai/sdk';
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
       AND EXISTS (
         SELECT 1 FROM opportunities op
         WHERE op.id = t.opportunity_id
           AND op.is_active = true AND op.is_closed_lost = false
       )
     WHERE u.is_active = true
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
       AND o.is_active = true AND o.is_closed_lost = false
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
     WHERE o.rfx_status IS NOT NULL AND o.rfx_status != '' AND o.is_active = true
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
     WHERE o.poc_status IS NOT NULL AND o.poc_status != '' AND o.is_active = true
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

// GET /insights/closed-lost-stats?days=30|90|365|0 (0 = all time)
router.get('/closed-lost-stats', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const days = parseInt((req.query.days as string) ?? '0') || 0;

  const rows = await query(
    `SELECT
       o.id, o.name, o.account_name,
       o.stage, o.previous_stage,
       o.arr, o.arr_currency,
       o.record_type,
       o.team,
       o.ae_owner_name,
       o.closed_at,
       u.id   AS se_owner_id,
       u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.is_closed_lost = true
       ${days > 0 ? 'AND o.closed_at >= now() - ($1 || \' days\')::interval' : ''}
     ORDER BY o.closed_at DESC NULLS LAST`,
    days > 0 ? [days] : []
  );

  res.json(ok(rows, { days }));
});

// ── Technical Blockers ────────────────────────────────────────────────────────

// GET /insights/tech-blockers  — all active opps that have technical_blockers content
// Returns a `blocker_status` field: 'red' | 'orange' | 'yellow' | 'green' | 'none'
router.get('/tech-blockers', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
            o.deploy_mode, o.technical_blockers, o.updated_at,
            u.name AS se_owner_name,
            CASE
              WHEN o.technical_blockers ~ '^🔴' THEN 'red'
              WHEN o.technical_blockers ~ '^🟠' THEN 'orange'
              WHEN o.technical_blockers ~ '^🟡' THEN 'yellow'
              WHEN o.technical_blockers ~ '^🟢' THEN 'green'
              ELSE 'none'
            END AS blocker_status
     FROM opportunities o
     LEFT JOIN users u ON o.se_owner_id = u.id
     WHERE o.is_active = true AND o.is_closed_lost = false
       AND o.technical_blockers IS NOT NULL AND length(o.technical_blockers) > 0
     ORDER BY
       CASE WHEN o.technical_blockers ~ '^🔴' THEN 1
            WHEN o.technical_blockers ~ '^🟠' THEN 2
            WHEN o.technical_blockers ~ '^🟡' THEN 3
            WHEN o.technical_blockers ~ '^🟢' THEN 5
            ELSE 4
       END,
       u.name NULLS LAST, o.name`
  );
  res.json(ok(rows));
});

// GET /insights/tech-blockers/recent?days=30  — recently changed from field history
router.get('/tech-blockers/recent', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const days = parseInt((req.query.days as string) ?? '30') || 30;
  const rows = await query(
    `SELECT o.id, o.name, o.account_name, o.stage, o.deploy_mode,
            h.old_value, h.new_value, h.changed_at,
            u.name AS se_owner_name
     FROM opportunity_field_history h
     JOIN opportunities o ON h.opportunity_id = o.id
     LEFT JOIN users u ON o.se_owner_id = u.id
     WHERE h.field_name = 'technical_blockers'
       AND h.changed_at > now() - (interval '1 day' * $1)
       AND o.is_active = true AND o.is_closed_lost = false
     ORDER BY h.changed_at DESC`,
    [days]
  );
  res.json(ok(rows, { days }));
});

// GET /insights/tech-blockers/ai-summary/cached  — return persisted summary if any
router.get('/tech-blockers/ai-summary/cached', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<{ content: string; generated_at: string }>(
    `SELECT content, generated_at FROM ai_summary_cache WHERE key = 'tech-blockers'`
  );
  if (rows.length === 0) {
    res.json(ok(null));
    return;
  }
  res.json(ok({ summary: rows[0].content, generated_at: rows[0].generated_at }));
});

// POST /insights/tech-blockers/ai-summary  — Claude-powered summary of all blockers
router.post('/tech-blockers/ai-summary', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const rows = await query<{
    name: string; account_name: string; se_owner_name: string | null;
    deploy_mode: string | null; stage: string; technical_blockers: string;
    blocker_status: string;
  }>(
    `SELECT o.name, o.account_name, o.stage, o.deploy_mode, o.technical_blockers,
            u.name AS se_owner_name,
            CASE
              WHEN o.technical_blockers ~ '^🔴' THEN 'red'
              WHEN o.technical_blockers ~ '^🟠' THEN 'orange'
              WHEN o.technical_blockers ~ '^🟡' THEN 'yellow'
              WHEN o.technical_blockers ~ '^🟢' THEN 'green'
              ELSE 'none'
            END AS blocker_status
     FROM opportunities o
     LEFT JOIN users u ON o.se_owner_id = u.id
     WHERE o.is_active = true AND o.is_closed_lost = false
       AND o.technical_blockers IS NOT NULL AND length(o.technical_blockers) > 0
     ORDER BY
       CASE
         WHEN o.technical_blockers ~ '^🔴' THEN 1
         WHEN o.technical_blockers ~ '^🟠' THEN 2
         WHEN o.technical_blockers ~ '^🟡' THEN 3
         ELSE 4
       END, o.name`
  );

  if (rows.length === 0) {
    res.json(ok({ summary: 'No technical blockers have been recorded yet.' }));
    return;
  }

  const severityLabel: Record<string, string> = {
    red: '[CRITICAL]', orange: '[HIGH]', yellow: '[MEDIUM]', green: '[LOW/NONE]', none: '[UNRATED]',
  };
  const context = rows.map(r =>
    `${severityLabel[r.blocker_status] ?? '[UNRATED]'} ${r.name} (${r.account_name}) — SE: ${r.se_owner_name ?? 'Unassigned'}, Stage: ${r.stage}, Deploy: ${r.deploy_mode ?? 'N/A'}\n  ${r.technical_blockers}`
  ).join('\n\n');

  const redCount = rows.filter(r => r.blocker_status === 'red').length;
  const orangeCount = rows.filter(r => r.blocker_status === 'orange').length;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are analyzing technical blockers across a software sales engineering pipeline (${rows.length} opportunities total: ${redCount} critical 🔴, ${orangeCount} high 🟠, rest medium/low/unrated).

Each entry is prefixed with its severity: [CRITICAL], [HIGH], [MEDIUM], [LOW/NONE], or [UNRATED]. Weight your analysis accordingly — critical and high blockers should drive the conclusions.

${context}

Write a structured analysis for the SE Manager. Use this exact format with markdown:

## Most Common Blocker Themes
Identify the 3-5 dominant patterns. For each theme, open with a short bold header on its own line, then a paragraph, then a short bullet list of the specific affected accounts. Weight your ordering by severity — themes that have more critical/high entries should rank higher even if they appear in fewer deals.

## Most Affected Deployment Modes & Stages
Paragraph analysis of which deployment modes (Agentic, SaaS, Self-managed, etc.) and pipeline stages carry the most blocker density and severity.

## Top Priorities for SE Manager
A numbered list of the 2-3 highest-leverage actions the SE manager should take, with brief rationale. Focus on systemic issues rather than account-by-account firefighting.`,
    }],
  });

  const summary = response.content.find(b => b.type === 'text')?.text ?? '';

  // Persist to cache
  await query(
    `INSERT INTO ai_summary_cache (key, content, generated_at)
     VALUES ('tech-blockers', $1, now())
     ON CONFLICT (key) DO UPDATE SET content = $1, generated_at = now()`,
    [summary]
  );

  res.json(ok({ summary, generated_at: new Date().toISOString(), count: rows.length, red: redCount, orange: orangeCount }));
});

export default router;
