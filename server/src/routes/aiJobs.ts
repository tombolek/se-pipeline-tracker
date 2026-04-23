import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { findRunningJob, killJob } from '../services/aiJobs.js';
import { query, queryOne } from '../db/index.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const admin = requireAdmin as unknown as (req: Request, res: Response, next: () => void) => void;

// ── Existing client-facing endpoint (unchanged behaviour) ──────────────────
// GET /ai-jobs/by-key/:key — returns { running: boolean, job: AiJob | null }
// Used by the client to detect whether an AI generation for a given cache key is
// already in progress (so a user who navigated away can re-attach and poll for
// the result instead of kicking off a duplicate request).
router.get('/by-key/:key', auth, async (req: Request, res: Response): Promise<void> => {
  const key = req.params.key;
  const job = await findRunningJob(key);
  res.json(ok({ running: !!job, job }));
});

// ── Admin surface ──────────────────────────────────────────────────────────

// GET /ai-jobs — paginated list with filters (admin)
// Query: agent_id, status, user_id, since_hours, limit, offset
router.get('/', auth, admin, async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const agentId = req.query.agent_id ? Number(req.query.agent_id) : null;
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const userId = req.query.user_id ? Number(req.query.user_id) : null;
  const sinceHours = req.query.since_hours ? Number(req.query.since_hours) : null;

  const rows = await query(
    `SELECT j.id, j.agent_id, j.feature, j.status, j.model,
            j.input_tokens, j.output_tokens, j.duration_ms,
            j.started_at, j.finished_at, j.error, j.opportunity_id,
            j.killed_at, j.started_by_user_id,
            u.name AS started_by_name,
            a.name AS agent_name
     FROM ai_jobs j
     LEFT JOIN users  u ON u.id = j.started_by_user_id
     LEFT JOIN agents a ON a.id = j.agent_id
     WHERE ($1::int  IS NULL OR j.agent_id = $1)
       AND ($2::text IS NULL OR j.status = $2)
       AND ($3::int  IS NULL OR j.started_by_user_id = $3)
       AND ($4::int  IS NULL OR j.started_at > now() - ($4 || ' hours')::interval)
     ORDER BY j.started_at DESC
     LIMIT $5 OFFSET $6`,
    [agentId, status, userId, sinceHours, limit, offset],
  );
  res.json(ok(rows));
});

// GET /ai-jobs/running — admin view, all currently running jobs across agents
router.get('/running', auth, admin, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT j.id, j.agent_id, j.feature, j.status, j.model, j.started_at,
            j.opportunity_id, j.started_by_user_id,
            u.name AS started_by_name,
            a.name AS agent_name
     FROM ai_jobs j
     LEFT JOIN users  u ON u.id = j.started_by_user_id
     LEFT JOIN agents a ON a.id = j.agent_id
     WHERE j.status = 'running'
     ORDER BY j.started_at ASC`,
  );
  res.json(ok(rows));
});

// GET /ai-jobs/usage-summary?since_hours=168  — rollup by agent + by user
router.get('/usage-summary', auth, admin, async (req: Request, res: Response): Promise<void> => {
  const sinceHours = Math.max(Number(req.query.since_hours) || 24 * 7, 1); // default: 7 days

  const byAgent = await query(
    `SELECT a.id AS agent_id, a.name AS agent_name, a.feature,
            COUNT(j.id)::int                                        AS calls,
            COALESCE(SUM(j.input_tokens), 0)::int                   AS input_tokens,
            COALESCE(SUM(j.output_tokens), 0)::int                  AS output_tokens,
            SUM(CASE WHEN j.status = 'failed' THEN 1 ELSE 0 END)::int AS failed,
            SUM(CASE WHEN j.status = 'killed' THEN 1 ELSE 0 END)::int AS killed,
            AVG(j.duration_ms)::int                                 AS avg_duration_ms
     FROM agents a
     LEFT JOIN ai_jobs j
       ON j.agent_id = a.id
      AND j.started_at > now() - ($1 || ' hours')::interval
     GROUP BY a.id, a.name, a.feature
     ORDER BY calls DESC NULLS LAST, a.name ASC`,
    [String(sinceHours)],
  );

  const byUser = await query(
    `SELECT u.id AS user_id, u.name AS user_name,
            COUNT(j.id)::int                                         AS calls,
            COALESCE(SUM(j.input_tokens), 0)::int                    AS input_tokens,
            COALESCE(SUM(j.output_tokens), 0)::int                   AS output_tokens
     FROM ai_jobs j
     JOIN users u ON u.id = j.started_by_user_id
     WHERE j.started_at > now() - ($1 || ' hours')::interval
     GROUP BY u.id, u.name
     ORDER BY calls DESC
     LIMIT 50`,
    [String(sinceHours)],
  );

  const byDay = await query(
    `SELECT DATE_TRUNC('day', started_at)::date AS day,
            COUNT(*)::int                                AS calls,
            COALESCE(SUM(input_tokens), 0)::int          AS input_tokens,
            COALESCE(SUM(output_tokens), 0)::int         AS output_tokens
     FROM ai_jobs
     WHERE started_at > now() - ($1 || ' hours')::interval
     GROUP BY day
     ORDER BY day ASC`,
    [String(sinceHours)],
  );

  res.json(ok({ window_hours: sinceHours, by_agent: byAgent, by_user: byUser, by_day: byDay }));
});

// GET /ai-jobs/:id — admin job detail. Includes prompt_text / response_text
// only when the owning agent has log_io = true (which is what caused them to
// be persisted in the first place).
router.get('/:id', auth, admin, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json(err('Invalid job id')); return; }

  const row = await queryOne(
    `SELECT j.*,
            u.name AS started_by_name,
            k.name AS killed_by_name,
            a.name AS agent_name,
            a.log_io AS agent_log_io
     FROM ai_jobs j
     LEFT JOIN users u  ON u.id = j.started_by_user_id
     LEFT JOIN users k  ON k.id = j.killed_by_user_id
     LEFT JOIN agents a ON a.id = j.agent_id
     WHERE j.id = $1`,
    [id],
  );
  if (!row) { res.status(404).json(err('Job not found')); return; }
  res.json(ok(row));
});

// POST /ai-jobs/:id/kill — admin interrupts a running job
router.post('/:id/kill', auth, admin, async (req: Request, res: Response): Promise<void> => {
  const authed = req as AuthenticatedRequest;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json(err('Invalid job id')); return; }

  const { job, had_controller } = await killJob(id, authed.user.userId);
  if (!job) {
    res.status(409).json(err('Job is not running (may have already finished or been killed)'));
    return;
  }
  res.json(ok({ job, aborted_in_flight: had_controller }));
});

export default router;
