import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Opportunity } from '../types';
import { listOpportunities } from '../api/opportunities';
import { updateMyPreferences } from '../api/users';
import { useAuthStore } from '../store/auth';
import { getColumnsForPage, DEFAULT_COLUMNS, COLUMN_BY_KEY } from '../constants/columnDefs';
import OpportunityDetail from '../components/OpportunityDetail';
import Drawer from '../components/Drawer';
import ColumnPicker from '../components/shared/ColumnPicker';
import MultiSelectFilter from '../components/shared/MultiSelectFilter';
import { sortFiscalPeriod } from '../utils/formatters';
import SortableHeader from '../components/shared/SortableHeader';
import RowCapture from '../components/RowCapture';
import { renderOpportunityCell } from '../utils/renderOpportunityCell';
import { sortRows, oppColType, getOppValue, type SortDir } from '../utils/sortRows';

// Stage order per issue #16
const STAGES = [
  'Qualify', 'Build Value', 'Develop Solution',
  'Proposal Sent', 'Negotiate', 'Submitted for Booking',
];

// ── Opportunity row ───────────────────────────────────────────────────────────
function OppRow({ opp, selected, onClick, onRefreshList, visibleColumns }: {
  opp: Opportunity;
  selected: boolean;
  onClick: () => void;
  onRefreshList?: () => void;
  visibleColumns: string[];
}) {
  return (
    <tr
      onClick={onClick}
      className={`group border-b border-brand-navy-30/30 cursor-pointer transition-colors ${
        selected
          ? 'bg-brand-purple-30/20 border-l-2 border-l-brand-purple'
          : 'hover:bg-brand-purple-30/10'
      }`}
    >
      {visibleColumns.map(col => (
        <td key={col} className="px-3 py-3 whitespace-nowrap">
          {renderOpportunityCell(opp, col)}
        </td>
      ))}
      <td className="px-3 py-3 text-brand-navy-30">
        <div className="flex items-center justify-end gap-1">
          <RowCapture oppId={opp.id} oppName={opp.name} onSaved={onRefreshList} />
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </td>
    </tr>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({
  search, setSearch,
  stages, setStages,
  fiscalPeriods, selectedFiscalPeriods, setFiscalPeriods,
  seFilterName, clearSeFilter,
  total,
  columnPicker,
}: {
  search: string; setSearch: (v: string) => void;
  stages: string[]; setStages: (v: string[]) => void;
  fiscalPeriods: string[]; selectedFiscalPeriods: string[]; setFiscalPeriods: (v: string[]) => void;
  seFilterName: string | null; clearSeFilter: () => void;
  total: number;
  columnPicker: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-brand-navy-30/40 bg-white flex-wrap flex-shrink-0">
      <input
        type="text"
        placeholder="Search opportunities…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="flex-1 min-w-[160px] max-w-xs px-3 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-70 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
      />
      <MultiSelectFilter options={STAGES} selected={stages} onChange={setStages} placeholder="All stages" />
      <MultiSelectFilter options={fiscalPeriods} selected={selectedFiscalPeriods} onChange={setFiscalPeriods} placeholder="All periods" />
      {seFilterName && (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-brand-purple/10 border border-brand-purple text-brand-purple">
          SE: {seFilterName}
          <button onClick={clearSeFilter} className="hover:text-brand-navy transition-colors" aria-label="Clear SE filter">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      )}
      {columnPicker}
      <span className="text-xs text-brand-navy-70 ml-auto">
        {total} opportunit{total !== 1 ? 'ies' : 'y'}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const { user, setUser } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allOpps, setAllOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [stages, setStages] = useState<string[]>([]);
  const [selectedFiscalPeriods, setFiscalPeriods] = useState<string[]>([]);

  const seIdParam = searchParams.get('se_id') ? Number(searchParams.get('se_id')) : null;
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    getColumnsForPage('pipeline', user?.column_prefs ?? null)
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
      const opps = await listOpportunities({ include_qualify: true });
      setAllOpps(opps);
    } catch {
      setError('Failed to load opportunities.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derive sorted fiscal periods from loaded data
  const fiscalPeriods = [...new Set(
    allOpps.map(o => o.fiscal_period).filter(Boolean) as string[]
  )].sort(sortFiscalPeriod);

  // Derive SE filter name from loaded data
  const seFilterName = seIdParam
    ? (allOpps.find(o => o.se_owner?.id === seIdParam)?.se_owner?.name ?? `SE #${seIdParam}`)
    : null;

  function clearSeFilter() {
    setSearchParams(p => { p.delete('se_id'); return p; });
  }

  // Apply all filters client-side
  const filtered = allOpps.filter(o => {
    if (seIdParam && o.se_owner?.id !== seIdParam) return false;
    if (stages.length > 0 && !stages.includes(o.stage)) return false;
    if (selectedFiscalPeriods.length > 0 && !selectedFiscalPeriods.includes(o.fiscal_period ?? '')) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.name.toLowerCase().includes(q) && !(o.account_name ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const displayed = sortKey
    ? sortRows(filtered, sortKey, sortDir, oppColType, getOppValue)
    : filtered;

  async function handleColumnsChange(cols: string[]) {
    setVisibleColumns(cols);
    try {
      const updatedUser = await updateMyPreferences({ column_prefs: { pipeline: cols } });
      setUser(updatedUser);
    } catch {
      // persist failure is non-fatal
    }
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <FilterBar
        search={search} setSearch={setSearch}
        stages={stages} setStages={setStages}
        fiscalPeriods={fiscalPeriods} selectedFiscalPeriods={selectedFiscalPeriods} setFiscalPeriods={setFiscalPeriods}
        seFilterName={seFilterName} clearSeFilter={clearSeFilter}
        total={displayed.length}
        columnPicker={
          <ColumnPicker
            visibleColumns={visibleColumns}
            defaultColumns={DEFAULT_COLUMNS.pipeline}
            onChange={handleColumnsChange}
          />
        }
      />

      {/* Opportunity table */}
      <div className="flex-1 overflow-y-auto overflow-x-auto bg-white">
        {loading && (
          <div className="flex items-center justify-center py-20 text-sm text-brand-navy-70">Loading…</div>
        )}
        {error && (
          <div className="px-5 py-4 text-sm text-status-overdue">{error}</div>
        )}
        {!loading && !error && displayed.length === 0 && (
          <div className="flex items-center justify-center py-20 text-sm text-brand-navy-70">
            No opportunities found.
          </div>
        )}
        {!loading && displayed.length > 0 && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white border-b border-brand-navy-30/40 z-10">
              <tr>
                {visibleColumns.map(col => (
                  <SortableHeader
                    key={col}
                    colKey={col}
                    label={COLUMN_BY_KEY[col]?.label ?? col}
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide whitespace-nowrap"
                  />
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {displayed.map(opp => (
                <OppRow
                  key={opp.id}
                  opp={opp}
                  selected={selectedId === opp.id}
                  onClick={() => setSelectedId(opp.id)}
                  onRefreshList={load}
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
          <OpportunityDetail
            key={selectedId}
            oppId={selectedId}
            onRefreshList={load}
          />
        )}
      </Drawer>
    </div>
  );
}
