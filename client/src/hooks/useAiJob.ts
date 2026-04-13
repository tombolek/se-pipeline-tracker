import { useEffect, useRef, useState, useCallback } from 'react';
import { getAiJobByKey } from '../api/aiJobs';

/**
 * useAiJob — generic hook for AI generations that may outlive the user's
 * presence on a panel. Pattern:
 *
 * 1. On mount, check `/ai-jobs/by-key/:key`. If a job is already running
 *    (e.g. the user kicked it off from another tab, or on a previous visit),
 *    we flip into polling mode and call `fetchCached` every 3s until the
 *    cached result updates or 5 min elapses.
 * 2. `generate()` fires the POST but does NOT await it — the server runs
 *    the AI call to completion regardless of client connection. The hook
 *    immediately flips into polling mode and waits for the cache to update.
 *
 * The panel owns `fetchCached` (shape of cached result is panel-specific)
 * and receives the result plus flags: isGenerating, isPolling, lastGeneratedAt.
 */
export function useAiJob<TCached>(params: {
  key: string;
  fetchCached: () => Promise<{ content: TCached | null; generatedAt: string | null }>;
  triggerGenerate: () => Promise<void>;
  enabled?: boolean;
  pollIntervalMs?: number;
  maxPollMs?: number;
}) {
  const {
    key,
    fetchCached,
    triggerGenerate,
    enabled = true,
    pollIntervalMs = 3000,
    maxPollMs = 5 * 60 * 1000,
  } = params;

  const [content, setContent] = useState<TCached | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStart = useRef<number>(0);
  const lastSeenGeneratedAt = useRef<string | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }
  }, []);

  const tick = useCallback(async () => {
    try {
      const { content: c, generatedAt: g } = await fetchCached();
      if (g && g !== lastSeenGeneratedAt.current) {
        // Fresh result landed
        setContent(c);
        setGeneratedAt(g);
        lastSeenGeneratedAt.current = g;
        setIsGenerating(false);
        clearPoll();
        return;
      }
    } catch {
      /* ignore transient errors during polling */
    }
    if (Date.now() - pollStart.current > maxPollMs) {
      setIsGenerating(false);
      setError('Generation is taking longer than expected — try refreshing.');
      clearPoll();
      return;
    }
    pollTimer.current = setTimeout(tick, pollIntervalMs);
  }, [fetchCached, clearPoll, maxPollMs, pollIntervalMs]);

  const startPolling = useCallback(() => {
    clearPoll();
    pollStart.current = Date.now();
    setIsGenerating(true);
    setError(null);
    pollTimer.current = setTimeout(tick, pollIntervalMs);
  }, [tick, clearPoll, pollIntervalMs]);

  // On mount / key change: load cached + detect running job
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const [cached, jobStatus] = await Promise.all([
          fetchCached(),
          getAiJobByKey(key).catch(() => ({ running: false, job: null })),
        ]);
        if (cancelled) return;

        setContent(cached.content);
        setGeneratedAt(cached.generatedAt);
        lastSeenGeneratedAt.current = cached.generatedAt;

        if (jobStatus.running) {
          // Another generation is in flight — attach and poll for the result.
          startPolling();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();

    return () => { cancelled = true; clearPoll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const generate = useCallback(async () => {
    setError(null);
    setIsGenerating(true);
    // Start polling immediately — do NOT await triggerGenerate. The server
    // continues to completion regardless of client disconnect, so if the user
    // navigates away before the POST resolves, the result still lands in
    // ai_summary_cache and the next page visit will pick it up.
    startPolling();
    try {
      await triggerGenerate();
      // POST returned — the result should already be in cache. Fetch once
      // more to avoid waiting for the next poll tick.
      void tick();
    } catch (e) {
      setIsGenerating(false);
      clearPoll();
      setError(e instanceof Error ? e.message : 'Failed to generate');
    }
  }, [triggerGenerate, startPolling, tick, clearPoll]);

  return { content, generatedAt, isGenerating, error, generate };
}
