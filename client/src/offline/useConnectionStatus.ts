/**
 * Connection-status hook (Issue #117).
 *
 * Tracks three things:
 *   - `online`   — current belief, flipped by:
 *                    * `window.ononline` / `window.onoffline` events
 *                    * any API call that succeeds (→ online) or fails with a
 *                      network error (→ offline)
 *   - `syncing`  — a background refresh is in progress (set by the cache
 *                  wrapper via bump counters).
 *   - `lastSync` — ms epoch of the most recent successful API response.
 *
 * Exposed via a tiny pub-sub so non-React code (axios interceptors, queue
 * flushers) can mutate it, and any component subscribed via the hook re-renders.
 */
import { useSyncExternalStore } from 'react';

interface ConnectionState {
  online: boolean;
  syncing: boolean;
  lastSync: number | null;
}

let state: ConnectionState = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncing: false,
  lastSync: null,
};

const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot(): ConnectionState { return state; }

export function useConnectionStatus(): ConnectionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Mutators (called from axios interceptor & queue) ─────────────────────────

export function markOnline() {
  if (!state.online || state.lastSync === null) {
    state = { ...state, online: true, lastSync: Date.now() };
    emit();
  } else {
    state = { ...state, lastSync: Date.now() };
    emit();
  }
}

export function markOffline() {
  if (state.online) {
    state = { ...state, online: false };
    emit();
  }
}

export function setSyncing(v: boolean) {
  if (state.syncing !== v) {
    state = { ...state, syncing: v };
    emit();
  }
}

// ── Bootstrap — window events ───────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('online',  () => { markOnline(); });
  window.addEventListener('offline', () => { markOffline(); });
}
