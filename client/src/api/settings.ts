import api from './client';
import type { ApiResponse, DealInfoConfig, AvailableField } from '../types';

interface DealInfoConfigResponse {
  config: DealInfoConfig;
  available_fields: AvailableField[];
}

export async function getDealInfoConfig(): Promise<DealInfoConfigResponse> {
  const r = await api.get<ApiResponse<DealInfoConfigResponse>>('/settings/deal-info-config');
  return r.data.data;
}

export async function saveDealInfoConfig(config: DealInfoConfig): Promise<DealInfoConfig> {
  const r = await api.put<ApiResponse<{ config: DealInfoConfig }>>('/settings/deal-info-config', { config });
  return r.data.data.config;
}

export async function resetDealInfoConfig(): Promise<DealInfoConfig> {
  const r = await api.post<ApiResponse<{ config: DealInfoConfig }>>('/settings/deal-info-config/reset');
  return r.data.data.config;
}

// ── Quota Groups (Issue #94) ─────────────────────────────────────────────────
export type QuotaRuleType = 'global' | 'teams' | 'ae_owners';

export interface QuotaGroup {
  id: number;
  name: string;
  rule_type: QuotaRuleType;
  rule_value: string[];
  target_amount: string; // pg NUMERIC comes back as string
  sort_order: number;
}

export interface QuotaGroupInput {
  name: string;
  rule_type: QuotaRuleType;
  rule_value: string[];
  target_amount: number;
  sort_order?: number;
}

export async function listQuotaGroups(): Promise<QuotaGroup[]> {
  const r = await api.get<ApiResponse<QuotaGroup[]>>('/settings/quota-groups');
  return r.data.data;
}

export async function createQuotaGroup(input: QuotaGroupInput): Promise<QuotaGroup> {
  const r = await api.post<ApiResponse<QuotaGroup>>('/settings/quota-groups', input);
  return r.data.data;
}

export async function updateQuotaGroup(id: number, input: Partial<QuotaGroupInput>): Promise<QuotaGroup> {
  const r = await api.patch<ApiResponse<QuotaGroup>>(`/settings/quota-groups/${id}`, input);
  return r.data.data;
}

export async function deleteQuotaGroup(id: number): Promise<void> {
  await api.delete(`/settings/quota-groups/${id}`);
}
