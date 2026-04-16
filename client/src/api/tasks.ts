import api from './client';
import type { Task, ApiResponse } from '../types';
import { enqueue } from '../offline/queue';

export async function createTask(opportunityId: number, payload: {
  title: string;
  description?: string;
  is_next_step?: boolean;
  due_date?: string;
  assigned_to_id?: number;
}, oppName?: string): Promise<Task> {
  try {
    const { data } = await api.post<ApiResponse<Task>>(`/opportunities/${opportunityId}/tasks`, payload);
    return data.data;
  } catch (e) {
    if (isNetworkError(e)) {
      // Offline task-create (Issue #117). Queue it and return an optimistic
      // placeholder. No version guard needed for creates.
      const q = await enqueue({
        kind: 'task_create',
        opportunity_id: opportunityId,
        opportunity_name: oppName ?? `Opportunity #${opportunityId}`,
        payload: payload as Record<string, unknown>,
        expected_updated_at: null,
      });
      return {
        id: -Math.abs(hashStr(q.id)),
        opportunity_id: opportunityId,
        opportunity_name: oppName ?? '',
        title: payload.title,
        description: payload.description ?? null,
        status: 'open',
        is_next_step: payload.is_next_step ?? false,
        due_date: payload.due_date ?? null,
        assigned_to_id: payload.assigned_to_id ?? null,
        assigned_to_name: null,
        created_by_id: 0,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Task;
    }
    throw e;
  }
}

export interface UpdateTaskOptions {
  /** The `updated_at` the caller saw on the task before this edit; used as a
   *  version guard when replayed from the offline queue. */
  expectedUpdatedAt?: string | null;
  /** Opp context for the pending-changes UI. */
  opportunityId?: number;
  opportunityName?: string;
}

export async function updateTask(
  id: number,
  payload: Partial<{
    title: string;
    description: string;
    status: Task['status'];
    is_next_step: boolean;
    due_date: string | null;
    assigned_to_id: number | null;
  }>,
  opts: UpdateTaskOptions = {},
): Promise<Task> {
  try {
    const { data } = await api.patch<ApiResponse<Task>>(`/tasks/${id}`, {
      ...payload,
      ...(opts.expectedUpdatedAt ? { expected_updated_at: opts.expectedUpdatedAt } : {}),
    });
    return data.data;
  } catch (e) {
    if (isNetworkError(e)) {
      // Queue the patch with its version guard so on replay the server can
      // reject with 409 if someone else edited in the meantime.
      await enqueue({
        kind: 'task_patch',
        opportunity_id: opts.opportunityId ?? 0,
        opportunity_name: opts.opportunityName ?? `Task #${id}`,
        payload: { task_id: id, patch: payload },
        expected_updated_at: opts.expectedUpdatedAt ?? null,
      });
      // Optimistic echo: merge the patch onto the caller's current view.
      return { id, ...payload } as Task;
    }
    throw e;
  }
}

export async function deleteTask(id: number): Promise<void> {
  await api.delete(`/tasks/${id}`);
}

function isNetworkError(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? '';
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'ERR_NETWORK' || code === 'ECONNABORTED') return true;
  if (msg === 'Network Error') return true;
  return false;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}
