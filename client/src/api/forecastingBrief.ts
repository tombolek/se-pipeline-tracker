import api from './client';
import type { ApiResponse } from '../types';

export interface ForecastingBriefKPI {
  total_arr: number;
  deal_count: number;
  commit_arr: number;
  commit_count: number;
  most_likely_arr: number;
  most_likely_count: number;
  upside_arr: number;
  upside_count: number;
  won_arr: number;
  stale_comments_count: number;
  unassigned_se_count: number;
  active_pocs: number;
  avg_meddpicc_commit_ml: number;
}

export interface ForecastOpp {
  id: number;
  name: string;
  account_name: string | null;
  account_industry: string | null;
  arr: string | null;
  arr_currency: string | null;
  stage: string;
  stage_changed_at: string | null;
  close_date: string | null;
  forecast_status: string | null;
  se_owner_id: number | null;
  se_owner_name: string | null;
  ae_owner_name: string | null;
  se_comments: string | null;
  se_comments_updated_at: string | null;
  se_comments_days_ago: number | null;
  next_step_sf: string | null;
  technical_blockers: string | null;
  poc_status: string | null;
  deploy_mode: string | null;
  engaged_competitors: string | null;
  key_deal: boolean;
  record_type: string | null;
  team: string | null;
  products: string[];
  // MEDDPICC fields
  metrics: string | null;
  economic_buyer: string | null;
  decision_criteria: string | null;
  decision_process: string | null;
  paper_process: string | null;
  implicate_pain: string | null;
  champion: string | null;
  authority: string | null;
  need: string | null;
  budget: string | null;
  overdue_task_count: number;
  // Cached AI summary for expansion
  ai_summary: string | null;
  ai_summary_generated_at: string | null;
}

export interface ForecastNarrative {
  content: string;
  /** #135 — [N] markers in content reference deals by their order in the prompt. */
  citations?: import('../types/citations').ResolvedCitation[];
  /** #136 — paragraphs in the narrative that carry no `[N]` markers (may be ungrounded). */
  low_confidence_spans?: import('../types/citations').LowConfidenceSpan[];
  generated_at: string;
}

export type ForecastRegion = 'NA' | 'INTL';

export interface ForecastingBriefData {
  fiscal_period: string;
  region?: ForecastRegion | null;
  kpi: ForecastingBriefKPI;
  opportunities: ForecastOpp[];
  narrative: ForecastNarrative | null;
}

export async function getForecastingBrief(fq?: string, region?: ForecastRegion | null): Promise<ForecastingBriefData> {
  const params: Record<string, string> = {};
  if (fq) params.fq = fq;
  if (region) params.region = region;
  const { data } = await api.get<ApiResponse<ForecastingBriefData>>('/forecasting-brief', { params });
  return data.data;
}

export async function generateNarrative(fiscalPeriod: string, region?: ForecastRegion | null): Promise<ForecastNarrative> {
  const body: Record<string, string> = { fiscal_period: fiscalPeriod };
  if (region) body.region = region;
  const { data } = await api.post<ApiResponse<ForecastNarrative>>('/forecasting-brief/narrative/generate', body);
  return data.data;
}

export interface BulkSummaryResult {
  total: number;
  succeeded: number;
  failed: number;
  results: { id: number; status: 'ok' | 'error'; error?: string }[];
}

export async function bulkGenerateSummaries(oppIds: number[]): Promise<BulkSummaryResult> {
  const { data } = await api.post<ApiResponse<BulkSummaryResult>>('/forecasting-brief/summaries/bulk-generate', { opp_ids: oppIds });
  return data.data;
}
