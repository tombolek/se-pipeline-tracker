/**
 * Offline heartbeat (Issue #117, Phase 3.1).
 *
 * Pings `/api/v1/ping` on a 45-second cadence while the tab is visible.
 * The ping response travels through the existing axios response
 * interceptor, which calls `markOnline()` on success and `markOffline()`
 * on a network-level failure. That, in turn, drives:
 *   - the sidebar connection indicator,
 *   - the offline banner,
 *   - and the `wasOffline → online` transition detector in
 *     useConnectionStatus that auto-calls runFlush() to drain any
 *     queued writes.
 *
 * The bulk of the value is the last bullet: without a heartbeat, a laptop
 * that sleeps with queued writes can miss the `online` event on wake
 * (browser heuristics vary). A 45-second poll closes that gap without
 * meaningfully affecting battery or server load — one small no-content
 * HTTP roundtrip while the user is actively looking at the tab.
 *
 * Tab hidden → skip the ping. No point burning cycles / bytes on a
 * minimized window, and the next visibility-change will trigger a fresh
 * ping via focus event handling. (We intentionally DON'T wire
 * visibilitychange here — the axios interceptor is the single source
 * of truth for online/offline; starting a ping immediately on tab
 * show would be redundant with the natural next poll cycle.)
 *
 * Idempotent start/stop — safe to call from multiple sites in the auth
 * lifecycle.
 */
import api from '../api/client';

const INTERVAL_MS = 45_000;
let handle: ReturnType<typeof setInterval> | null = null;

async function ping(): Promise<void> {
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    await api.get('/ping');
  } catch {
    // Swallow — the axios response interceptor has already flipped
    // the connection indicator to Offline. No further action needed.
  }
}

export function startHeartbeat(): void {
  if (handle) return;
  // Fire one right away so we don't wait 45s for the first reading on
  // startup / after login.
  void ping();
  handle = setInterval(() => { void ping(); }, INTERVAL_MS);
}

export function stopHeartbeat(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}
