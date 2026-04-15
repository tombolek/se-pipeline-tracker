import api from './client';
import type { ApiResponse, Task, Note } from '../types';

export type TemplateKind = 'task_pack' | 'note';

export interface TaskPackItem {
  title: string;
  description?: string | null;
  is_next_step?: boolean;
  due_offset_days?: number;
}

export interface Template {
  id: number;
  kind: TemplateKind;
  name: string;
  description: string | null;
  body: string | null;
  items: TaskPackItem[] | null;
  stage: string | null;
  is_deleted: boolean;
  created_by_id: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function listTemplates(opts?: { kind?: TemplateKind; stage?: string }): Promise<Template[]> {
  const params = new URLSearchParams();
  if (opts?.kind) params.set('kind', opts.kind);
  if (opts?.stage) params.set('stage', opts.stage);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const { data } = await api.get<ApiResponse<Template[]>>(`/templates${qs}`);
  return data.data;
}

export interface CreateTemplateInput {
  kind: TemplateKind;
  name: string;
  description?: string;
  body?: string;
  items?: TaskPackItem[];
  stage?: string | null;
}

export async function createTemplate(input: CreateTemplateInput): Promise<Template> {
  const { data } = await api.post<ApiResponse<Template>>('/templates', input);
  return data.data;
}

export async function updateTemplate(id: number, patch: Partial<CreateTemplateInput>): Promise<Template> {
  const { data } = await api.patch<ApiResponse<Template>>(`/templates/${id}`, patch);
  return data.data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete<ApiResponse<{ deleted: true }>>(`/templates/${id}`);
}

export interface ApplyTaskPackResult {
  kind: 'task_pack';
  tasks: Task[];
}
export interface ApplyNoteResult {
  kind: 'note';
  note: Note;
}
export type ApplyTemplateResult = ApplyTaskPackResult | ApplyNoteResult;

export async function applyTemplate(id: number, opts: {
  opportunity_id: number;
  assigned_to_id?: number | null;
  start_date?: string;
}): Promise<ApplyTemplateResult> {
  const { data } = await api.post<ApiResponse<ApplyTemplateResult>>(`/templates/${id}/apply`, opts);
  return data.data;
}
