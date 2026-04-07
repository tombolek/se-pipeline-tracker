import api from './client';
import type { ApiResponse } from '../types';

export interface BackupMeta {
  key: string;
  size: number;
  last_modified: string;
  created_by: string;
}

export interface RestoreResult {
  usersProcessed: number;
  tasksRestored: number;
  tasksSkipped: number;
  notesRestored: number;
  assignmentsProcessed: number;
}

export async function createBackup(): Promise<{ s3_key: string; backup: unknown }> {
  const { data } = await api.post<ApiResponse<{ s3_key: string; backup: unknown }>>('/backup');
  return data.data;
}

export async function listBackups(): Promise<BackupMeta[]> {
  const { data } = await api.get<ApiResponse<BackupMeta[]>>('/backup');
  return data.data;
}

export async function downloadBackupFromS3(key: string): Promise<void> {
  const { data } = await api.get<Blob>(`/backup/download?key=${encodeURIComponent(key)}`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = key.split('/').pop() ?? 'backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function triggerJsonDownload(backup: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreFromKey(s3_key: string): Promise<RestoreResult> {
  const { data } = await api.post<ApiResponse<RestoreResult>>('/backup/restore', { s3_key });
  return data.data;
}

export async function restoreFromFile(backup: unknown): Promise<RestoreResult> {
  const { data } = await api.post<ApiResponse<RestoreResult>>('/backup/restore', { backup });
  return data.data;
}
