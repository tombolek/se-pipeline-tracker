import { useState, useEffect, useCallback, useRef } from 'react';
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

// ── Stage order (per issue #16) ───────────────────────────────────────────────
const STAGES = [
  'Qualify',
  'Build Value',
  'Develop Solution',
  'Proposal Sent',
  'Negotiate',
  'Submitted for Booking',
];

// ── Stage multi-select dropdown ───────────────────────────────────────────────
function StageFilter({ selected, onChange }: {
  selected: string[];
  onChange: (stages: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function toggle(stage: string) {
    onChange(
      selected.includes(stage)
        ? selected.filter(s => s !== stage)
        : [...selected, stage]
    );
  }

  const label = selected.length === 0
    ? 'All stages'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} stages`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
          selected.length > 0
            ? 'bg-brand-purple/10 border-brand-purple text-brand-purple font-medium'
            : 'border-brand-navy-30 text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple'
        }`}
      >
        {label}
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-brand-navy-30/50 py-1 min-w-[200px]">
          {selected.length > 0 && (
            <button
              onClick={() => { onChange([]); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-brand-navy-70 hover:bg-gray-50"
            >
              Clear selection
            </button>
          )}
          {STAGES.map(stage => (
            <label key={stage} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-brand-purple-30/30">
              <span className={`flex-shrink-0 flex items-center justify-center w-3.5 h-3.5 rounded border transition-colors ${
                selected.includes(stage)
                  ? 'bg-brand-purple border-brand-purple text-white'
                  : 'border-brand-navy-30 bg-white'
              }`}>
                {selected.includes(stage) && (
                  <svg className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={3.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <input type="checkbox" className="sr-only" checked={selected.includes(stage)} onChange={() => toggle(stage)} />
              <span className="text-sm text-brand-navy">{stage}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

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
  fiscalPeriod, setFiscalPeriod,
  fiscalPeriods,
  total,
  columnPicker,
}: {
  search: string; setSearch: (v: string) => void;
  stages: string[]; setStages: (v: string[]) => void;
  fiscalPeriod: string; setFiscalPeriod: (v: string) => void;
  fiscalPeriods: string[];
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
      <StageFilter selected={stages} onChange={setStages} />
      <select
        value={fiscalPeriod}
        onChange={e => setFiscalPeriod(e.target.value)}
        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-purple ${
          fiscalPeriod
            ? 'bg-brand-purple/10 border-brand-purple text-brand-purple font-medium'
            : 'border-brand-navy-30 text-brand-navy'
        }`}
      >
        <option value="">All periods</option>
        {fiscalPeriods.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
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
  const [allOpps, setAllOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [stages, setStages] = useState<string[]>([]);
  const [fiscalPeriod, setFiscalPeriod] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    getColumnsForPage('pipeline', user?.column_prefs ?? null)
  );

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
  )].sort();

  // Apply all filters client-side
  const displayed = allOpps.filter(o => {
    if (stages.length > 0 && !stages.includes(o.stage)) return false;
    if (fiscalPeriod && o.fiscal_period !== fiscalPeriod) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.name.toLowerCase().includes(q) && !(o.account_name ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

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
        fiscalPeriod={fiscalPeriod} setFiscalPeriod={setFiscalPeriod}
        fiscalPeriods={fiscalPeriods}
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
