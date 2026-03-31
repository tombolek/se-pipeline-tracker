import api from './client';
import type { User, ApiResponse } from '../types';

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get<ApiResponse<User[]>>('/users');
  return data.data;
}

export async function createUser(payload: {
  name: string;
  email: string;
  role: 'manager' | 'se';
  password: string;
}): Promise<User> {
  const { data } = await api.post<ApiResponse<User>>('/users', payload);
  return data.data;
}

export async function updateUser(
  id: number,
  payload: Partial<{ name: string; email: string; role: 'manager' | 'se'; is_active: boolean }>
): Promise<User> {
  const { data } = await api.patch<ApiResponse<User>>(`/users/${id}`, payload);
  return data.data;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}`);
}

export async function updateMyPreferences(show_qualify: boolean): Promise<User> {
  const { data } = await api.patch<ApiResponse<User>>('/users/me/preferences', { show_qualify });
  return data.data;
}
