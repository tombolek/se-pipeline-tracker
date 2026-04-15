import api from './client';
import type { Opportunity, ApiResponse } from '../types';

export interface OpportunityListParams {
  stage?: string;
  se_owner?: string;
  search?: string;
  sort?: string;
  include_qualify?: boolean;
  limit?: number;
}

export async function listOpportunities(params: OpportunityListParams = {}): Promise<Opportunity[]> {
  const { data } = await api.get<ApiResponse<Opportunity[]>>('/opportunities', { params });
  return data.data;
}

// ── Paginated list (Issue #102 phase 3) ─────────────────────────────────────
// Used by the Pipeline page. All filtering + sorting happens server-side so
// "Load more" stays consistent across pages.

export interface PaginatedOpportunityParams {
  limit?: number;
  offset?: number;
  search?: string;
  stage?: string[];              // multi-select → CSV over the wire
  team?: string[];
  record_type?: string[];
  fiscal_period?: string[];
  se_owner?: number;             // single SE filter
  my_deals?: boolean;
  at_risk?: boolean;
  meddpicc_max?: number;
  key_deal?: boolean;
  include_qualify?: boolean;
  include_closed?: boolean;
  sort?: string;
  dir?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export async function listOpportunitiesPaginated(
  params: PaginatedOpportunityParams = {}
): Promise<PaginatedResponse<Opportunity>> {
  // Arrays → CSV; booleans → 'true'/'false'; undefined → stripped by axios.
  const wire: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length > 0) wire[k] = v.join(',');
    } else if (typeof v === 'boolean') {
      wire[k] = v ? 'true' : 'false';
    } else {
      wire[k] = v as string | number;
    }
  }
  const { data } = await api.get<ApiResponse<Opportunity[]>>('/opportunities/paginated', { params: wire });
  return {
    data: data.data,
    total: (data.meta.total as number) ?? data.data.length,
    limit: (data.meta.limit as number) ?? data.data.length,
    offset: (data.meta.offset as number) ?? 0,
  };
}

export async function getFilterOptions(): Promise<{
  fiscal_period: string[];
  team: string[];
  record_type: string[];
  stage: string[];
}> {
  const { data } = await api.get<ApiResponse<{ fiscal_period: string[]; team: string[]; record_type: string[]; stage: string[] }>>('/opportunities/filter-options');
  return data.data;
}

export async function getOpportunity(idOrSfId: number | string): Promise<Opportunity> {
  const { data } = await api.get<ApiResponse<Opportunity>>(`/opportunities/${idOrSfId}`);
  return data.data;
}

export async function assignSeOwner(id: number, seOwnerId: number | null): Promise<Opportunity> {
  const { data } = await api.patch<ApiResponse<Opportunity>>(`/opportunities/${id}`, { se_owner_id: seOwnerId });
  return data.data;
}

// ── Bulk actions (Issue #115) ───────────────────────────────────────────────

export interface BulkResult {
  id: number;
  ok: boolean;
  error?: string;
}

/** Reassign SE Owner on many opps at once. `se_owner_id = null` unassigns. */
export async function bulkAssignSeOwner(ids: number[], seOwnerId: number | null): Promise<{
  results: BulkResult[]; succeeded: number; failed: number;
}> {
  const { data } = await api.patch<ApiResponse<{ results: BulkResult[] }>>(
    '/opportunities/bulk',
    { ids, patch: { se_owner_id: seOwnerId } },
  );
  return {
    results: data.data.results,
    succeeded: (data.meta.succeeded as number) ?? 0,
    failed:    (data.meta.failed    as number) ?? 0,
  };
}

/** Add or remove many opps from the current user's favorites at once. */
export async function bulkFavorite(ids: number[], favorited: boolean): Promise<void> {
  await api.post('/opportunities/bulk/favorite', { ids, favorited });
}

// ── SE Contributors (Issue #104) ─────────────────────────────────────────────

export interface SeContributorUser { id: number; name: string; email: string; }

export async function addSeContributor(oppId: number, userId: number): Promise<SeContributorUser[]> {
  const { data } = await api.post<ApiResponse<{ se_contributors: SeContributorUser[] }>>(
    `/opportunities/${oppId}/contributors`,
    { user_id: userId },
  );
  return data.data.se_contributors;
}

export async function removeSeContributor(oppId: number, userId: number): Promise<SeContributorUser[]> {
  const { data } = await api.delete<ApiResponse<{ se_contributors: SeContributorUser[] }>>(
    `/opportunities/${oppId}/contributors/${userId}`,
  );
  return data.data.se_contributors;
}

// ── Favorites ────────────────────────────────────────────────────────────────

export async function listFavorites(): Promise<Opportunity[]> {
  const { data } = await api.get<ApiResponse<Opportunity[]>>('/opportunities/favorites');
  return data.data;
}

export async function getFavoriteIds(): Promise<number[]> {
  const { data } = await api.get<ApiResponse<number[]>>('/opportunities/favorites/ids');
  return data.data;
}

export async function addFavorite(oppId: number): Promise<void> {
  await api.post(`/opportunities/${oppId}/favorite`);
}

export async function removeFavorite(oppId: number): Promise<void> {
  await api.delete(`/opportunities/${oppId}/favorite`);
}

export async function listClosedLost(): Promise<{ items: Opportunity[]; unreadCount: number }> {
  const { data } = await api.get<ApiResponse<Opportunity[]>>('/opportunities/closed-lost');
  return { items: data.data, unreadCount: (data.meta.unread_count as number) ?? 0 };
}

export async function markClosedLostRead(ids: number[] = []): Promise<void> {
  await api.post('/opportunities/closed-lost/mark-read', { ids });
}
