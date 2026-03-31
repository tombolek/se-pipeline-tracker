import api from './client';
import type { Task, ApiResponse } from '../types';

export async function createTask(opportunityId: number, payload: {
  title: string;
  description?: string;
  is_next_step?: boolean;
  due_date?: string;
  assigned_to_id?: number;
}): Promise<Task> {
  const { data } = await api.post<ApiResponse<Task>>(`/opportunities/${opportunityId}/tasks`, payload);
  return data.data;
}

export async function updateTask(id: number, payload: Partial<{
  title: string;
  description: string;
  status: Task['status'];
  is_next_step: boolean;
  due_date: string | null;
  assigned_to_id: number | null;
}>): Promise<Task> {
  const { data } = await api.patch<ApiResponse<Task>>(`/tasks/${id}`, payload);
  return data.data;
}

export async function deleteTask(id: number): Promise<void> {
  await api.delete(`/tasks/${id}`);
}
