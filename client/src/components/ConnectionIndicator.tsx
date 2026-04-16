/**
 * Connection indicator — lives in the sidebar footer above the user pill.
 * Four states (see `offline-pwa-117.html` mockup, screen 1):
 *   - live     → green dot, "Live"
 *   - syncing  → spinner, "Syncing…"
 *   - cached   → amber dot, "Cached Nm ago", clicking opens dropdown
 *   - offline  → purple dot, "Offline", clicking opens dropdown
 *
 * The "cached" variant kicks in when lastSync is older than 5 minutes and we're
 * still online — a soft hint that a refresh wouldn't hurt, not an error.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnectionStatus } from '../offline/useConnectionStatus';
import { useOfflineQueue } from '../offline/useOfflineQueue';

function timeAgo(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function ConnectionIndicator() {
  const { online, syncing, lastSync } = useConnectionStatus();
  const { pending, conflicts } = useOfflineQueue();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Force a tick every 60s so "Cached Nm ago" keeps advancing.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const stale = online && lastSync !== null && Date.now() - lastSync > 5 * 60_000;
  const hasQueue = pending > 0 || conflicts > 0;

  let dotClass = 'bg-status-success';
  let label = 'Live';
  let clickable = false;
  if (!online) {
    dotClass = 'bg-brand-purple';
    label = 'Offline';
    clickable = true;
  } else if (syncing) {
    dotClass = 'bg-brand-purple-70 animate-pulse';
    label = 'Syncing…';
    clickable = true;
  } else if (stale && lastSync !== null) {
    dotClass = 'bg-status-warning';
    label = `Cached ${timeAgo(lastSync)}`;
    clickable = true;
  } else if (hasQueue) {
    // Online, but still has unresolved queued items — make it visible.
    dotClass = 'bg-status-warning';
    label = 'Pending sync';
    clickable = true;
  }

  return (
    <div ref={rootRef} className="relative mb-1">
      <button
        type="button"
        onClick={() => clickable && setOpen(v => !v)}
        disabled={!clickable}
        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
          clickable ? 'hover:bg-white/10 cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass} ring-2 ring-white/10`} />
        <span className={online ? 'text-white/70' : 'text-white font-medium'}>{label}</span>
        {hasQueue && (
          <span className="text-[10px] font-semibold text-white bg-status-warning/80 px-1.5 py-0.5 rounded-full">
            {pending + conflicts}
          </span>
        )}
        {clickable && (
          <svg className="w-3 h-3 ml-auto text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 z-30 bg-white text-brand-navy rounded-xl border border-brand-navy-30 shadow-xl overflow-hidden">
          <div className="px-4 py-3 bg-brand-purple/[0.04] border-b border-brand-navy-30/40">
            <p className="text-xs font-semibold flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${dotClass}`} />
              {online ? (stale ? 'Cached data' : syncing ? 'Syncing…' : 'Online') : "You're offline"}
            </p>
            <p className="text-[11px] text-brand-navy-70 mt-0.5">
              {lastSync !== null
                ? `Last synced ${timeAgo(lastSync)}`
                : 'No successful sync yet'}
            </p>
          </div>
          {(pending > 0 || conflicts > 0) && (
            <div className="px-4 py-3 border-b border-brand-navy-30/40">
              {pending > 0 && (
                <p className="text-[11px] text-brand-navy-70">
                  <span className="font-semibold text-brand-navy">{pending} pending</span>
                  {' '}{pending === 1 ? 'change is' : 'changes are'} queued and will sync when you reconnect.
                </p>
              )}
              {conflicts > 0 && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); navigate('/review-offline-changes'); }}
                  className="text-[11px] text-status-overdue mt-1 text-left hover:underline block w-full"
                >
                  <span className="font-semibold">{conflicts} {conflicts === 1 ? 'change needs' : 'changes need'} review</span> →
                </button>
              )}
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-brand-navy-30/40 flex items-center justify-between bg-gray-50">
            <button
              onClick={() => { setOpen(false); window.location.reload(); }}
              className="text-[11px] font-medium text-brand-purple hover:text-brand-purple-70"
            >
              {online ? 'Sync now' : 'Try reconnect'}
            </button>
            <span className="text-[10px] text-brand-navy-70">
              Favorites are kept offline.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
