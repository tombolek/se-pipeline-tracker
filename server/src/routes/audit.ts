import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const mgr  = requireManager as unknown as (req: Request, res: Response, next: () => void) => void;

// ── POST /audit/events — batch-ingest frontend usage events ───────────────────
router.post('/events', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;

  const events = req.body as Array<{
    session_id?: string;
    page?: string;
    action?: string;
    entity_type?: string;
    entity_id?: string;
    metadata?: Record<string, unknown>;
    timestamp?: string;
  }>;

  if (!Array.isArray(events) || events.length === 0) {
    res.json(ok({ inserted: 0 }));
    return;
  }

  // Respond immediately — inserts happen async after
  res.json(ok({ inserted: events.length }));

  Promise.all(
    events.slice(0, 100).map(e =>
      query(
        `INSERT INTO events
           (user_id, session_id, page, action, entity_type, entity_id, metadata, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::timestamptz, now()))`,
        [
          userId,
          e.session_id ?? '',
          e.page ?? '',
          e.action ?? '',
          e.entity_type ?? null,
          e.entity_id    ?? null,
          e.metadata     ? JSON.stringify(e.metadata) : null,
          e.timestamp    ?? null,
        ]
      ).catch(() => {})
    )
  ).catch(() => {});
});

// ── GET /audit/log — paginated audit log (manager only) ───────────────────────
router.get('/log', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const limit  = Math.min(parseInt(req.query.limit  as string) || 100, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const userId = req.query.user_id ? parseInt(req.query.user_id as string) : null;
  const action = (req.query.action as string) || null;
  const days   = Math.min(parseInt(req.query.days as string) || 30, 180);

  const conditions: string[] = [`a.timestamp > now() - interval '${days} days'`];
  const params: unknown[] = [];

  if (userId) { params.push(userId); conditions.push(`a.user_id = $${params.length}`); }
  if (action) { params.push(action); conditions.push(`a.action  = $${params.length}`); }

  const where = 'WHERE ' + conditions.join(' AND ');

  const [entries, countRow] = await Promise.all([
    query(
      `SELECT a.id, a.timestamp, a.action, a.resource_type, a.resource_id, a.resource_name,
              a.before_value, a.after_value, a.ip_address, a.session_id,
              a.success, a.failure_reason, a.user_role,
              u.name AS user_name, u.email AS user_email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.timestamp DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM audit_log a ${where}`,
      params
    ),
  ]);

  res.json(ok({ entries, total: parseInt(countRow?.count ?? '0') }));
});

// ── GET /audit/usage — aggregated usage stats (manager only) ─────────────────
router.get('/usage', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const [pageViews, featureUsage, userActivity] = await Promise.all([
    // Page view counts per route
    query<{ page: string; views: string; unique_users: string; last_seen: string }>(
      `SELECT page,
              COUNT(*)              AS views,
              COUNT(DISTINCT user_id) AS unique_users,
              MAX(timestamp)          AS last_seen
       FROM events
       WHERE action = 'view'
         AND timestamp > now() - interval '180 days'
       GROUP BY page
       ORDER BY views DESC`
    ),
    // Non-view feature interactions
    query<{ action: string; entity_type: string; count: string; last_seen: string }>(
      `SELECT action,
              COALESCE(entity_type, '') AS entity_type,
              COUNT(*) AS count,
              MAX(timestamp) AS last_seen
       FROM events
       WHERE action != 'view'
         AND timestamp > now() - interval '180 days'
       GROUP BY action, entity_type
       ORDER BY count DESC`
    ),
    // Per-user event totals
    query<{ user_id: number; name: string; total_events: string; last_seen: string }>(
      `SELECT e.user_id, u.name,
              COUNT(*)       AS total_events,
              MAX(e.timestamp) AS last_seen
       FROM events e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.timestamp > now() - interval '180 days'
       GROUP BY e.user_id, u.name
       ORDER BY total_events DESC`
    ),
  ]);

  res.json(ok({ pageViews, featureUsage, userActivity }));
});

// ── GET /audit/actions — distinct action types for filter dropdown ─────────────
router.get('/actions', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<{ action: string }>(
    `SELECT DISTINCT action FROM audit_log ORDER BY action`
  );
  res.json(ok(rows.map(r => r.action)));
});

// ── GET /audit/users — users who appear in the audit log ─────────────────────
router.get('/users', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<{ id: number; name: string }>(
    `SELECT DISTINCT u.id, u.name
     FROM audit_log a
     JOIN users u ON u.id = a.user_id
     ORDER BY u.name`
  );
  res.json(ok(rows));
});

export default router;
