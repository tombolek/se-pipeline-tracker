import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Opportunity, User } from '../types';
import { computeHealthScore } from '../utils/healthScore';
import { listFavorites, listOpportunitiesPaginated, getFilterOptions } from '../api/opportunities';
import { updateMyPreferences, listUsers } from '../api/users';
import { useUsers } from '../hooks/useUsers';
import { useOppUrlSync } from '../hooks/useOppUrlSync';
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
import TeamScopeSelector from '../components/shared/TeamScopeSelector';
import { useTeamScope } from '../hooks/useTeamScope';
import BulkActionsBar from '../components/pipeline/BulkActionsBar';
import { estimateUsage } from '../offline/db';
import { useConnectionStatus } from '../offline/useConnectionStatus';

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
  let dotColor = 'bg-brand-navy-30 dark:bg-fg-4';
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
        <span className="absolute inset-0 rounded-full bg-brand-purple dark:bg-accent-purple opacity-0 group-hover/dot:opacity-100 transition-opacity flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </span>
      </button>

      <span className="text-sm font-medium text-brand-navy dark:text-fg-1 truncate max-w-[260px]">{opp.name}</span>

      {/* Popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            className="fixed z-50 w-72 bg-white dark:bg-ink-1 rounded-xl shadow-xl border border-brand-navy-30/40 dark:border-ink-border-soft p-3"
            style={{ top: pos.top, left: pos.left }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex gap-1 bg-gray-100 dark:bg-ink-3 rounded-lg p-0.5 w-fit mb-2.5">
              {(['note', 'task'] as CaptureType[]).map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`px-3 py-0.5 rounded-md text-[11px] font-semibold transition-colors capitalize ${type === t ? 'bg-white dark:bg-ink-1 text-brand-navy dark:text-fg-1 shadow-sm' : 'text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy'}`}>
                  {t}
                </button>
              ))}
            </div>
            <form onSubmit={handleSave}>
              <input ref={inputRef} type="text" value={text} onChange={e => setText(e.target.value)}
                placeholder={type === 'note' ? 'SE comments, next steps, context…' : 'What needs doing…'}
                className="w-full px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy dark:text-fg-1 placeholder:text-brand-navy-70 dark:text-fg-2 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple mb-2"
              />
              {type === 'task' && (
                <>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-xs text-brand-navy dark:text-fg-1 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple mb-2"
                  />
                  <select value={assignedTo ?? ''} onChange={e => setAssignedTo(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-xs text-brand-navy dark:text-fg-1 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple mb-2 bg-white dark:bg-ink-1">
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-brand-navy-70 dark:text-fg-2 truncate max-w-[140px]" title={opp.name}>→ {opp.name}</p>
                <button type="submit" disabled={!text.trim() || saving || saved}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${saved ? 'bg-status-success dark:bg-status-d-success text-white' : 'bg-brand-purple dark:bg-accent-purple text-white hover:bg-brand-purple-70 dark:hover:opacity-90 disabled:opacity-40'}`}>
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
// Memoized: skips re-render unless the opp object, selection, or column set
// changes. Critical with 1000+ rows — without this, every keystroke in the
// search box re-rendered every row. (Issue #102)
const OppRow = memo(function OppRow({ opp, selected, checked, onSelect, onToggleCheck, onRefreshList, visibleColumns }: {
  opp: Opportunity;
  selected: boolean;
  checked: boolean;
  onSelect: (id: number) => void;
  onToggleCheck: (id: number, e: React.MouseEvent | React.ChangeEvent) => void;
  onRefreshList?: () => void;
  visibleColumns: string[];
}) {
  const handleClick = useCallback(() => onSelect(opp.id), [onSelect, opp.id]);
  return (
    <tr
      onClick={handleClick}
      className={`group border-b border-brand-navy-30/30 dark:border-ink-border-soft cursor-pointer transition-colors ${
        selected
          ? 'bg-brand-purple/[0.04] border-l-2 border-l-brand-purple-70'
          : checked
            ? 'bg-brand-purple/[0.025]'
            : 'hover:bg-brand-navy/[0.025] dark:hover:bg-white/[0.025]'
      }`}
    >
      <td
        className="px-2 py-3 w-8"
        onClick={e => { e.stopPropagation(); onToggleCheck(opp.id, e); }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={e => { e.stopPropagation(); onToggleCheck(opp.id, e); }}
          className="h-3.5 w-3.5 rounded border-brand-navy-30 text-brand-purple dark:text-accent-purple focus:ring-brand-purple cursor-pointer"
          aria-label={`Select ${opp.name}`}
        />
      </td>
      {visibleColumns.map(col => (
        <td key={col} className="px-3 py-3 whitespace-nowrap">
          {col === 'name'
            ? <NameCellWithCapture opp={opp} onSaved={onRefreshList} />
            : renderOpportunityCell(opp, col)}
        </td>
      ))}
      <td className="px-2 py-3 text-brand-navy-30 dark:text-fg-4">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </td>
    </tr>
  );
});


// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({
  search, setSearch,
  stages, setStages,
  fiscalPeriods, selectedFiscalPeriods, setFiscalPeriods,
  teams, teamOptions, setTeams,
  recordTypes, recordTypeOptions, setRecordTypes,
  atRisk, setAtRisk,
  meddpiccMax, setMeddpiccMax,
  seFilterName, clearSeFilter,
  total,
  columnPicker,
  showTeamScope,
}: {
  search: string; setSearch: (v: string) => void;
  stages: string[]; setStages: (v: string[]) => void;
  fiscalPeriods: string[]; selectedFiscalPeriods: string[]; setFiscalPeriods: (v: string[]) => void;
  teams: string[]; teamOptions: string[]; setTeams: (v: string[]) => void;
  recordTypes: string[]; recordTypeOptions: string[]; setRecordTypes: (v: string[]) => void;
  atRisk: boolean; setAtRisk: (v: boolean) => void;
  meddpiccMax: number | null; setMeddpiccMax: (v: number | null) => void;
  seFilterName: string | null; clearSeFilter: () => void;
  total: number;
  columnPicker: React.ReactNode;
  showTeamScope?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-brand-navy-30/40 dark:border-ink-border-soft bg-white dark:bg-ink-1 flex-wrap flex-shrink-0">
      <input
        type="text"
        placeholder="Search opportunities…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="flex-1 min-w-[160px] max-w-xs px-3 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy dark:text-fg-1 placeholder:text-brand-navy-70 dark:text-fg-2 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple"
      />
      <MultiSelectFilter options={STAGES} selected={stages} onChange={setStages} placeholder="All stages" />
      <MultiSelectFilter options={fiscalPeriods} selected={selectedFiscalPeriods} onChange={setFiscalPeriods} placeholder="All periods" />
      <MultiSelectFilter options={teamOptions} selected={teams} onChange={setTeams} placeholder="All teams" />
      <MultiSelectFilter options={recordTypeOptions} selected={recordTypes} onChange={setRecordTypes} placeholder="All types" />
      {showTeamScope && <TeamScopeSelector />}
      {/* At-risk and MEDDPICC-below filters temporarily hidden — keep state + props wired so we can re-enable without refactoring. */}
      {false && (
        <button
          onClick={() => setAtRisk(!atRisk)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            atRisk
              ? 'bg-status-overdue/10 dark:bg-status-d-overdue-soft border-status-overdue text-status-overdue dark:text-status-d-overdue'
              : 'border-brand-navy-30 text-brand-navy-70 dark:text-fg-2 hover:border-brand-navy hover:text-brand-navy'
          }`}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${atRisk ? 'bg-status-overdue' : 'bg-brand-navy-30 dark:bg-fg-4'}`} />
          At-risk only
        </button>
      )}
      {false && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          meddpiccMax !== null
            ? 'bg-amber-50 border-status-warning text-status-warning dark:text-status-d-warning'
            : 'border-brand-navy-30 text-brand-navy-70 dark:text-fg-2'
        }`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meddpiccMax !== null ? 'bg-status-warning' : 'bg-brand-navy-30 dark:bg-fg-4'}`} />
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
      )}
      {seFilterName && (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-brand-purple/10 dark:bg-accent-purple-soft border border-brand-purple text-brand-purple dark:text-accent-purple">
          SE: {seFilterName}
          <button onClick={clearSeFilter} className="hover:text-brand-navy dark:text-fg-1 transition-colors" aria-label="Clear SE filter">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      )}
      {columnPicker}
      <span className="text-xs text-brand-navy-70 dark:text-fg-2 ml-auto">
        {total} opportunit{total !== 1 ? 'ies' : 'y'}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PipelinePage({ myPipelineMode = false, favoritesMode = false }: { myPipelineMode?: boolean; favoritesMode?: boolean }) {
  const { user, setUser } = useAuthStore();
  const { users } = useUsers();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allOpps, setAllOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useOppUrlSync(selectedId, setSelectedId, allOpps);
  const [search, setSearch] = useState('');
  // Debounced copy of `search` — actual filtering uses this so typing each char
  // doesn't re-filter 1000+ rows per keystroke. (Issue #102)
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);
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
  const [atRisk, setAtRisk] = useState(false);
  const [meddpiccMax, setMeddpiccMax] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); setSortDir('asc'); }
  }

  // Server-side pagination (Issue #102 phase 3).
  // Pipeline/MyPipeline: filters+sort+paging go through the server.
  // Favorites: still loads full set (small) and filters client-side to keep the
  // local-first-class UX for starred deals.
  const PAGE_SIZE = 100;
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterOptions, setFilterOptionsState] = useState<{ fiscal_period: string[]; team: string[]; record_type: string[]; stage: string[] }>({ fiscal_period: [], team: [], record_type: [], stage: [] });

  // Fetch distinct filter-option values once — used to populate dropdowns
  // independently of the currently-loaded page of rows.
  useEffect(() => {
    if (favoritesMode) return;
    getFilterOptions().then(setFilterOptionsState).catch(() => {});
  }, [favoritesMode]);

  // Serialized filter state → server params. A single string key is used for
  // the useEffect dependency so equality is stable across re-renders.
  const serverParams = useMemo(() => ({
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    stage: stages.length ? stages : undefined,
    team: teams.length ? teams : undefined,
    record_type: recordTypes.length ? recordTypes : undefined,
    fiscal_period: selectedFiscalPeriods.length ? selectedFiscalPeriods : undefined,
    se_owner: seIdParam ?? undefined,
    my_deals: (!favoritesMode && myPipelineMode) ? true : undefined,
    at_risk: atRisk ? true : undefined,
    meddpicc_max: meddpiccMax !== null ? meddpiccMax : undefined,
    include_qualify: true,
    sort: sortKey ?? 'close_date',
    dir: sortDir,
  }), [
    debouncedSearch, stages, teams, recordTypes, selectedFiscalPeriods,
    seIdParam, favoritesMode, myPipelineMode, atRisk, meddpiccMax,
    sortKey, sortDir,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (favoritesMode) {
        const opps = await listFavorites();
        setAllOpps(opps);
        setTotal(opps.length);
      } else {
        const r = await listOpportunitiesPaginated({ ...serverParams, offset: 0 });
        setAllOpps(r.data);
        setTotal(r.total);
      }
    } catch {
      setError('Failed to load opportunities.');
    } finally {
      setLoading(false);
    }
  }, [favoritesMode, serverParams]);

  useEffect(() => { load(); }, [load]);

  async function loadMore() {
    if (favoritesMode || loadingMore || allOpps.length >= total) return;
    setLoadingMore(true);
    try {
      const r = await listOpportunitiesPaginated({ ...serverParams, offset: allOpps.length });
      setAllOpps(prev => [...prev, ...r.data]);
      setTotal(r.total);
    } catch {
      // non-fatal
    } finally {
      setLoadingMore(false);
    }
  }

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

  // Team scope (managers only). "My Team" → filter to manager's territories;
  // "Full View" → no territory filter. For SEs and non-managers, isFiltered is
  // always false and we keep the legacy behaviour of defaulting to their
  // manager's territories on first load.
  const { isFiltered, isManager } = useTeamScope();

  // Managers: react to the scope selector — sync the teams multi-select to the
  // active scope so server pagination lines up with what's shown.
  // SEs: apply the one-time default to their manager's territories.
  useEffect(() => {
    if (myPipelineMode || favoritesMode || allTeamsParam) { defaultTeamsSet.current = true; return; }
    if (isManager) {
      setTeams(isFiltered ? effectiveTeams : []);
      defaultTeamsSet.current = true;
      return;
    }
    if (!defaultTeamsSet.current && effectiveTeams.length > 0) {
      setTeams(effectiveTeams);
      defaultTeamsSet.current = true;
    }
  }, [allTeamsParam, effectiveTeams, isManager, isFiltered, myPipelineMode, favoritesMode]);

  // Filter-option lists. In favorites mode we derive from loaded data (small
  // set, no server endpoint needed). Otherwise use the distinct-values endpoint
  // so dropdowns don't shrink when filters are applied.
  const fiscalPeriods = useMemo(
    () => favoritesMode
      ? [...new Set(allOpps.map(o => o.fiscal_period).filter(Boolean) as string[])].sort(sortFiscalPeriod)
      : [...filterOptions.fiscal_period].sort(sortFiscalPeriod),
    [favoritesMode, allOpps, filterOptions.fiscal_period]
  );

  const teamOptions = useMemo(
    () => favoritesMode
      ? [...new Set(allOpps.map(o => o.team).filter(Boolean) as string[])].sort()
      : [...filterOptions.team].sort(),
    [favoritesMode, allOpps, filterOptions.team]
  );
  const recordTypeOptions = useMemo(
    () => favoritesMode
      ? [...new Set(allOpps.map(o => o.record_type).filter(Boolean) as string[])].sort()
      : [...filterOptions.record_type].sort(),
    [favoritesMode, allOpps, filterOptions.record_type]
  );

  // Derive SE filter name from loaded data
  const seFilterName = useMemo(
    () => seIdParam
      ? (allOpps.find(o => o.se_owner?.id === seIdParam)?.se_owner?.name ?? `SE #${seIdParam}`)
      : null,
    [allOpps, seIdParam]
  );

  function clearSeFilter() {
    setSearchParams(p => { p.delete('se_id'); return p; });
  }

  // Pipeline/MyPipeline rows come back already filtered+sorted from the server.
  // Favorites mode still filters client-side so the starred list feels instant.
  const displayed = useMemo(() => {
    if (!favoritesMode) return allOpps;
    const q = debouncedSearch.toLowerCase();
    const filtered = allOpps.filter(o => {
      if (seIdParam && o.se_owner?.id !== seIdParam) return false;
      if (stages.length > 0 && !stages.includes(o.stage)) return false;
      if (selectedFiscalPeriods.length > 0 && !selectedFiscalPeriods.includes(o.fiscal_period ?? '')) return false;
      if (teams.length > 0 && !teams.includes(o.team ?? '')) return false;
      if (atRisk && computeHealthScore(o).rag === 'green') return false;
      if (meddpiccMax !== null && computeMeddpicc(o).strong > meddpiccMax) return false;
      if (recordTypes.length > 0 && !recordTypes.includes(o.record_type ?? '')) return false;
      if (q) {
        if (!o.name.toLowerCase().includes(q) && !(o.account_name ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return sortKey ? sortRows(filtered, sortKey, sortDir, oppColType, getOppValue) : filtered;
  }, [
    favoritesMode, allOpps, seIdParam,
    stages, selectedFiscalPeriods, teams, atRisk, meddpiccMax, recordTypes,
    debouncedSearch, sortKey, sortDir,
  ]);

  // Stable callback so memoized OppRow doesn't re-render on parent state churn.
  const handleSelectId = useCallback((id: number) => setSelectedId(id), []);

  // ── Bulk selection (Issue #115) ────────────────────────────────────────────
  // Track row checkboxes separately from the drawer's "selectedId". Using a
  // Set keeps membership checks O(1) in the memoized row, and supports
  // shift-click range select against a last-clicked anchor.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const lastClickedIdRef = useRef<number | null>(null);

  const handleToggleCheck = useCallback((id: number, e: React.MouseEvent | React.ChangeEvent) => {
    const shift = 'shiftKey' in e ? (e as React.MouseEvent).shiftKey : false;
    setSelectedIds(prev => {
      const next = new Set(prev);
      const anchor = lastClickedIdRef.current;
      if (shift && anchor != null && anchor !== id) {
        // Select the contiguous range in the currently-visible list.
        const ids = displayed.map(o => o.id);
        const a = ids.indexOf(anchor);
        const b = ids.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
        } else {
          if (next.has(id)) next.delete(id); else next.add(id);
        }
      } else {
        if (next.has(id)) next.delete(id); else next.add(id);
      }
      return next;
    });
    lastClickedIdRef.current = id;
  }, [displayed]);

  // Clear selection whenever the visible row set changes materially (filter /
  // search / sort). Otherwise users see "3 selected" referring to rows that
  // are no longer on screen.
  useEffect(() => {
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  }, [debouncedSearch, stages, teams, recordTypes, selectedFiscalPeriods, seIdParam, atRisk, meddpiccMax, sortKey, sortDir, myPipelineMode, favoritesMode]);

  const allVisibleChecked = displayed.length > 0 && displayed.every(o => selectedIds.has(o.id));
  const someVisibleChecked = !allVisibleChecked && displayed.some(o => selectedIds.has(o.id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleChecked;
  }, [someVisibleChecked]);

  function toggleSelectAll() {
    if (allVisibleChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayed.map(o => o.id)));
    }
  }

  const selectedOpps = useMemo(
    () => displayed.filter(o => selectedIds.has(o.id)),
    [displayed, selectedIds],
  );
  const visibleColumnLabels = useMemo(
    () => visibleColumns.map(k => ({ key: k, label: COLUMN_BY_KEY[k]?.label ?? k })),
    [visibleColumns],
  );

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
      {myPipelineMode && (
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-brand-navy-30/40 dark:border-ink-border-soft bg-white dark:bg-ink-1 flex-shrink-0">
          <span className="text-[13px] font-semibold text-brand-navy dark:text-fg-1">My Pipeline</span>
          <span className="inline-flex items-center gap-1.5 bg-brand-purple-30 text-brand-purple dark:text-accent-purple text-[11px] font-medium px-2.5 py-0.5 rounded-full">
            <span className="w-4 h-4 rounded-full bg-brand-purple dark:bg-accent-purple flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0">
              {user?.name?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
            </span>
            {user?.name ?? 'You'}
          </span>
        </div>
      )}
      {favoritesMode && (
        <>
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-brand-navy-30/40 dark:border-ink-border-soft bg-white dark:bg-ink-1 flex-shrink-0">
            <svg className="w-4 h-4 text-amber-400" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            <span className="text-[13px] font-semibold text-brand-navy dark:text-fg-1">Favorites</span>
            <span className="text-[11px] text-brand-navy-70 dark:text-fg-2">{allOpps.length} deal{allOpps.length !== 1 ? 's' : ''}</span>
          </div>
          <FavoritesOfflineBanner />
        </>
      )}
      <FilterBar
        search={search} setSearch={setSearch}
        stages={stages} setStages={setStages}
        fiscalPeriods={fiscalPeriods} selectedFiscalPeriods={selectedFiscalPeriods} setFiscalPeriods={setFiscalPeriods}
        teams={teams} teamOptions={teamOptions} setTeams={setTeams}
        recordTypes={recordTypes} recordTypeOptions={recordTypeOptions} setRecordTypes={setRecordTypes}
        atRisk={atRisk} setAtRisk={setAtRisk}
        meddpiccMax={meddpiccMax} setMeddpiccMax={setMeddpiccMax}
        seFilterName={seFilterName} clearSeFilter={clearSeFilter}
        total={favoritesMode ? displayed.length : total}
        showTeamScope={!myPipelineMode && !favoritesMode}
        columnPicker={
          <ColumnPicker
            visibleColumns={visibleColumns}
            defaultColumns={DEFAULT_COLUMNS.pipeline}
            onChange={handleColumnsChange}
          />
        }
      />

      {selectedIds.size > 0 && (
        <BulkActionsBar
          selectedIds={selectedIds}
          selectedOpps={selectedOpps}
          visibleColumnLabels={visibleColumnLabels}
          onClear={() => setSelectedIds(new Set())}
          onAfterMutate={load}
        />
      )}

      {/* Opportunity table */}
      <div className="flex-1 overflow-y-auto overflow-x-auto bg-white dark:bg-ink-1">
        {loading && (
          <div className="flex items-center justify-center py-20 text-sm text-brand-navy-70 dark:text-fg-2">Loading…</div>
        )}
        {error && (
          <div className="px-5 py-4 text-sm text-status-overdue dark:text-status-d-overdue">{error}</div>
        )}
        {!loading && !error && displayed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-1.5">
            <p className="text-sm font-medium text-brand-navy-70 dark:text-fg-2">No deals match your filters</p>
            <p className="text-xs text-brand-navy-30 dark:text-fg-4">Try adjusting the stage, SE, or close date filters, or clear the search.</p>
          </div>
        )}
        {!loading && displayed.length > 0 && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white dark:bg-ink-1 border-b border-brand-navy-30/40 dark:border-ink-border-soft z-10">
              <tr>
                <th className="px-2 py-2.5 w-8">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleChecked}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-brand-navy-30 text-brand-purple dark:text-accent-purple focus:ring-brand-purple cursor-pointer"
                    aria-label="Select all visible rows"
                    title={allVisibleChecked ? 'Clear selection' : 'Select all visible'}
                  />
                </th>
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
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {displayed.map(opp => (
                <OppRow
                  key={opp.id}
                  opp={opp}
                  selected={selectedId === opp.id}
                  checked={selectedIds.has(opp.id)}
                  onSelect={handleSelectId}
                  onToggleCheck={handleToggleCheck}
                  onRefreshList={load}
                  visibleColumns={visibleColumns}
                />
              ))}
            </tbody>
          </table>
        )}
        {/* Load more — paginated mode only, when there are more rows on the server. */}
        {!loading && !favoritesMode && allOpps.length < total && (
          <div className="flex items-center justify-center gap-2 py-4 border-t border-brand-navy-30/40 dark:border-ink-border-soft bg-white dark:bg-ink-1">
            <span className="text-[11px] text-brand-navy-70 dark:text-fg-2">
              Showing {allOpps.length} of {total}
            </span>
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-xs font-medium text-brand-purple dark:text-accent-purple hover:text-brand-purple-70 dark:text-accent-purple transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
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

// ── Favorites offline banner (Issue #117) ──────────────────────────────────
// Sits above the Favorites table, explains that favoriting a deal also keeps
// it available offline. Shows current cache usage + last-synced. Re-using
// the favorites primitive avoids a new "pin for offline" UI concept.
function FavoritesOfflineBanner() {
  const { online, syncing, lastSync } = useConnectionStatus();
  const [usageMb, setUsageMb] = useState<number | null>(null);
  useEffect(() => {
    estimateUsage().then(u => {
      if (u && u.used) setUsageMb(Math.round(u.used / (1024 * 1024) * 10) / 10);
    });
  }, [lastSync]);

  const syncedLabel = lastSync === null
    ? 'not yet synced'
    : (() => {
        const mins = Math.round((Date.now() - lastSync) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins} min ago`;
        const hrs = Math.floor(mins / 60);
        return `${hrs}h ${mins % 60}m ago`;
      })();

  return (
    <div className="mx-5 my-4 p-4 rounded-xl border border-brand-purple-30 bg-brand-purple-30/30 dark:bg-accent-purple-soft flex gap-3">
      <svg className="w-5 h-5 text-brand-purple dark:text-accent-purple flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex-1">
        <p className="text-xs font-medium text-brand-navy dark:text-fg-1">Favorited deals are available offline</p>
        <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-1 leading-relaxed">
          When you favorite a deal, the app keeps a local copy so you can review it without VPN or internet.
          Notes, tasks and reassigns made offline sync automatically when you reconnect.
        </p>
        <div className="flex items-center gap-3 mt-3 text-[11px] flex-wrap">
          {usageMb != null && (
            <span className="text-brand-navy-70 dark:text-fg-2">Cached: <span className="font-semibold text-brand-navy dark:text-fg-1">{usageMb} MB</span></span>
          )}
          <span className="text-brand-navy-70 dark:text-fg-2">Last synced {syncedLabel}{syncing ? ' · syncing now…' : ''}</span>
          <button
            onClick={() => window.location.reload()}
            className="ml-auto text-brand-purple dark:text-accent-purple font-semibold hover:text-brand-purple-70 dark:text-accent-purple"
            disabled={!online}
            title={online ? 'Refresh from server' : 'Reconnect to sync'}
          >Sync now</button>
        </div>
      </div>
    </div>
  );
}
