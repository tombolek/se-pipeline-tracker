import api from './client';
import type { User, ColumnPrefs, ApiResponse } from '../types';
import { cacheRead, putUsers, getCachedUsers } from '../offline/cache';

export async function listTeams(): Promise<string[]> {
  const { data } = await api.get<ApiResponse<string[]>>('/opportunities/teams');
  return data.data;
}

export async function listUsers(): Promise<User[]> {
  // Offline-aware (Issue #117). Mentions UI and OwnerSelector both depend on
  // a populated user list; cache ensures those keep working off VPN.
  const result = await cacheRead<User[]>(
    async () => {
      const { data } = await api.get<ApiResponse<User[]>>('/users');
      void putUsers(data.data as unknown[]);
      return data.data;
    },
    async () => {
      const cached = await getCachedUsers();
      if (cached.length === 0) return null;
      return { data: cached as User[], cachedAt: Date.now() };
    },
  );
  return result.data;
}

export async function createUser(payload: {
  name: string;
  email: string;
  role: 'manager' | 'se' | 'viewer';
  password: string;
  manager_id?: number | null;
}): Promise<User> {
  const { data } = await api.post<ApiResponse<User>>('/users', payload);
  return data.data;
}

export async function updateUser(
  id: number,
  payload: Partial<{ name: string; email: string; role: 'manager' | 'se' | 'viewer'; is_active: boolean; is_admin: boolean; manager_id: number | null; teams: string[] }>
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
  prefs: { show_qualify?: boolean; column_prefs?: ColumnPrefs; theme?: 'light' | 'dark' | 'system' }
): Promise<User> {
  const { data } = await api.patch<ApiResponse<User>>('/users/me/preferences', prefs);
  return data.data;
}
