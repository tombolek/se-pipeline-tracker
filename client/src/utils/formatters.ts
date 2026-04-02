/**
 * Shared formatting utilities — use these instead of inline helpers.
 */

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export function formatDateTime(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit',
    hour: 'numeric', minute: '2-digit',
  });
}

/** Accepts a number or a string (e.g. from DB numeric columns). */
export function formatARR(arr: number | string | null | undefined): string {
  if (arr == null || arr === '') return '—';
  const n = typeof arr === 'string' ? parseFloat(arr) : arr;
  if (isNaN(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/** Returns number of days since the given date, or null if no date. */
export function daysSince(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

/** Returns a human label like "5d ago" or "Never". */
export function daysSinceLabel(d: string | null | undefined): string {
  const days = daysSince(d);
  if (days === null) return 'Never';
  return `${days}d ago`;
}
