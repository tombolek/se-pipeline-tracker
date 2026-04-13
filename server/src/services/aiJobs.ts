import { query, queryOne } from '../db/index.js';

export interface AiJob {
  id: number;
  key: string;
  opportunity_id: number | null;
  feature: string;
  status: 'running' | 'done' | 'failed';
  started_at: string;
  finished_at: string | null;
  error: string | null;
  started_by_user_id: number | null;
}

export async function startJob(params: {
  key: string;
  feature: string;
  opportunityId?: number | null;
  userId?: number | null;
}): Promise<AiJob> {
  const row = await queryOne<AiJob>(
    `INSERT INTO ai_jobs (key, feature, opportunity_id, started_by_user_id, status)
     VALUES ($1, $2, $3, $4, 'running')
     RETURNING *`,
    [params.key, params.feature, params.opportunityId ?? null, params.userId ?? null]
  );
  return row as AiJob;
}

export async function completeJob(id: number): Promise<void> {
  await query(
    `UPDATE ai_jobs SET status = 'done', finished_at = now() WHERE id = $1`,
    [id]
  );
}

export async function failJob(id: number, error: string): Promise<void> {
  await query(
    `UPDATE ai_jobs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
    [id, error.slice(0, 2000)]
  );
}

/**
 * Wraps an async AI operation with job bookkeeping. The job row is created
 * before `work` runs and marked `done` after it resolves (or `failed` if it
 * throws). Callers should write the AI result to `ai_summary_cache` (or
 * equivalent) inside `work` so the persisted result is available even if the
 * client disconnected — that's the whole point: the server keeps running
 * in the background and the client can re-attach later via findRunningJob.
 */
export async function runAiJob<T>(params: {
  key: string;
  feature: string;
  opportunityId?: number | null;
  userId?: number | null;
  work: () => Promise<T>;
}): Promise<T> {
  const job = await startJob(params);
  try {
    const result = await params.work();
    await completeJob(job.id);
    return result;
  } catch (e) {
    await failJob(job.id, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/**
 * Returns the most recent running job for a given key, if one was started within
 * the freshness window. Jobs older than `windowMinutes` are ignored (treated as
 * orphaned by a crashed server).
 */
export async function findRunningJob(
  key: string,
  windowMinutes = 5
): Promise<AiJob | null> {
  const row = await queryOne<AiJob>(
    `SELECT * FROM ai_jobs
     WHERE key = $1
       AND status = 'running'
       AND started_at > now() - ($2 || ' minutes')::interval
     ORDER BY started_at DESC
     LIMIT 1`,
    [key, String(windowMinutes)]
  );
  return row ?? null;
}
