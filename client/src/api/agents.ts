import api from './client';
import type { ApiResponse } from '../types';

export interface Agent {
  id: number;
  feature: string;
  name: string;
  description: string;
  default_model: string;
  default_max_tokens: number;
  is_enabled: boolean;
  log_io: boolean;
  system_prompt_extra: string;
  prompt_template: string | null;
  active_version_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgentUsageRollup {
  total_calls: number;
  input_tokens: number;
  output_tokens: number;
  failed_calls: number;
  running_calls: number;
}

export type AgentWithUsage = Agent & { usage_24h: AgentUsageRollup };

export interface AgentPromptVersion {
  id: number;
  agent_id: number;
  system_prompt_extra: string;
  prompt_template: string | null;
  default_model: string;
  default_max_tokens: number;
  is_enabled: boolean;
  log_io: boolean;
  note: string | null;
  created_at: string;
  created_by_user_id: number | null;
  created_by_name: string | null;
}

export interface AgentJob {
  id: number;
  status: 'running' | 'done' | 'failed' | 'killed';
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  opportunity_id: number | null;
  started_by_name: string | null;
}

export interface AgentDailyUsage {
  day: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  failed: number;
  killed: number;
}

export async function listAgents(): Promise<AgentWithUsage[]> {
  const r = await api.get<ApiResponse<AgentWithUsage[]>>('/agents');
  return r.data.data;
}

export async function getAgent(id: number): Promise<{ agent: Agent; recent_jobs: AgentJob[] }> {
  const r = await api.get<ApiResponse<{ agent: Agent; recent_jobs: AgentJob[] }>>(`/agents/${id}`);
  return r.data.data;
}

export interface AgentSettingsPatch {
  default_model?: string;
  default_max_tokens?: number;
  is_enabled?: boolean;
  log_io?: boolean;
  system_prompt_extra?: string;
  prompt_template?: string;
  note?: string | null;
}

export async function updateAgent(id: number, patch: AgentSettingsPatch): Promise<Agent> {
  const r = await api.patch<ApiResponse<Agent>>(`/agents/${id}`, patch);
  return r.data.data;
}

export async function listAgentVersions(id: number): Promise<AgentPromptVersion[]> {
  const r = await api.get<ApiResponse<AgentPromptVersion[]>>(`/agents/${id}/versions`);
  return r.data.data;
}

export async function listAgentJobs(
  id: number,
  opts: { limit?: number; offset?: number; status?: string } = {},
): Promise<AgentJob[]> {
  const r = await api.get<ApiResponse<AgentJob[]>>(`/agents/${id}/jobs`, { params: opts });
  return r.data.data;
}

export async function getAgentUsage(id: number): Promise<AgentDailyUsage[]> {
  const r = await api.get<ApiResponse<AgentDailyUsage[]>>(`/agents/${id}/usage`);
  return r.data.data;
}

// ── Global AI jobs ─────────────────────────────────────────────────────────

export interface AiJobRow {
  id: number;
  agent_id: number | null;
  feature: string;
  agent_name: string | null;
  status: 'running' | 'done' | 'failed' | 'killed';
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  opportunity_id: number | null;
  killed_at: string | null;
  started_by_user_id: number | null;
  started_by_name: string | null;
}

export interface AiJobDetail extends AiJobRow {
  prompt_text: string | null;
  response_text: string | null;
  stop_reason: string | null;
  pii_counts: { email: number; phone: number } | null;
  killed_by_user_id: number | null;
  killed_by_name: string | null;
  agent_log_io: boolean | null;
}

export async function listAiJobs(
  opts: { agent_id?: number; status?: string; user_id?: number; since_hours?: number; limit?: number; offset?: number } = {},
): Promise<AiJobRow[]> {
  const r = await api.get<ApiResponse<AiJobRow[]>>('/ai-jobs', { params: opts });
  return r.data.data;
}

export async function listRunningAiJobs(): Promise<AiJobRow[]> {
  const r = await api.get<ApiResponse<AiJobRow[]>>('/ai-jobs/running');
  return r.data.data;
}

export async function getAiJob(id: number): Promise<AiJobDetail> {
  const r = await api.get<ApiResponse<AiJobDetail>>(`/ai-jobs/${id}`);
  return r.data.data;
}

export async function killAiJob(id: number): Promise<{ job: AiJobRow; aborted_in_flight: boolean }> {
  const r = await api.post<ApiResponse<{ job: AiJobRow; aborted_in_flight: boolean }>>(`/ai-jobs/${id}/kill`);
  return r.data.data;
}

export interface AiUsageSummary {
  window_hours: number;
  by_agent: Array<{
    agent_id: number; agent_name: string; feature: string;
    calls: number; input_tokens: number; output_tokens: number;
    failed: number; killed: number; avg_duration_ms: number | null;
  }>;
  by_user: Array<{ user_id: number; user_name: string; calls: number; input_tokens: number; output_tokens: number }>;
  by_day: Array<{ day: string; calls: number; input_tokens: number; output_tokens: number }>;
}

export async function getAiUsageSummary(sinceHours = 168): Promise<AiUsageSummary> {
  const r = await api.get<ApiResponse<AiUsageSummary>>('/ai-jobs/usage-summary', {
    params: { since_hours: sinceHours },
  });
  return r.data.data;
}
