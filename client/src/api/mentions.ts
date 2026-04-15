import api from './client';
import type { ApiResponse } from '../types';

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
  const { data } = await api.get<ApiResponse<MentionFeedItem[]>>('/mentions', { params: { limit } });
  return { items: data.data, unread: (data.meta.unread as number) ?? 0 };
}

/** Mark specific ids as read, or omit ids to mark all as read. */
export async function markMentionsRead(ids?: number[]): Promise<void> {
  await api.post('/mentions/mark-read', ids && ids.length > 0 ? { ids } : {});
}
