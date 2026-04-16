import api from './client';
import type { Note, ApiResponse } from '../types';
import { cacheRead } from '../offline/cache';
import { getDb } from '../offline/db';

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
  return result.data;
}

export async function createNote(opportunityId: number, content: string): Promise<Note> {
  const { data } = await api.post<ApiResponse<Note>>(`/opportunities/${opportunityId}/notes`, { content });
  return data.data;
}
