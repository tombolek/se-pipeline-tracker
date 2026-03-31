import api from './client';
import type { Opportunity, ApiResponse } from '../types';

export interface OpportunityListParams {
  stage?: string;
  se_owner?: string;
  search?: string;
  sort?: string;
  include_qualify?: boolean;
}

export async function listOpportunities(params: OpportunityListParams = {}): Promise<Opportunity[]> {
  const { data } = await api.get<ApiResponse<Opportunity[]>>('/opportunities', { params });
  return data.data;
}

export async function getOpportunity(id: number): Promise<Opportunity> {
  const { data } = await api.get<ApiResponse<Opportunity>>(`/opportunities/${id}`);
  return data.data;
}

export async function assignSeOwner(id: number, seOwnerId: number | null): Promise<Opportunity> {
  const { data } = await api.patch<ApiResponse<Opportunity>>(`/opportunities/${id}`, { se_owner_id: seOwnerId });
  return data.data;
}

export interface ClosedLostItem {
  id: number;
  sf_opportunity_id: string;
  name: string;
  account_name: string | null;
  account_segment: string | null;
  stage: string;
  arr: number | null;
  arr_currency: string;
  close_date: string | null;
  closed_at: string | null;
  closed_lost_seen: boolean;
  ae_owner_name: string | null;
  team: string | null;
  record_type: string | null;
  se_owner: { id: number; name: string } | null;
}

export async function listClosedLost(): Promise<{ items: ClosedLostItem[]; unreadCount: number }> {
  const { data } = await api.get<ApiResponse<ClosedLostItem[]>>('/opportunities/closed-lost');
  return { items: data.data, unreadCount: (data.meta.unread_count as number) ?? 0 };
}

export async function markClosedLostRead(ids: number[] = []): Promise<void> {
  await api.post('/opportunities/closed-lost/mark-read', { ids });
}
