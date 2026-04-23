/**
 * Developer settings — intentionally buried in Settings.
 *
 * Only real tool today: **Simulate offline mode**. Flips a localStorage flag
 * that the axios request interceptor reads to short-circuit every request
 * with a synthetic Network Error, putting the app in the same state as a
 * real VPN disconnect.
 *
 * The accompanying OfflineSimBadge (mounted in AppShell) shows a persistent
 * red chip in the corner while the toggle is on, so you can't forget to
 * turn it off.
 */
import { useSyncExternalStore } from 'react';
import { isOfflineSimEnabled, setOfflineSimEnabled, subscribeOfflineSim } from '../../offline/offlineSim';
import { estimateUsage, clearAll } from '../../offline/db';
import { useEffect, useState } from 'react';

function useOfflineSim(): boolean {
  return useSyncExternalStore(subscribeOfflineSim, isOfflineSimEnabled, isOfflineSimEnabled);
}

export default function DeveloperPage() {
  const simOn = useOfflineSim();
  const [usageMb, setUsageMb] = useState<number | null>(null);
  const [quotaMb, setQuotaMb] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    estimateUsage().then(u => {
      if (!u) return;
      setUsageMb(Math.round((u.used ?? 0) / (1024 * 1024) * 10) / 10);
      setQuotaMb(Math.round((u.quota ?? 0) / (1024 * 1024)));
    });
  }, [simOn, clearing]);

  async function handleClear() {
    if (!window.confirm('Wipe the local offline cache? You will be re-synced on next connect.')) return;
    setClearing(true);
    await clearAll().catch(() => {});
    setClearing(false);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1 mb-1">Developer</h1>
      <p className="text-sm text-brand-navy-70 dark:text-fg-2 mb-6">
        Debug tools for testing offline mode without disconnecting from the VPN. Leaving any of these on affects only your browser — other users are unaffected.
      </p>

      {/* ── Offline simulation ─────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Simulate offline mode</h2>
            <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-1 leading-relaxed">
              When on, every API request is short-circuited as if the server were unreachable — the app falls back to the local cache, the offline banner appears, and any writes are queued (coming in Phase 2). Useful for verifying the offline experience without pulling the network plug.
            </p>
            {simOn && (
              <p className="text-[11px] text-status-overdue dark:text-status-d-overdue font-medium mt-2">
                ⚠ Currently ON — the app will not talk to the server until you toggle this off.
              </p>
            )}
            <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-2">
              <strong>Login still works</strong> while sim is on — <code>/auth/*</code> requests bypass the toggle so you can't lock yourself out after a session refresh.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={simOn}
              onChange={e => setOfflineSimEnabled(e.target.checked)}
            />
            <div className="w-11 h-6 bg-brand-navy-30 peer-checked:bg-status-overdue rounded-full peer-focus:ring-2 peer-focus:ring-brand-purple/30 transition-colors"></div>
            <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-ink-1 rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
          </label>
        </div>
      </section>

      {/* ── Cache storage ──────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft p-5">
        <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Offline cache storage</h2>
        <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-1 leading-relaxed">
          Opportunities, notes, tasks and mentions are stored in this browser's IndexedDB. The cache is capped at 500 MB; oldest drawer payloads are evicted first (favorited deals are never evicted).
        </p>

        <div className="mt-4 flex items-center gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-brand-navy-70 dark:text-fg-2">Used</p>
            <p className="text-lg font-semibold text-brand-navy dark:text-fg-1">{usageMb != null ? `${usageMb} MB` : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-brand-navy-70 dark:text-fg-2">Browser quota</p>
            <p className="text-lg font-semibold text-brand-navy dark:text-fg-1">{quotaMb != null ? `${quotaMb} MB` : '—'}</p>
          </div>
          <button
            onClick={handleClear}
            disabled={clearing}
            className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg border border-brand-navy-30 hover:border-status-overdue hover:text-status-overdue dark:text-status-d-overdue transition-colors disabled:opacity-50"
          >
            {clearing ? 'Clearing…' : 'Clear offline cache'}
          </button>
        </div>
      </section>
    </div>
  );
}
