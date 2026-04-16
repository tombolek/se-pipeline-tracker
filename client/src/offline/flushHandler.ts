/**
 * Per-write-type replay logic for the offline queue (Issue #117, Phase 2).
 *
 * Called by `flushQueue()` on reconnect. Each queued write is dispatched to
 * its own handler which makes the real API call and maps the response onto
 * the FlushHandler protocol (ok / conflict / transient / rejected).
 *
 * Version guard: for task_patch and reassign, the client captured
 * `expected_updated_at` when the write was queued. We pass that in the body;
 * the server compares against the current row's updated_at and responds 409
 * if they don't match. The 409 body is expected to include the current
 * server state so the review UI can show "you tried X; it's now Y".
 */
import api from '../api/client';
import type { QueuedWrite } from './db';
import type { FlushHandler } from './queue';
import { setSyncing } from './useConnectionStatus';
import { flushQueue } from './queue';

function isNetworkError(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? '';
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'ERR_NETWORK' || code === 'ECONNABORTED') return true;
  if (msg === 'Network Error') return true;
  return false;
}

function httpStatus(e: unknown): number | undefined {
  return (e as { response?: { status?: number } })?.response?.status;
}

function httpBody(e: unknown): Record<string, unknown> | undefined {
  const data = (e as { response?: { data?: { data?: Record<string, unknown> } } })?.response?.data?.data;
  return data ?? undefined;
}

export const handleQueuedWrite: FlushHandler = async (w: QueuedWrite) => {
  try {
    switch (w.kind) {
      case 'note': {
        // Append-only. No version guard needed — always applies.
        await api.post(`/opportunities/${w.opportunity_id}/notes`, {
          content: (w.payload.content as string),
        });
        return { ok: true };
      }

      case 'task_create': {
        await api.post(`/opportunities/${w.opportunity_id}/tasks`, w.payload);
        return { ok: true };
      }

      case 'task_patch': {
        const taskId = w.payload.task_id as number;
        const patch = w.payload.patch as Record<string, unknown>;
        await api.patch(`/tasks/${taskId}`, {
          ...patch,
          expected_updated_at: w.expected_updated_at,
        });
        return { ok: true };
      }

      case 'reassign': {
        await api.patch(`/opportunities/${w.opportunity_id}`, {
          se_owner_id: w.payload.se_owner_id ?? null,
          expected_updated_at: w.expected_updated_at,
        });
        return { ok: true };
      }
    }
  } catch (e) {
    if (isNetworkError(e)) {
      return { ok: false, kind: 'transient', error: 'Network error while replaying.' };
    }
    const status = httpStatus(e);
    if (status === 409) {
      // Server version guard failed. Body carries current server state.
      const body = httpBody(e);
      const serverActor = (body?.last_modified_by as { name?: string } | undefined)?.name ?? null;
      return {
        ok: false,
        kind: 'conflict',
        server_state: body ?? {},
        server_actor: serverActor,
      };
    }
    if (status && status >= 500) {
      return { ok: false, kind: 'transient', error: `Server error ${status}` };
    }
    return {
      ok: false,
      kind: 'rejected',
      error: (e as Error).message,
      server_state: httpBody(e),
    };
  }
  // Unreachable — TS exhaustiveness.
  return { ok: false, kind: 'rejected', error: 'Unknown write kind' };
};

/**
 * Drive a flush cycle with the correct sidebar state. Safe to call
 * concurrently — the sync flag flicks off once flushing actually finishes.
 */
let flushing = false;
export async function runFlush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  setSyncing(true);
  try {
    await flushQueue(handleQueuedWrite);
  } finally {
    flushing = false;
    setSyncing(false);
  }
}
