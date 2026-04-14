import Anthropic from '@anthropic-ai/sdk';
import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { startJob, completeJob, failJob } from '../services/aiJobs.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const mgr  = requireManager as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /insights/stage-movement?days=7|14|30
// Uses the per-stage SF date fields (stage_date_*) to surface EVERY stage entered
// within the window — not just the most recent transition. A deal that moved
// Build Value → Proposal Sent → Negotiate in one week shows up as 3 rows.
router.get('/stage-movement', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const days = parseInt((req.query.days as string) ?? '14') || 14;

  const rows = await query(
    `WITH stage_entries AS (
       SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency, o.ae_owner_name,
              o.team,
              o.se_owner_id,
              u.id   AS u_id,
              u.name AS u_name,
              x.stage_name,
              x.stage_date
       FROM opportunities o
       LEFT JOIN users u ON u.id = o.se_owner_id
       CROSS JOIN LATERAL (VALUES
         ('Qualify',               o.stage_date_qualify),
         ('Develop Solution',      o.stage_date_develop_solution),
         ('Build Value',           o.stage_date_build_value),
         ('Proposal Sent',         o.stage_date_proposal_sent),
         ('Submitted for Booking', o.stage_date_submitted_for_booking),
         ('Negotiate',             o.stage_date_negotiate),
         ('Closed Won',            o.stage_date_closed_won),
         ('Closed Lost',           o.stage_date_closed_lost)
       ) AS x(stage_name, stage_date)
       WHERE x.stage_date IS NOT NULL
     ),
     ranked AS (
       SELECT *,
         LAG(stage_name) OVER (
           PARTITION BY id
           ORDER BY stage_date,
             CASE stage_name
               WHEN 'Qualify' THEN 1 WHEN 'Develop Solution' THEN 2
               WHEN 'Build Value' THEN 3 WHEN 'Proposal Sent' THEN 4
               WHEN 'Submitted for Booking' THEN 5 WHEN 'Negotiate' THEN 6
               WHEN 'Closed Won' THEN 7 WHEN 'Closed Lost' THEN 8
             END
         ) AS previous_stage
       FROM stage_entries
     )
     SELECT id, name, account_name, arr, arr_currency, ae_owner_name,
            team,
            u_id AS se_owner_id, u_name AS se_owner_name,
            stage_name AS current_stage,
            previous_stage,
            stage_date AS stage_changed_at
     FROM ranked
     WHERE stage_date >= CURRENT_DATE - ($1 || ' days')::interval
     ORDER BY stage_date DESC, id`,
    [days]
  );

  res.json(ok(rows, { days }));
});

// GET /insights/missing-notes?threshold_days=21
router.get('/missing-notes', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const threshold = parseInt((req.query.threshold_days as string) ?? '21') || 21;
  const seId = req.query.se_id ? parseInt(req.query.se_id as string) : null;

  const params: unknown[] = [threshold];
  const seFilter = seId ? `AND o.se_owner_id = $${params.push(seId)}` : '';

  const rows = await query(
    `SELECT
       o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
       o.team,
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
       ${seFilter}
     ORDER BY o.se_comments_updated_at ASC NULLS FIRST`,
    params
  );

  res.json(ok(rows, { threshold_days: threshold, se_id: seId }));
});

// GET /insights/team-workload
router.get('/team-workload', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       u.id,
       u.name,
       u.email,
       COUNT(DISTINCT o.id)                                                                        AS opp_count,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.status != 'done')                     AS open_tasks,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.status != 'done'
                             AND t.due_date < CURRENT_DATE)                                        AS overdue_tasks,
       COUNT(t.id) FILTER (WHERE t.is_deleted = false AND t.is_next_step = true
                             AND t.status != 'done')                                               AS next_steps,
       COUNT(DISTINCT o.id) FILTER (
         WHERE o.se_comments_updated_at >= now() - interval '7 days'
       )                                                                                           AS fresh_comments,
       COUNT(DISTINCT o.id) FILTER (
         WHERE o.stage != 'Qualify'
           AND (o.se_comments_updated_at IS NULL
                OR o.se_comments_updated_at < now() - interval '21 days')
       )                                                                                           AS stale_comments,
       COALESCE((
         SELECT json_agg(json_build_object('team', t.team, 'count', t.cnt) ORDER BY t.cnt DESC)
         FROM (
           SELECT o2.team, COUNT(*)::int AS cnt
           FROM opportunities o2
           WHERE o2.se_owner_id = u.id
             AND o2.is_active = true AND o2.is_closed_lost = false
             AND o2.team IS NOT NULL AND o2.team != ''
           GROUP BY o2.team
         ) t
       ), '[]'::json)                                                                             AS team_breakdown
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
       o.rfx_status, o.team, o.record_type,
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
       o.poc_status, o.poc_start_date, o.poc_end_date, o.poc_type, o.poc_deploy_type,
       o.ae_owner_name, o.team,
       o.is_closed_lost,
       u.id   AS se_owner_id,
       u.name AS se_owner_name,
       CASE
         WHEN o.poc_end_date IS NULL THEN NULL
         ELSE (o.poc_end_date::date - CURRENT_DATE)
       END AS days_remaining
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.poc_status IS NOT NULL AND o.poc_status != '' AND o.is_active = true
     ORDER BY
       CASE WHEN o.poc_end_date IS NULL THEN 2 ELSE 1 END ASC,
       (o.poc_end_date::date - CURRENT_DATE) ASC,
       o.name ASC`
  );

  res.json(ok(rows));
});

// GET /insights/deploy-mode — currently open opps grouped by deploy mode
// (excludes Closed Won and Closed Lost)
router.get('/deploy-mode', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
       o.deploy_mode, o.deploy_location,
       o.close_date, o.fiscal_period,
       o.team,
       o.se_comments, o.se_comments_updated_at,
       o.agentic_qual,
       o.technical_blockers,
       o.ae_owner_name,
       u.id   AS se_owner_id,
       u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.is_active = true AND o.is_closed_lost = false AND o.is_closed_won = false
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
       o.account_segment,
       o.account_industry,
       o.engaged_competitors,
       o.ae_owner_name,
       o.closed_at, o.first_seen_at,
       EXTRACT(DAY FROM o.closed_at - o.first_seen_at)::integer AS days_in_pipeline,
       u.id   AS se_owner_id,
       u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.is_closed_lost = true
       -- Exclude deals lost in Qualify — they were never qualified pipeline.
       AND (o.stage IS NULL OR o.stage <> 'Qualify')
       ${days > 0 ? 'AND o.closed_at >= now() - ($1 || \' days\')::interval' : ''}
     ORDER BY o.closed_at DESC NULLS LAST`,
    days > 0 ? [days] : []
  );

  res.json(ok(rows, { days }));
});

// ── Closed Won by Territory (Issue #94) ──────────────────────────────────────
// GET /insights/closed-won-by-territory?fiscal_year=FY2026&fiscal_period=FY2026-Q1
//
// Returns raw Closed Won deals (new-business record types only) so the client
// can group/aggregate flexibly. `meta.fiscal_years` is the list of distinct
// fiscal years present in new-business Closed Won data, for the FY dropdown.
router.get('/closed-won-by-territory', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const fiscalYear = (req.query.fiscal_year as string | undefined) || null;
  const fiscalPeriod = (req.query.fiscal_period as string | undefined) || null;

  const conditions: string[] = [
    `o.is_closed_won = true`,
    `o.record_type IN ('New Logo', 'Upsell', 'Cross-Sell')`,
  ];
  const params: unknown[] = [];
  if (fiscalYear) {
    params.push(fiscalYear);
    conditions.push(`o.fiscal_year = $${params.length}`);
  }
  if (fiscalPeriod) {
    params.push(fiscalPeriod);
    conditions.push(`o.fiscal_period = $${params.length}`);
  }

  const rows = await query(
    `SELECT o.id, o.sf_opportunity_id, o.name, o.account_name,
            o.team, o.record_type,
            o.arr, o.arr_converted, o.arr_currency,
            o.fiscal_year, o.fiscal_period,
            o.close_date, o.closed_at,
            o.ae_owner_name,
            u.id AS se_owner_id, u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY o.team ASC NULLS LAST, u.name ASC NULLS LAST, o.arr_converted DESC NULLS LAST`,
    params
  );

  // Distinct fiscal years available (new-business Closed Won only)
  const fyRows = await query<{ fiscal_year: string }>(
    `SELECT DISTINCT fiscal_year
     FROM opportunities
     WHERE is_closed_won = true
       AND record_type IN ('New Logo', 'Upsell', 'Cross-Sell')
       AND fiscal_year IS NOT NULL AND fiscal_year != ''
     ORDER BY fiscal_year DESC`
  );

  res.json(ok(rows, {
    fiscal_years: fyRows.map(r => r.fiscal_year),
    filters: { fiscal_year: fiscalYear, fiscal_period: fiscalPeriod },
  }));
});

// ── % to Target (Issue #94) ──────────────────────────────────────────────────
// GET /insights/percent-to-target?fiscal_year=FY2026
//
// Returns each quota group's progress: target, total Closed Won ARR (USD),
// matching deals, and a 12-month cumulative % series for the pacing chart.
// New business only (New Logo + Upsell + Cross-Sell), same as Closed Won page.
router.get('/percent-to-target', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const fiscalYear = (req.query.fiscal_year as string | undefined) || null;

  type QuotaGroup = {
    id: number; name: string; rule_type: 'global' | 'teams' | 'ae_owners';
    rule_value: unknown; target_amount: string; sort_order: number;
  };
  const groups = await query<QuotaGroup>(
    `SELECT id, name, rule_type, rule_value, target_amount, sort_order
     FROM quota_groups
     ORDER BY sort_order ASC, id ASC`
  );

  // Distinct fiscal years available for the FY dropdown
  const fyRows = await query<{ fiscal_year: string }>(
    `SELECT DISTINCT fiscal_year FROM opportunities
     WHERE is_closed_won = true
       AND record_type IN ('New Logo','Upsell','Cross-Sell')
       AND fiscal_year IS NOT NULL AND fiscal_year != ''
     ORDER BY fiscal_year DESC`
  );

  // Pull the deals once, filter per group in JS
  const conditions: string[] = [
    `o.is_closed_won = true`,
    `o.record_type IN ('New Logo','Upsell','Cross-Sell')`,
  ];
  const params: unknown[] = [];
  if (fiscalYear) {
    params.push(fiscalYear);
    conditions.push(`o.fiscal_year = $${params.length}`);
  }

  type Deal = {
    id: number; sf_opportunity_id: string; name: string; account_name: string | null;
    team: string | null; ae_owner_name: string | null; record_type: string | null;
    arr_converted: string | null;
    fiscal_year: string | null; fiscal_period: string | null;
    close_date: string | null; closed_at: string | null;
    se_owner_name: string | null;
  };
  const deals = await query<Deal>(
    `SELECT o.id, o.sf_opportunity_id, o.name, o.account_name,
            o.team, o.ae_owner_name, o.record_type,
            o.arr_converted,
            o.fiscal_year, o.fiscal_period,
            o.close_date, o.closed_at,
            u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE ${conditions.join(' AND ')}`,
    params
  );

  function ruleMatches(d: Deal, g: QuotaGroup): boolean {
    if (g.rule_type === 'global') return true;
    if (!Array.isArray(g.rule_value)) return false;
    const list = g.rule_value as string[];
    if (g.rule_type === 'teams') return d.team !== null && list.includes(d.team);
    if (g.rule_type === 'ae_owners') return d.ae_owner_name !== null && list.includes(d.ae_owner_name);
    return false;
  }

  function dealMonth(d: Deal): number | null {
    const src = d.closed_at ?? d.close_date;
    if (!src) return null;
    const m = new Date(src).getUTCMonth();
    return isNaN(m) ? null : m; // 0..11
  }
  function dealArr(d: Deal): number {
    const n = parseFloat(d.arr_converted ?? '0');
    return isFinite(n) ? n : 0;
  }

  const groupResults = groups.map(g => {
    const matching = deals.filter(d => ruleMatches(d, g));
    const monthlyArr = new Array(12).fill(0) as number[];
    for (const d of matching) {
      const mIdx = dealMonth(d);
      if (mIdx === null) continue;
      monthlyArr[mIdx] += dealArr(d);
    }
    const cumulativeArr: number[] = [];
    let running = 0;
    for (let m = 0; m < 12; m++) {
      running += monthlyArr[m];
      cumulativeArr.push(running);
    }
    const target = parseFloat(g.target_amount) || 0;
    const cumulativePct = cumulativeArr.map(c => target > 0 ? (c / target) * 100 : 0);
    const totalArr = cumulativeArr[11] ?? 0;
    return {
      id: g.id,
      name: g.name,
      rule_type: g.rule_type,
      rule_value: g.rule_value,
      target_amount: target,
      sort_order: g.sort_order,
      total_arr: totalArr,
      deal_count: matching.length,
      pct: target > 0 ? (totalArr / target) * 100 : 0,
      monthly_cumulative_arr: cumulativeArr,
      monthly_cumulative_pct: cumulativePct,
      deals: matching.map(d => ({
        id: d.id,
        sf_opportunity_id: d.sf_opportunity_id,
        name: d.name,
        account_name: d.account_name,
        team: d.team,
        ae_owner_name: d.ae_owner_name,
        se_owner_name: d.se_owner_name,
        record_type: d.record_type,
        arr_converted: d.arr_converted,
        fiscal_period: d.fiscal_period,
        close_date: d.close_date,
        closed_at: d.closed_at,
      })),
    };
  });

  const today = new Date();
  const currentMonthIdx = today.getUTCMonth(); // 0..11

  res.json(ok({ groups: groupResults }, {
    fiscal_years: fyRows.map(r => r.fiscal_year),
    fiscal_year: fiscalYear,
    today: today.toISOString().slice(0, 10),
    current_month_index: currentMonthIdx,
  }));
});

// GET /insights/ae-owners — distinct AE owners (for the quota group editor)
router.get('/ae-owners', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<{ ae_owner_name: string }>(
    `SELECT DISTINCT ae_owner_name FROM opportunities
     WHERE ae_owner_name IS NOT NULL AND ae_owner_name != ''
     ORDER BY ae_owner_name ASC`
  );
  res.json(ok(rows.map(r => r.ae_owner_name)));
});

// ── Technical Blockers ────────────────────────────────────────────────────────

// GET /insights/tech-blockers  — all active opps that have technical_blockers content
// Returns a `blocker_status` field: 'red' | 'orange' | 'yellow' | 'green' | 'none'
router.get('/tech-blockers', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
            o.deploy_mode, o.team, o.record_type, o.technical_blockers, o.updated_at,
            u.id AS se_owner_id, u.name AS se_owner_name,
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
  const userId = (req as AuthenticatedRequest).user?.userId ?? null;
  const job = await startJob({ key: 'tech-blockers', feature: 'tech-blockers', userId });
  try {
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
    await completeJob(job.id);
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

  await completeJob(job.id);
  res.json(ok({ summary, generated_at: new Date().toISOString(), count: rows.length, red: redCount, orange: orangeCount }));
  } catch (e) {
    await failJob(job.id, e instanceof Error ? e.message : String(e));
    throw e;
  }
});

// ── Agentic Qualification ──────────────────────────────────────────────────────

// GET /insights/agentic-qual  — currently open opps that have agentic_qual content
// (excludes Closed Won and Closed Lost)
router.get('/agentic-qual', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
            o.deploy_mode, o.team, o.record_type, o.agentic_qual, o.updated_at,
            u.id AS se_owner_id, u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON o.se_owner_id = u.id
     WHERE o.is_active = true AND o.is_closed_lost = false AND o.is_closed_won = false
       AND o.agentic_qual IS NOT NULL AND length(o.agentic_qual) > 0
     ORDER BY u.name NULLS LAST, o.name`
  );
  res.json(ok(rows));
});

// GET /insights/agentic-qual/recent?days=30  — recently changed from field history
router.get('/agentic-qual/recent', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const days = parseInt((req.query.days as string) ?? '30') || 30;
  const rows = await query(
    `SELECT o.id, o.name, o.account_name, o.stage, o.deploy_mode,
            h.old_value, h.new_value, h.changed_at,
            u.name AS se_owner_name
     FROM opportunity_field_history h
     JOIN opportunities o ON h.opportunity_id = o.id
     LEFT JOIN users u ON o.se_owner_id = u.id
     WHERE h.field_name = 'agentic_qual'
       AND h.changed_at > now() - (interval '1 day' * $1)
       AND o.is_active = true AND o.is_closed_lost = false AND o.is_closed_won = false
     ORDER BY h.changed_at DESC`,
    [days]
  );
  res.json(ok(rows, { days }));
});

// GET /insights/agentic-qual/ai-summary/cached
router.get('/agentic-qual/ai-summary/cached', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<{ content: string; generated_at: string }>(
    `SELECT content, generated_at FROM ai_summary_cache WHERE key = 'agentic-qual'`
  );
  if (rows.length === 0) { res.json(ok(null)); return; }
  res.json(ok({ summary: rows[0].content, generated_at: rows[0].generated_at }));
});

// POST /insights/agentic-qual/ai-summary
router.post('/agentic-qual/ai-summary', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthenticatedRequest).user?.userId ?? null;
  const job = await startJob({ key: 'agentic-qual', feature: 'agentic-qual', userId });
  try {
  const rows = await query<{
    name: string; account_name: string; se_owner_name: string | null;
    deploy_mode: string | null; stage: string; agentic_qual: string;
  }>(
    `SELECT o.name, o.account_name, o.stage, o.deploy_mode, o.agentic_qual,
            u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON o.se_owner_id = u.id
     WHERE o.is_active = true AND o.is_closed_lost = false AND o.is_closed_won = false
       AND o.agentic_qual IS NOT NULL AND length(o.agentic_qual) > 0
     ORDER BY u.name NULLS LAST, o.name`
  );

  if (rows.length === 0) {
    await completeJob(job.id);
    res.json(ok({ summary: 'No Agentic Qualification data has been recorded yet.' }));
    return;
  }

  const context = rows.map(r =>
    `${r.name} (${r.account_name}) — SE: ${r.se_owner_name ?? 'Unassigned'}, Stage: ${r.stage}, Deploy: ${r.deploy_mode ?? 'N/A'}\n  ${r.agentic_qual}`
  ).join('\n\n');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are analyzing Agentic Qualification data across a software sales engineering pipeline (${rows.length} opportunities). The "Agentic Qual" field explains why a deal is NOT an Agentic opportunity — i.e., why the customer would use the Core platform (PaaS/PaaS+/Self-managed) instead of the Agentic (cloud-only, AI-native) product.

${context}

Write a structured analysis for the SE Manager. Use this exact format with markdown:

## Common Reasons Deals Aren't Agentic
Identify the 3-5 dominant patterns explaining why deals can't be Agentic. For each theme, open with a short bold header on its own line, then a paragraph explaining the pattern, then a short bullet list of the specific affected accounts.

## Deployment Mode & Stage Distribution
Paragraph analysis of which deployment modes and pipeline stages have the most non-Agentic deals, and what this signals about the pipeline.

## Opportunities to Revisit
A numbered list of 2-3 accounts or situations where the Agentic qualification might be re-evaluated, with brief rationale based on their current stage and notes.`,
    }],
  });

  const summary = response.content.find(b => b.type === 'text')?.text ?? '';

  await query(
    `INSERT INTO ai_summary_cache (key, content, generated_at)
     VALUES ('agentic-qual', $1, now())
     ON CONFLICT (key) DO UPDATE SET content = $1, generated_at = now()`,
    [summary]
  );

  await completeJob(job.id);
  res.json(ok({ summary, generated_at: new Date().toISOString(), count: rows.length }));
  } catch (e) {
    await failJob(job.id, e instanceof Error ? e.message : String(e));
    throw e;
  }
});

// GET /insights/weekly-digest?days=7|14|30
router.get('/weekly-digest', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const days = parseInt((req.query.days as string) ?? '7') || 7;

  const [newOpps, stageProgressions, staleDeals, pocsStarted, pocsEnded, closedLost, atRiskCandidates] =
    await Promise.all([
      // New qualified opportunities: opps that entered Build Value within the window.
      // Uses stage_date_build_value (SF-authoritative) when available; falls back to
      // stage_changed_at (import-tracked) or first_seen_at for older records.
      query(
        `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency, o.stage,
                o.close_date, o.ae_owner_name, o.team,
                o.stage_date_build_value,
                u.id AS se_owner_id, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.is_active = true AND o.is_closed_lost = false
           AND o.stage = 'Build Value'
           AND (
             o.stage_date_build_value >= CURRENT_DATE - ($1 || ' days')::interval
             OR (o.stage_date_build_value IS NULL AND o.stage_changed_at >= now() - ($1 || ' days')::interval)
             OR (o.stage_date_build_value IS NULL AND o.stage_changed_at IS NULL AND o.first_seen_at >= now() - ($1 || ' days')::interval)
           )
         ORDER BY COALESCE(o.stage_date_build_value, o.stage_changed_at::date, o.first_seen_at::date) DESC`,
        [days]
      ),

      // Stage progressions within the window — SF-authoritative.
      // Unpivots the per-stage date fields so EVERY stage entered within the window
      // produces a row (catches deals that jumped multiple stages within one week).
      query(
        `WITH stage_entries AS (
           SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency, o.ae_owner_name, o.team,
                  o.se_owner_id,
                  u.id   AS u_id,
                  u.name AS u_name,
                  x.stage_name,
                  x.stage_date
           FROM opportunities o
           LEFT JOIN users u ON u.id = o.se_owner_id
           CROSS JOIN LATERAL (VALUES
             ('Qualify',               o.stage_date_qualify),
             ('Develop Solution',      o.stage_date_develop_solution),
             ('Build Value',           o.stage_date_build_value),
             ('Proposal Sent',         o.stage_date_proposal_sent),
             ('Submitted for Booking', o.stage_date_submitted_for_booking),
             ('Negotiate',             o.stage_date_negotiate),
             ('Closed Won',            o.stage_date_closed_won),
             ('Closed Lost',           o.stage_date_closed_lost)
           ) AS x(stage_name, stage_date)
           WHERE x.stage_date IS NOT NULL
             AND o.is_active = true AND o.is_closed_lost = false
         ),
         ranked AS (
           SELECT *,
             LAG(stage_name) OVER (
               PARTITION BY id
               ORDER BY stage_date,
                 CASE stage_name
                   WHEN 'Qualify' THEN 1 WHEN 'Develop Solution' THEN 2
                   WHEN 'Build Value' THEN 3 WHEN 'Proposal Sent' THEN 4
                   WHEN 'Submitted for Booking' THEN 5 WHEN 'Negotiate' THEN 6
                   WHEN 'Closed Won' THEN 7 WHEN 'Closed Lost' THEN 8
                 END
             ) AS previous_stage
           FROM stage_entries
         )
         SELECT id, name, account_name, arr, arr_currency, ae_owner_name, team,
                u_id AS se_owner_id, u_name AS se_owner_name,
                stage_name AS current_stage,
                previous_stage,
                stage_date AS stage_changed_at
         FROM ranked
         WHERE stage_date >= CURRENT_DATE - ($1 || ' days')::interval
           -- Exclude entries into Qualify; those are surfaced in "New Qualified Opportunities".
           AND stage_name <> 'Qualify'
         ORDER BY stage_date DESC, id`,
        [days]
      ),

      // Stale deals: no in-app notes, no task activity, AND no SE comments update within the window.
      // Any one of these signals being fresh makes the deal not stale.
      query(
        `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency, o.stage,
                o.ae_owner_name, o.team,
                o.last_note_at, o.se_comments_updated_at,
                EXTRACT(DAY FROM now() - GREATEST(
                  o.last_note_at,
                  o.se_comments_updated_at,
                  (SELECT MAX(t.updated_at) FROM tasks t
                   WHERE t.opportunity_id = o.id AND t.is_deleted = false)
                ))::integer AS days_stale,
                u.id AS se_owner_id, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.is_active = true AND o.is_closed_lost = false
           AND o.stage NOT IN ('Qualify', 'Closed Won')
           AND (o.last_note_at IS NULL OR o.last_note_at < now() - ($1 || ' days')::interval)
           AND (o.se_comments_updated_at IS NULL OR o.se_comments_updated_at < now() - ($1 || ' days')::interval)
           AND NOT EXISTS (
             SELECT 1 FROM tasks t
             WHERE t.opportunity_id = o.id
               AND t.is_deleted = false
               AND t.updated_at >= now() - ($1 || ' days')::interval
           )
         ORDER BY days_stale DESC NULLS LAST`,
        [days]
      ),

      // PoCs started within the window
      query(
        `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency, o.stage,
                o.poc_status, o.poc_start_date, o.poc_end_date, o.poc_type, o.team,
                o.ae_owner_name,
                u.id AS se_owner_id, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.is_active = true
           AND o.poc_start_date >= (CURRENT_DATE - ($1 || ' days')::interval)::date
           AND o.poc_start_date <= CURRENT_DATE
         ORDER BY o.poc_start_date DESC`,
        [days]
      ),

      // PoCs ended within the window
      query(
        `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency, o.stage,
                o.poc_status, o.poc_start_date, o.poc_end_date, o.poc_type, o.team,
                o.ae_owner_name,
                u.id AS se_owner_id, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.is_active = true
           AND o.poc_end_date >= (CURRENT_DATE - ($1 || ' days')::interval)::date
           AND o.poc_end_date <= CURRENT_DATE
         ORDER BY o.poc_end_date DESC`,
        [days]
      ),

      // Closed Lost within the window (disappeared from import)
      query(
        `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency,
                o.stage, o.previous_stage,
                o.closed_at, o.ae_owner_name, o.team,
                u.id AS se_owner_id, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.is_closed_lost = true
           AND o.closed_at >= now() - ($1 || ' days')::interval
         ORDER BY o.closed_at DESC`,
        [days]
      ),

      // At-risk candidates: active opps with risk signals — health score computed client-side
      query(
        `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency, o.stage,
                o.ae_owner_name, o.team,
                o.metrics, o.economic_buyer, o.decision_criteria, o.decision_process,
                o.paper_process, o.implicate_pain, o.champion, o.authority, o.need,
                o.se_comments_updated_at, o.last_note_at, o.stage_changed_at,
                (SELECT COUNT(*)::integer FROM tasks t
                 WHERE t.opportunity_id = o.id
                   AND t.is_deleted = false
                   AND t.status != 'done'
                   AND t.due_date < CURRENT_DATE) AS overdue_task_count,
                u.id AS se_owner_id, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.is_active = true AND o.is_closed_lost = false
           AND o.stage NOT IN ('Qualify')
           AND (
             EXISTS (SELECT 1 FROM tasks t WHERE t.opportunity_id = o.id AND t.is_deleted = false AND t.status != 'done' AND t.due_date < CURRENT_DATE)
             OR o.se_comments_updated_at IS NULL
             OR o.se_comments_updated_at < now() - interval '14 days'
           )
         ORDER BY o.se_comments_updated_at ASC NULLS FIRST`
      ),
    ]);

  // Summary stats
  const arrSum = (rows: Record<string, unknown>[]) =>
    rows.reduce((s, r) => s + (parseFloat(String(r.arr ?? '0')) || 0), 0);

  const arrMovedForward = arrSum(stageProgressions as Record<string, unknown>[]);
  const arrClosedLost   = arrSum(closedLost as Record<string, unknown>[]);
  const arrNew          = arrSum(newOpps as Record<string, unknown>[]);

  const summary = {
    arr_moved_forward:  arrMovedForward,
    arr_closed_lost:    arrClosedLost,
    net_pipeline_change: arrNew - arrClosedLost,
    new_opp_count:      (newOpps as unknown[]).length,
    stale_count:        (staleDeals as unknown[]).length,
  };

  res.json({
    data: {
      summary,
      new_opps:            newOpps,
      stage_progressions:  stageProgressions,
      stale_deals:         staleDeals,
      pocs_started:        pocsStarted,
      pocs_ended:          pocsEnded,
      closed_lost:         closedLost,
      at_risk_candidates:  atRiskCandidates,
    },
    error: null,
    meta: { days },
  });
});

// GET /insights/calendar — POCs, RFPs with submission date, and tasks with due dates
// Accessible to all authenticated users; managers see all data, SEs see their own.
router.get('/calendar', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as unknown as { user: { id: number; role: string } }).user;
  const isManager = user.role === 'manager';
  const uid = user.id;

  const seFilter   = isManager ? '' : `AND o.se_owner_id = ${uid}`;
  const taskFilter = isManager ? '' : `AND t.assigned_to_id = ${uid}`;

  const [pocs, rfps, tasks] = await Promise.all([
    query(
      `SELECT o.id, o.name, o.account_name, o.poc_status,
              o.poc_start_date, o.poc_end_date, o.poc_type, o.team,
              u.id   AS se_owner_id,
              u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
        WHERE o.poc_status IS NOT NULL AND o.poc_status != ''
          AND o.is_active = true
          AND (o.poc_start_date IS NOT NULL OR o.poc_end_date IS NOT NULL)
          ${seFilter}
        ORDER BY o.poc_start_date ASC NULLS LAST`
    ),
    query(
      `SELECT o.id, o.name, o.account_name, o.rfx_status, o.rfx_received_date, o.rfx_submission_date, o.team,
              u.id   AS se_owner_id,
              u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
        WHERE o.rfx_status IS NOT NULL AND o.rfx_status != ''
          AND o.is_active = true
          ${seFilter}
        ORDER BY o.rfx_submission_date ASC NULLS LAST`
    ),
    query(
      `SELECT t.id, t.title, t.status, t.due_date, t.is_next_step,
              o.id   AS opportunity_id,
              o.name AS opportunity_name,
              o.team AS opportunity_team,
              u.id   AS assigned_to_id,
              u.name AS assigned_to_name
         FROM tasks t
         JOIN opportunities o ON o.id = t.opportunity_id
         LEFT JOIN users u ON u.id = t.assigned_to_id
        WHERE t.is_deleted = false
          AND t.due_date IS NOT NULL
          ${taskFilter}
        ORDER BY t.due_date ASC`
    ),
  ]);

  res.json(ok({ pocs, rfps, tasks }));
});

// GET /insights/team-tasks — all tasks from active opps with full metadata
router.get('/team-tasks', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       t.id, t.title, t.status, t.due_date, t.is_next_step,
       t.description, t.created_at,
       t.opportunity_id,
       o.name  AS opportunity_name,
       o.stage AS opportunity_stage,
       t.assigned_to_id,
       u.name  AS assigned_to_name
     FROM tasks t
     JOIN opportunities o ON o.id = t.opportunity_id
     LEFT JOIN users u ON u.id = t.assigned_to_id
     WHERE t.is_deleted = false
       AND o.is_active = true AND o.is_closed_lost = false
     ORDER BY
       CASE t.status
         WHEN 'blocked' THEN 1
         WHEN 'open' THEN 2
         WHEN 'in_progress' THEN 3
         WHEN 'done' THEN 4
       END,
       t.due_date ASC NULLS LAST,
       t.created_at DESC`
  );

  res.json(ok(rows));
});

// ── 1:1 Prep (Issue #69) ────────────────────────────────────────────────────
// Manager-facing one-page summary for a specific SE, designed for pre-1:1 prep.
// Aggregates: SE's open opps + health signals, their tasks, stale comments,
// recent stage movements, deals with no next step.

// Small fields subset needed for health score on the server side (mirrors client
// computeHealthScore). We only need the raw fields; the client computes the
// score so it stays in sync with the canonical algorithm.
const ONE_ON_ONE_OPP_FIELDS = `
  o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency, o.close_date,
  o.record_type, o.key_deal, o.team, o.ae_owner_name, o.next_step_sf,
  o.se_comments, o.se_comments_updated_at, o.last_note_at, o.stage_changed_at,
  o.previous_stage, o.technical_blockers, o.engaged_competitors, o.poc_status,
  o.poc_start_date, o.poc_end_date,
  o.metrics, o.economic_buyer, o.decision_criteria, o.decision_process,
  o.paper_process, o.implicate_pain, o.champion, o.authority, o.need,
  (SELECT COUNT(*)::int FROM tasks t
     WHERE t.opportunity_id = o.id AND t.is_deleted = false
       AND t.status IN ('open','in_progress','blocked')) AS open_task_count,
  (SELECT COUNT(*)::int FROM tasks t
     WHERE t.opportunity_id = o.id AND t.is_deleted = false
       AND t.status IN ('open','in_progress','blocked')
       AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE) AS overdue_task_count,
  (SELECT COUNT(*)::int FROM tasks t
     WHERE t.opportunity_id = o.id AND t.is_deleted = false
       AND t.is_next_step = true
       AND t.status IN ('open','in_progress')) AS next_step_count
`;

// GET /insights/one-on-one/:se_id
router.get('/one-on-one/:se_id', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const seId = parseInt(req.params.se_id);
  if (!seId || isNaN(seId)) { res.status(400).json(err('Invalid se_id')); return; }

  const seUser = await queryOne(
    `SELECT id, name, email, role, teams, last_login_at
     FROM users WHERE id = $1 AND is_active = true`,
    [seId]
  );
  if (!seUser) { res.status(404).json(err('SE not found')); return; }

  // Open opps owned by this SE
  const opps = await query(
    `SELECT ${ONE_ON_ONE_OPP_FIELDS}
     FROM opportunities o
     WHERE o.se_owner_id = $1
       AND o.is_active = true
       AND o.is_closed_lost = false
       AND COALESCE(o.is_closed_won, false) = false
     ORDER BY COALESCE(o.arr, 0) DESC NULLS LAST`,
    [seId]
  );

  // Tasks assigned to this SE (or on their opps with no assignee), grouped
  const tasks = await query(
    `SELECT t.id, t.opportunity_id, t.title, t.description, t.status,
            t.is_next_step, t.due_date, t.created_at, t.updated_at,
            o.name AS opportunity_name, o.account_name, o.stage, o.arr, o.arr_currency,
            CASE
              WHEN t.due_date IS NULL THEN 'no_due_date'
              WHEN t.due_date < CURRENT_DATE THEN 'overdue'
              WHEN t.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
              ELSE 'later'
            END AS bucket
     FROM tasks t
     JOIN opportunities o ON o.id = t.opportunity_id
     WHERE t.is_deleted = false
       AND t.status IN ('open','in_progress','blocked')
       AND o.se_owner_id = $1
       AND o.is_active = true
       AND o.is_closed_lost = false
       AND COALESCE(o.is_closed_won, false) = false
     ORDER BY
       CASE
         WHEN t.due_date IS NULL THEN 3
         WHEN t.due_date < CURRENT_DATE THEN 0
         WHEN t.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 1
         ELSE 2
       END,
       t.due_date ASC NULLS LAST`,
    [seId]
  );

  // Recent stage movements (last 14 days) on their deals — reuse SF per-stage date fields
  const stageMovements = await query(
    `WITH stage_entries AS (
       SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency,
              x.stage_name, x.stage_date
       FROM opportunities o
       CROSS JOIN LATERAL (VALUES
         ('Qualify',               o.stage_date_qualify),
         ('Develop Solution',      o.stage_date_develop_solution),
         ('Build Value',           o.stage_date_build_value),
         ('Proposal Sent',         o.stage_date_proposal_sent),
         ('Submitted for Booking', o.stage_date_submitted_for_booking),
         ('Negotiate',             o.stage_date_negotiate),
         ('Closed Won',            o.stage_date_closed_won),
         ('Closed Lost',           o.stage_date_closed_lost)
       ) AS x(stage_name, stage_date)
       WHERE o.se_owner_id = $1 AND x.stage_date IS NOT NULL
     ),
     ranked AS (
       SELECT *,
         LAG(stage_name) OVER (
           PARTITION BY id
           ORDER BY stage_date,
             CASE stage_name
               WHEN 'Qualify' THEN 1 WHEN 'Develop Solution' THEN 2
               WHEN 'Build Value' THEN 3 WHEN 'Proposal Sent' THEN 4
               WHEN 'Submitted for Booking' THEN 5 WHEN 'Negotiate' THEN 6
               WHEN 'Closed Won' THEN 7 WHEN 'Closed Lost' THEN 8
             END
         ) AS previous_stage
       FROM stage_entries
     )
     SELECT id, name, account_name, arr, arr_currency,
            stage_name AS current_stage, previous_stage,
            stage_date AS stage_changed_at
     FROM ranked
     WHERE stage_date >= CURRENT_DATE - INTERVAL '14 days'
     ORDER BY stage_date DESC`,
    [seId]
  );

  // Cached narrative
  const narrativeRow = await queryOne(
    `SELECT content, generated_at FROM ai_summary_cache WHERE key = $1`,
    [`one-on-one-narrative-${seId}`]
  );
  const narrative = narrativeRow
    ? { content: narrativeRow.content as string, generated_at: (narrativeRow.generated_at as Date).toISOString() }
    : null;

  res.json(ok({
    se: seUser,
    opportunities: opps,
    tasks,
    stage_movements: stageMovements,
    narrative,
  }));
});

// POST /insights/one-on-one/:se_id/narrative — AI-generated coaching brief
router.post('/one-on-one/:se_id/narrative', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const seId = parseInt(req.params.se_id);
  if (!seId || isNaN(seId)) { res.status(400).json(err('Invalid se_id')); return; }
  const userId = (req as AuthenticatedRequest).user?.userId ?? null;
  const jobKey = `one-on-one-narrative-${seId}`;

  const seUser = await queryOne<{ id: number; name: string; email: string }>(
    `SELECT id, name, email FROM users WHERE id = $1 AND is_active = true`,
    [seId]
  );
  if (!seUser) { res.status(404).json(err('SE not found')); return; }

  const opps = await query(
    `SELECT ${ONE_ON_ONE_OPP_FIELDS}
     FROM opportunities o
     WHERE o.se_owner_id = $1
       AND o.is_active = true
       AND o.is_closed_lost = false
       AND COALESCE(o.is_closed_won, false) = false
     ORDER BY COALESCE(o.arr, 0) DESC NULLS LAST`,
    [seId]
  );

  if (opps.length === 0) {
    res.status(404).json(err('No open opportunities for this SE'));
    return;
  }

  const MEDDPICC_KEYS = ['metrics','economic_buyer','decision_criteria','decision_process','paper_process','implicate_pain','champion','authority','need'] as const;

  const dealLines = opps.map((r: Record<string, unknown>) => {
    const arr = parseFloat(r.arr as string) || 0;
    const meddpiccFilled = MEDDPICC_KEYS.filter(k => r[k]).length;
    const seStale = r.se_comments_updated_at
      ? Math.floor((Date.now() - new Date(r.se_comments_updated_at as string).getTime()) / 86_400_000)
      : null;
    const stageDays = r.stage_changed_at
      ? Math.floor((Date.now() - new Date(r.stage_changed_at as string).getTime()) / 86_400_000)
      : null;
    return `- ${r.name} | ${r.account_name ?? ''} | $${Math.round(arr/1000)}K | ${r.stage} (${stageDays ?? '?'}d) | MEDDPICC ${meddpiccFilled}/9 | SE comments: ${seStale === null ? 'never' : seStale + 'd ago'} | Overdue tasks: ${r.overdue_task_count ?? 0} | Next step: ${r.next_step_sf || '—'} | Blockers: ${r.technical_blockers || 'None'} | PoC: ${r.poc_status || 'N/A'}`;
  }).join('\n');

  const totalArr = opps.reduce((s: number, r: Record<string, unknown>) => s + (parseFloat(r.arr as string) || 0), 0);
  const overdueCount = opps.reduce((s: number, r: Record<string, unknown>) => s + ((r.overdue_task_count as number) || 0), 0);
  const staleCount = opps.filter((r: Record<string, unknown>) => {
    const upd = r.se_comments_updated_at as string | null;
    if (!upd) return true;
    const days = Math.floor((Date.now() - new Date(upd).getTime()) / 86_400_000);
    return days > 21;
  }).length;

  const prompt = `You are an SE Manager preparing for a 1:1 with ${seUser.name}. Write a concise coaching brief to guide the conversation.

SE: ${seUser.name}
Open pipeline: $${Math.round(totalArr/1000)}K across ${opps.length} deals | ${overdueCount} overdue tasks | ${staleCount} deals with stale/missing SE comments

Deals:
${dealLines}

Write a brief with exactly these 4 sections, each 2–4 sentences:

**Wins & momentum** — deals progressing well, recent positive signals. Reference specific deal names and what's going right.

**Coaching focus** — deals where the SE needs help (stale comments, low MEDDPICC, missing next steps, stuck in stage). Be specific: "On X deal, MEDDPICC is weak on Economic Buyer — dig into who signs."

**Risks to flag** — technical blockers, competitive threats, slipping PoCs, deals at risk of going dark. Name the deals.

**Suggested 1:1 agenda** — 3-5 concrete discussion prompts for the call, using deal names. Example: "Walk through plan for [Deal Name] — what's blocking stage progression?"

Keep it under 350 words total. Use deal names and ARR figures. Be direct and actionable, not generic.`;

  const job = await startJob({ key: jobKey, feature: 'one-on-one-narrative', userId });
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const content = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    await query(
      `INSERT INTO ai_summary_cache (key, content, generated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET content = $2, generated_at = now()`,
      [jobKey, content]
    );

    await completeJob(job.id);
    res.json(ok({ content, generated_at: new Date().toISOString() }));
  } catch (e: unknown) {
    await failJob(job.id, e instanceof Error ? e.message : String(e));
    console.error('[one-on-one] narrative generation failed:', e);
    res.status(500).json(err('Failed to generate narrative'));
  }
});

// GET /insights/analytics — Pipeline Analytics Dashboard (Issue #71)
router.get('/analytics', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  try {
    const baseWhere = `o.is_active = true AND o.is_closed_lost = false AND o.is_closed_won = false`;
    const stageOrder = `CASE stage
      WHEN 'Qualify' THEN 1 WHEN 'Build Value' THEN 2
      WHEN 'Develop Solution' THEN 3 WHEN 'Proposal Sent' THEN 4
      WHEN 'Negotiate' THEN 5 WHEN 'Submitted for Booking' THEN 6
    END`;

    // 1. Pipeline funnel: total ARR by stage, ordered by pipeline stage order
    const funnelRows = await query(
      `SELECT o.stage, COALESCE(SUM(o.arr), 0)::numeric AS arr, COUNT(*)::int AS count
       FROM opportunities o
       WHERE ${baseWhere}
       GROUP BY o.stage
       ORDER BY ${stageOrder.replace(/stage/g, 'o.stage')}`,
      []
    );

    // 2. ARR by SE Owner with breakdown by stage
    const bySeRows = await query(
      `SELECT COALESCE(u.name, 'Unassigned') AS se_owner_name,
              o.stage,
              COALESCE(SUM(o.arr), 0)::numeric AS arr
       FROM opportunities o
       LEFT JOIN users u ON u.id = o.se_owner_id
       WHERE ${baseWhere}
       GROUP BY COALESCE(u.name, 'Unassigned'), o.stage
       ORDER BY COALESCE(u.name, 'Unassigned'), ${stageOrder.replace(/stage/g, 'o.stage')}`,
      []
    );

    // Reshape by_se into grouped structure
    const seMap = new Map<string, { total_arr: number; stages: { stage: string; arr: number }[] }>();
    for (const row of bySeRows) {
      const name = row.se_owner_name as string;
      if (!seMap.has(name)) {
        seMap.set(name, { total_arr: 0, stages: [] });
      }
      const entry = seMap.get(name)!;
      const arr = Number(row.arr);
      entry.total_arr += arr;
      entry.stages.push({ stage: row.stage as string, arr });
    }
    const by_se = Array.from(seMap.entries()).map(([se_owner_name, v]) => ({
      se_owner_name,
      total_arr: v.total_arr,
      stages: v.stages,
    }));

    // 3. ARR by Record Type
    const byRecordTypeRows = await query(
      `SELECT COALESCE(o.record_type, 'Unknown') AS record_type,
              COALESCE(SUM(o.arr), 0)::numeric AS arr,
              COUNT(*)::int AS count
       FROM opportunities o
       WHERE ${baseWhere}
       GROUP BY COALESCE(o.record_type, 'Unknown')
       ORDER BY arr DESC`,
      []
    );

    // 4. ARR by Close Month
    const byCloseMonthRows = await query(
      `SELECT TO_CHAR(o.close_date, 'YYYY-MM') AS month,
              COALESCE(SUM(o.arr), 0)::numeric AS arr,
              COUNT(*)::int AS count
       FROM opportunities o
       WHERE ${baseWhere} AND o.close_date IS NOT NULL
       GROUP BY TO_CHAR(o.close_date, 'YYYY-MM')
       ORDER BY month`,
      []
    );

    // 5. Key deals summary
    const keyDealsRow = await queryOne(
      `SELECT COALESCE(SUM(o.arr), 0)::numeric AS total_arr, COUNT(*)::int AS count
       FROM opportunities o
       WHERE ${baseWhere} AND o.key_deal = true`,
      []
    );

    // 6. Stage velocity: average days in current stage
    const stageVelocityRows = await query(
      `SELECT o.stage,
              ROUND(AVG(EXTRACT(EPOCH FROM (now() - o.stage_changed_at)) / 86400)::numeric, 1) AS avg_days,
              COUNT(*)::int AS count
       FROM opportunities o
       WHERE ${baseWhere} AND o.stage_changed_at IS NOT NULL
       GROUP BY o.stage
       ORDER BY ${stageOrder.replace(/stage/g, 'o.stage')}`,
      []
    );

    // 7. Summary totals
    const summaryRow = await queryOne(
      `SELECT COALESCE(SUM(o.arr), 0)::numeric AS total_arr,
              COUNT(*)::int AS total_count,
              COALESCE(SUM(o.arr_converted), 0)::numeric AS total_arr_converted
       FROM opportunities o
       WHERE ${baseWhere}`,
      []
    );

    res.json(ok({
      funnel: funnelRows.map(r => ({ stage: r.stage, arr: Number(r.arr), count: Number(r.count) })),
      by_se,
      by_record_type: byRecordTypeRows.map(r => ({ record_type: r.record_type, arr: Number(r.arr), count: Number(r.count) })),
      by_close_month: byCloseMonthRows.map(r => ({ month: r.month, arr: Number(r.arr), count: Number(r.count) })),
      key_deals: { total_arr: Number(keyDealsRow?.total_arr ?? 0), count: Number(keyDealsRow?.count ?? 0) },
      stage_velocity: stageVelocityRows.map(r => ({ stage: r.stage, avg_days: Number(r.avg_days), count: Number(r.count) })),
      summary: {
        total_arr: Number(summaryRow?.total_arr ?? 0),
        total_count: Number(summaryRow?.total_count ?? 0),
        total_arr_converted: Number(summaryRow?.total_arr_converted ?? 0),
      },
    }));
  } catch (e: unknown) {
    console.error('[analytics] query failed:', e);
    res.status(500).json(err('Failed to load analytics data'));
  }
});

// GET /insights/competitive — Competitive Intelligence Rollup (Issue #72)
router.get('/competitive', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. All opps with competitors (open pipeline)
    const openRows = await query(
      `SELECT o.id, o.sf_opportunity_id, o.name, o.account_name, o.stage, o.arr,
              o.engaged_competitors, o.se_comments, o.se_comments_updated_at,
              o.team, o.account_segment, o.record_type,
              u.id AS se_owner_id, u.name AS se_owner_name
       FROM opportunities o
       LEFT JOIN users u ON u.id = o.se_owner_id
       WHERE o.is_active = true AND o.is_closed_lost = false AND o.is_closed_won = false
         AND o.engaged_competitors IS NOT NULL AND o.engaged_competitors != ''`,
      []
    );

    // 2. Closed lost opps with competitors (for win/loss context)
    const closedLostRows = await query(
      `SELECT o.engaged_competitors, o.arr
       FROM opportunities o
       WHERE o.is_closed_lost = true
         AND o.engaged_competitors IS NOT NULL AND o.engaged_competitors != ''`,
      []
    );

    // 3. Closed won opps with competitors
    const closedWonRows = await query(
      `SELECT o.engaged_competitors, o.arr
       FROM opportunities o
       WHERE o.is_closed_won = true
         AND o.engaged_competitors IS NOT NULL AND o.engaged_competitors != ''`,
      []
    );

    // Parse semicolon-separated competitors and aggregate
    type CompAgg = {
      open_count: number;
      open_arr: number;
      closed_lost_count: number;
      closed_lost_arr: number;
      closed_won_count: number;
      closed_won_arr: number;
      se_counts: Map<string, number>;
      deals: {
        id: number; sf_opportunity_id: string; name: string; account_name: string | null;
        stage: string; arr: number; se_owner_name: string | null; team: string | null;
        se_comments_stale: boolean;
      }[];
    };
    const compMap = new Map<string, CompAgg>();

    function getOrCreate(name: string): CompAgg {
      const trimmed = name.trim();
      if (!trimmed) return null as unknown as CompAgg;
      if (!compMap.has(trimmed)) {
        compMap.set(trimmed, {
          open_count: 0, open_arr: 0,
          closed_lost_count: 0, closed_lost_arr: 0,
          closed_won_count: 0, closed_won_arr: 0,
          se_counts: new Map(),
          deals: [],
        });
      }
      return compMap.get(trimmed)!;
    }

    // Process open pipeline
    const now = Date.now();
    const STALE_MS = 21 * 24 * 60 * 60 * 1000; // 21 days
    for (const row of openRows) {
      const competitors = (row.engaged_competitors as string).split(';');
      const seCommentsStale = !row.se_comments_updated_at ||
        (now - new Date(row.se_comments_updated_at as string).getTime()) > STALE_MS;

      for (const c of competitors) {
        const agg = getOrCreate(c);
        if (!agg) continue;
        agg.open_count++;
        agg.open_arr += Number(row.arr ?? 0);
        const seName = (row.se_owner_name as string) || 'Unassigned';
        agg.se_counts.set(seName, (agg.se_counts.get(seName) ?? 0) + 1);
        agg.deals.push({
          id: row.id as number,
          sf_opportunity_id: row.sf_opportunity_id as string,
          name: row.name as string,
          account_name: row.account_name as string | null,
          stage: row.stage as string,
          arr: Number(row.arr ?? 0),
          se_owner_name: row.se_owner_name as string | null,
          team: row.team as string | null,
          se_comments_stale: seCommentsStale,
        });
      }
    }

    // Process closed lost
    for (const row of closedLostRows) {
      const competitors = (row.engaged_competitors as string).split(';');
      for (const c of competitors) {
        const agg = getOrCreate(c);
        if (!agg) continue;
        agg.closed_lost_count++;
        agg.closed_lost_arr += Number(row.arr ?? 0);
      }
    }

    // Process closed won
    for (const row of closedWonRows) {
      const competitors = (row.engaged_competitors as string).split(';');
      for (const c of competitors) {
        const agg = getOrCreate(c);
        if (!agg) continue;
        agg.closed_won_count++;
        agg.closed_won_arr += Number(row.arr ?? 0);
      }
    }

    // Convert to response
    const competitors = Array.from(compMap.entries())
      .map(([name, agg]) => ({
        name,
        open_count: agg.open_count,
        open_arr: agg.open_arr,
        closed_lost_count: agg.closed_lost_count,
        closed_lost_arr: agg.closed_lost_arr,
        closed_won_count: agg.closed_won_count,
        closed_won_arr: agg.closed_won_arr,
        total_count: agg.open_count + agg.closed_lost_count + agg.closed_won_count,
        se_breakdown: Array.from(agg.se_counts.entries())
          .map(([se_name, count]) => ({ se_name, count }))
          .sort((a, b) => b.count - a.count),
        deals: agg.deals,
        stale_comment_count: agg.deals.filter(d => d.se_comments_stale).length,
      }))
      .sort((a, b) => b.open_count - a.open_count);

    // Summary
    const totalOpenWithComp = openRows.length;
    const uniqueCompetitors = compMap.size;
    const totalOpenArr = openRows.reduce((s, r) => s + Number(r.arr ?? 0), 0);

    res.json(ok({
      competitors,
      summary: {
        total_open_deals_with_competitors: totalOpenWithComp,
        unique_competitors: uniqueCompetitors,
        total_open_arr: totalOpenArr,
      },
    }));
  } catch (e: unknown) {
    console.error('[competitive] query failed:', e);
    res.status(500).json(err('Failed to load competitive intelligence'));
  }
});

export default router;

