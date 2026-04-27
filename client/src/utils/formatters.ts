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

/**
 * Sorts fiscal period strings like "Q1-2026" chronologically (year first, then quarter).
 * Falls back to alphabetical for unrecognised formats.
 */
export function sortFiscalPeriod(a: string, b: string): number {
  const parse = (s: string) => {
    const m = s.match(/Q(\d+)[- ](\d{4})|(\d{4})[- ]Q(\d+)/i);
    if (!m) return { year: 0, q: 0 };
    return m[1] ? { q: parseInt(m[1]), year: parseInt(m[2]) } : { q: parseInt(m[4]), year: parseInt(m[3]) };
  };
  const pa = parse(a), pb = parse(b);
  return pa.year !== pb.year ? pa.year - pb.year : pa.q - pb.q;
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

/** ISO date string for "today + n days" — used as a default for due-date pickers. */
export function defaultDueDate(daysAhead = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

/** Parses a YYYY-MM-DD or ISO string as a local-tz Date (no UTC shift). */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Returns a new Date n days after d (n may be negative). */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** True if two Dates (or ISO strings) fall on the same calendar day in local tz. */
export function isSameDay(a: Date | string, b: Date | string): boolean {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

/** Formats a close date as "Mon YYYY" (e.g. "Apr 2026"). Returns the fallback for null/invalid. */
export function formatCloseDate(d: string | null | undefined, fallback: string = '—'): string {
  if (!d) return fallback;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return fallback;
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
