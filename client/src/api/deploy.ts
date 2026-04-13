import api from './client';
import type { ApiResponse } from '../types';

export interface DeployStatus {
  server_sha:   string | null;
  frontend_sha: string | null;
  latest_sha:   string | null;
  has_update:   boolean;
  deploy_running: boolean;
  error?:       string;
  last_deploy:  DeployLogEntry | null;
}

export interface DeployLogEntry {
  id:           number;
  triggered_at: string;
  completed_at: string | null;
  status:       'pending' | 'running' | 'success' | 'failed';
  current_sha:  string | null;
  target_sha:   string | null;
  log:          string[];
  error:        string | null;
}

export async function getDeployStatus(): Promise<DeployStatus> {
  const { data } = await api.get<ApiResponse<DeployStatus>>('/deploy/status');
  return data.data!;
}

export async function triggerDeploy(): Promise<{ log_id: number }> {
  const { data } = await api.post<ApiResponse<{ log_id: number }>>('/deploy/trigger');
  return data.data!;
}

export async function getDeployLog(id: number): Promise<DeployLogEntry> {
  const { data } = await api.get<ApiResponse<DeployLogEntry>>(`/deploy/log/${id}`);
  return data.data!;
}

export interface CommitEntry {
  sha:     string;
  message: string;
  author:  string;
  date:    string;
}

export async function getCommits(): Promise<CommitEntry[]> {
  const { data } = await api.get<ApiResponse<CommitEntry[]>>('/deploy/commits');
  return data.data!;
}
