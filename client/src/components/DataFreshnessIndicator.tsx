/**
 * Data freshness indicator — lives in the top AppHeader, just left of the
 * ConnectionIndicator. Shows how long ago the last successful SF import ran.
 *
 *   - Green  (text-status-success)  : < 6 hours old
 *   - Amber  (text-status-warning)  : 6–12 hours old
 *   - Red    (text-status-overdue)  : > 12 hours old
 *   - Muted grey                     : no successful import yet
 *
 * Thresholds aligned with ~2× / day import cadence. Managers click through to
 * /settings/import-history; SEs get a read-only hover tooltip.
 */
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import type { ApiResponse } from '../types';
import { useAuthStore } from '../store/auth';

interface LatestImport {
  id: number;
  imported_at: string;
  filename: string | null;
  row_count: number | null;
  opportunities_added: number | null;
  opportunities_updated: number | null;
}

/** Human-readable relative time, tuned for the sub-24h window we care about here. */
function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/** Absolute, locale-formatted timestamp for the tooltip. */
function fmtAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ageClass(iso: string | null): { text: string; label: string } {
  if (!iso) return { text: 'text-white/40', label: 'no import yet' };
  const hrs = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hrs < 6)  return { text: 'text-status-success', label: 'fresh' };
  if (hrs < 12) return { text: 'text-status-warning', label: 'aging' };
  return { text: 'text-status-overdue', label: 'stale' };
}

export default function DataFreshnessIndicator() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [data, setData] = useState<LatestImport | null>(null);
  const [, setTick] = useState(0);
  const mountedRef = useRef(true);

  // Fetch latest import on mount + whenever the tab regains focus.
  useEffect(() => {
    mountedRef.current = true;
    async function load() {
      try {
        const r = await api.get<ApiResponse<LatestImport | null>>('/opportunities/import/latest');
        if (!mountedRef.current) return;
        setData(r.data.data);
      } catch {
        /* silent — header widget should never blow up the page */
      }
    }
    load();

    function onVisibility() {
      if (document.visibilityState === 'visible') load();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Tick every 60s so "Nh ago" advances without a refetch.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const isManager = user?.role === 'manager';
  const age = ageClass(data?.imported_at ?? null);
  const label = data ? relTime(data.imported_at) : 'no data yet';

  const canNavigate = isManager;

  const content = (
    <>
      <svg className={`w-3.5 h-3.5 ${age.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className={age.text}>{label}</span>
    </>
  );

  return (
    <div className="group relative">
      {canNavigate ? (
        <button
          type="button"
          onClick={() => navigate('/settings/import-history')}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] hover:bg-white/10 cursor-pointer transition-colors"
        >
          {content}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] cursor-default">
          {content}
        </span>
      )}

      {/* Hover tooltip — explains what this is + drops the exact details. */}
      <div
        className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl bg-white px-3 py-2.5 text-[11px] text-brand-navy opacity-0 shadow-xl border border-brand-navy-30/50 transition-opacity duration-150 group-hover:opacity-100"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 mb-1">SF data freshness</p>
        {data ? (
          <>
            <p className="font-semibold leading-snug">
              Last import: {fmtAbsolute(data.imported_at)}
              <span className={`ml-1.5 text-[10px] font-semibold uppercase tracking-wide ${age.text}`}>
                · {age.label}
              </span>
            </p>
            {data.row_count != null && (
              <p className="text-brand-navy-70 text-[10px] mt-1">
                {data.row_count} rows
                {data.opportunities_added != null && <> · {data.opportunities_added} added</>}
                {data.opportunities_updated != null && <> · {data.opportunities_updated} updated</>}
              </p>
            )}
            <p className="text-brand-navy-70 text-[10px] mt-2 leading-relaxed">
              We expect two imports per day. <span className="text-status-success font-semibold">Green</span> &lt; 6h, <span className="text-status-warning font-semibold">amber</span> 6–12h, <span className="text-status-overdue font-semibold">red</span> &gt; 12h.
              {canNavigate && <> Click to open Import History.</>}
            </p>
          </>
        ) : (
          <p className="text-brand-navy-70 leading-relaxed">No successful SF import on record yet.</p>
        )}
      </div>
    </div>
  );
}
