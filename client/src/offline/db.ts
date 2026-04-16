/**
 * IndexedDB layer for offline mode (Issue #117).
 *
 * One database per user, namespaced so two users sharing a laptop don't
 * collide. Every store is keyed by a natural id (opp.id, mention_id, etc.).
 *
 * Stores:
 *   opportunities       — paginated pipeline rows, keyed by id
 *   opp_details         — full opp + notes/tasks/mentions payload, keyed by id
 *   users               — the user directory, keyed by id
 *   favorites           — favorite opp ids (array stored under key='ids')
 *   mentions            — mention feed items, keyed by mention_id
 *   meta                — key-value metadata (last_synced, user_id, etc.)
 *   write_queue         — offline writes pending flush (see queue.ts)
 *   conflict_queue      — writes rejected on flush that need user review
 *
 * Schema changes require bumping DB_VERSION. Each upgrade step is cumulative.
 *
 * 500 MB cap is enforced in cache.ts; nothing here bounds growth.
 */
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'se-pipeline-offline';
const DB_VERSION = 1;

export interface MetaRow {
  key: string;
  value: unknown;
  updated_at: number;
}

export interface CachedOpp {
  id: number;
  payload: unknown;           // the full row as returned by the API
  cached_at: number;          // ms epoch
}

export interface CachedOppDetail {
  id: number;
  payload: unknown;           // { opp, notes, tasks, contributors, mentions }
  cached_at: number;
  opened_at: number;          // last time the user opened this opp — drives LRU
}

export interface CachedMention {
  mention_id: number;
  payload: unknown;
  cached_at: number;
}

export interface QueuedWrite {
  id: string;                 // client-generated uuid
  kind: 'note' | 'task_patch' | 'task_create' | 'reassign';
  opportunity_id: number;
  opportunity_name: string;   // for the review UI when things go wrong
  payload: Record<string, unknown>;
  expected_updated_at: string | null;   // ISO timestamp captured at queue time
  queued_at: number;          // ms epoch
  status: 'pending' | 'failed';
  last_error: string | null;
}

export interface ConflictRecord {
  id: string;                 // matches QueuedWrite.id
  kind: QueuedWrite['kind'];
  opportunity_id: number;
  opportunity_name: string;
  your_change: Record<string, unknown>;
  server_state: Record<string, unknown>;
  server_actor: string | null;   // who made the conflicting change
  queued_at: number;
  failed_at: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('opportunities')) {
          db.createObjectStore('opportunities', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('opp_details')) {
          const s = db.createObjectStore('opp_details', { keyPath: 'id' });
          s.createIndex('opened_at', 'opened_at');
        }
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('favorites')) {
          db.createObjectStore('favorites');     // single key='ids' → number[]
        }
        if (!db.objectStoreNames.contains('mentions')) {
          db.createObjectStore('mentions', { keyPath: 'mention_id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('write_queue')) {
          const q = db.createObjectStore('write_queue', { keyPath: 'id' });
          q.createIndex('queued_at', 'queued_at');
          q.createIndex('status', 'status');
        }
        if (!db.objectStoreNames.contains('conflict_queue')) {
          const c = db.createObjectStore('conflict_queue', { keyPath: 'id' });
          c.createIndex('failed_at', 'failed_at');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Wipe every offline store. Called on logout so user-B doesn't inherit
 * user-A's cached data on a shared machine.
 */
export async function clearAll(): Promise<void> {
  const db = await getDb();
  const names = [
    'opportunities', 'opp_details', 'users', 'favorites',
    'mentions', 'meta', 'write_queue', 'conflict_queue',
  ];
  const tx = db.transaction(names, 'readwrite');
  await Promise.all(names.map(n => tx.objectStore(n).clear()));
  await tx.done;
}

// ── Meta helpers ─────────────────────────────────────────────────────────────

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('meta', { key, value, updated_at: Date.now() } satisfies MetaRow);
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const row = await db.get('meta', key) as MetaRow | undefined;
  return row?.value as T | undefined;
}

/**
 * Request that the browser treat our storage as persistent (not eligible for
 * eviction under disk pressure). No-op if already granted or unsupported.
 * Call once per session; Chrome will either auto-grant or show a prompt.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  const already = await navigator.storage.persisted();
  if (already) return true;
  try { return await navigator.storage.persist(); }
  catch { return false; }
}

/**
 * Returns total bytes used by our origin's IndexedDB + Cache Storage, as
 * reported by the browser. Shown in the Favorites info banner. `null` if the
 * browser doesn't expose the Storage API.
 */
export async function estimateUsage(): Promise<{ used: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const e = await navigator.storage.estimate();
    return { used: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
