import { Request, Response } from 'express';
import { query } from '../../db/index.js';

// Handler for GET /insights/weekly-digest?days=7|14|30
// Aggregates pipeline activity for a manager's weekly review:
//   • new qualified opportunities (entered Build Value within window)
//   • stage progressions (every stage entered within window — multi-stage jumps included)
//   • stale deals (no notes / SE comments / next-step / task activity)
//   • POCs started / ended within window
//   • closed-lost deals within window
//   • at-risk candidates (overdue tasks or stale SE comments ≥ 14d)
export async function weeklyDigestHandler(req: Request, res: Response): Promise<void> {
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
                  o.next_step_sf, o.se_comments,
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
                next_step_sf, se_comments,
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

      // Stale deals: no in-app notes, no task activity, AND no SE comments OR
      // AE Next Step update within the window. Any one of these signals being
      // fresh makes the deal not stale. `next_step_updated_at` is populated
      // from the SF Next Step field on each import (see migration 051).
      query(
        `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency, o.stage,
                o.ae_owner_name, o.team,
                o.next_step_sf, o.se_comments,
                o.last_note_at, o.se_comments_updated_at, o.next_step_updated_at,
                EXTRACT(DAY FROM now() - GREATEST(
                  o.last_note_at,
                  o.se_comments_updated_at,
                  o.next_step_updated_at,
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
           AND (o.next_step_updated_at  IS NULL OR o.next_step_updated_at  < now() - ($1 || ' days')::interval)
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

      // Closed Lost within the window — SF reports Stage='Closed Lost' directly;
      // closed_at is set from Stage Date: Closed - Lost at import time.
      query(
        `SELECT o.id, o.name, o.account_name, o.arr, o.arr_currency,
                o.stage, o.previous_stage,
                o.lost_reason, o.lost_sub_reason, o.lost_reason_comments, o.lost_to_competitor,
                o.closed_at, o.ae_owner_name, o.team,
                u.id AS se_owner_id, u.name AS se_owner_name
         FROM opportunities o
         LEFT JOIN users u ON u.id = o.se_owner_id
         WHERE o.is_closed_lost = true
           AND o.closed_at >= now() - ($1 || ' days')::interval
         ORDER BY
           CASE o.previous_stage
             WHEN 'Negotiate'             THEN 6
             WHEN 'Submitted for Booking' THEN 5
             WHEN 'Proposal Sent'         THEN 4
             WHEN 'Build Value'           THEN 3
             WHEN 'Develop Solution'      THEN 2
             WHEN 'Qualify'               THEN 1
             ELSE 0
           END DESC,
           o.closed_at DESC`,
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
}
