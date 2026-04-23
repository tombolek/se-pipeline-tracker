/**
 * Admin-only: agent registry endpoints.
 *
 * GET    /agents                      — list all agents + last-24h usage rollup
 * GET    /agents/:id                  — one agent + its latest few jobs
 * PATCH  /agents/:id                  — update settings (creates new version)
 * GET    /agents/:id/versions         — change history
 * GET    /agents/:id/jobs             — paginated job history for this agent
 * GET    /agents/:id/usage            — 30-day token/call rollup
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { query } from '../db/index.js';
import {
  listAgents,
  getAgentById,
  updateAgentSettings,
  listVersionsForAgent,
} from '../services/agents.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const admin = requireAdmin as unknown as (req: Request, res: Response, next: () => void) => void;

router.use(auth, admin);

// GET /agents  — list + last-24h rollup per agent
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const agents = await listAgents();
  const rollup = await query<{
    agent_id: number;
    total_calls: string;
    total_input_tokens: string;
    total_output_tokens: string;
    failed_calls: string;
    running_calls: string;
  }>(
    `SELECT agent_id,
            COUNT(*)::text                                   AS total_calls,
            COALESCE(SUM(input_tokens), 0)::text             AS total_input_tokens,
            COALESCE(SUM(output_tokens), 0)::text            AS total_output_tokens,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::text  AS failed_calls,
            SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)::text AS running_calls
     FROM ai_jobs
     WHERE agent_id IS NOT NULL
       AND started_at > now() - interval '24 hours'
     GROUP BY agent_id`,
  );
  const byAgent = new Map(rollup.map(r => [r.agent_id, r]));

  const enriched = agents.map(a => {
    const r = byAgent.get(a.id);
    return {
      ...a,
      usage_24h: {
        total_calls: Number(r?.total_calls ?? 0),
        input_tokens: Number(r?.total_input_tokens ?? 0),
        output_tokens: Number(r?.total_output_tokens ?? 0),
        failed_calls: Number(r?.failed_calls ?? 0),
        running_calls: Number(r?.running_calls ?? 0),
      },
    };
  });

  res.json(ok(enriched));
});

// GET /agents/:id  — detail
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json(err('Invalid agent id')); return; }
  const agent = await getAgentById(id);
  if (!agent) { res.status(404).json(err('Agent not found')); return; }

  const recentJobs = await query(
    `SELECT j.id, j.status, j.model, j.input_tokens, j.output_tokens, j.duration_ms,
            j.started_at, j.finished_at, j.error, j.opportunity_id,
            u.name AS started_by_name
     FROM ai_jobs j
     LEFT JOIN users u ON u.id = j.started_by_user_id
     WHERE j.agent_id = $1
     ORDER BY j.started_at DESC
     LIMIT 20`,
    [id],
  );

  res.json(ok({ agent, recent_jobs: recentJobs }));
});

// PATCH /agents/:id  — change settings (and create a new version row)
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const authed = req as AuthenticatedRequest;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json(err('Invalid agent id')); return; }

  const body = req.body as {
    default_model?: string;
    default_max_tokens?: number;
    is_enabled?: boolean;
    log_io?: boolean;
    system_prompt_extra?: string;
    note?: string | null;
  };

  try {
    const updated = await updateAgentSettings(id, body, authed.user?.userId ?? null);
    res.json(ok(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update agent';
    // Known business-rule error from the service → 400. Unknown → 500.
    const isValidation = /between 100 and 16000|not found/i.test(msg);
    res.status(isValidation ? 400 : 500).json(err(msg));
  }
});

// GET /agents/:id/versions  — change history
router.get('/:id/versions', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json(err('Invalid agent id')); return; }
  const versions = await listVersionsForAgent(id);
  res.json(ok(versions));
});

// GET /agents/:id/jobs?limit=100&offset=0&status=...
router.get('/:id/jobs', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json(err('Invalid agent id')); return; }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const status = typeof req.query.status === 'string' ? req.query.status : null;

  const rows = await query(
    `SELECT j.id, j.status, j.model, j.input_tokens, j.output_tokens, j.duration_ms,
            j.started_at, j.finished_at, j.error, j.opportunity_id,
            u.name AS started_by_name
     FROM ai_jobs j
     LEFT JOIN users u ON u.id = j.started_by_user_id
     WHERE j.agent_id = $1
       AND ($2::text IS NULL OR j.status = $2)
     ORDER BY j.started_at DESC
     LIMIT $3 OFFSET $4`,
    [id, status, limit, offset],
  );
  res.json(ok(rows));
});

// GET /agents/:id/usage  — 30-day daily rollup
router.get('/:id/usage', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json(err('Invalid agent id')); return; }
  const rows = await query(
    `SELECT DATE_TRUNC('day', started_at)::date AS day,
            COUNT(*)::int                                AS calls,
            COALESCE(SUM(input_tokens), 0)::int          AS input_tokens,
            COALESCE(SUM(output_tokens), 0)::int         AS output_tokens,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed,
            SUM(CASE WHEN status = 'killed' THEN 1 ELSE 0 END)::int AS killed
     FROM ai_jobs
     WHERE agent_id = $1
       AND started_at > now() - interval '30 days'
     GROUP BY day
     ORDER BY day ASC`,
    [id],
  );
  res.json(ok(rows));
});

export default router;
