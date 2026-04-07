import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import {
  getVersionStatus,
  getLatestSha,
  isDeployRunning,
  runDeploy,
} from '../services/deployService.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const mgr  = requireManager as unknown as (req: Request, res: Response, next: () => void) => void;

// ── GET /status — compare current deployed SHA with latest GitHub commit ───────
router.get('/status', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const status = await getVersionStatus();
  res.json(ok({ ...status, deploy_running: isDeployRunning() }));
});

// ── POST /trigger — kick off an async frontend deploy ─────────────────────────
router.post('/trigger', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  if (isDeployRunning()) {
    res.status(409).json(err('A deploy is already in progress'));
    return;
  }

  const missingVars = ['GITHUB_TOKEN', 'FRONTEND_BUCKET', 'CF_DISTRIBUTION_ID']
    .filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    res.status(503).json(err(`Missing env vars: ${missingVars.join(', ')}`));
    return;
  }

  const actor = (req as AuthenticatedRequest).user;

  const rows = await query<{ id: number }>(
    `INSERT INTO deploy_log (triggered_by, status) VALUES ($1, 'pending') RETURNING id`,
    [actor.userId],
  );
  const logId = rows[0].id;

  // Fire-and-forget — client polls /log/:id for progress
  runDeploy(logId).catch(() => { /* errors are recorded in the DB */ });

  res.status(202).json(ok({ log_id: logId }));
});

// ── GET /log/:id — poll deploy progress ───────────────────────────────────────
router.get('/log/:id', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json(err('Invalid log ID')); return; }

  const rows = await query<{
    id: number;
    triggered_at: string;
    completed_at: string | null;
    status: string;
    current_sha: string | null;
    target_sha: string | null;
    log: string[];
    error: string | null;
  }>(
    `SELECT id, triggered_at, completed_at, status, current_sha, target_sha, log, error
     FROM deploy_log WHERE id = $1`,
    [id],
  );

  if (rows.length === 0) { res.status(404).json(err('Log not found')); return; }
  res.json(ok(rows[0]));
});

// ── GET /commits — recent GitHub commit history ───────────────────────────────
router.get('/commits', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) { res.status(503).json(err('GITHUB_TOKEN not configured')); return; }

  const apiRes = await fetch(
    'https://api.github.com/repos/tombolek/se-pipeline-tracker/commits?per_page=20',
    { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'se-pipeline-tracker', Accept: 'application/vnd.github.v3+json' } },
  );
  if (!apiRes.ok) { res.status(502).json(err(`GitHub API ${apiRes.status}`)); return; }

  const raw = await apiRes.json() as Array<{
    sha: string;
    commit: { message: string; author: { date: string; name: string } };
  }>;

  const commits = raw.map(c => ({
    sha:     c.sha,
    message: c.commit.message.split('\n')[0],   // first line only
    author:  c.commit.author.name,
    date:    c.commit.author.date,
  }));

  res.json(ok(commits));
});

export default router;
