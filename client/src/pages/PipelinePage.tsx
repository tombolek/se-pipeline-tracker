import { useState, useEffect, useCallback } from 'react';
import type { Opportunity } from '../types';
import { listOpportunities } from '../api/opportunities';
import { updateMyPreferences } from '../api/users';
import { useAuthStore } from '../store/auth';
import { getColumnsForPage, DEFAULT_COLUMNS, COLUMN_BY_KEY } from '../constants/columnDefs';
import OpportunityDetail from '../components/OpportunityDetail';
import Drawer from '../components/Drawer';
import ColumnPicker from '../components/shared/ColumnPicker';
import RowCapture from '../components/RowCapture';
import { renderOpportunityCell } from '../utils/renderOpportunityCell';

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
const STAGES = [
  'Qualify', 'Develop Solution', 'Build Value',
  'Proposal Sent', 'Submitted for Booking', 'Negotiate',
];

function FilterBar({
  search, setSearch,
  stage, setStage,
  includeQualify, setIncludeQualify,
  qualifyCount, total,
  columnPicker,
}: {
  search: string; setSearch: (v: string) => void;
  stage: string; setStage: (v: string) => void;
  includeQualify: boolean; setIncludeQualify: (v: boolean) => void;
  qualifyCount: number;
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
      <select
        value={stage}
        onChange={e => setStage(e.target.value)}
        className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple"
      >
        <option value="">All stages</option>
        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button
        onClick={() => setIncludeQualify(!includeQualify)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
          includeQualify
            ? 'bg-brand-purple/10 border-brand-purple text-brand-purple'
            : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy'
        }`}
      >
        Show Qualify
        {!includeQualify && qualifyCount > 0 && (
          <span className="text-[10px] bg-brand-navy-30 text-brand-navy-70 rounded-full px-1.5">{qualifyCount}</span>
        )}
      </button>
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
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [qualifyOpps, setQualifyOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [includeQualify, setIncludeQualify] = useState(user?.show_qualify ?? false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    getColumnsForPage('pipeline', user?.column_prefs ?? null)
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [main, all] = await Promise.all([
        listOpportunities({ search: search || undefined, stage: stage || undefined, include_qualify: false }),
        listOpportunities({ include_qualify: true }),
      ]);
      setOpps(main);
      setQualifyOpps(all.filter(o => o.stage === 'Qualify'));
    } catch {
      setError('Failed to load opportunities.');
    } finally {
      setLoading(false);
    }
  }, [search, stage]);

  useEffect(() => { load(); }, [load]);

  const displayed = includeQualify
    ? [...opps.filter(o => o.stage !== 'Qualify'), ...qualifyOpps]
        .filter(o => !stage || o.stage === stage)
        .filter(o => !search ||
          o.name.toLowerCase().includes(search.toLowerCase()) ||
          (o.account_name ?? '').toLowerCase().includes(search.toLowerCase())
        )
    : opps;

  async function handleColumnsChange(cols: string[]) {
    setVisibleColumns(cols);
    try {
      const updatedUser = await updateMyPreferences({ column_prefs: { pipeline: cols } });
      setUser(updatedUser);
    } catch {
      // persist failure is non-fatal — local state already updated
    }
  }

  function handleClose() {
    setSelectedId(null);
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <FilterBar
        search={search} setSearch={setSearch}
        stage={stage} setStage={setStage}
        includeQualify={includeQualify} setIncludeQualify={setIncludeQualify}
        qualifyCount={qualifyOpps.length}
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
                  <th key={col} className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide whitespace-nowrap">
                    {COLUMN_BY_KEY[col]?.label ?? col}
                  </th>
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
      <Drawer open={selectedId !== null} onClose={handleClose}>
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
