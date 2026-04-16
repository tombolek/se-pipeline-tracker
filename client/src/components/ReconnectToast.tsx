/**
 * Reconnect toast (Issue #117, Phase 2C).
 *
 * Listens for the `offline-flush-complete` custom event fired at the tail of
 * runFlush() and shows a brief summary chip at the bottom-right:
 *   - "Synced N change(s)" in green if all flushed cleanly.
 *   - "Synced N · M need review" in amber if any conflicted, with a button
 *     linking to /review-offline-changes.
 *
 * Mounted once in AppShell so any route gets it.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface FlushSummary { succeeded: number; conflicts: number; transient: number; }

export default function ReconnectToast() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<FlushSummary | null>(null);

  useEffect(() => {
    function onFlush(e: Event) {
      const detail = (e as CustomEvent<FlushSummary>).detail;
      setSummary(detail);
      const t = setTimeout(() => setSummary(null), 8000);
      return () => clearTimeout(t);
    }
    window.addEventListener('offline-flush-complete', onFlush);
    return () => window.removeEventListener('offline-flush-complete', onFlush);
  }, []);

  if (!summary) return null;
  const { succeeded, conflicts } = summary;
  const hasConflicts = conflicts > 0;

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg shadow-xl border text-sm flex items-center gap-3 px-4 py-2.5 ${
      hasConflicts
        ? 'bg-white border-status-overdue text-brand-navy'
        : 'bg-status-success/90 border-status-success text-white'
    }`}>
      {hasConflicts ? (
        <svg className="w-4 h-4 text-status-overdue" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a1 1 0 011 1v4a1 1 0 11-2 0V7a1 1 0 011-1zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )}
      <span>
        {succeeded > 0 && <strong>Synced {succeeded} change{succeeded === 1 ? '' : 's'}</strong>}
        {succeeded > 0 && hasConflicts && ' · '}
        {hasConflicts && (
          <span className="text-status-overdue font-medium">
            {conflicts} need{conflicts === 1 ? 's' : ''} review
          </span>
        )}
      </span>
      {hasConflicts && (
        <button
          onClick={() => { setSummary(null); navigate('/review-offline-changes'); }}
          className="text-xs font-semibold text-brand-purple hover:text-brand-purple-70"
        >
          Review →
        </button>
      )}
      <button
        onClick={() => setSummary(null)}
        className={`ml-1 ${hasConflicts ? 'text-brand-navy-70 hover:text-brand-navy' : 'text-white/70 hover:text-white'}`}
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
