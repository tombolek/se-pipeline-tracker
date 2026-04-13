/**
 * Generic client-side sort utility used across Pipeline, Closed Lost,
 * Missing Notes, and Deploy Mode pages.
 */
import type { Opportunity } from '../types';
import { computeHealthScore } from './healthScore';
import { computeMeddpicc } from './meddpicc';

export type SortDir = 'asc' | 'desc';
export type ColType = 'date' | 'number' | 'string';

function comparePrimitive(a: unknown, b: unknown, type: ColType): number {
  // Nulls always go last (regardless of direction — caller inverts for desc)
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (type === 'date') {
    return new Date(a as string).getTime() - new Date(b as string).getTime();
  }
  if (type === 'number') {
    return (parseFloat(String(a)) || 0) - (parseFloat(String(b)) || 0);
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export function sortRows<T>(
  rows: T[],
  key: string,
  dir: SortDir,
  getType: (key: string) => ColType,
  getValue?: (row: T, key: string) => unknown,
): T[] {
  const extract = getValue ?? ((row, k) => (row as Record<string, unknown>)[k]);
  return [...rows].sort((a, b) => {
    const cmp = comparePrimitive(extract(a, key), extract(b, key), getType(key));
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ── Opportunity-specific helpers ──────────────────────────────────────────────

const OPP_DATE_COLS = new Set([
  'close_date', 'close_month', 'poc_start_date', 'poc_end_date',
  'closed_at', 'se_comments_updated_at', 'manager_comments_updated_at',
]);
const OPP_NUMERIC_COLS = new Set(['arr', 'arr_converted', 'open_task_count', 'health_score', 'meddpicc_score']);

export function oppColType(key: string): ColType {
  if (OPP_DATE_COLS.has(key)) return 'date';
  if (OPP_NUMERIC_COLS.has(key)) return 'number';
  return 'string';
}

/** Extracts the sortable primitive value from an Opportunity for a given column key. */
export function getOppValue(opp: Opportunity, key: string): unknown {
  if (key === 'se_owner') return opp.se_owner?.name ?? null;
  if (key === 'key_deal') return opp.key_deal ? 1 : 0;
  if (key === 'se_comments_freshness') return opp.se_comments_updated_at;
  if (key === 'health_score') return computeHealthScore(opp).score;
  if (key === 'meddpicc_score') return computeMeddpicc(opp).strong;
  return (opp as unknown as Record<string, unknown>)[key];
}
