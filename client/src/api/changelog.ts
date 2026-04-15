import api from './client';
import type { ApiResponse } from '../types';

export interface ChangelogBullet { text: string; }

export interface ChangelogSection {
  kind: string; // 'Added' | 'Changed' | 'Fixed' | 'Removed' | 'Deprecated' | 'Security' | other
  bullets: ChangelogBullet[];
}

export interface ChangelogEntry {
  date: string;           // ISO yyyy-mm-dd
  sections: ChangelogSection[];
}

export interface ChangelogResponse {
  entries: ChangelogEntry[];
  latest_date: string | null;
  last_seen_at: string | null;
  unread_count: number;
}

export async function getChangelog(): Promise<ChangelogResponse> {
  const { data } = await api.get<ApiResponse<ChangelogResponse>>('/changelog');
  return data.data;
}

export async function markChangelogSeen(): Promise<void> {
  await api.post<ApiResponse<{ marked: true }>>('/changelog/mark-seen');
}
