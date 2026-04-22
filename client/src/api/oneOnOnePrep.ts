import api from './client';
import type { ApiResponse, Opportunity } from '../types';

export interface OneOnOneSE {
  id: number;
  name: string;
  email: string;
  role: 'manager' | 'se';
  teams: string[];
  last_login_at: string | null;
}

export interface OneOnOneTask {
  id: number;
  opportunity_id: number;
  opportunity_name: string;
  account_name: string | null;
  stage: string;
  arr: string | null;
  arr_currency: string | null;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done' | 'blocked';
  is_next_step: boolean;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  bucket: 'overdue' | 'due_soon' | 'later' | 'no_due_date';
}

export interface OneOnOneStageMovement {
  id: number;
  name: string;
  account_name: string | null;
  arr: string | null;
  arr_currency: string | null;
  current_stage: string;
  previous_stage: string | null;
  stage_changed_at: string;
}

export interface OneOnOneNarrative {
  content: string;
  /** #135 — [N] markers in content reference deals by the order shown to the AI. */
  citations?: import('../types/citations').ResolvedCitation[];
  generated_at: string;
}

// The server returns a subset of Opportunity fields. We cast to Opportunity on
// the client so the shared health-score helper + badges work unchanged; missing
// fields are nullable on the base type.
export interface OneOnOneData {
  se: OneOnOneSE;
  opportunities: Opportunity[];
  tasks: OneOnOneTask[];
  stage_movements: OneOnOneStageMovement[];
  narrative: OneOnOneNarrative | null;
}

export async function getOneOnOneData(seId: number): Promise<OneOnOneData> {
  const { data } = await api.get<ApiResponse<OneOnOneData>>(`/insights/one-on-one/${seId}`);
  return data.data;
}

export async function generateOneOnOneNarrative(seId: number): Promise<OneOnOneNarrative> {
  const { data } = await api.post<ApiResponse<OneOnOneNarrative>>(`/insights/one-on-one/${seId}/narrative`);
  return data.data;
}
