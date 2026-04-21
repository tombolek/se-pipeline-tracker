import Anthropic from '@anthropic-ai/sdk';
import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { startJob, completeJob, failJob } from '../services/aiJobs.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const mgr  = requireManager as unknown as (req: Request, res: Response, next: () => void) => void;

// ── MEDDPICC fields for score computation ───────────────────────────────────
const MEDDPICC_FIELDS = [
  'metrics', 'economic_buyer', 'decision_criteria', 'decision_process',
  'paper_process', 'implicate_pain', 'champion', 'authority', 'need',
];

function computeMeddpiccScore(row: Record<string, unknown>): number {
  return MEDDPICC_FIELDS.filter(f => row[f] && String(row[f]).trim().length > 0).length;
}

// ── Region → team mapping (mirrors the FE) ───────────────────────────────────
const NA_TEAMS   = ['NA Enterprise', 'NA Strategic'];
const INTL_TEAMS = ['EMEA', 'ANZ'];
type ForecastRegion = 'NA' | 'INTL';

function isRegion(v: unknown): v is ForecastRegion {
  return v === 'NA' || v === 'INTL';
}

function teamsForRegion(region: ForecastRegion): string[] {
  return region === 'NA' ? NA_TEAMS : INTL_TEAMS;
}

function narrativeCacheKey(fq: string, region: ForecastRegion | null): string {
  // Separate cache per region. Legacy (unscoped) keys remain for ad-hoc read.
  return region ? `forecast-narrative-${fq}-${region}` : `forecast-narrative-${fq}`;
}

// ── GET /forecasting-brief?fq=Q2-2026 ──────────────────────────────────────
router.get('/', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  let fq = req.query.fq as string | undefined;
  const regionParam = req.query.region as string | undefined;
  const region: ForecastRegion | null = isRegion(regionParam) ? regionParam : null;

  // Default to the current fiscal quarter based on today's date
  if (!fq) {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    fq = `Q${quarter}-${now.getFullYear()}`;
  }

  // Fetch all opportunities for this FQ
  const rows = await query(
    `SELECT
       o.id, o.name, o.account_name, o.account_industry,
       o.arr, o.arr_currency, o.stage,
       -- Prefer the SF per-stage date for the deal's CURRENT stage
       -- (more accurate than import-tracked stage_changed_at).
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
       o.close_date,
       o.forecast_status, o.record_type, o.team, o.key_deal,
       o.se_owner_id,
       u.name AS se_owner_name,
       o.ae_owner_name,
       o.se_comments, o.se_comments_updated_at,
       CASE
         WHEN o.se_comments_updated_at IS NULL THEN NULL
         ELSE EXTRACT(DAY FROM now() - o.se_comments_updated_at)::integer
       END AS se_comments_days_ago,
       o.next_step_sf, o.technical_blockers, o.poc_status, o.deploy_mode,
       o.engaged_competitors,
       o.metrics, o.economic_buyer, o.decision_criteria, o.decision_process,
       o.paper_process, o.implicate_pain, o.champion, o.authority, o.need, o.budget,
       COALESCE(
         (SELECT COUNT(*) FROM tasks t
          WHERE t.opportunity_id = o.id AND t.is_deleted = false
            AND t.status IN ('open','in_progress','blocked')
            AND t.due_date < CURRENT_DATE), 0
       )::integer AS overdue_task_count,
       o.products,
       s.content AS ai_summary,
       s.generated_at AS ai_summary_generated_at
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     LEFT JOIN ai_summary_cache s ON s.key = 'summary-' || o.id::text
     WHERE o.is_active = true AND o.is_closed_lost = false AND o.fiscal_period = $1
     ORDER BY
       CASE o.forecast_status
         WHEN 'Commit' THEN 1
         WHEN 'Most Likely' THEN 2
         WHEN 'Upside' THEN 3
         WHEN 'Pipeline' THEN 4
         WHEN 'Omitted' THEN 5
         ELSE 6
       END,
       o.arr DESC NULLS LAST`,
    [fq]
  );

  // Compute KPIs from the fetched rows
  let totalArr = 0, commitArr = 0, mlArr = 0, upsideArr = 0, wonArr = 0;
  let commitCount = 0, mlCount = 0, upsideCount = 0;
  let staleCount = 0, unassignedCount = 0, activePocs = 0;
  let meddpiccSum = 0, meddpiccDenom = 0;

  for (const r of rows) {
    const arr = parseFloat(String(r.arr ?? '0')) || 0;
    totalArr += arr;
    const fc = String(r.forecast_status || '').toLowerCase();
    if (fc === 'commit') { commitArr += arr; commitCount++; }
    else if (fc === 'most likely') { mlArr += arr; mlCount++; }
    else if (fc === 'upside') { upsideArr += arr; upsideCount++; }
    const daysAgo = r.se_comments_days_ago as number | null | undefined;
    // Only count as stale if SE is assigned but comments are old/missing
    if (r.se_owner_id) {
      if (daysAgo != null && daysAgo > 7) staleCount++;
      else if (r.se_comments_updated_at == null) staleCount++;
    }
    if (!r.se_owner_id) unassignedCount++;
    const pocStatus = String(r.poc_status || '');
    if (pocStatus && pocStatus.toLowerCase().includes('in progress')) activePocs++;
    // MEDDPICC avg for Commit + Most Likely
    if (fc === 'commit' || fc === 'most likely') {
      meddpiccSum += computeMeddpiccScore(r);
      meddpiccDenom++;
    }
  }

  const kpi = {
    total_arr: totalArr,
    deal_count: rows.length,
    commit_arr: commitArr,
    commit_count: commitCount,
    most_likely_arr: mlArr,
    most_likely_count: mlCount,
    upside_arr: upsideArr,
    upside_count: upsideCount,
    won_arr: wonArr,
    stale_comments_count: staleCount,
    unassigned_se_count: unassignedCount,
    active_pocs: activePocs,
    avg_meddpicc_commit_ml: meddpiccDenom > 0
      ? Math.round((meddpiccSum / meddpiccDenom) * 10) / 10
      : 0,
  };

  // Fetch cached narrative for the requested region (separate per NA / INTL)
  const narrativeRow = await queryOne(
    `SELECT content, generated_at FROM ai_summary_cache WHERE key = $1`,
    [narrativeCacheKey(fq, region)]
  );
  const narrative = narrativeRow
    ? { content: narrativeRow.content as string, generated_at: (narrativeRow.generated_at as Date).toISOString() }
    : null;

  res.json(ok({
    fiscal_period: fq,
    region,
    kpi,
    opportunities: rows,
    narrative,
  }));
});

// ── POST /forecasting-brief/narrative/generate ──────────────────────────────
router.post('/narrative/generate', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const fq = req.body.fiscal_period as string;
  if (!fq) { res.status(400).json(err('fiscal_period is required')); return; }
  const regionBody = req.body.region as string | undefined;
  const region: ForecastRegion | null = isRegion(regionBody) ? regionBody : null;
  const userId = (req as AuthenticatedRequest).user?.userId ?? null;

  // Fetch pipeline data for the prompt — filtered by region's teams when region is set
  const params: unknown[] = [fq];
  let teamFilter = '';
  if (region) {
    const teams = teamsForRegion(region);
    const placeholders = teams.map((_, i) => `$${i + 2}`).join(', ');
    params.push(...teams);
    teamFilter = `AND o.team IN (${placeholders})`;
  }
  const rows = await query(
    `SELECT
       o.name, o.account_name, o.arr, o.arr_currency, o.stage, o.forecast_status,
       o.se_comments, o.se_comments_updated_at, o.technical_blockers, o.key_deal,
       o.poc_status, o.next_step_sf, o.engaged_competitors,
       o.metrics, o.economic_buyer, o.decision_criteria, o.decision_process,
       o.paper_process, o.implicate_pain, o.champion, o.authority, o.need,
       u.name AS se_owner_name,
       CASE
         WHEN o.se_comments_updated_at IS NULL THEN NULL
         ELSE EXTRACT(DAY FROM now() - o.se_comments_updated_at)::integer
       END AS se_comments_days_ago
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.is_active = true AND o.is_closed_lost = false AND o.fiscal_period = $1 ${teamFilter}
     ORDER BY o.arr DESC NULLS LAST`,
    params
  );

  if (rows.length === 0) {
    res.status(404).json(err(`No opportunities found for ${fq}${region ? ` in ${region}` : ''}`));
    return;
  }

  // Build deal summaries for prompt
  const dealLines = rows.map((r: Record<string, unknown>) => {
    const arr = parseFloat(r.arr as string) || 0;
    const fc = r.forecast_status || 'Unset';
    const se = r.se_owner_name || 'Unassigned';
    const stale = r.se_comments_days_ago !== null ? `${r.se_comments_days_ago}d ago` : 'never';
    const meddpicc = computeMeddpiccScore(r);
    const blockers = r.technical_blockers || 'None';
    return `- ${r.name} | ${r.account_name} | $${Math.round(arr / 1000)}K ${r.arr_currency} | ${r.stage} | ${fc} | SE: ${se} | SE comments: ${stale} | MEDDPICC: ${meddpicc}/9 | PoC: ${r.poc_status || 'N/A'} | Blockers: ${blockers} | Competitors: ${r.engaged_competitors || 'None'} | Next Step: ${r.next_step_sf || 'None'}`;
  }).join('\n');

  const totalArr = rows.reduce((s: number, r: Record<string, unknown>) => s + (parseFloat(r.arr as string) || 0), 0);
  const commitArr = rows.filter((r: Record<string, unknown>) => (r.forecast_status as string || '').toLowerCase() === 'commit')
    .reduce((s: number, r: Record<string, unknown>) => s + (parseFloat(r.arr as string) || 0), 0);
  const mlArr = rows.filter((r: Record<string, unknown>) => (r.forecast_status as string || '').toLowerCase() === 'most likely')
    .reduce((s: number, r: Record<string, unknown>) => s + (parseFloat(r.arr as string) || 0), 0);

  const regionLabel = region === 'NA' ? 'NA (NA Enterprise + NA Strategic)'
                    : region === 'INTL' ? 'INTL (EMEA + ANZ)'
                    : 'All regions';

  const prompt = `You are an SE Manager preparing a forecasting brief for your leadership call.

Fiscal Quarter: ${fq}
Region scope: ${regionLabel}
Pipeline: $${Math.round(totalArr / 1000)}K total | $${Math.round(commitArr / 1000)}K Commit | $${Math.round(mlArr / 1000)}K Most Likely | ${rows.length} deals

Deals:
${dealLines}

Write a concise SE-perspective forecast narrative with exactly these 3 sections:

**On Track** — Deals progressing well from SE perspective. Mention specific deal names, ARR, and why they're on track (tech validated, PoC complete, fresh SE engagement, etc.)

**At Risk** — Deals with SE concerns: stale comments (>7d), technical blockers, low MEDDPICC scores, PoC delays, competitive threats. Be specific about the risk and what needs to happen.

**Needs Attention** — Deals requiring manager action: no SE assigned, critical gaps, escalation needed.

BE CONCISE. Each section should be 2-4 sentences. Use deal names and dollar amounts. Focus on actionable SE insights, not generic observations. Total response should be under 300 words.`;

  const cacheKey = narrativeCacheKey(fq, region);
  const job = await startJob({ key: cacheKey, feature: 'forecast-narrative', userId });
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const content = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    // Cache the narrative under the region-scoped key
    await query(
      `INSERT INTO ai_summary_cache (key, content, generated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET content = $2, generated_at = now()`,
      [cacheKey, content]
    );

    await completeJob(job.id);
    res.json(ok({ content, generated_at: new Date().toISOString() }));
  } catch (e: unknown) {
    await failJob(job.id, e instanceof Error ? e.message : String(e));
    console.error('[forecasting-brief] narrative generation failed:', e);
    res.status(500).json(err('Failed to generate forecast narrative'));
  }
});

// ── POST /forecasting-brief/summaries/bulk-generate ────────────────────────
// Accepts { opp_ids: number[] } and generates AI summaries sequentially.
// Only called after client filters to opps that are stale or missing summaries.
router.post('/summaries/bulk-generate', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const oppIds = req.body.opp_ids as number[] | undefined;
  if (!Array.isArray(oppIds) || oppIds.length === 0) {
    res.status(400).json(err('opp_ids array is required'));
    return;
  }

  // Cap at 200 to prevent abuse
  if (oppIds.length > 200) {
    res.status(400).json(err('Maximum 200 opportunities per batch'));
    return;
  }

  const userId = (req as AuthenticatedRequest).user?.userId ?? null;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const results: { id: number; status: 'ok' | 'error'; error?: string }[] = [];

  for (const oppId of oppIds) {
    const job = await startJob({ key: `summary-${oppId}`, feature: 'summary', opportunityId: oppId, userId });
    try {
      const opp = await queryOne<Record<string, unknown>>(
        `SELECT o.*, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.id = $1`,
        [oppId]
      );
      if (!opp) { await failJob(job.id, 'Not found'); results.push({ id: oppId, status: 'error', error: 'Not found' }); continue; }

      const tasks = await query(
        `SELECT t.title, t.status, t.due_date, t.is_next_step
         FROM tasks t WHERE t.opportunity_id = $1 AND t.is_deleted = false AND t.status != 'done'
         ORDER BY t.is_next_step DESC, t.due_date ASC NULLS LAST`,
        [oppId]
      );

      const notes = await query(
        `SELECT n.content, u.name AS author_name, n.created_at
         FROM notes n JOIN users u ON u.id = n.author_id
         WHERE n.opportunity_id = $1 AND n.is_deleted = false ORDER BY n.created_at DESC LIMIT 10`,
        [oppId]
      );

      const fmtDate = (d: unknown) => d ? new Date(d as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
      const fmtARR = (a: unknown) => a ? `$${(Number(a) / 1000).toFixed(0)}K` : 'N/A';

      const taskLines = tasks.length
        ? tasks.map((t: Record<string, unknown>) =>
            `- [${t.is_next_step ? 'NEXT STEP' : t.status}] ${t.title}${t.due_date ? ` (due ${fmtDate(t.due_date)})` : ''}`
          ).join('\n')
        : 'No open tasks.';

      const noteLines = notes.length
        ? [...notes].reverse().map((n: Record<string, unknown>) =>
            `[${fmtDate(n.created_at)} — ${n.author_name}]: ${n.content}`
          ).join('\n')
        : 'No notes yet.';

      const prompt = `You are an SE deal intelligence assistant. Write a concise deal summary in 3 short paragraphs using plain text with **bold** for emphasis on key names, numbers, and actions. Do NOT use markdown headers (#), bullet points, or lists. Keep it conversational and direct.

Paragraph 1: Current deal status and momentum (1-2 sentences).
Paragraph 2: Key risks or blockers (1-2 sentences).
Paragraph 3: Recommended next action starting with "**Recommended next action:**" (1-2 sentences).

Opportunity: ${opp.name}
Account: ${opp.account_name ?? 'N/A'}
Stage: ${opp.stage}
ARR: ${fmtARR(opp.arr)}
Close Date: ${fmtDate(opp.close_date)}
AE Owner: ${opp.ae_owner_name ?? 'N/A'}
SE Owner: ${opp.se_owner_name ?? 'Unassigned'}

Next Step (from SF): ${opp.next_step_sf ?? 'N/A'}

SE Comments: ${opp.se_comments ?? 'None'}

Manager Comments: ${opp.manager_comments ?? 'None'}

Open Tasks:
${taskLines}

Recent Notes (oldest to newest):
${noteLines}`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });

      const summaryBlock = response.content.find(b => b.type === 'text');
      const summary = summaryBlock && summaryBlock.type === 'text' ? summaryBlock.text : '';

      await query(
        `INSERT INTO ai_summary_cache (key, content, generated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET content = $2, generated_at = now()`,
        [`summary-${oppId}`, summary]
      );

      await completeJob(job.id);
      results.push({ id: oppId, status: 'ok' });
    } catch (e: unknown) {
      await failJob(job.id, e instanceof Error ? e.message : String(e));
      console.error(`[bulk-summary] Failed for opp ${oppId}:`, e);
      results.push({ id: oppId, status: 'error', error: String((e as Error).message || e) });
    }
  }

  const succeeded = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;
  res.json(ok({ total: oppIds.length, succeeded, failed, results }));
});

export default router;
