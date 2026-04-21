/**
 * Connection indicator — lives in the top AppHeader, to the left of the
 * feature-chip buttons. Four states (see `offline-pwa-117.html` mockup):
 *   - live     → green dot, "Live"
 *   - syncing  → spinner, "Syncing…"
 *   - cached   → amber dot, "Cached Nm ago", clicking opens dropdown
 *   - offline  → purple dot, "Offline", clicking opens dropdown
 *
 * The "cached" variant kicks in when lastSync is older than 5 minutes and we're
 * still online — a soft hint that a refresh wouldn't hurt, not an error.
 *
 * Compact layout: dot + label + optional queue badge. Dropdown opens downward
 * with a fixed width panel. Previously rendered in the sidebar footer; moved
 * to the header as part of the horizontal redesign.
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
  let stateKey: 'live' | 'syncing' | 'cached' | 'offline' | 'queue' = 'live';
  if (!online) {
    dotClass = 'bg-brand-purple';
    label = 'Offline';
    clickable = true;
    stateKey = 'offline';
  } else if (syncing) {
    dotClass = 'bg-brand-purple-70 animate-pulse';
    label = 'Syncing…';
    clickable = true;
    stateKey = 'syncing';
  } else if (stale && lastSync !== null) {
    dotClass = 'bg-status-warning';
    label = `Cached ${timeAgo(lastSync)}`;
    clickable = true;
    stateKey = 'cached';
  } else if (hasQueue) {
    // Online, but still has unresolved queued items — make it visible.
    dotClass = 'bg-status-warning';
    label = 'Pending sync';
    clickable = true;
    stateKey = 'queue';
  }

  const tooltipTitle = {
    live: 'Live',
    syncing: 'Syncing',
    cached: 'Cached data',
    offline: "You're offline",
    queue: 'Pending sync',
  }[stateKey];

  const tooltipBody = {
    live: 'Your browser is reaching the server normally. Reads come from the network; writes (notes, tasks, assignments) save directly.',
    syncing: 'Pushing queued offline changes to the server. Takes a moment; you can keep working.',
    cached: "Server's not responding right now, but we're still showing data saved from your last online session. New reads won't be available until you reconnect.",
    offline: 'Your connection dropped. Favorited deals stay readable, and any notes or task edits you make queue locally and sync automatically when you reconnect.',
    queue: 'Online, but some offline edits haven\'t synced yet. Click for details.',
  }[stateKey];

  return (
    <div ref={rootRef} className="relative group">
      <button
        type="button"
        onClick={() => clickable && setOpen(v => !v)}
        disabled={!clickable}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-colors ${
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
      </button>

      {/* Hover tooltip — explains what the current state actually means.
          Hidden while the click-dropdown is open so the two don't overlap. */}
      {!open && (
        <div className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl bg-white px-3 py-2.5 text-[11px] text-brand-navy opacity-0 shadow-xl border border-brand-navy-30/50 transition-opacity duration-150 group-hover:opacity-100">
          <p className="font-semibold flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${dotClass}`} />
            {tooltipTitle}
          </p>
          <p className="text-brand-navy-70 leading-relaxed mt-1">{tooltipBody}</p>
          {lastSync !== null && (
            <p className="text-brand-navy-70 text-[10px] mt-1.5">Last sync: {timeAgo(lastSync)}</p>
          )}
        </div>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-white text-brand-navy rounded-xl border border-brand-navy-30 shadow-xl overflow-hidden">
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
