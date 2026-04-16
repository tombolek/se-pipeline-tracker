import api from './client';
import type { Opportunity, ApiResponse } from '../types';
import {
  cacheRead, putOpps, getCachedOpps,
  putOppDetail, getCachedOppDetail,
  putFavoriteIds, getCachedFavoriteIds,
} from '../offline/cache';

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

  // Offline-aware (Issue #117): on success mirror the rows into IDB; on
  // network failure return the cached rows (ignoring the server-side filters
  // — the user sees everything we have cached, not a "no results" page).
  // The cache captures union-of-all-previously-seen opps, so the offline
  // pipeline view still beats a blank page. Filters applied *on top* of the
  // offline set are handled on the client in a follow-up.
  const result = await cacheRead<PaginatedResponse<Opportunity>>(
    async () => {
      const { data } = await api.get<ApiResponse<Opportunity[]>>('/opportunities/paginated', { params: wire });
      const out: PaginatedResponse<Opportunity> = {
        data: data.data,
        total: (data.meta.total as number) ?? data.data.length,
        limit: (data.meta.limit as number) ?? data.data.length,
        offset: (data.meta.offset as number) ?? 0,
      };
      // Write-through on the first page only; deeper pages merge into the
      // same store without clobbering earlier entries.
      void putOpps(out.data as unknown[]);
      return out;
    },
    async () => {
      const c = await getCachedOpps();
      if (!c) return null;
      const rows = c.list as Opportunity[];
      return {
        data: { data: rows, total: rows.length, limit: rows.length, offset: 0 } as PaginatedResponse<Opportunity>,
        cachedAt: c.cachedAt,
      };
    },
  );
  return result.data;
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
  // Write-through + read-fallback (Issue #117). Opens are cached per-opp so
  // the drawer works offline for any deal you've previously viewed.
  const result = await cacheRead<Opportunity>(
    async () => {
      const { data } = await api.get<ApiResponse<Opportunity>>(`/opportunities/${idOrSfId}`);
      if (typeof idOrSfId === 'number') {
        void putOppDetail(idOrSfId, data.data);
      } else if (typeof (data.data as { id?: number }).id === 'number') {
        void putOppDetail((data.data as { id: number }).id, data.data);
      }
      return data.data;
    },
    async () => {
      if (typeof idOrSfId !== 'number') return null;   // sf-id lookups can't offline fallback yet
      const c = await getCachedOppDetail(idOrSfId);
      if (!c) return null;
      return { data: c.payload as Opportunity, cachedAt: c.cachedAt };
    },
  );
  return result.data;
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
  // Favorites are the explicit "keep offline" set — always write-through so
  // they survive a reconnect outage. (Issue #117)
  const result = await cacheRead<Opportunity[]>(
    async () => {
      const { data } = await api.get<ApiResponse<Opportunity[]>>('/opportunities/favorites');
      void putOpps(data.data as unknown[]);
      void putFavoriteIds(data.data.map(o => o.id));
      return data.data;
    },
    async () => {
      const ids = await getCachedFavoriteIds();
      if (ids.length === 0) return null;
      const c = await getCachedOpps();
      if (!c) return null;
      const idset = new Set(ids);
      const rows = (c.list as Opportunity[]).filter(o => idset.has(o.id));
      return { data: rows, cachedAt: c.cachedAt };
    },
  );
  return result.data;
}

export async function getFavoriteIds(): Promise<number[]> {
  const result = await cacheRead<number[]>(
    async () => {
      const { data } = await api.get<ApiResponse<number[]>>('/opportunities/favorites/ids');
      void putFavoriteIds(data.data);
      return data.data;
    },
    async () => {
      const ids = await getCachedFavoriteIds();
      return { data: ids, cachedAt: Date.now() };
    },
  );
  return result.data;
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
