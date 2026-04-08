import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Opportunity, User } from '../types';
import { computeHealthScore } from '../utils/healthScore';
import { listOpportunities } from '../api/opportunities';
import { updateMyPreferences, listUsers } from '../api/users';
import { useUsers } from '../hooks/useUsers';
import { useAuthStore } from '../store/auth';
import { getColumnsForPage, DEFAULT_COLUMNS, COLUMN_BY_KEY } from '../constants/columnDefs';
import OpportunityDetail from '../components/OpportunityDetail';
import Drawer from '../components/Drawer';
import ColumnPicker from '../components/shared/ColumnPicker';
import MultiSelectFilter from '../components/shared/MultiSelectFilter';
import { sortFiscalPeriod } from '../utils/formatters';
import SortableHeader from '../components/shared/SortableHeader';
import { createNote } from '../api/notes';
import { createTask } from '../api/tasks';
import { renderOpportunityCell } from '../utils/renderOpportunityCell';
import { sortRows, oppColType, getOppValue, type SortDir } from '../utils/sortRows';
import { computeMeddpicc } from '../utils/meddpicc';

// Stage order per issue #16
const STAGES = [
  'Qualify', 'Build Value', 'Develop Solution',
  'Proposal Sent', 'Negotiate', 'Submitted for Booking',
];

// ── Freshness dot that morphs into a + capture trigger on hover ───────────────
type CaptureType = 'note' | 'task';
function defaultDueDate() {
  const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0];
}

function NameCellWithCapture({ opp, onSaved }: { opp: Opportunity; onSaved?: () => void }) {
  const { user } = useAuthStore();
  const defaultType: CaptureType = user?.role === 'manager' ? 'task' : 'note';
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CaptureType>(defaultType);
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [assignedTo, setAssignedTo] = useState<number | null>(opp.se_owner?.id ?? null);
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Freshness color
  const updatedAt = opp.se_comments_updated_at;
  let dotColor = 'bg-brand-navy-30';
  let title = 'Never updated — click to add note/task';
  if (updatedAt) {
    const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
    title = `${days}d ago — click to add note/task`;
    if (days <= 7)  dotColor = 'bg-status-success';
    else if (days <= 21) dotColor = 'bg-status-warning';
    else dotColor = 'bg-status-overdue';
  }

  function openPopover(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = btnRef.current!.getBoundingClientRect();
    const left = Math.min(rect.right, window.innerWidth - 296);
    setPos({ top: rect.bottom + 6, left: Math.max(8, left) });
    setText(''); setType(defaultType); setDueDate(defaultDueDate()); setSaved(false);
    setAssignedTo(opp.se_owner?.id ?? null);
    setOpen(true);
    if (users.length === 0) listUsers().then(setUsers).catch(() => {});
  }

  function close() { setOpen(false); setSaving(false); }

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  const onKey = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') close(); }, []);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onKey]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      if (type === 'note') await createNote(opp.id, text.trim());
      else await createTask(opp.id, { title: text.trim(), due_date: dueDate, ...(assignedTo != null ? { assigned_to_id: assignedTo } : {}) });
      setSaved(true); onSaved?.();
      setTimeout(() => close(), 500);
    } catch { setSaving(false); }
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Freshness dot → + on hover */}
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        title={title}
        className="group/dot relative flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center focus:outline-none"
      >
        <span className={`absolute inset-0 rounded-full ${dotColor} transition-opacity group-hover/dot:opacity-0`} />
        <span className="absolute inset-0 rounded-full bg-brand-purple opacity-0 group-hover/dot:opacity-100 transition-opacity flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </span>
      </button>

      <span className="text-sm font-medium text-brand-navy truncate max-w-[260px]">{opp.name}</span>

      {/* Popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            className="fixed z-50 w-72 bg-white rounded-xl shadow-xl border border-brand-navy-30/40 p-3"
            style={{ top: pos.top, left: pos.left }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit mb-2.5">
              {(['note', 'task'] as CaptureType[]).map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`px-3 py-0.5 rounded-md text-[11px] font-semibold transition-colors capitalize ${type === t ? 'bg-white text-brand-navy shadow-sm' : 'text-brand-navy-70 hover:text-brand-navy'}`}>
                  {t}
                </button>
              ))}
            </div>
            <form onSubmit={handleSave}>
              <input ref={inputRef} type="text" value={text} onChange={e => setText(e.target.value)}
                placeholder={type === 'note' ? 'SE comments, next steps, context…' : 'What needs doing…'}
                className="w-full px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-70 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple mb-2"
              />
              {type === 'task' && (
                <>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-xs text-brand-navy focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple mb-2"
                  />
                  <select value={assignedTo ?? ''} onChange={e => setAssignedTo(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-xs text-brand-navy focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple mb-2 bg-white">
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-brand-navy-70 truncate max-w-[140px]" title={opp.name}>→ {opp.name}</p>
                <button type="submit" disabled={!text.trim() || saving || saved}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${saved ? 'bg-status-success text-white' : 'bg-brand-purple text-white hover:bg-brand-purple-70 disabled:opacity-40'}`}>
                  {saved ? 'Saved ✓' : saving ? '…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </>
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
          ? 'bg-brand-purple/[0.04] border-l-2 border-l-brand-purple-70'
          : 'hover:bg-brand-navy/[0.025]'
      }`}
    >
      {visibleColumns.map(col => (
        <td key={col} className="px-3 py-3 whitespace-nowrap">
          {col === 'name'
            ? <NameCellWithCapture opp={opp} onSaved={onRefreshList} />
            : renderOpportunityCell(opp, col)}
        </td>
      ))}
      <td className="px-2 py-3 text-brand-navy-30">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </td>
    </tr>
  );
}


// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({
  search, setSearch,
  stages, setStages,
  fiscalPeriods, selectedFiscalPeriods, setFiscalPeriods,
  teams, teamOptions, setTeams,
  recordTypes, recordTypeOptions, setRecordTypes,
  myDeals, setMyDeals,
  atRisk, setAtRisk,
  meddpiccMax, setMeddpiccMax,
  seFilterName, clearSeFilter,
  total,
  columnPicker,
}: {
  search: string; setSearch: (v: string) => void;
  stages: string[]; setStages: (v: string[]) => void;
  fiscalPeriods: string[]; selectedFiscalPeriods: string[]; setFiscalPeriods: (v: string[]) => void;
  teams: string[]; teamOptions: string[]; setTeams: (v: string[]) => void;
  recordTypes: string[]; recordTypeOptions: string[]; setRecordTypes: (v: string[]) => void;
  myDeals: boolean; setMyDeals: (v: boolean) => void;
  atRisk: boolean; setAtRisk: (v: boolean) => void;
  meddpiccMax: number | null; setMeddpiccMax: (v: number | null) => void;
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
        className="flex-1 min-w-[160px] max-w-xs px-3 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-70 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple"
      />
      <MultiSelectFilter options={STAGES} selected={stages} onChange={setStages} placeholder="All stages" />
      <MultiSelectFilter options={fiscalPeriods} selected={selectedFiscalPeriods} onChange={setFiscalPeriods} placeholder="All periods" />
      <MultiSelectFilter options={teamOptions} selected={teams} onChange={setTeams} placeholder="All teams" />
      <MultiSelectFilter options={recordTypeOptions} selected={recordTypes} onChange={setRecordTypes} placeholder="All types" />
      <button
        onClick={() => setMyDeals(!myDeals)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          myDeals
            ? 'bg-brand-purple/10 border-brand-purple text-brand-purple'
            : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy'
        }`}
      >
        My deals
      </button>
      <button
        onClick={() => setAtRisk(!atRisk)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          atRisk
            ? 'bg-status-overdue/10 border-status-overdue text-status-overdue'
            : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy'
        }`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${atRisk ? 'bg-status-overdue' : 'bg-brand-navy-30'}`} />
        At-risk only
      </button>
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
        meddpiccMax !== null
          ? 'bg-amber-50 border-status-warning text-status-warning'
          : 'border-brand-navy-30 text-brand-navy-70'
      }`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meddpiccMax !== null ? 'bg-status-warning' : 'bg-brand-navy-30'}`} />
        MEDDPICC below
        <select
          value={meddpiccMax ?? ''}
          onChange={e => setMeddpiccMax(e.target.value === '' ? null : Number(e.target.value))}
          className="bg-transparent border-none outline-none font-semibold cursor-pointer text-xs"
        >
          <option value="">—</option>
          {[4, 5, 6, 7].map(n => (
            <option key={n} value={n}>{n}/9</option>
          ))}
        </select>
      </div>
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
  const { users } = useUsers();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allOpps, setAllOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [stages, setStages] = useState<string[]>([]);
  const [selectedFiscalPeriods, setFiscalPeriods] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const defaultTeamsSet = useRef(false);
  const [recordTypes, setRecordTypes] = useState<string[]>([]);

  const seIdParam = searchParams.get('se_id') ? Number(searchParams.get('se_id')) : null;
  const allTeamsParam = searchParams.get('all_teams') === '1';
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    getColumnsForPage('pipeline', user?.column_prefs ?? null)
  );
  const [myDeals, setMyDeals] = useState(() => user?.role === 'se');
  const [atRisk, setAtRisk] = useState(false);
  const [meddpiccMax, setMeddpiccMax] = useState<number | null>(null);
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

  // Compute effective territory filter: manager's own teams, or SE's manager's teams
  const effectiveTeams = useMemo(() => {
    if (!user) return [];
    if (user.teams?.length) return user.teams;
    if (user.manager_id && users.length > 0) {
      const mgr = users.find(u => u.id === user.manager_id);
      return mgr?.teams ?? [];
    }
    return [];
  }, [user, users]);

  // Set teams filter default once when effective teams become known
  // Skip default when all_teams=1 param is present (e.g. cross-territory drill-through)
  useEffect(() => {
    if (allTeamsParam) { defaultTeamsSet.current = true; return; }
    if (!defaultTeamsSet.current && effectiveTeams.length > 0) {
      setTeams(effectiveTeams);
      defaultTeamsSet.current = true;
    }
  }, [allTeamsParam, effectiveTeams]);

  // Derive sorted fiscal periods from loaded data
  const fiscalPeriods = [...new Set(
    allOpps.map(o => o.fiscal_period).filter(Boolean) as string[]
  )].sort(sortFiscalPeriod);

  const teamOptions = [...new Set(allOpps.map(o => o.team).filter(Boolean) as string[])].sort();
  const recordTypeOptions = [...new Set(allOpps.map(o => o.record_type).filter(Boolean) as string[])].sort();

  // Derive SE filter name from loaded data
  const seFilterName = seIdParam
    ? (allOpps.find(o => o.se_owner?.id === seIdParam)?.se_owner?.name ?? `SE #${seIdParam}`)
    : null;

  function clearSeFilter() {
    setSearchParams(p => { p.delete('se_id'); return p; });
  }

  // Apply all filters client-side
  const filtered = allOpps.filter(o => {
    if (myDeals && o.se_owner?.id !== user?.id) return false;
    if (seIdParam && o.se_owner?.id !== seIdParam) return false;
    if (stages.length > 0 && !stages.includes(o.stage)) return false;
    if (selectedFiscalPeriods.length > 0 && !selectedFiscalPeriods.includes(o.fiscal_period ?? '')) return false;
    if (teams.length > 0 && !teams.includes(o.team ?? '')) return false;
    if (atRisk && computeHealthScore(o).rag === 'green') return false;
    if (meddpiccMax !== null && computeMeddpicc(o).strong > meddpiccMax) return false;
    if (recordTypes.length > 0 && !recordTypes.includes(o.record_type ?? '')) return false;
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
        teams={teams} teamOptions={teamOptions} setTeams={setTeams}
        recordTypes={recordTypes} recordTypeOptions={recordTypeOptions} setRecordTypes={setRecordTypes}
        myDeals={myDeals} setMyDeals={setMyDeals}
        atRisk={atRisk} setAtRisk={setAtRisk}
        meddpiccMax={meddpiccMax} setMeddpiccMax={setMeddpiccMax}
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
          <div className="flex flex-col items-center justify-center py-20 text-center gap-1.5">
            <p className="text-sm font-medium text-brand-navy-70">No deals match your filters</p>
            <p className="text-xs text-brand-navy-30">Try adjusting the stage, SE, or close date filters, or clear the search.</p>
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
                <th className="w-6" />
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
