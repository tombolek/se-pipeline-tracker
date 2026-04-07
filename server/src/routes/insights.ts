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
  const seId = req.query.se_id ? parseInt(req.query.se_id as string) : null;

  const params: unknown[] = [threshold];
  const seFilter = seId ? `AND o.se_owner_id = $${params.push(seId)}` : '';

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

// ── Agentic Qualification ──────────────────────────────────────────────────────

// GET /insights/agentic-qual  — all active opps that have agentic_qual content
router.get('/agentic-qual', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
            o.deploy_mode, o.team, o.record_type, o.agentic_qual, o.updated_at,
            u.id AS se_owner_id, u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON o.se_owner_id = u.id
     WHERE o.is_active = true AND o.is_closed_lost = false
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
       AND o.is_active = true AND o.is_closed_lost = false
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
router.post('/agentic-qual/ai-summary', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<{
    name: string; account_name: string; se_owner_name: string | null;
    deploy_mode: string | null; stage: string; agentic_qual: string;
  }>(
    `SELECT o.name, o.account_name, o.stage, o.deploy_mode, o.agentic_qual,
            u.name AS se_owner_name
     FROM opportunities o
     LEFT JOIN users u ON o.se_owner_id = u.id
     WHERE o.is_active = true AND o.is_closed_lost = false
       AND o.agentic_qual IS NOT NULL AND length(o.agentic_qual) > 0
     ORDER BY u.name NULLS LAST, o.name`
  );

  if (rows.length === 0) {
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

  res.json(ok({ summary, generated_at: new Date().toISOString(), count: rows.length }));
});

// GET /insights/weekly-digest?days=7|14|30
router.get('/weekly-digest', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const days = parseInt((req.query.days as string) ?? '7') || 7;

  const [newOpps, stageProgressions, staleDeals, pocsStarted, pocsEnded, closedLost, atRiskCandidates] =
    await Promise.all([
      // New qualified opportunities: opps that entered Build Value within the window.
      // Covers two cases: (a) progressed TO Build Value (stage_changed_at in window),
      // (b) first appeared in the import already at Build Value (first_seen_at in window,
      // no stage_changed_at yet).
      query(
        `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency, o.stage,
                o.close_date, o.ae_owner_name, o.team,
                u.id AS se_owner_id, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.is_active = true AND o.is_closed_lost = false
           AND o.stage = 'Build Value'
           AND (
             o.stage_changed_at >= now() - ($1 || ' days')::interval
             OR (o.first_seen_at >= now() - ($1 || ' days')::interval AND o.stage_changed_at IS NULL)
           )
         ORDER BY COALESCE(o.stage_changed_at, o.first_seen_at) DESC`,
        [days]
      ),

      // Stage progressions within the window
      query(
        `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency,
                o.stage AS current_stage, o.previous_stage, o.stage_changed_at,
                o.ae_owner_name, o.team,
                u.id AS se_owner_id, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.stage_changed_at >= now() - ($1 || ' days')::interval
           AND o.stage_changed_at IS NOT NULL
           AND o.is_active = true AND o.is_closed_lost = false
         ORDER BY o.stage_changed_at DESC`,
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
                o.overdue_task_count,
                u.id AS se_owner_id, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.is_active = true AND o.is_closed_lost = false
           AND o.stage NOT IN ('Qualify')
           AND (
             o.overdue_task_count > 0
             OR o.se_comments_updated_at IS NULL
             OR o.se_comments_updated_at < now() - interval '14 days'
           )
         ORDER BY o.overdue_task_count DESC NULLS LAST, o.se_comments_updated_at ASC NULLS FIRST`
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
      `SELECT o.id, o.name, o.account_name, o.rfx_status, o.rfx_submission_date, o.team,
              u.id   AS se_owner_id,
              u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
        WHERE o.rfx_status IS NOT NULL AND o.rfx_status != ''
          AND o.rfx_submission_date IS NOT NULL
          AND o.is_active = true
          ${seFilter}
        ORDER BY o.rfx_submission_date ASC`
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

export default router;

