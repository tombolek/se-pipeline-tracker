import { callAnthropic } from '../services/aiClient.js';
import { renderAgentPrompt } from '../services/agentRunner.js';
import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { startJob, completeJob, failJob } from '../services/aiJobs.js';
import { CITATION_INSTRUCTIONS, resolveCitations } from '../services/citations.js';
import type { CitationSource } from '../types/citations.js';
import { weeklyDigestHandler } from './insights/weeklyDigest.js';

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

  // Quarterly targets for the requested FY (or all FYs if none specified — use
  // first row by FY in groupResults below). A null quarter falls back to
  // annual / 4 on the client; 0 means explicitly zero.
  type QuarterlyRow = { quota_group_id: number; quarter: number; target_amount: string };
  const quarterlyParams: unknown[] = [];
  let quarterlySql = `SELECT quota_group_id, quarter, target_amount FROM quota_group_quarterly_targets`;
  if (fiscalYear) {
    quarterlyParams.push(fiscalYear);
    quarterlySql += ` WHERE fiscal_year = $1`;
  }
  const quarterlyRows = await query<QuarterlyRow>(quarterlySql, quarterlyParams);
  const quarterlyByGroup = new Map<number, { q1: number | null; q2: number | null; q3: number | null; q4: number | null }>();
  for (const r of quarterlyRows) {
    let cell = quarterlyByGroup.get(r.quota_group_id);
    if (!cell) { cell = { q1: null, q2: null, q3: null, q4: null }; quarterlyByGroup.set(r.quota_group_id, cell); }
    const v = parseFloat(r.target_amount);
    cell[`q${r.quarter}` as 'q1' | 'q2' | 'q3' | 'q4'] = isFinite(v) ? v : null;
  }

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
    const qt = quarterlyByGroup.get(g.id) ?? { q1: null, q2: null, q3: null, q4: null };
    return {
      id: g.id,
      name: g.name,
      rule_type: g.rule_type,
      rule_value: g.rule_value,
      target_amount: target,
      quarterly_targets: qt,
      sort_order: g.sort_order,
      total_arr: totalArr,
      deal_count: matching.length,
      pct: target > 0 ? (totalArr / target) * 100 : 0,
      monthly_arr: monthlyArr,
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

// ── Home page quota-progress widget ──────────────────────────────────────────
// GET /insights/quota-progress
//
// Lightweight, auth-only counterpart to /percent-to-target for the Home page
// header. Always returns the **current quarter** of the **current FY** for
// (a) the Global quota group (if one is configured) and (b) the caller's
// assigned quota group (if `users.quota_group_id` is set). Trims the payload
// to just the numbers the widget renders — no per-deal lists, no monthly
// arrays — so it's safe to expose to non-managers.
//
// Quarter target falls back to annual ÷ 4 when `quota_group_quarterly_targets`
// has no row for the current FY/quarter, matching the % to Target page.
// Pace target is linear inside the quarter: months_elapsed_in_q / 3 × target.
router.get('/quota-progress', auth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthenticatedRequest).user.userId;

  // 1. Look up the caller's assigned quota group (may be null).
  const userRow = await queryOne<{ quota_group_id: number | null }>(
    `SELECT quota_group_id FROM users WHERE id = $1`,
    [userId]
  );
  const userQuotaGroupId = userRow?.quota_group_id ?? null;

  // 2. Compute current quarter (UTC, calendar-year FY).
  const today = new Date();
  const currentMonthIdx = today.getUTCMonth(); // 0..11
  const currentYear = today.getUTCFullYear();
  const quarterNum = Math.floor(currentMonthIdx / 3) + 1; // 1..4
  const qStart = (quarterNum - 1) * 3;
  const qEnd = qStart + 2;
  const monthsElapsedInQ = Math.min(3, currentMonthIdx - qStart + 1); // 1..3
  const fiscalYear = `FY${currentYear}`;

  // 3. Load only the groups we need: global + the user's group (if any).
  type QuotaGroup = {
    id: number; name: string; rule_type: 'global' | 'teams' | 'ae_owners';
    rule_value: unknown; target_amount: string;
  };
  const groupRows = await query<QuotaGroup>(
    `SELECT id, name, rule_type, rule_value, target_amount FROM quota_groups
     WHERE rule_type = 'global' OR id = $1`,
    [userQuotaGroupId]
  );
  const globalGroup = groupRows.find(g => g.rule_type === 'global') ?? null;
  // If the user's assigned group IS the global group, suppress the personal
  // row entirely — rendering "Global progress" and "My quota · Global" side
  // by side would just duplicate the same numbers.
  const personalGroup = userQuotaGroupId !== null && userQuotaGroupId !== globalGroup?.id
    ? groupRows.find(g => g.id === userQuotaGroupId) ?? null
    : null;

  // Short-circuit: nothing to show.
  if (!globalGroup && !personalGroup) {
    res.json(ok({
      quarter: `Q${quarterNum}`,
      fiscal_year: fiscalYear,
      months_elapsed_in_q: monthsElapsedInQ,
      global: null,
      personal: null,
    }));
    return;
  }

  // 4. Quarter targets for current FY (fall back to annual/4 if no row).
  const wantedIds = [globalGroup?.id, personalGroup?.id].filter((x): x is number => typeof x === 'number');
  const qTargetRows = wantedIds.length > 0
    ? await query<{ quota_group_id: number; target_amount: string }>(
        `SELECT quota_group_id, target_amount FROM quota_group_quarterly_targets
         WHERE fiscal_year = $1 AND quarter = $2 AND quota_group_id = ANY($3::int[])`,
        [fiscalYear, quarterNum, wantedIds]
      )
    : [];
  const qTargetById = new Map<number, number>();
  for (const r of qTargetRows) {
    const v = parseFloat(r.target_amount);
    if (isFinite(v)) qTargetById.set(r.quota_group_id, v);
  }

  // 5. Closed Won deals for this FY (same record-type filter as % to Target).
  type Deal = {
    team: string | null; ae_owner_name: string | null;
    arr_converted: string | null; close_date: string | null; closed_at: string | null;
  };
  const deals = await query<Deal>(
    `SELECT team, ae_owner_name, arr_converted, close_date, closed_at
     FROM opportunities
     WHERE is_closed_won = true
       AND record_type IN ('New Logo','Upsell','Cross-Sell')
       AND fiscal_year = $1`,
    [fiscalYear]
  );

  function ruleMatches(d: Deal, g: QuotaGroup): boolean {
    if (g.rule_type === 'global') return true;
    if (!Array.isArray(g.rule_value)) return false;
    const list = g.rule_value as string[];
    if (g.rule_type === 'teams') return d.team !== null && list.includes(d.team);
    if (g.rule_type === 'ae_owners') return d.ae_owner_name !== null && list.includes(d.ae_owner_name);
    return false;
  }
  function isInCurrentQuarter(d: Deal): boolean {
    const src = d.closed_at ?? d.close_date;
    if (!src) return false;
    const m = new Date(src).getUTCMonth();
    return m >= qStart && m <= qEnd;
  }
  function dealArr(d: Deal): number {
    const n = parseFloat(d.arr_converted ?? '0');
    return isFinite(n) ? n : 0;
  }

  function buildResult(g: QuotaGroup) {
    const annual = parseFloat(g.target_amount) || 0;
    const target = qTargetById.get(g.id) ?? (annual / 4);
    const closed = deals
      .filter(d => isInCurrentQuarter(d) && ruleMatches(d, g))
      .reduce((acc, d) => acc + dealArr(d), 0);
    const paceTarget = target * (monthsElapsedInQ / 3);
    return {
      group_name: g.name,
      closed,
      target,
      pace_target: paceTarget,
      pct: target > 0 ? (closed / target) * 100 : 0,
      gap: closed - paceTarget,
    };
  }

  res.json(ok({
    quarter: `Q${quarterNum}`,
    fiscal_year: fiscalYear,
    months_elapsed_in_q: monthsElapsedInQ,
    global: globalGroup ? buildResult(globalGroup) : null,
    personal: personalGroup ? buildResult(personalGroup) : null,
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

// ── Win Rate (Issue #92) ─────────────────────────────────────────────────────
//
// GET /insights/win-rate?fiscal_year=FY2026&fiscal_period=FY2026-Q1
//
// Two perspectives on win rate:
//   1. Technical Win Rate  — among closed deals, how many reached Negotiate?
//      Proxy for "did the SE earn a technical win" before commercial terms took over.
//      Computed as: reached_negotiate / (closed_won + closed_lost)
//   2. Negotiate Win Rate  — among deals that reached Negotiate, how many Closed Won?
//      Proxy for "when the technical side was solved, did we close?"
//      Computed as: closed_won_ex_negotiate / (closed_won_ex_negotiate + closed_lost_ex_negotiate)
//
// Also returns the classic Overall Win Rate: closed_won / (closed_won + closed_lost).
// All three are returned at the team level and broken down per SE.
// Excludes Services & Renewal record types (matching Closed Won / % to Target).
router.get('/win-rate', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const fiscalYear   = (req.query.fiscal_year   as string | undefined) || null;
  const fiscalPeriod = (req.query.fiscal_period as string | undefined) || null;

  const conditions: string[] = [
    `(o.is_closed_won = true OR o.is_closed_lost = true)`,
    `o.record_type IN ('New Logo','Upsell','Cross-Sell')`,
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

  interface Row {
    id: number;
    sf_opportunity_id: string;
    name: string;
    account_name: string | null;
    team: string | null;
    record_type: string | null;
    arr_converted: string | null;
    stage: string;
    is_closed_won: boolean;
    is_closed_lost: boolean;
    stage_date_negotiate: string | null;
    closed_at: string | null;
    fiscal_year: string | null;
    fiscal_period: string | null;
    se_owner_id: number | null;
    se_owner_name: string | null;
  }

  const rows = await query<Row>(
    `SELECT o.id, o.sf_opportunity_id, o.name, o.account_name,
            o.team, o.record_type,
            o.arr_converted, o.stage,
            o.is_closed_won, o.is_closed_lost,
            o.stage_date_negotiate,
            o.closed_at, o.fiscal_year, o.fiscal_period,
            u.id AS se_owner_id, u.name AS se_owner_name
       FROM opportunities o
       LEFT JOIN users u ON u.id = o.se_owner_id
      WHERE ${conditions.join(' AND ')}`,
    params,
  );

  interface Bucket {
    closed_won: number;
    closed_lost: number;
    won_arr: number;
    lost_arr: number;
    reached_negotiate: number;
    negotiate_won: number;
    negotiate_lost: number;
  }

  function emptyBucket(): Bucket {
    return { closed_won: 0, closed_lost: 0, won_arr: 0, lost_arr: 0,
             reached_negotiate: 0, negotiate_won: 0, negotiate_lost: 0 };
  }

  function add(b: Bucket, r: Row): void {
    const arr = parseFloat(r.arr_converted ?? '0') || 0;
    const reached = r.stage_date_negotiate !== null;
    if (r.is_closed_won) { b.closed_won += 1; b.won_arr  += arr; if (reached) b.negotiate_won  += 1; }
    if (r.is_closed_lost){ b.closed_lost+= 1; b.lost_arr += arr; if (reached) b.negotiate_lost += 1; }
    if (reached) b.reached_negotiate += 1;
  }

  function summarize(b: Bucket) {
    const closed = b.closed_won + b.closed_lost;
    const negotiateCohort = b.negotiate_won + b.negotiate_lost;
    return {
      ...b,
      total_closed: closed,
      overall_win_rate:   closed           > 0 ? b.closed_won       / closed           : null,
      technical_win_rate: closed           > 0 ? b.reached_negotiate / closed          : null,
      negotiate_win_rate: negotiateCohort  > 0 ? b.negotiate_won    / negotiateCohort  : null,
    };
  }

  const overall = emptyBucket();
  const bySe = new Map<number | string, { se_id: number | null; se_name: string; bucket: Bucket; deals: Row[] }>();

  for (const r of rows) {
    add(overall, r);
    const key = r.se_owner_id ?? '__unassigned__';
    let entry = bySe.get(key);
    if (!entry) {
      entry = {
        se_id: r.se_owner_id,
        se_name: r.se_owner_name ?? 'Unassigned',
        bucket: emptyBucket(),
        deals: [],
      };
      bySe.set(key, entry);
    }
    add(entry.bucket, r);
    entry.deals.push(r);
  }

  const perSe = Array.from(bySe.values()).map(e => ({
    se_id: e.se_id,
    se_name: e.se_name,
    ...summarize(e.bucket),
    deals: e.deals.map(d => ({
      id: d.id,
      sf_opportunity_id: d.sf_opportunity_id,
      name: d.name,
      account_name: d.account_name,
      team: d.team,
      arr_converted: d.arr_converted,
      is_closed_won: d.is_closed_won,
      is_closed_lost: d.is_closed_lost,
      reached_negotiate: d.stage_date_negotiate !== null,
      closed_at: d.closed_at,
      fiscal_period: d.fiscal_period,
    })),
  })).sort((a, b) => b.total_closed - a.total_closed);

  // Distinct fiscal years in the scope (won+lost, new business only) for the FY dropdown
  const fyRows = await query<{ fiscal_year: string }>(
    `SELECT DISTINCT fiscal_year FROM opportunities
      WHERE (is_closed_won = true OR is_closed_lost = true)
        AND record_type IN ('New Logo','Upsell','Cross-Sell')
        AND fiscal_year IS NOT NULL AND fiscal_year != ''
      ORDER BY fiscal_year DESC`,
  );

  res.json(ok({
    overall: summarize(overall),
    by_se: perSe,
  }, {
    fiscal_years: fyRows.map(r => r.fiscal_year),
    filters: { fiscal_year: fiscalYear, fiscal_period: fiscalPeriod },
  }));
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
  // Newer rows cached as JSON { summary, citations }; legacy rows are raw
  // text. Detect and normalize. #135 Phase 2 Batch 4.
  const raw = rows[0].content;
  let summary = raw;
  let citations: unknown[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.summary === 'string') {
      summary = parsed.summary;
      citations = Array.isArray(parsed.citations) ? parsed.citations : [];
    }
  } catch { /* legacy plain-text row */ }
  res.json(ok({ summary, citations, generated_at: rows[0].generated_at }));
});

// POST /insights/tech-blockers/ai-summary  — Claude-powered summary of all blockers
router.post('/tech-blockers/ai-summary', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthenticatedRequest).user?.userId ?? null;
  const job = await startJob({ key: 'tech-blockers', feature: 'tech-blockers', userId });
  try {
  const rows = await query<{
    id: number; sf_opportunity_id: string;
    name: string; account_name: string; se_owner_name: string | null;
    deploy_mode: string | null; stage: string; technical_blockers: string;
    blocker_status: string;
  }>(
    `SELECT o.id, o.sf_opportunity_id, o.name, o.account_name, o.stage, o.deploy_mode, o.technical_blockers,
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
  // Cross-opp citation sources — one per deal with a recorded blocker. #135.
  const oppCitationSources: CitationSource[] = rows.map((r, i) => ({
    key: `opp-${r.id}`,
    kind: 'opportunity' as const,
    label: `[${i + 1}] ${r.name}`,
    meta: `${r.stage} · ${r.account_name}`,
    preview: r.technical_blockers,
    opportunity_id: r.id,
    opportunity_sfid: r.sf_opportunity_id,
  }));
  const context = rows.map((r, i) =>
    `[${i + 1}] ${severityLabel[r.blocker_status] ?? '[UNRATED]'} ${r.name} (${r.account_name}) — SE: ${r.se_owner_name ?? 'Unassigned'}, Stage: ${r.stage}, Deploy: ${r.deploy_mode ?? 'N/A'}\n  ${r.technical_blockers}`
  ).join('\n\n');

  const redCount = rows.filter(r => r.blocker_status === 'red').length;
  const orangeCount = rows.filter(r => r.blocker_status === 'orange').length;

  const techBlockersPrompt = await renderAgentPrompt('tech-blockers', {
    total_count: rows.length,
    red_count: redCount,
    orange_count: orangeCount,
    context,
    citation_instructions: CITATION_INSTRUCTIONS,
  });
  const { text: summary } = await callAnthropic({
    feature: 'tech-blockers',
    maxTokens: 1500,
    prompt: techBlockersPrompt,
  });
  const { citations } = resolveCitations(summary, oppCitationSources);

  // Persist cache as JSON { summary, citations } for #135 pills. Legacy plain
  // text rows stay readable via the cached-read back-compat branch.
  const cachePayload = JSON.stringify({ summary, citations });
  await query(
    `INSERT INTO ai_summary_cache (key, content, generated_at)
     VALUES ('tech-blockers', $1, now())
     ON CONFLICT (key) DO UPDATE SET content = $1, generated_at = now()`,
    [cachePayload]
  );

  await completeJob(job.id);
  res.json(ok({ summary, citations, generated_at: new Date().toISOString(), count: rows.length, red: redCount, orange: orangeCount }));
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

  const agenticQualPrompt = await renderAgentPrompt('agentic-qual', {
    total_count: rows.length,
    context,
  });
  const { text: summary } = await callAnthropic({
    feature: 'agentic-qual',
    maxTokens: 1500,
    prompt: agenticQualPrompt,
  });

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

// GET /insights/weekly-digest?days=7|14|30 — handler extracted to ./insights/weeklyDigest.ts
router.get('/weekly-digest', auth, mgr, weeklyDigestHandler);


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
  o.id, o.sf_opportunity_id, o.name, o.account_name, o.stage, o.arr, o.arr_currency, o.close_date,
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

  // Cached narrative — newer rows are JSON { content, citations }, legacy rows
  // are raw text. Detect and normalize. #135 Phase 2 Batch 3.
  const narrativeRow = await queryOne(
    `SELECT content, generated_at FROM ai_summary_cache WHERE key = $1`,
    [`one-on-one-narrative-${seId}`]
  );
  let narrative: { content: string; citations: unknown[]; generated_at: string } | null = null;
  if (narrativeRow) {
    const raw = narrativeRow.content as string;
    let content = raw;
    let citations: unknown[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.content === 'string') {
        content = parsed.content;
        citations = Array.isArray(parsed.citations) ? parsed.citations : [];
      }
    } catch { /* legacy plain-text row */ }
    narrative = { content, citations, generated_at: (narrativeRow.generated_at as Date).toISOString() };
  }

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

  // Cross-opp citation sources — each deal is one citable source. Claude
  // emits [N] where N is the 1-based position in `dealLines`. Click-jump in
  // the client navigates to the deal's drawer. #135 Phase 2 Batch 3.
  const oppCitationSources: CitationSource[] = opps.map((r: Record<string, unknown>, i) => {
    const n = i + 1;
    const arr = parseFloat(r.arr as string) || 0;
    return {
      key: `opp-${r.id}`,
      kind: 'opportunity' as const,
      label: `[${n}] ${r.name}`,
      meta: `${r.stage} · $${Math.round(arr / 1000)}K`,
      preview: String(r.technical_blockers ?? r.se_comments ?? r.next_step_sf ?? '(no recent activity)'),
      opportunity_id: r.id as number,
      opportunity_sfid: r.sf_opportunity_id as string,
    };
  });

  const dealLines = opps.map((r: Record<string, unknown>, i) => {
    const arr = parseFloat(r.arr as string) || 0;
    const meddpiccFilled = MEDDPICC_KEYS.filter(k => r[k]).length;
    const seStale = r.se_comments_updated_at
      ? Math.floor((Date.now() - new Date(r.se_comments_updated_at as string).getTime()) / 86_400_000)
      : null;
    const stageDays = r.stage_changed_at
      ? Math.floor((Date.now() - new Date(r.stage_changed_at as string).getTime()) / 86_400_000)
      : null;
    return `[${i + 1}] ${r.name} | ${r.account_name ?? ''} | $${Math.round(arr/1000)}K | ${r.stage} (${stageDays ?? '?'}d) | MEDDPICC ${meddpiccFilled}/9 | SE comments: ${seStale === null ? 'never' : seStale + 'd ago'} | Overdue tasks: ${r.overdue_task_count ?? 0} | Next step: ${r.next_step_sf || '—'} | Blockers: ${r.technical_blockers || 'None'} | PoC: ${r.poc_status || 'N/A'}`;
  }).join('\n');

  const totalArr = opps.reduce((s: number, r: Record<string, unknown>) => s + (parseFloat(r.arr as string) || 0), 0);
  const overdueCount = opps.reduce((s: number, r: Record<string, unknown>) => s + ((r.overdue_task_count as number) || 0), 0);
  const staleCount = opps.filter((r: Record<string, unknown>) => {
    const upd = r.se_comments_updated_at as string | null;
    if (!upd) return true;
    const days = Math.floor((Date.now() - new Date(upd).getTime()) / 86_400_000);
    return days > 21;
  }).length;

  const prompt = await renderAgentPrompt('one-on-one-narrative', {
    se_name: seUser.name,
    pipeline_summary: `$${Math.round(totalArr/1000)}K across ${opps.length} deals | ${overdueCount} overdue tasks | ${staleCount} deals with stale/missing SE comments`,
    deal_lines: dealLines,
    citation_instructions: CITATION_INSTRUCTIONS,
  });

  const job = await startJob({ key: jobKey, feature: 'one-on-one-narrative', userId });
  try {
    const { text: content } = await callAnthropic({
      feature: 'one-on-one-narrative',
      prompt,
      maxTokens: 900,
    });

    // Resolve [N] → ResolvedCitation. Cache JSON { content, citations } so
    // the read endpoint can restore both. Legacy plain-text rows continue to
    // render (without pills). #135 Phase 2 Batch 3.
    const { citations } = resolveCitations(content, oppCitationSources);
    await query(
      `INSERT INTO ai_summary_cache (key, content, generated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET content = $2, generated_at = now()`,
      [jobKey, JSON.stringify({ content, citations })]
    );

    await completeJob(job.id);
    res.json(ok({ content, citations, generated_at: new Date().toISOString() }));
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

/* Competitive Intelligence (Issue #72) — disabled; will re-enable once meeting
   transcript ingestion provides real competitive data.
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
*/

// GET /insights/se-contribution?days=365
//
// Per-SE contribution report for manager performance reviews. Four metrics:
//   • BV→DS conversion rate (strict forward transition)
//   • DS→PS conversion rate (strict forward transition)
//   • Closed ARR (owner) + Contributed ARR (non-owner contributor on closed-won)
//   • PoC conversion (deals that reached a PoC end date → Closed Won)
//   • Data hygiene (% of owned open deals with note/SE-comments update in 14d)
//
// Conversion bucket logic (per deal, per source stage):
//   progressed          — destination stage date > source stage date (strict)
//   lost                — closed lost after entering source stage
//   skipped             — jumped past destination (dest NULL, later stage dated)
//   stuck_assumed_lost  — source entered ≥180d ago, no progression, not lost
//   in_flight           — still resolving
// Rate denominator = progressed + lost + stuck_assumed_lost.
router.get('/se-contribution', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const days = Math.max(1, parseInt((req.query.days as string) ?? '365') || 365);
  const STUCK_CUTOFF_DAYS = 180;

  // BV cohort per SE — using current se_owner (attribution caveat: historical handoffs).
  const bvRows = await query<{ se_owner_id: number | null; bucket: string; cnt: string }>(
    `SELECT o.se_owner_id,
       CASE
         WHEN o.stage_date_develop_solution > o.stage_date_build_value        THEN 'progressed'
         WHEN o.is_closed_lost
              AND o.stage_date_closed_lost > o.stage_date_build_value         THEN 'lost'
         WHEN o.stage_date_develop_solution IS NULL
              AND (o.stage_date_proposal_sent         > o.stage_date_build_value
                OR o.stage_date_submitted_for_booking > o.stage_date_build_value
                OR o.stage_date_negotiate             > o.stage_date_build_value
                OR o.stage_date_closed_won            > o.stage_date_build_value) THEN 'skipped'
         WHEN o.stage_date_build_value <= CURRENT_DATE - $2::int              THEN 'stuck_assumed_lost'
         ELSE                                                                      'in_flight'
       END AS bucket,
       COUNT(*) AS cnt
     FROM opportunities o
     WHERE o.is_active
       AND o.stage_date_build_value IS NOT NULL
       AND o.stage_date_build_value >= CURRENT_DATE - $1::int
     GROUP BY o.se_owner_id, bucket`,
    [days, STUCK_CUTOFF_DAYS],
  );

  const dsRows = await query<{ se_owner_id: number | null; bucket: string; cnt: string }>(
    `SELECT o.se_owner_id,
       CASE
         WHEN o.stage_date_proposal_sent > o.stage_date_develop_solution      THEN 'progressed'
         WHEN o.is_closed_lost
              AND o.stage_date_closed_lost > o.stage_date_develop_solution    THEN 'lost'
         WHEN o.stage_date_proposal_sent IS NULL
              AND (o.stage_date_submitted_for_booking > o.stage_date_develop_solution
                OR o.stage_date_negotiate             > o.stage_date_develop_solution
                OR o.stage_date_closed_won            > o.stage_date_develop_solution) THEN 'skipped'
         WHEN o.stage_date_develop_solution <= CURRENT_DATE - $2::int         THEN 'stuck_assumed_lost'
         ELSE                                                                      'in_flight'
       END AS bucket,
       COUNT(*) AS cnt
     FROM opportunities o
     WHERE o.is_active
       AND o.stage_date_develop_solution IS NOT NULL
       AND o.stage_date_develop_solution >= CURRENT_DATE - $1::int
     GROUP BY o.se_owner_id, bucket`,
    [days, STUCK_CUTOFF_DAYS],
  );

  // Closed ARR (as owner) + Contributed ARR (as contributor, not owner).
  // Both scoped to closed-won within the lookback. arr_converted is the USD
  // normalised ARR (preferred) with fallback to arr when converted is null.
  const arrOwnerRows = await query<{ se_owner_id: number | null; closed_arr: string; deal_count: string }>(
    `SELECT o.se_owner_id,
       COALESCE(SUM(COALESCE(o.arr_converted, o.arr)), 0) AS closed_arr,
       COUNT(*) AS deal_count
     FROM opportunities o
     WHERE o.is_closed_won
       AND o.stage_date_closed_won IS NOT NULL
       AND o.stage_date_closed_won >= CURRENT_DATE - $1::int
     GROUP BY o.se_owner_id`,
    [days],
  );

  const arrContribRows = await query<{ user_id: number; contributed_arr: string; deal_count: string }>(
    `SELECT c.user_id,
       COALESCE(SUM(COALESCE(o.arr_converted, o.arr)), 0) AS contributed_arr,
       COUNT(*) AS deal_count
     FROM opportunity_se_contributors c
     JOIN opportunities o ON o.id = c.opportunity_id
     WHERE o.is_closed_won
       AND o.stage_date_closed_won IS NOT NULL
       AND o.stage_date_closed_won >= CURRENT_DATE - $1::int
       AND (o.se_owner_id IS DISTINCT FROM c.user_id)
     GROUP BY c.user_id`,
    [days],
  );

  // PoC conversion — deals whose PoC has ended (poc_end_date in the past) grouped
  // by whether they reached Closed Won. Denominator excludes PoCs still in progress.
  const pocRows = await query<{ se_owner_id: number | null; ended: string; won: string }>(
    `SELECT o.se_owner_id,
       COUNT(*) FILTER (WHERE o.poc_end_date <= CURRENT_DATE) AS ended,
       COUNT(*) FILTER (WHERE o.poc_end_date <= CURRENT_DATE AND o.is_closed_won) AS won
     FROM opportunities o
     WHERE o.poc_end_date IS NOT NULL
       AND o.poc_end_date >= CURRENT_DATE - $1::int
     GROUP BY o.se_owner_id`,
    [days],
  );

  // Data hygiene — % of open owned deals with a note or SE-comments update in 14d.
  // Counts apply to the *current* state, not the lookback (hygiene is a "today" metric).
  const hygieneRows = await query<{ se_owner_id: number | null; owned_open: string; fresh: string }>(
    `SELECT o.se_owner_id,
       COUNT(*) AS owned_open,
       COUNT(*) FILTER (
         WHERE o.se_comments_updated_at >= now() - interval '14 days'
            OR o.last_note_at          >= now() - interval '14 days'
       ) AS fresh
     FROM opportunities o
     WHERE o.is_active AND NOT o.is_closed_won AND NOT o.is_closed_lost
       AND o.stage != 'Qualify'
     GROUP BY o.se_owner_id`,
  );

  // Active SE users form the baseline row set.
  const users = await query<{ id: number; name: string; email: string; is_active: boolean }>(
    `SELECT id, name, email, is_active FROM users WHERE role = 'se' ORDER BY is_active DESC, name`,
  );

  // Assemble. Include a "no_owner" synthetic row for orphan deals so the table
  // doesn't silently drop them (attribution honesty).
  type Buckets = { progressed: number; lost: number; stuck_assumed_lost: number; skipped: number; in_flight: number };
  const emptyBuckets = (): Buckets => ({ progressed: 0, lost: 0, stuck_assumed_lost: 0, skipped: 0, in_flight: 0 });

  function toMap<T extends { se_owner_id: number | null }>(rows: T[]): Map<number | null, T[]> {
    const m = new Map<number | null, T[]>();
    for (const r of rows) {
      const k = r.se_owner_id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }

  const bvByOwner = toMap(bvRows);
  const dsByOwner = toMap(dsRows);
  const arrOwnerByOwner = new Map(arrOwnerRows.map(r => [r.se_owner_id, r]));
  const arrContribByUser = new Map(arrContribRows.map(r => [r.user_id, r]));
  const pocByOwner = new Map(pocRows.map(r => [r.se_owner_id, r]));
  const hygieneByOwner = new Map(hygieneRows.map(r => [r.se_owner_id, r]));

  function foldBuckets(rows: { bucket: string; cnt: string }[] | undefined): Buckets {
    const out = emptyBuckets();
    for (const r of rows ?? []) {
      const n = parseInt(r.cnt);
      if (r.bucket === 'progressed') out.progressed += n;
      else if (r.bucket === 'lost') out.lost += n;
      else if (r.bucket === 'stuck_assumed_lost') out.stuck_assumed_lost += n;
      else if (r.bucket === 'skipped') out.skipped += n;
      else if (r.bucket === 'in_flight') out.in_flight += n;
    }
    return out;
  }
  function rate(b: Buckets): number | null {
    const denom = b.progressed + b.lost + b.stuck_assumed_lost;
    if (denom === 0) return null;
    return Math.round((100 * b.progressed) / denom);
  }
  function pct(num: number, denom: number): number | null {
    return denom === 0 ? null : Math.round((100 * num) / denom);
  }

  function buildRow(seId: number | null, seName: string, isActive: boolean) {
    const bv = foldBuckets(bvByOwner.get(seId));
    const ds = foldBuckets(dsByOwner.get(seId));
    const arrOwn = arrOwnerByOwner.get(seId);
    const arrCon = seId != null ? arrContribByUser.get(seId) : undefined;
    const poc = pocByOwner.get(seId);
    const hyg = hygieneByOwner.get(seId);

    const pocEnded = poc ? parseInt(poc.ended) : 0;
    const pocWon = poc ? parseInt(poc.won) : 0;
    const hygOpen = hyg ? parseInt(hyg.owned_open) : 0;
    const hygFresh = hyg ? parseInt(hyg.fresh) : 0;

    return {
      se_id: seId,
      se_name: seName,
      is_active: isActive,
      bv, bv_to_ds_pct: rate(bv),
      ds, ds_to_ps_pct: rate(ds),
      closed_arr: arrOwn ? parseFloat(arrOwn.closed_arr) : 0,
      closed_deal_count: arrOwn ? parseInt(arrOwn.deal_count) : 0,
      contributed_arr: arrCon ? parseFloat(arrCon.contributed_arr) : 0,
      contributed_deal_count: arrCon ? parseInt(arrCon.deal_count) : 0,
      poc_ended: pocEnded,
      poc_won: pocWon,
      poc_conversion_pct: pct(pocWon, pocEnded),
      open_owned: hygOpen,
      fresh_owned: hygFresh,
      hygiene_pct: pct(hygFresh, hygOpen),
    };
  }

  const perSe = users.map(u => buildRow(u.id, u.name, u.is_active));
  const noOwner = buildRow(null, 'No current SE owner', false);

  // Team totals — sum raw buckets (not average of rates) to avoid Simpson's paradox.
  function sumBuckets(...bs: Buckets[]): Buckets {
    const out = emptyBuckets();
    for (const b of bs) {
      out.progressed += b.progressed;
      out.lost += b.lost;
      out.stuck_assumed_lost += b.stuck_assumed_lost;
      out.skipped += b.skipped;
      out.in_flight += b.in_flight;
    }
    return out;
  }
  const teamBv = sumBuckets(...perSe.map(r => r.bv), noOwner.bv);
  const teamDs = sumBuckets(...perSe.map(r => r.ds), noOwner.ds);
  const teamPocEnded = perSe.reduce((s, r) => s + r.poc_ended, 0) + noOwner.poc_ended;
  const teamPocWon = perSe.reduce((s, r) => s + r.poc_won, 0) + noOwner.poc_won;
  const teamOpen = perSe.reduce((s, r) => s + r.open_owned, 0) + noOwner.open_owned;
  const teamFresh = perSe.reduce((s, r) => s + r.fresh_owned, 0) + noOwner.fresh_owned;

  const team = {
    bv: teamBv, bv_to_ds_pct: rate(teamBv),
    ds: teamDs, ds_to_ps_pct: rate(teamDs),
    closed_arr: perSe.reduce((s, r) => s + r.closed_arr, 0) + noOwner.closed_arr,
    contributed_arr: perSe.reduce((s, r) => s + r.contributed_arr, 0),
    poc_ended: teamPocEnded,
    poc_won: teamPocWon,
    poc_conversion_pct: pct(teamPocWon, teamPocEnded),
    open_owned: teamOpen,
    fresh_owned: teamFresh,
    hygiene_pct: pct(teamFresh, teamOpen),
  };

  res.json(ok({
    config: { lookback_days: days, stuck_cutoff_days: STUCK_CUTOFF_DAYS },
    team,
    per_se: perSe,
    no_owner: noOwner,
  }));
});

export default router;

