import api from './client';
import type { ApiResponse } from '../types';
import { cacheRead, putMentions, getCachedMentions } from '../offline/cache';

export interface MentionFeedItem {
  mention_id: number;
  note_id: number;
  created_at: string;
  seen_at: string | null;
  content: string;
  author_id: number;
  author_name: string;
  opportunity_id: number;
  sf_opportunity_id: string;
  opportunity_name: string;
  account_name: string | null;
  stage: string;
}

export async function listMentions(limit = 50): Promise<{ items: MentionFeedItem[]; unread: number }> {
  // Offline-aware (Issue #117). Unread count from cache is always 0 — we
  // can't tell, and it's better to under-report than flash a stale badge.
  const result = await cacheRead<{ items: MentionFeedItem[]; unread: number }>(
    async () => {
      const { data } = await api.get<ApiResponse<MentionFeedItem[]>>('/mentions', { params: { limit } });
      void putMentions(data.data as unknown[]);
      return { items: data.data, unread: (data.meta.unread as number) ?? 0 };
    },
    async () => {
      const c = await getCachedMentions();
      if (!c) return null;
      return { data: { items: c.items as MentionFeedItem[], unread: 0 }, cachedAt: c.cachedAt };
    },
  );
  return result.data;
}

/** Mark specific ids as read, or omit ids to mark all as read. */
export async function markMentionsRead(ids?: number[]): Promise<void> {
  await api.post('/mentions/mark-read', ids && ids.length > 0 ? { ids } : {});
}
