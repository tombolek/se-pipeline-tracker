/**
 * Offline write queue (Issue #117, Phase 2).
 *
 * When the app is offline, write API calls don't go to the server. Instead
 * they're enqueued here with enough metadata to replay them on reconnect.
 * On the next successful connection, `flush()` walks the queue and makes the
 * real API calls one at a time.
 *
 * Writes that arrive to a server in a different state than the one the user
 * saw land in a *conflict queue* and surface through the Review Offline
 * Changes screen instead of silently succeeding or silently failing.
 *
 * Exposed pub/sub so React components can react to queue-size changes without
 * polling. See useOfflineQueue() below.
 */
import { getDb, type QueuedWrite, type ConflictRecord } from './db';

// Re-export so callers can import these types from the queue module alone.
export type { QueuedWrite, ConflictRecord };

const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

function uid(): string {
  // crypto.randomUUID is available in all browsers we target (Chrome 92+,
  // Edge 92+, Safari 15.4+, Firefox 95+).
  return crypto.randomUUID();
}

// ── Queue operations ────────────────────────────────────────────────────────

export async function enqueue(
  write: Omit<QueuedWrite, 'id' | 'queued_at' | 'status' | 'last_error'>,
): Promise<QueuedWrite> {
  const db = await getDb();
  const full: QueuedWrite = {
    id: uid(),
    queued_at: Date.now(),
    status: 'pending',
    last_error: null,
    ...write,
  };
  await db.put('write_queue', full);
  emit();
  return full;
}

export async function listQueued(): Promise<QueuedWrite[]> {
  const db = await getDb();
  const rows = await db.getAll('write_queue') as QueuedWrite[];
  return rows.sort((a, b) => a.queued_at - b.queued_at);
}

export async function removeQueued(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('write_queue', id);
  emit();
}

export async function queueSize(): Promise<number> {
  const db = await getDb();
  return db.count('write_queue');
}

/**
 * Returns the pending queued writes of a given kind scoped to a single
 * opportunity. Used by getNotes() and getTasks() so optimistic reads
 * merge server state + local queue.
 */
export async function listQueuedFor(
  opportunityId: number,
  kind: QueuedWrite['kind'],
): Promise<QueuedWrite[]> {
  const all = await listQueued();
  return all.filter(w => w.opportunity_id === opportunityId && w.kind === kind);
}

// ── Conflict operations ─────────────────────────────────────────────────────

export async function addConflict(
  record: Omit<ConflictRecord, 'failed_at'>,
): Promise<ConflictRecord> {
  const db = await getDb();
  const full: ConflictRecord = { ...record, failed_at: Date.now() };
  await db.put('conflict_queue', full);
  emit();
  return full;
}

export async function listConflicts(): Promise<ConflictRecord[]> {
  const db = await getDb();
  const rows = await db.getAll('conflict_queue') as ConflictRecord[];
  return rows.sort((a, b) => b.failed_at - a.failed_at);
}

export async function removeConflict(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('conflict_queue', id);
  emit();
}

// ── Subscriptions (for useOfflineQueue hook) ───────────────────────────────

export function subscribeQueue(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// ── Flush ────────────────────────────────────────────────────────────────────

/**
 * Walk the queue oldest-first and replay each write against the real API.
 *
 * Successful replays → queue entry removed.
 * Server rejects with 409 Conflict (version guard failed) → moved to the
 * conflict queue with the server's current state attached for the review UI.
 * Network failure during a flush → leave the entry in place so the next
 * reconnect retries. HTTP 5xx is treated as a transient failure (same).
 * Other 4xx → move to conflict queue as "server rejected".
 *
 * Caller is expected to `markSyncing(true/false)` around the call so the
 * sidebar indicator shows the "Syncing…" state during the flush.
 */
export type FlushHandler = (w: QueuedWrite) => Promise<
  | { ok: true }
  | { ok: false; kind: 'conflict'; server_state: Record<string, unknown>; server_actor: string | null }
  | { ok: false; kind: 'transient'; error: string }
  | { ok: false; kind: 'rejected'; error: string; server_state?: Record<string, unknown> }
>;

export async function flushQueue(handler: FlushHandler): Promise<{
  succeeded: number; conflicts: number; transient: number;
}> {
  const pending = await listQueued();
  let succeeded = 0, conflicts = 0, transient = 0;

  for (const w of pending) {
    let result;
    try { result = await handler(w); }
    catch (e) {
      // Defensive: a throwing handler should be treated as transient so we
      // don't lose the queued write.
      result = { ok: false as const, kind: 'transient' as const, error: (e as Error).message };
    }

    if (result.ok) {
      await removeQueued(w.id);
      succeeded++;
    } else if (result.kind === 'transient') {
      // Leave in queue. Stop flushing — network likely dropped again.
      transient++;
      break;
    } else {
      // Conflict or rejection → conflict queue.
      await addConflict({
        id: w.id,
        kind: w.kind,
        opportunity_id: w.opportunity_id,
        opportunity_name: w.opportunity_name,
        your_change: w.payload,
        server_state: result.kind === 'conflict' ? result.server_state : (result.server_state ?? {}),
        server_actor: result.kind === 'conflict' ? result.server_actor : null,
        queued_at: w.queued_at,
      });
      await removeQueued(w.id);
      conflicts++;
    }
  }

  return { succeeded, conflicts, transient };
}
