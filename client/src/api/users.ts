import api from './client';
import type { User, ColumnPrefs, ApiResponse } from '../types';

export async function listTeams(): Promise<string[]> {
  const { data } = await api.get<ApiResponse<string[]>>('/opportunities/teams');
  return data.data;
}

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get<ApiResponse<User[]>>('/users');
  return data.data;
}

export async function createUser(payload: {
  name: string;
  email: string;
  role: 'manager' | 'se' | 'read-only';
  password: string;
  manager_id?: number | null;
}): Promise<User> {
  const { data } = await api.post<ApiResponse<User>>('/users', payload);
  return data.data;
}

export async function updateUser(
  id: number,
  payload: Partial<{ name: string; email: string; role: 'manager' | 'se' | 'read-only'; is_active: boolean; manager_id: number | null; teams: string[] }>
): Promise<User> {
  const { data } = await api.patch<ApiResponse<User>>(`/users/${id}`, payload);
  return data.data;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}`);
}

export async function resetUserPassword(id: number, password: string): Promise<User> {
  const { data } = await api.post<ApiResponse<User>>(`/users/${id}/reset-password`, { password });
  return data.data;
}

export async function reassignWorkload(
  fromUserId: number,
  toUserId: number
): Promise<{ tasks_reassigned: number; opps_reassigned: number }> {
  const { data } = await api.post<ApiResponse<{ tasks_reassigned: number; opps_reassigned: number }>>(
    `/users/${fromUserId}/reassign-workload`,
    { to_user_id: toUserId }
  );
  return data.data;
}

export async function updateMyPreferences(
  prefs: { show_qualify?: boolean; column_prefs?: ColumnPrefs }
): Promise<User> {
  const { data } = await api.patch<ApiResponse<User>>('/users/me/preferences', prefs);
  return data.data;
}
