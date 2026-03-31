import api from './client';
import type { Note, ApiResponse } from '../types';

export async function getNotes(opportunityId: number): Promise<Note[]> {
  const { data } = await api.get<ApiResponse<Note[]>>(`/opportunities/${opportunityId}/notes`);
  return data.data;
}

export async function createNote(opportunityId: number, content: string): Promise<Note> {
  const { data } = await api.post<ApiResponse<Note>>(`/opportunities/${opportunityId}/notes`, { content });
  return data.data;
}
