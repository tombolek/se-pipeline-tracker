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

export async function listClosedLost(): Promise<{ items: Opportunity[]; unreadCount: number }> {
  const { data } = await api.get<ApiResponse<Opportunity[]>>('/opportunities/closed-lost');
  return { items: data.data, unreadCount: (data.meta.unread_count as number) ?? 0 };
}

export async function markClosedLostRead(ids: number[] = []): Promise<void> {
  await api.post('/opportunities/closed-lost/mark-read', { ids });
}
