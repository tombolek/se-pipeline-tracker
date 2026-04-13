import api from './client';

export interface AiJobStatus {
  running: boolean;
  job: {
    id: number;
    key: string;
    opportunity_id: number | null;
    feature: string;
    status: 'running' | 'done' | 'failed';
    started_at: string;
    finished_at: string | null;
  } | null;
}

export async function getAiJobByKey(key: string): Promise<AiJobStatus> {
  const { data } = await api.get(`/ai-jobs/by-key/${encodeURIComponent(key)}`);
  return data.data as AiJobStatus;
}
