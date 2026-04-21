import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest, ok } from '../types/index.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /home/digest — SE daily digest: tasks, PoC alerts, recent activity, closed lost, stale deals, upcoming
router.get('/digest', auth, async (req: Request, res: Response): Promise<void> => {
  try {
  const user = (req as AuthenticatedRequest).user;
  const uid = user.userId;

  const [myTasks, pocAlerts, recentActivity, closedLost, staleDeals, upcoming, hygieneRaw] = await Promise.all([
    // 1. My tasks: overdue + due today + due this week (open/in_progress/blocked)
    // "Today's Tasks" card: overdue + due today only. Tasks due tomorrow
    // through 7 days out are covered by the "Upcoming This Week" section.
    // Tasks with no due_date are viewable from /my-tasks.
    query(
      `SELECT t.id, t.title, t.status, t.due_date, t.is_next_step,
              t.opportunity_id,
              o.name AS opportunity_name
       FROM tasks t
       JOIN opportunities o ON o.id = t.opportunity_id
       WHERE t.assigned_to_id = $1
         AND t.is_deleted = false
         AND t.status IN ('open', 'in_progress', 'blocked')
         AND o.is_active = true AND o.is_closed_lost = false
         AND t.due_date IS NOT NULL
         AND t.due_date <= CURRENT_DATE
       ORDER BY
         CASE WHEN t.due_date < CURRENT_DATE THEN 0
              ELSE 1
         END,
         t.due_date ASC,
         t.created_at DESC`,
      [uid]
    ),

    // 2. PoC alerts: my deals with PoCs ending within the next two weeks, OR
    //    overdue PoCs in an active status (Identified / In Deployment / In Progress
    //    / Wrapping Up). Closed PoC statuses drop out so the card doesn't carry
    //    long-finished PoCs forever.
    query(
      `SELECT o.id, o.name, o.account_name, o.poc_status,
              o.poc_end_date,
              (o.poc_end_date::date - CURRENT_DATE) AS days_remaining
       FROM opportunities o
       WHERE o.se_owner_id = $1
         AND o.is_active = true AND o.is_closed_lost = false
         AND o.poc_status = ANY(ARRAY['Identified', 'In Deployment', 'In Progress', 'Wrapping Up'])
         AND o.poc_end_date IS NOT NULL
         AND o.poc_end_date::date <= CURRENT_DATE + 14
       ORDER BY o.poc_end_date ASC`,
      [uid]
    ),

    // 3. Recent activity on my deals (last 7 days): notes by others, stage changes, comment updates
    query(
      `(
        SELECT 'note' AS activity_type,
               n.created_at AS activity_at,
               u2.name AS actor_name,
               o.id AS opportunity_id,
               o.name AS opportunity_name,
               LEFT(n.content, 200) AS detail,
               NULL AS extra
        FROM notes n
        JOIN opportunities o ON o.id = n.opportunity_id
        JOIN users u2 ON u2.id = n.author_id
        WHERE o.se_owner_id = $1
          AND n.author_id != $1
          AND n.is_deleted = false
          AND n.created_at >= now() - interval '7 days'
          AND o.is_active = true
      )
      UNION ALL
      (
        -- Stage change activity — driven by SF stage_date_* fields, so ALL stage moves
        -- within the last 7 days appear (not just the most recent transition per deal).
        WITH stage_entries AS (
          SELECT o.id, o.name, o.se_owner_id, o.is_active,
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
        SELECT 'stage_change' AS activity_type,
               r.stage_date::timestamptz AS activity_at,
               NULL AS actor_name,
               r.id AS opportunity_id,
               r.name AS opportunity_name,
               r.stage_name AS detail,
               r.previous_stage AS extra
        FROM ranked r
        WHERE r.se_owner_id = $1
          AND r.is_active = true
          AND r.previous_stage IS NOT NULL
          AND r.stage_date >= CURRENT_DATE - interval '7 days'
      )
      UNION ALL
      (
        SELECT 'manager_comment' AS activity_type,
               o.manager_comments_updated_at AS activity_at,
               NULL AS actor_name,
               o.id AS opportunity_id,
               o.name AS opportunity_name,
               LEFT(o.manager_comments, 200) AS detail,
               NULL AS extra
        FROM opportunities o
        WHERE o.se_owner_id = $1
          AND o.manager_comments_updated_at >= now() - interval '7 days'
          AND o.manager_comments IS NOT NULL
          AND o.is_active = true
      )
      ORDER BY activity_at DESC
      LIMIT 20`,
      [uid]
    ),

    // 4. Unread closed lost (my deals)
    query(
      `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency,
              o.stage AS last_stage, o.previous_stage, o.closed_at
       FROM opportunities o
       WHERE o.se_owner_id = $1
         AND o.is_closed_lost = true
         AND o.closed_lost_seen = false
       ORDER BY o.closed_at DESC NULLS LAST`,
      [uid]
    ),

    // 5. Stale deals: my active opps with no notes, no SE comments update, no task activity in 21+ days
    query(
      `SELECT o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
              o.last_note_at, o.se_comments_updated_at,
              GREATEST(o.last_note_at, o.se_comments_updated_at,
                (SELECT MAX(t.updated_at) FROM tasks t
                 WHERE t.opportunity_id = o.id AND t.is_deleted = false)
              ) AS last_activity_at
       FROM opportunities o
       WHERE o.se_owner_id = $1
         AND o.is_active = true AND o.is_closed_lost = false
         AND o.stage NOT IN ('Qualify', 'Closed Won')
         AND (o.last_note_at IS NULL OR o.last_note_at < now() - interval '21 days')
         AND (o.se_comments_updated_at IS NULL OR o.se_comments_updated_at < now() - interval '21 days')
         AND NOT EXISTS (
           SELECT 1 FROM tasks t
           WHERE t.opportunity_id = o.id
             AND t.is_deleted = false
             AND t.updated_at >= now() - interval '21 days'
         )
       ORDER BY GREATEST(o.last_note_at, o.se_comments_updated_at) ASC NULLS FIRST
       LIMIT 10`,
      [uid]
    ),

    // 6. Upcoming this week: tasks + PoC end dates + RFx submissions within 7 days
    query(
      `(
        SELECT 'task' AS event_type,
               t.due_date::date AS event_date,
               t.title AS label,
               t.is_next_step,
               t.opportunity_id,
               o.name AS opportunity_name
        FROM tasks t
        JOIN opportunities o ON o.id = t.opportunity_id
        WHERE t.assigned_to_id = $1
          AND t.is_deleted = false
          AND t.status IN ('open', 'in_progress')
          AND t.due_date >= CURRENT_DATE + 1
          AND t.due_date <= CURRENT_DATE + 7
          AND o.is_active = true AND o.is_closed_lost = false
      )
      UNION ALL
      (
        SELECT 'poc_end' AS event_type,
               o.poc_end_date::date AS event_date,
               'PoC end date' AS label,
               false AS is_next_step,
               o.id AS opportunity_id,
               o.name AS opportunity_name
        FROM opportunities o
        WHERE o.se_owner_id = $1
          AND o.poc_end_date >= CURRENT_DATE + 1
          AND o.poc_end_date <= CURRENT_DATE + 7
          AND o.is_active = true AND o.is_closed_lost = false
          AND o.poc_status IS NOT NULL AND o.poc_status != ''
      )
      UNION ALL
      (
        SELECT 'rfx_submission' AS event_type,
               o.rfx_submission_date::date AS event_date,
               'RFx submission deadline' AS label,
               false AS is_next_step,
               o.id AS opportunity_id,
               o.name AS opportunity_name
        FROM opportunities o
        WHERE o.se_owner_id = $1
          AND o.rfx_submission_date >= CURRENT_DATE + 1
          AND o.rfx_submission_date <= CURRENT_DATE + 7
          AND o.is_active = true AND o.is_closed_lost = false
          AND o.rfx_status IS NOT NULL AND o.rfx_status != ''
      )
      ORDER BY event_date ASC, label ASC
      LIMIT 15`,
      [uid]
    ),

    // 7. SE Data Hygiene: active opps with SE-responsibility issues
    query(
      `SELECT o.id, o.name, o.account_name, o.stage, o.arr, o.arr_currency,
              o.se_comments, o.se_comments_updated_at,
              o.poc_status, o.poc_start_date, o.poc_end_date,
              o.technical_blockers, o.next_step_sf, o.last_note_at,
              u.id AS se_owner_id, u.name AS se_owner_name
       FROM opportunities o
       LEFT JOIN users u ON u.id = o.se_owner_id
       WHERE o.se_owner_id = $1
         AND o.is_active = true AND o.is_closed_lost = false
         AND COALESCE(o.is_closed_won, false) = false
       ORDER BY COALESCE(o.arr, 0) DESC NULLS LAST`,
      [uid]
    ),
  ]);

  // Compute summary counts
  const today = new Date().toISOString().slice(0, 10);
  const nowMs = Date.now();
  const overdueCount = (myTasks as { due_date: Date | string | null }[]).filter(t => {
    if (!t.due_date) return false;
    const d = typeof t.due_date === 'string' ? t.due_date.slice(0, 10) : t.due_date.toISOString().slice(0, 10);
    return d < today;
  }).length;
  const dueTodayCount = (myTasks as { due_date: Date | string | null }[]).filter(t => {
    if (!t.due_date) return false;
    const d = typeof t.due_date === 'string' ? t.due_date.slice(0, 10) : t.due_date.toISOString().slice(0, 10);
    return d === today;
  }).length;

  // ── SE Data Hygiene: compute flags per opp ──────────────────────────────
  type HygieneOpp = {
    id: number; name: string; account_name: string | null;
    stage: string; arr: number | null; arr_currency: string;
    se_comments: string | null; se_comments_updated_at: string | null;
    poc_status: string | null; poc_start_date: string | null; poc_end_date: string | null;
    technical_blockers: string | null; next_step_sf: string | null; last_note_at: string | null;
    se_owner_id: number | null; se_owner_name: string | null;
  };
  const POC_ACTIVE = ['Identified', 'In Deployment', 'In Progress', 'Wrapping Up'];
  const POC_STARTED = ['In Progress', 'Wrapping Up'];
  const dayMs = 86_400_000;

  function daysSinceStr(iso: string | null): number | null {
    if (!iso) return null;
    return Math.floor((nowMs - new Date(iso).getTime()) / dayMs);
  }

  function toDateStr(v: string | Date | null): string | null {
    if (!v) return null;
    return typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
  }

  const hygiene: { id: number; name: string; account_name: string | null; stage: string; arr: number | null; arr_currency: string; se_owner_id: number | null; se_owner_name: string | null; flags: string[] }[] = [];

  for (const raw of hygieneRaw as HygieneOpp[]) {
    const flags: string[] = [];
    const seCommentsDays = daysSinceStr(raw.se_comments_updated_at);
    const pocStart = toDateStr(raw.poc_start_date);
    const pocEnd = toDateStr(raw.poc_end_date);
    const pocStatus = raw.poc_status?.trim() || null;

    // Rule 1: Stale SE Comments (>21 days or never updated)
    if (seCommentsDays === null) {
      flags.push('SE Comments never updated');
    } else if (seCommentsDays > 21) {
      flags.push(`SE Comments ${seCommentsDays}d old`);
    }

    // Rule 2: PoC not started on time
    if (pocStart && pocStart < today && pocStatus && POC_ACTIVE.includes(pocStatus) && !POC_STARTED.includes(pocStatus)) {
      flags.push('PoC should be In Progress');
    }

    // Rule 3: PoC overrunning
    if (pocStatus === 'In Progress' && pocEnd && pocEnd < today) {
      const overdue = Math.floor((nowMs - new Date(pocEnd).getTime()) / dayMs);
      flags.push(`PoC overdue by ${overdue}d`);
    }

    // Rule 4: PoC wrap-up overdue
    if (pocStatus === 'Wrapping Up' && pocEnd && pocEnd < today) {
      const overdue = Math.floor((nowMs - new Date(pocEnd).getTime()) / dayMs);
      flags.push(`PoC wrap-up overdue ${overdue}d`);
    }

    // Rule 5: PoC timeline too long (>6 weeks)
    if (pocStart && pocEnd) {
      const span = Math.floor((new Date(pocEnd).getTime() - new Date(pocStart).getTime()) / dayMs);
      if (span > 42) {
        flags.push(`PoC span ${Math.round(span / 7)}wk`);
      }
    }

    // Rule 6: Develop Solution or later → missing PoC planning
    if (raw.stage === 'Develop Solution' && (!pocStatus || !pocStart)) {
      if (!pocStatus && !pocStart) {
        flags.push('Missing PoC planning');
      } else if (!pocStatus) {
        flags.push('Missing PoC status');
      } else if (!pocStart) {
        flags.push('Missing PoC start date');
      }
    }

    // Rule 7: Develop Solution or later → missing Tech Blockers
    const DEVELOP_OR_LATER = ['Develop Solution', 'Build Value', 'Proposal Sent', 'Submitted for Booking', 'Negotiate'];
    if (DEVELOP_OR_LATER.includes(raw.stage) && !raw.technical_blockers?.trim()) {
      flags.push('Missing Tech Blockers');
    }

    // Rule 8: Demo mentioned in SE Comments or Next Step, but no recent note
    const demoRe = /\bdemo\b/i;
    const mentionsDemo = (raw.se_comments && demoRe.test(raw.se_comments)) ||
                         (raw.next_step_sf && demoRe.test(raw.next_step_sf));
    if (mentionsDemo) {
      const lastNote = daysSinceStr(raw.last_note_at);
      if (lastNote === null || lastNote > 7) {
        flags.push('Demo mentioned, no follow-up');
      }
    }

    if (flags.length > 0) {
      hygiene.push({
        id: raw.id, name: raw.name, account_name: raw.account_name,
        stage: raw.stage, arr: raw.arr, arr_currency: raw.arr_currency,
        se_owner_id: raw.se_owner_id, se_owner_name: raw.se_owner_name,
        flags,
      });
    }
  }

  res.json(ok({
    summary: {
      overdue: overdueCount,
      due_today: dueTodayCount,
      poc_alerts: (pocAlerts as unknown[]).length,
      closed_lost_unread: (closedLost as unknown[]).length,
      stale_deals: (staleDeals as unknown[]).length,
      hygiene_issues: hygiene.length,
    },
    tasks: myTasks,
    poc_alerts: pocAlerts,
    recent_activity: recentActivity,
    closed_lost: closedLost,
    stale_deals: staleDeals,
    upcoming: upcoming,
    hygiene,
  }));
  } catch (err) {
    console.error('Home digest error:', err);
    res.status(500).json({ data: null, error: 'Failed to load digest', meta: {} });
  }
});

export default router;
