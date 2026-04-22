import { useState, useEffect, useCallback } from 'react';
import type { Opportunity } from '../types';
import { listClosedLost, markClosedLostRead } from '../api/opportunities';
import { updateMyPreferences } from '../api/users';
import { useAuthStore } from '../store/auth';
import { usePipelineStore } from '../store/pipeline';
import { getColumnsForPage, DEFAULT_COLUMNS, COLUMN_BY_KEY } from '../constants/columnDefs';
import OpportunityDetail from '../components/OpportunityDetail';
import Drawer from '../components/Drawer';
import { useOppUrlSync } from '../hooks/useOppUrlSync';
import ColumnPicker from '../components/shared/ColumnPicker';
import SortableHeader from '../components/shared/SortableHeader';
import { renderOpportunityCell } from '../utils/renderOpportunityCell';
import { formatDateTime } from '../utils/formatters';
import { sortRows, oppColType, getOppValue, type SortDir } from '../utils/sortRows';

// ── Row ───────────────────────────────────────────────────────────────────────
function ClosedRow({ item, selected, onClick, visibleColumns }: {
  item: Opportunity;
  selected: boolean;
  onClick: () => void;
  visibleColumns: string[];
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-brand-navy-30/30 dark:border-ink-border-soft cursor-pointer transition-colors ${
        selected
          ? 'bg-brand-purple/[0.04] border-l-2 border-l-brand-purple-70'
          : 'hover:bg-brand-navy/[0.025] dark:hover:bg-white/[0.025]'
      }`}
    >
      {visibleColumns.map(col => (
        <td key={col} className="px-3 py-3 whitespace-nowrap">
          {renderOpportunityCell(item, col)}
        </td>
      ))}
      {/* Pinned: Closed date */}
      <td className="px-3 py-3 text-xs text-brand-navy-70 dark:text-fg-2 whitespace-nowrap">
        {item.closed_at ? formatDateTime(item.closed_at) : '—'}
      </td>
      {/* Chevron */}
      <td className="px-3 py-3 text-brand-navy-30 dark:text-fg-4">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ClosedLostPage() {
  const { user, setUser } = useAuthStore();
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useOppUrlSync(selectedId, setSelectedId, items);
  const setClosedLostUnread = usePipelineStore((s) => s.setClosedLostUnread);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    getColumnsForPage('closed_lost', user?.column_prefs ?? null)
  );
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); setSortDir('asc'); }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: rows, unreadCount } = await listClosedLost();
      setItems(rows);
      if (unreadCount > 0) {
        setClosedLostUnread(0);
        markClosedLostRead([]).catch(() => {});
      }
    } catch {
      setError('Failed to load closed opportunities.');
    } finally {
      setLoading(false);
    }
  }, [setClosedLostUnread]);

  useEffect(() => { load(); }, [load]);

  async function handleColumnsChange(cols: string[]) {
    setVisibleColumns(cols);
    try {
      const updatedUser = await updateMyPreferences({ column_prefs: { closed_lost: cols } });
      setUser(updatedUser);
    } catch {
      // persist failure is non-fatal
    }
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-brand-navy-30/40 dark:border-ink-border-soft bg-white dark:bg-ink-1 flex-shrink-0">
        <h1 className="text-base font-semibold text-brand-navy dark:text-fg-1">Closed Lost</h1>
        {!loading && items.length > 0 && (
          <span className="text-[10px] bg-brand-navy-30 text-brand-navy-70 dark:text-fg-2 rounded-full px-1.5 py-px font-medium">
            {items.length}
          </span>
        )}
        <span className="text-xs text-brand-navy-70 dark:text-fg-2">{sortKey ? 'Sorted by column' : 'Sorted by most recently closed'}</span>
        <div className="ml-auto">
          <ColumnPicker
            visibleColumns={visibleColumns}
            defaultColumns={DEFAULT_COLUMNS.closed_lost}
            onChange={handleColumnsChange}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto overflow-x-auto bg-white dark:bg-ink-1">
        {loading && (
          <div className="flex items-center justify-center py-20 text-sm text-brand-navy-70 dark:text-fg-2">Loading…</div>
        )}
        {error && (
          <div className="px-5 py-4 text-sm text-status-overdue dark:text-status-d-overdue">{error}</div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="flex items-center justify-center py-20 text-sm text-brand-navy-70 dark:text-fg-2">
            No closed opportunities yet.
          </div>
        )}
        {!loading && items.length > 0 && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white dark:bg-ink-1 border-b border-brand-navy-30/40 dark:border-ink-border-soft z-10">
              <tr>
                {visibleColumns.map(col => (
                  <SortableHeader
                    key={col}
                    colKey={col}
                    label={COLUMN_BY_KEY[col]?.label ?? col}
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide whitespace-nowrap"
                  />
                ))}
                {/* Pinned: Closed date column header */}
                <SortableHeader
                  colKey="closed_at"
                  label="Closed"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide whitespace-nowrap"
                />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {(sortKey ? sortRows(items, sortKey, sortDir, oppColType, getOppValue) : items).map((item) => (
                <ClosedRow
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  onClick={() => setSelectedId(item.id)}
                  visibleColumns={visibleColumns}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-in drawer */}
      <Drawer open={selectedId !== null} onClose={() => setSelectedId(null)}>
        {selectedId !== null && (
          <OpportunityDetail key={selectedId} oppId={selectedId} />
        )}
      </Drawer>
    </div>
  );
}
