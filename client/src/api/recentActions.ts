import api from './client';
import type { ApiResponse } from '../types';

export type ActionKind = 'task' | 'inbox' | 'assignment';

export interface RecentAction {
  kind: ActionKind;
  id: number;
  at: string;
  title: string;
  subtitle: string | null;
  opportunity_id: number | null;
  opportunity_name: string | null;
  undoable: boolean;
  reason_if_not_undoable: string | null;
}

export async function listRecentActions(limit = 50): Promise<RecentAction[]> {
  const { data } = await api.get<ApiResponse<RecentAction[]>>(`/recent-actions?limit=${limit}`);
  return data.data;
}

export async function undoRecentAction(kind: ActionKind, id: number): Promise<void> {
  await api.post<ApiResponse<unknown>>('/recent-actions/undo', { kind, id });
}
