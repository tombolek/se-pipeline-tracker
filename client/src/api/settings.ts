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
