/**
 * BulkActionsBar — floating toolbar shown when one or more Pipeline rows are
 * selected via the row checkbox column (Issue #115).
 *
 * Actions:
 *   - Reassign SE Owner (manager, or SE reassigning themselves on owned deals)
 *   - Favorite / Unfavorite (everyone — personal preference, not a deal change)
 *   - Export CSV (everyone — client-side using the already-loaded rows)
 *   - Clear selection
 *
 * The SE picker mirrors OwnerSelector's permission UI: managers see all active
 * SEs plus "Unassign"; non-managers only see "Assign to me" (the server
 * enforces the same rule per-row in the bulk endpoint).
 */
import { useEffect, useRef, useState } from 'react';
import type { Opportunity, User } from '../../types';
import { bulkAssignSeOwner, bulkFavorite } from '../../api/opportunities';
import { listUsers } from '../../api/users';
import { useAuthStore } from '../../store/auth';

interface Props {
  selectedIds: Set<number>;
  selectedOpps: Opportunity[];   // needed for CSV export
  visibleColumnLabels: { key: string; label: string }[]; // column set to export
  onClear: () => void;
  onAfterMutate: () => void;     // refetch parent list
}

export default function BulkActionsBar({
  selectedIds, selectedOpps, visibleColumnLabels, onClear, onAfterMutate,
}: Props) {
  const { user } = useAuthStore();
  const [menu, setMenu] = useState<'reassign' | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const isManager = user?.role === 'manager';
  const count = selectedIds.size;

  // Close popover on outside click / Esc.
  useEffect(() => {
    if (!menu) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenu(null);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenu(null); }
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // Load users lazily when the reassign menu is first opened.
  useEffect(() => {
    if (menu !== 'reassign' || users.length > 0) return;
    listUsers().then(setUsers).catch(() => setUsers([]));
  }, [menu, users.length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function doReassign(userId: number | null) {
    if (busy) return;
    setBusy(true);
    try {
      const ids = [...selectedIds];
      const r = await bulkAssignSeOwner(ids, userId);
      if (r.failed === 0) {
        setToast(`Reassigned ${r.succeeded} deal${r.succeeded === 1 ? '' : 's'}`);
      } else {
        setToast(`Reassigned ${r.succeeded}; ${r.failed} failed`);
      }
      setMenu(null);
      setFilter('');
      onClear();
      onAfterMutate();
    } catch (e) {
      setToast((e as Error).message || 'Bulk reassign failed');
    } finally {
      setBusy(false);
    }
  }

  async function doFavorite(favorited: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await bulkFavorite([...selectedIds], favorited);
      setToast(`${favorited ? 'Added' : 'Removed'} ${count} favorite${count === 1 ? '' : 's'}`);
      onClear();
      onAfterMutate();
    } catch (e) {
      setToast((e as Error).message || 'Bulk favorite failed');
    } finally {
      setBusy(false);
    }
  }

  function doExport() {
    // Client-side CSV of the selected rows using the currently-visible columns.
    // No server round-trip — the rows are already loaded and the user sees
    // exactly what they're exporting.
    const header = visibleColumnLabels.map(c => csvEscape(c.label)).join(',');
    const bodyRows = selectedOpps.map(opp =>
      visibleColumnLabels.map(c => csvEscape(formatCellForCsv(opp, c.key))).join(',')
    );
    const csv = [header, ...bodyRows].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }); // BOM so Excel picks up UTF-8
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-${new Date().toISOString().slice(0, 10)}-${count}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setToast(`Exported ${count} row${count === 1 ? '' : 's'}`);
  }

  // Non-managers reassigning in bulk: only themselves.
  const candidates = users
    .filter(u => u.is_active && u.role === 'se')
    .filter(u => isManager ? true : u.id === user?.id)
    .filter(u => !filter || u.name.toLowerCase().includes(filter.toLowerCase()) || u.email.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div
      ref={rootRef}
      className="sticky top-0 z-20 bg-brand-purple text-white px-4 py-2 flex items-center gap-3 shadow-sm border-b border-brand-purple-70"
    >
      <span className="text-[12px] font-semibold">
        {count} selected
      </span>

      <div className="h-4 w-px bg-white/30" />

      {/* Reassign SE */}
      <div className="relative">
        <button
          onClick={() => setMenu(menu === 'reassign' ? null : 'reassign')}
          disabled={busy}
          className="text-[12px] font-medium px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          Reassign SE
          <svg className="w-3 h-3 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {menu === 'reassign' && (
          <div className="absolute left-0 top-full mt-1 z-30 w-72 bg-white text-brand-navy rounded-lg border border-brand-navy-30 shadow-xl overflow-hidden">
            <div className="p-2 border-b border-brand-navy-30/40">
              <input
                autoFocus
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder={isManager ? 'Search SE…' : 'Assign to me'}
                className="w-full px-2 py-1 text-xs border border-brand-navy-30 rounded focus:outline-none focus:ring-1 focus:ring-brand-purple"
              />
            </div>
            <ul className="max-h-64 overflow-y-auto">
              {isManager && (
                <li>
                  <button
                    type="button"
                    onClick={() => doReassign(null)}
                    disabled={busy}
                    className="w-full px-3 py-1.5 text-left text-xs text-status-warning hover:bg-amber-50 transition-colors disabled:opacity-50 border-b border-brand-navy-30/30"
                  >
                    Unassign all
                  </button>
                </li>
              )}
              {candidates.length === 0 ? (
                <li className="px-3 py-2 text-xs text-brand-navy-70">No matches.</li>
              ) : (
                candidates.slice(0, 30).map(u => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => doReassign(u.id)}
                      disabled={busy}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-brand-purple-30/40 transition-colors disabled:opacity-50"
                    >
                      <span className="font-medium">{u.name}</span>
                      <span className="ml-2 text-brand-navy-70">{u.email}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      <button
        onClick={() => doFavorite(true)}
        disabled={busy}
        className="text-[12px] font-medium px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
        title="Add selected to Favorites"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
        Favorite
      </button>
      <button
        onClick={() => doFavorite(false)}
        disabled={busy}
        className="text-[12px] font-medium px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors disabled:opacity-50"
        title="Remove selected from Favorites"
      >
        Unfavorite
      </button>

      <button
        onClick={doExport}
        disabled={busy}
        className="text-[12px] font-medium px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        Export CSV
      </button>

      <div className="flex-1" />

      <button
        onClick={onClear}
        className="text-[12px] font-medium px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors"
      >
        Clear
      </button>

      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 bg-brand-navy text-white text-[12px] px-3 py-1.5 rounded-md shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

function csvEscape(v: string): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function formatCellForCsv(opp: Opportunity, colKey: string): string {
  // Stringify fields for CSV in a way that mirrors what the user sees on
  // screen, without pulling the full renderOpportunityCell JSX chain into
  // plain text. Falls back to String() for anything we didn't special-case.
  const v = (opp as unknown as Record<string, unknown>)[colKey];

  if (v == null) return '';
  if (colKey === 'se_owner')      return opp.se_owner?.name ?? '';
  if (colKey === 'arr'
   || colKey === 'arr_converted') return typeof v === 'number' ? v.toFixed(0) : String(v);
  if (colKey === 'close_date'
   || colKey === 'poc_start_date'
   || colKey === 'poc_end_date')  return typeof v === 'string' ? v.slice(0, 10) : String(v);
  if (typeof v === 'boolean')     return v ? 'true' : 'false';
  if (typeof v === 'object')      return JSON.stringify(v);
  return String(v);
}
