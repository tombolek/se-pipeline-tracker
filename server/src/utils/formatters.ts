/**
 * Shared formatting utilities for server-side prompt building and templating.
 * Use these instead of redefining inline helpers in route handlers.
 */

export function formatDate(d: unknown): string {
  if (!d) return 'N/A';
  return new Date(d as string).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatARR(a: unknown): string {
  if (!a) return 'N/A';
  return `$${(Number(a) / 1000).toFixed(0)}K`;
}
