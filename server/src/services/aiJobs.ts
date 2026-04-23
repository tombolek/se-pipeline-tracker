import { query, queryOne } from '../db/index.js';
import { getAgentByFeature } from './agents.js';
import {
  runWithJobContext,
  registerAbort,
  clearAbort,
  abortJob,
} from './aiJobContext.js';

export type AiJobStatus = 'running' | 'done' | 'failed' | 'killed';

export interface AiJob {
  id: number;
  key: string;
  opportunity_id: number | null;
  feature: string;
  agent_id: number | null;
  status: AiJobStatus;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  prompt_text: string | null;
  response_text: string | null;
  pii_counts: { email: number; phone: number } | null;
  stop_reason: string | null;
  started_at: string;
  finished_at: string | null;
  killed_at: string | null;
  killed_by_user_id: number | null;
  error: string | null;
  started_by_user_id: number | null;
}

export async function startJob(params: {
  key: string;
  feature: string;
  opportunityId?: number | null;
  userId?: number | null;
}): Promise<AiJob> {
  // Resolve agent_id best-effort — keeps job <-> agent linkage even if someone
  // disables/recreates an agent. Null is fine if the feature has no agent row.
  const agent = await getAgentByFeature(params.feature);

  const row = await queryOne<AiJob>(
    `INSERT INTO ai_jobs (key, feature, agent_id, opportunity_id, started_by_user_id, status)
     VALUES ($1, $2, $3, $4, $5, 'running')
     RETURNING *`,
    [
      params.key,
      params.feature,
      agent?.id ?? null,
      params.opportunityId ?? null,
      params.userId ?? null,
    ],
  );
  return row as AiJob;
}

export async function completeJob(id: number): Promise<void> {
  await query(
    `UPDATE ai_jobs
     SET status      = 'done',
         finished_at = now(),
         duration_ms = EXTRACT(EPOCH FROM (now() - started_at))::int * 1000
     WHERE id = $1`,
    [id],
  );
}

export async function failJob(id: number, error: string): Promise<void> {
  // Abort-driven failures are recorded as 'killed' rather than 'failed' so the
  // admin can tell the difference between "model crashed" and "I cancelled it".
  const killed = /killed by admin|AbortError|aborted/i.test(error);
  await query(
    `UPDATE ai_jobs
     SET status      = $2,
         finished_at = now(),
         duration_ms = EXTRACT(EPOCH FROM (now() - started_at))::int * 1000,
         error       = $3
     WHERE id = $1
       AND status = 'running'`,  // don't clobber an already-killed row
    [id, killed ? 'killed' : 'failed', error.slice(0, 2000)],
  );
}

/**
 * Update the job with per-call telemetry that callAnthropic() has measured.
 * `prompt_text` / `response_text` are only written when the owning agent has
 * log_io = true (the caller in aiClient.ts makes that decision).
 */
export async function recordAiCall(
  id: number,
  payload: {
    model: string;
    input_tokens: number;
    output_tokens: number;
    stop_reason: string | null;
    pii_counts: { email: number; phone: number };
    prompt_text: string | null;   // null = don't store (log_io off)
    response_text: string | null; // null = don't store (log_io off)
  },
): Promise<void> {
  await query(
    `UPDATE ai_jobs
     SET model          = $2,
         input_tokens   = $3,
         output_tokens  = $4,
         stop_reason    = $5,
         pii_counts     = $6,
         prompt_text    = COALESCE($7, prompt_text),
         response_text  = COALESCE($8, response_text)
     WHERE id = $1`,
    [
      id,
      payload.model,
      payload.input_tokens,
      payload.output_tokens,
      payload.stop_reason,
      JSON.stringify(payload.pii_counts),
      payload.prompt_text,
      payload.response_text,
    ],
  );
}

/**
 * Admin kill. Marks the row killed, aborts any in-memory AbortController,
 * returns the updated row. `had_controller` tells the caller whether the
 * kill actually interrupted a live request or just tombstoned a zombie row
 * (e.g. after a server restart).
 */
export async function killJob(
  id: number,
  userId: number,
): Promise<{ job: AiJob | null; had_controller: boolean }> {
  const had_controller = abortJob(id, 'killed by admin');

  const job = await queryOne<AiJob>(
    `UPDATE ai_jobs
     SET status            = 'killed',
         finished_at       = COALESCE(finished_at, now()),
         duration_ms       = COALESCE(duration_ms, EXTRACT(EPOCH FROM (now() - started_at))::int * 1000),
         killed_at         = now(),
         killed_by_user_id = $2,
         error             = COALESCE(error, 'killed by admin')
     WHERE id = $1
       AND status = 'running'
     RETURNING *`,
    [id, userId],
  );
  return { job, had_controller };
}

/**
 * Called on server boot. A row stuck in 'running' after the process died can
 * never be completed — sweep it to 'failed' so the UI stops showing ghosts and
 * the findRunningJob() deduplication for clients doesn't wedge.
 */
export async function sweepStaleRunningJobs(olderThanMinutes = 10): Promise<number> {
  const rows = await query<{ id: number }>(
    `UPDATE ai_jobs
     SET status      = 'failed',
         finished_at = now(),
         duration_ms = EXTRACT(EPOCH FROM (now() - started_at))::int * 1000,
         error       = 'orphaned on server restart'
     WHERE status = 'running'
       AND started_at < now() - ($1 || ' minutes')::interval
     RETURNING id`,
    [String(olderThanMinutes)],
  );
  return rows.length;
}

/**
 * Wraps an async AI operation with job bookkeeping. The job row is created
 * before `work` runs and marked `done` after it resolves (or `failed` if it
 * throws). Callers should write the AI result to `ai_summary_cache` (or
 * equivalent) inside `work` so the persisted result is available even if the
 * client disconnected — that's the whole point: the server keeps running
 * in the background and the client can re-attach later via findRunningJob.
 *
 * Plumbing: enters an AsyncLocalStorage context so callAnthropic() inside
 * `work` can read the jobId (to persist I/O) and inherit the kill signal
 * (so an admin can abort a long-running generation). Registers an
 * AbortController in the in-memory registry and clears it on finish.
 */
export async function runAiJob<T>(params: {
  key: string;
  feature: string;
  opportunityId?: number | null;
  userId?: number | null;
  work: () => Promise<T>;
}): Promise<T> {
  const job = await startJob(params);
  registerAbort(job.id);

  try {
    return await runWithJobContext(
      {
        jobId: job.id,
        feature: params.feature,
        agentId: job.agent_id,
        userId: params.userId ?? null,
      },
      async () => {
        try {
          const result = await params.work();
          await completeJob(job.id);
          return result;
        } catch (e) {
          await failJob(job.id, e instanceof Error ? e.message : String(e));
          throw e;
        }
      },
    );
  } finally {
    clearAbort(job.id);
  }
}

/**
 * Returns the most recent running job for a given key, if one was started within
 * the freshness window. Jobs older than `windowMinutes` are ignored (treated as
 * orphaned by a crashed server).
 */
export async function findRunningJob(
  key: string,
  windowMinutes = 5,
): Promise<AiJob | null> {
  const row = await queryOne<AiJob>(
    `SELECT * FROM ai_jobs
     WHERE key = $1
       AND status = 'running'
       AND started_at > now() - ($2 || ' minutes')::interval
     ORDER BY started_at DESC
     LIMIT 1`,
    [key, String(windowMinutes)],
  );
  return row ?? null;
}
