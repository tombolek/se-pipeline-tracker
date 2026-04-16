/**
 * Dev toggle: simulate being off-VPN / off-network (Issue #117).
 *
 * When enabled, the axios request interceptor short-circuits every request
 * with a synthetic "Network Error", which kicks the app into the same
 * offline-fallback codepath it would take on a real disconnect — cache
 * reads, offline banner, queued writes, etc.
 *
 * Persisted in localStorage so you can reload the page without losing the
 * setting; a floating red chip (OfflineSimBadge) is always shown while
 * active so you can't accidentally leave it on.
 */
const STORAGE_KEY = 'offline_simulation_enabled';

const listeners = new Set<() => void>();

export function isOfflineSimEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; }
  catch { return false; }
}

export function setOfflineSimEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else    localStorage.removeItem(STORAGE_KEY);
  } catch { /* quota / sandboxed storage — ignore */ }
  for (const l of listeners) l();
}

export function subscribeOfflineSim(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Synthetic axios-compatible network error. Thrown from the request
 * interceptor so the response interceptor's `!error.response` branch fires
 * and `markOffline()` gets called, exactly like a real dropped connection.
 */
export class SimulatedOfflineError extends Error {
  code = 'ERR_NETWORK';
  constructor() {
    super('Network Error');
    this.name = 'SimulatedOfflineError';
  }
}
