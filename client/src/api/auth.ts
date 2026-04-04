import api from './client';
import type { User, ApiResponse } from '../types';

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const { data } = await api.post<ApiResponse<{ token: string; user: User }>>('/auth/login', { email, password });
  return data.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<ApiResponse<User>>('/auth/me');
  return data.data;
}

export async function changePassword(password: string): Promise<User> {
  const { data } = await api.post<ApiResponse<User>>('/auth/change-password', { password });
  return data.data;
}
