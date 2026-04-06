import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/client';

interface TrackEvent {
  session_id: string;
  page: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// Module-level event buffer — shared across all hook instances
const _buffer: TrackEvent[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _listenerAttached = false;

function getSessionId(): string {
  return sessionStorage.getItem('sessionId') ?? '';
}

async function flush(): Promise<void> {
  if (_buffer.length === 0) return;
  const batch = _buffer.splice(0, _buffer.length);
  try {
    await api.post('/audit/events', batch);
  } catch {
    // Best-effort — silently discard on failure
  }
}

/**
 * Track a user interaction event.
 * Call anywhere in the app — buffers client-side and flushes every 10s.
 */
export function track(
  action: string,
  entityType?: string,
  entityId?: string | number,
  metadata?: Record<string, unknown>
): void {
  const sessionId = getSessionId();
  if (!sessionId) return; // Not logged in
  _buffer.push({
    session_id: sessionId,
    page:        window.location.pathname,
    action,
    entity_type: entityType,
    entity_id:   entityId !== undefined ? String(entityId) : undefined,
    metadata,
    timestamp:   new Date().toISOString(),
  });
}

/**
 * Mount once inside AppShell (authenticated routes only).
 * Tracks every route change as a 'view' event, sets up flush interval.
 */
export function usePageTracking(): void {
  const location  = useLocation();
  const mounted   = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    // Flush interval
    _flushTimer = setInterval(flush, 10_000);

    // Flush on tab hide / page close
    if (!_listenerAttached) {
      _listenerAttached = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
      });
    }

    return () => {
      if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track each route change as a page view
  useEffect(() => {
    track('view');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
}
