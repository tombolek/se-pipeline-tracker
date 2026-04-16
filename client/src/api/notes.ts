import api from './client';
import type { Note, ApiResponse } from '../types';
import { cacheRead } from '../offline/cache';
import { getDb } from '../offline/db';
import { enqueue, listQueuedFor } from '../offline/queue';

export async function getNotes(opportunityId: number): Promise<Note[]> {
  // Offline-aware (Issue #117). Notes are the drawer's critical second
  // fetch — if this throws, the whole drawer goes blank. Cache per opp.
  const result = await cacheRead<Note[]>(
    async () => {
      const { data } = await api.get<ApiResponse<Note[]>>(`/opportunities/${opportunityId}/notes`);
      const db = await getDb();
      await db.put('meta', { key: `notes:${opportunityId}`, value: data.data, updated_at: Date.now() });
      return data.data;
    },
    async () => {
      const db = await getDb();
      const row = await db.get('meta', `notes:${opportunityId}`) as { value: Note[]; updated_at: number } | undefined;
      if (!row) return null;
      return { data: row.value, cachedAt: row.updated_at };
    },
  );

  // Merge any pending offline-queued notes for this opp so optimistic adds
  // render immediately. Once the queue flushes, the real note replaces the
  // optimistic one on the next refetch.
  const queued = await listQueuedFor(opportunityId, 'note').catch(() => []);
  if (queued.length === 0) return result.data;
  const optimistic: Note[] = queued.map(w => ({
    id: -Math.abs(hashStr(w.id)),             // stable negative id per queue entry
    opportunity_id: opportunityId,
    author_id: -1,
    author_name: '(you — pending sync)',
    content: (w.payload.content as string) ?? '',
    source_url: null,
    created_at: new Date(w.queued_at).toISOString(),
    mentions: [],
  }));
  return [...result.data, ...optimistic];
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

export async function createNote(
  opportunityId: number,
  content: string,
  oppName?: string,
): Promise<Note> {
  try {
    const { data } = await api.post<ApiResponse<Note>>(`/opportunities/${opportunityId}/notes`, { content });
    return data.data;
  } catch (e) {
    // Offline write queueing (Issue #117, Phase 2). Notes are append-only —
    // no conflict can arise — so the safest fallback is to stash the content
    // in the queue and return an optimistic Note for the caller's UI.
    if (isNetworkError(e)) {
      await enqueue({
        kind: 'note',
        opportunity_id: opportunityId,
        opportunity_name: oppName ?? `Opportunity #${opportunityId}`,
        payload: { content },
        expected_updated_at: null,
      });
      // Return an optimistic placeholder. `id` is negative + uuid-based so
      // it can't collide with a real server id; caller code that needs a
      // real id should refetch after reconnect.
      const placeholder: Note = {
        id: -Math.floor(Math.random() * 1_000_000),
        opportunity_id: opportunityId,
        author_id: -1,
        author_name: '(you — pending sync)',
        content,
        source_url: null,
        created_at: new Date().toISOString(),
        mentions: [],
      };
      return placeholder;
    }
    throw e;
  }
}

function isNetworkError(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? '';
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'ERR_NETWORK' || code === 'ECONNABORTED') return true;
  if (msg === 'Network Error') return true;
  return false;
}
