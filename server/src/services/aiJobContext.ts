/**
 * Per-AI-job context, plumbed via AsyncLocalStorage.
 *
 * Why this exists: we want callAnthropic() to
 *   • know which ai_jobs row it's running inside of (so it can persist
 *     prompt/response + token counts when the owning agent has log_io = true),
 *   • honour a cancellation signal when an admin kills the job from the UI.
 *
 * Threading those through the 12 existing callAnthropic() callsites by
 * parameter would force every feature route to also carry the signal + jobId.
 * AsyncLocalStorage lets runAiJob() enter a context once; any AI call made
 * synchronously-or-asynchronously inside `work()` picks up that context for
 * free, without signature changes.
 *
 * Also houses the in-memory AbortController registry used by the admin
 * "kill running job" action. The registry is process-local — fine today
 * because the app runs as a single EC2 instance. On restart, any rows left
 * in status='running' are reconciled by sweepStaleRunningJobs() on boot.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface AiJobContext {
  jobId: number;
  feature: string;
  agentId: number | null;
  userId: number | null;
}

const als = new AsyncLocalStorage<AiJobContext>();

export function runWithJobContext<T>(ctx: AiJobContext, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn);
}

export function getCurrentJobContext(): AiJobContext | undefined {
  return als.getStore();
}

// ── AbortController registry (admin kill switch) ────────────────────────────

const controllers = new Map<number, AbortController>();

export function registerAbort(jobId: number): AbortSignal {
  const ac = new AbortController();
  controllers.set(jobId, ac);
  return ac.signal;
}

export function getAbortSignalForJob(jobId: number): AbortSignal | undefined {
  return controllers.get(jobId)?.signal;
}

export function clearAbort(jobId: number): void {
  controllers.delete(jobId);
}

/** Returns true if the job had a live controller to abort. */
export function abortJob(jobId: number, reason = 'killed by admin'): boolean {
  const ac = controllers.get(jobId);
  if (!ac) return false;
  ac.abort(new Error(reason));
  controllers.delete(jobId);
  return true;
}

export function listActiveControllerJobIds(): number[] {
  return Array.from(controllers.keys());
}
