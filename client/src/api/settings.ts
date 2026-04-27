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

export interface QuarterlyTargetCell {
  q1: string | null;
  q2: string | null;
  q3: string | null;
  q4: string | null;
}

export type QuarterlyTargetsByFY = Record<string, QuarterlyTargetCell>;

export interface QuotaGroup {
  id: number;
  name: string;
  rule_type: QuotaRuleType;
  rule_value: string[];
  target_amount: string; // pg NUMERIC comes back as string
  sort_order: number;
  quarterly_targets: QuarterlyTargetsByFY;
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

export interface QuarterlyTargetsInput {
  q1: number | null;
  q2: number | null;
  q3: number | null;
  q4: number | null;
}

export async function saveQuarterlyTargets(
  groupId: number, fiscalYear: string, input: QuarterlyTargetsInput,
): Promise<QuarterlyTargetCell & { fiscal_year: string }> {
  const r = await api.put<ApiResponse<QuarterlyTargetCell & { fiscal_year: string }>>(
    `/settings/quota-groups/${groupId}/quarterly/${fiscalYear}`, input,
  );
  return r.data.data;
}

export async function clearQuarterlyTargets(groupId: number, fiscalYear: string): Promise<void> {
  await api.delete(`/settings/quota-groups/${groupId}/quarterly/${fiscalYear}`);
}

// ── Role-based page access ──────────────────────────────────────────────────

export interface RolePageMapping {
  page_key: string;
  role: string;
}

export async function getRoleAccessMappings(): Promise<RolePageMapping[]> {
  const r = await api.get<ApiResponse<RolePageMapping[]>>('/settings/role-access');
  return r.data.data;
}

export async function updateRoleAccessMappings(mappings: RolePageMapping[]): Promise<void> {
  await api.put('/settings/role-access', { mappings });
}

export async function getMyRoleAccess(): Promise<string[]> {
  const r = await api.get<ApiResponse<string[]>>('/settings/role-access/me');
  return r.data.data;
}
