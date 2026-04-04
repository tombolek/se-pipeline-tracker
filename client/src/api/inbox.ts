import api from './client';
import type { ApiResponse } from '../types';

export interface InboxItem {
  id: number;
  user_id: number;
  text: string;
  type: 'note' | 'todo';
  status: 'open' | 'done' | 'converted';
  opportunity_id: number | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export async function listInboxItems(): Promise<InboxItem[]> {
  const { data } = await api.get<ApiResponse<InboxItem[]>>('/inbox');
  return data.data;
}

export async function createInboxItem(text: string, type: 'note' | 'todo'): Promise<InboxItem> {
  const { data } = await api.post<ApiResponse<InboxItem>>('/inbox', { text, type });
  return data.data;
}

export async function updateInboxItem(id: number, patch: { text?: string; status?: string }): Promise<InboxItem> {
  const { data } = await api.patch<ApiResponse<InboxItem>>(`/inbox/${id}`, patch);
  return data.data;
}

export async function deleteInboxItem(id: number): Promise<void> {
  await api.delete(`/inbox/${id}`);
}

export async function convertInboxItem(id: number, opportunityId: number, convertAs?: 'task' | 'note'): Promise<void> {
  await api.post(`/inbox/${id}/convert`, { opportunity_id: opportunityId, convert_as: convertAs });
}
