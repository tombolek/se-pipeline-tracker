/**
 * Read-through / write-through cache helpers (Issue #117).
 *
 * Public API:
 *   cacheRead<T>(key, online, cached)   — run the online fetch; on success
 *                                          mirror into IDB; on failure return
 *                                          cached + flag `fromCache: true`.
 *   putOpps(list)       — mirror a paginated opp list into IDB.
 *   getOpps()           — read every cached opp (for offline Pipeline).
 *   putOppDetail(opp)   — cache a full drawer payload (marks opened_at=now).
 *   getOppDetail(id)    — read a cached drawer payload.
 *   enforceCap()        — evict oldest opp_details until total IDB size fits.
 *
 * The 500 MB ceiling is deliberately soft: we call `enforceCap()` opportunistically
 * after writes rather than blocking user actions on it. LRU eviction uses the
 * `opened_at` index on `opp_details` — favorited opps are pinned by a hardcoded
 * list so they never get evicted regardless of age.
 */
import { getDb, setMeta } from './db';
import type { CachedOpp, CachedOppDetail, CachedMention } from './db';

// 500 MB total cap. Reviewed when attachments ship (see #117 discussion).
const CACHE_CAP_BYTES = 500 * 1024 * 1024;

export interface CacheResult<T> {
  data: T;
  fromCache: boolean;
  cachedAt: number | null;
}

/**
 * Generic read-through wrapper. Pass in the online fetch and the cached
 * fallback (an async function reading IDB). The wrapper tries online first;
 * on network failure it returns the cached value with `fromCache: true`.
 *
 * Callers should mirror the online response into IDB inside `online` before
 * returning — this function doesn't know the shape well enough to do it.
 */
export async function cacheRead<T>(
  online: () => Promise<T>,
  cached: () => Promise<{ data: T; cachedAt: number } | null>,
): Promise<CacheResult<T>> {
  try {
    const data = await online();
    return { data, fromCache: false, cachedAt: Date.now() };
  } catch (e) {
    if (!isNetworkError(e)) throw e;          // real errors (401, 500) still bubble
    const c = await cached();
    if (c) return { data: c.data, fromCache: true, cachedAt: c.cachedAt };
    throw e;
  }
}

function isNetworkError(e: unknown): boolean {
  // Axios network errors land here. Also TypeError "Failed to fetch" from
  // service worker passthroughs.
  const msg = (e as { message?: string })?.message ?? '';
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'ERR_NETWORK' || code === 'ECONNABORTED') return true;
  if (msg === 'Network Error') return true;
  if (msg.includes('Failed to fetch')) return true;
  if ((e as { response?: unknown })?.response === undefined && msg !== '') return true;
  return false;
}

// ── Opportunities (list) ─────────────────────────────────────────────────────

export async function putOpps(list: unknown[]): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const tx = db.transaction('opportunities', 'readwrite');
  await Promise.all(
    list.map(item => tx.objectStore('opportunities').put({
      id: (item as { id: number }).id,
      payload: item,
      cached_at: now,
    } satisfies CachedOpp)),
  );
  await tx.done;
  await setMeta('opps_last_synced', now);
}

export async function getCachedOpps(): Promise<{ list: unknown[]; cachedAt: number } | null> {
  const db = await getDb();
  const rows = await db.getAll('opportunities') as CachedOpp[];
  if (rows.length === 0) return null;
  const cachedAt = Math.max(...rows.map(r => r.cached_at));
  return { list: rows.map(r => r.payload), cachedAt };
}

export async function getCachedOppIds(): Promise<Set<number>> {
  const db = await getDb();
  const keys = await db.getAllKeys('opportunities') as number[];
  return new Set(keys);
}

// ── Opportunity detail (drawer payload) ──────────────────────────────────────

export async function putOppDetail(id: number, payload: unknown): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.put('opp_details', {
    id,
    payload,
    cached_at: now,
    opened_at: now,
  } satisfies CachedOppDetail);
  // Fire-and-forget: cap enforcement shouldn't block the UI.
  void enforceCap();
}

export async function getCachedOppDetail(id: number): Promise<{ payload: unknown; cachedAt: number } | null> {
  const db = await getDb();
  const row = await db.get('opp_details', id) as CachedOppDetail | undefined;
  if (!row) return null;
  // Touch opened_at for LRU.
  void db.put('opp_details', { ...row, opened_at: Date.now() });
  return { payload: row.payload, cachedAt: row.cached_at };
}

// ── Users + favorites + mentions ─────────────────────────────────────────────

export async function putUsers(users: unknown[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('users', 'readwrite');
  await Promise.all(users.map(u => tx.objectStore('users').put(u)));
  await tx.done;
}

export async function getCachedUsers(): Promise<unknown[]> {
  const db = await getDb();
  return db.getAll('users');
}

export async function putFavoriteIds(ids: number[]): Promise<void> {
  const db = await getDb();
  await db.put('favorites', ids, 'ids');
}

export async function getCachedFavoriteIds(): Promise<number[]> {
  const db = await getDb();
  const ids = await db.get('favorites', 'ids') as number[] | undefined;
  return ids ?? [];
}

export async function putMentions(items: CachedMention['payload'][]): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const tx = db.transaction('mentions', 'readwrite');
  await Promise.all(items.map(p => tx.objectStore('mentions').put({
    mention_id: (p as { mention_id: number }).mention_id,
    payload: p,
    cached_at: now,
  } satisfies CachedMention)));
  await tx.done;
}

export async function getCachedMentions(): Promise<{ items: unknown[]; cachedAt: number } | null> {
  const db = await getDb();
  const rows = await db.getAll('mentions') as CachedMention[];
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.cached_at - a.cached_at);
  return { items: rows.map(r => r.payload), cachedAt: rows[0].cached_at };
}

// ── Cap + eviction ───────────────────────────────────────────────────────────

/**
 * Evict oldest-opened opp_details until total IDB usage fits under the cap.
 * Favorited ids are excluded from eviction (passed via setFavoriteIdsForCap).
 *
 * We don't touch the opportunities list store — it's needed for the offline
 * Pipeline view and is modest in size (~6 MB worst case). Only drawer
 * payloads grow unbounded as the user clicks around, so that's what we evict.
 */
let pinnedIds: Set<number> = new Set();

export function setFavoriteIdsForCap(ids: number[]): void {
  pinnedIds = new Set(ids);
}

export async function enforceCap(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
  const est = await navigator.storage.estimate();
  if ((est.usage ?? 0) < CACHE_CAP_BYTES) return;

  const db = await getDb();
  const tx = db.transaction('opp_details', 'readwrite');
  const store = tx.objectStore('opp_details');
  const idx = store.index('opened_at');
  let cursor = await idx.openCursor();           // ascending by opened_at
  let evicted = 0;
  while (cursor) {
    const row = cursor.value as CachedOppDetail;
    if (!pinnedIds.has(row.id)) {
      await cursor.delete();
      evicted++;
      // Don't evict everything in one pass — enough to get under the cap.
      if (evicted >= 20) break;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}
