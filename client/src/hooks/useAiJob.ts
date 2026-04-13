import { useEffect, useRef } from 'react';
import { getAiJobByKey } from '../api/aiJobs';

/**
 * Minimal re-attach helper for AI generations that may outlive a panel visit.
 *
 * Mechanism: on mount / key change, checks `/ai-jobs/by-key/:key`. If a
 * generation is already in flight (e.g. the user hit Regenerate then navigated
 * away and came back), invokes `onRunning()` so the panel can flip into its
 * loading state, then polls `fetchCached` every 3s until either the cached
 * result's `generated_at` changes (→ `onFresh(freshGeneratedAt)`) or 5 min
 * elapses (→ `onTimeout()`).
 *
 * The panel is responsible for its own initial cache load + state — this hook
 * only handles the "job is still running, attach and wait" edge case.
 *
 * Pass `currentGeneratedAt` so the hook knows when the cache has actually been
 * updated (vs. returning the same stale value). If null/undefined, any fetched
 * `generated_at` counts as fresh.
 */
export function useAiJobAttach(params: {
  key: string;
  enabled?: boolean;
  currentGeneratedAt: string | null | undefined;
  fetchCached: () => Promise<{ generatedAt: string | null }>;
  onRunning: () => void;
  onFresh: () => void;
  onTimeout?: () => void;
  pollIntervalMs?: number;
  maxPollMs?: number;
}) {
  const {
    key,
    enabled = true,
    currentGeneratedAt,
    fetchCached,
    onRunning,
    onFresh,
    onTimeout,
    pollIntervalMs = 3000,
    maxPollMs = 5 * 60 * 1000,
  } = params;

  // Refs so callbacks / currentGeneratedAt changes don't restart polling.
  const baselineRef = useRef<string | null | undefined>(currentGeneratedAt);
  const onRunningRef = useRef(onRunning);
  const onFreshRef = useRef(onFresh);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { baselineRef.current = currentGeneratedAt; }, [currentGeneratedAt]);
  useEffect(() => { onRunningRef.current = onRunning; }, [onRunning]);
  useEffect(() => { onFreshRef.current = onFresh; }, [onFresh]);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = Date.now();

    const poll = async () => {
      if (cancelled) return;
      try {
        const { generatedAt } = await fetchCached();
        if (cancelled) return;
        if (generatedAt && generatedAt !== baselineRef.current) {
          baselineRef.current = generatedAt;
          onFreshRef.current();
          return;
        }
      } catch { /* transient — keep polling */ }
      if (Date.now() - start > maxPollMs) {
        onTimeoutRef.current?.();
        return;
      }
      timer = setTimeout(poll, pollIntervalMs);
    };

    (async () => {
      try {
        const status = await getAiJobByKey(key);
        if (cancelled) return;
        if (status.running) {
          onRunningRef.current();
          timer = setTimeout(poll, pollIntervalMs);
        }
      } catch { /* ignore — assume no job running */ }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
}
