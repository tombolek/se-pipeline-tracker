import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest, ok } from '../types/index.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /home/digest — SE daily digest: tasks, PoC alerts, recent activity, closed lost, stale deals, upcoming
router.get('/digest', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  const uid = user.id;

  const [myTasks, pocAlerts, recentActivity, closedLost, staleDeals, upcoming] = await Promise.all([
    // 1. My tasks: overdue + due today + due this week (open/in_progress/blocked)
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
       ORDER BY
         CASE WHEN t.due_date < CURRENT_DATE THEN 0
              WHEN t.due_date = CURRENT_DATE THEN 1
              ELSE 2
         END,
         t.due_date ASC NULLS LAST,
         t.created_at DESC`,
      [uid]
    ),

    // 2. PoC alerts: my deals with PoC ending within 7 days
    query(
      `SELECT o.id, o.name, o.account_name, o.poc_status,
              o.poc_end_date,
              (o.poc_end_date::date - CURRENT_DATE) AS days_remaining
       FROM opportunities o
       WHERE o.se_owner_id = $1
         AND o.is_active = true AND o.is_closed_lost = false
         AND o.poc_status IS NOT NULL AND o.poc_status != ''
         AND o.poc_end_date IS NOT NULL
         AND o.poc_end_date::date <= CURRENT_DATE + 7
         AND o.poc_end_date::date >= CURRENT_DATE - 3
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
          AND n.created_at >= now() - interval '7 days'
          AND o.is_active = true
      )
      UNION ALL
      (
        SELECT 'stage_change' AS activity_type,
               o.stage_changed_at AS activity_at,
               NULL AS actor_name,
               o.id AS opportunity_id,
               o.name AS opportunity_name,
               o.stage AS detail,
               o.previous_stage AS extra
        FROM opportunities o
        WHERE o.se_owner_id = $1
          AND o.stage_changed_at >= now() - interval '7 days'
          AND o.previous_stage IS NOT NULL
          AND o.is_active = true
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
  ]);

  // Compute summary counts
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = (myTasks as { due_date: string | null }[]).filter(t => t.due_date && t.due_date < today).length;
  const dueTodayCount = (myTasks as { due_date: string | null }[]).filter(t => t.due_date && t.due_date.slice(0, 10) === today).length;

  res.json(ok({
    summary: {
      overdue: overdueCount,
      due_today: dueTodayCount,
      poc_alerts: (pocAlerts as unknown[]).length,
      closed_lost_unread: (closedLost as unknown[]).length,
      stale_deals: (staleDeals as unknown[]).length,
    },
    tasks: myTasks,
    poc_alerts: pocAlerts,
    recent_activity: recentActivity,
    closed_lost: closedLost,
    stale_deals: staleDeals,
    upcoming: upcoming,
  }));
});

export default router;
