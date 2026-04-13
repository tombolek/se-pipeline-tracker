import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/client';
import { listUsers } from '../../api/users';
import { updateMyPreferences } from '../../api/users';
import { useTeamScope } from '../../hooks/useTeamScope';
import type { ApiResponse, User, Opportunity } from '../../types';
import { getColumnsForPage, DEFAULT_COLUMNS, COLUMN_BY_KEY } from '../../constants/columnDefs';
import ColumnPicker from '../../components/shared/ColumnPicker';
import MultiSelectFilter from '../../components/shared/MultiSelectFilter';
import { renderOpportunityCell } from '../../utils/renderOpportunityCell';
import { sortFiscalPeriod, formatDate } from '../../utils/formatters';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useAuthStore } from '../../store/auth';

// se_owner is pinned as an interactive select — exclude it from the picker
const SE_OWNER_KEY = 'se_owner';
const DEFAULT_SE_MAPPING_COLS = DEFAULT_COLUMNS.se_mapping.filter(c => c !== SE_OWNER_KEY);

const STAGES = [
  'Qualify', 'Build Value', 'Develop Solution',
  'Proposal Sent', 'Negotiate', 'Submitted for Booking',
];

const STAGE_COLORS: Record<string, string> = {
  'Qualify':               'bg-gray-100 text-gray-600',
  'Develop Solution':      'bg-blue-100 text-blue-700',
  'Build Value':           'bg-indigo-100 text-indigo-700',
  'Proposal Sent':         'bg-brand-purple/10 text-brand-purple',
  'Negotiate':             'bg-amber-100 text-amber-700',
  'Submitted for Booking': 'bg-green-100 text-green-700',
};

// ── Inline SE assign select ────────────────────────────────────────────────────
function SeAssignSelect({
  opp,
  ses,
  currentUser,
  onAssigned,
}: {
  opp: Opportunity;
  ses: User[];
  currentUser: User;
  onAssigned: (oppId: number, se: { id: number; name: string; email: string } | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [pendingSeId, setPendingSeId] = useState<number | null>(null);
  const { effectiveTeamNames } = useTeamScope();

  async function doAssign(newSeId: number | null) {
    setSaving(true);
    setPendingSeId(null);
    try {
      await api.patch(`/opportunities/${opp.id}`, { se_owner_id: newSeId });
      const newSe = newSeId ? (ses.find(s => s.id === newSeId) ?? null) : null;
      onAssigned(opp.id, newSe ? { id: newSe.id, name: newSe.name, email: newSe.email } : null);
    } catch {
      // revert is implicit — state only updates on success
    } finally {
      setSaving(false);
    }
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const val = e.target.value;
    const newSeId = val === '' ? null : parseInt(val);

    // Out-of-territory: show inline confirmation instead of browser dialog
    if (newSeId === currentUser.id && effectiveTeamNames.size > 0 && opp.team && !effectiveTeamNames.has(opp.team)) {
      setPendingSeId(newSeId);
      return;
    }

    await doAssign(newSeId);
  }

  const isManager = currentUser.role === 'manager';
  const currentlyOwns = opp.se_owner?.id === currentUser.id;
  const visibleSes = isManager || currentlyOwns ? ses : ses.filter(s => s.id === currentUser.id);
  const canUnassign = isManager || currentlyOwns;
  const territories = [...effectiveTeamNames].join(', ');

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <select
        value={opp.se_owner?.id ?? ''}
        onChange={handleChange}
        onClick={e => e.stopPropagation()}
        disabled={saving}
        className={`text-xs rounded-lg border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-colors disabled:opacity-50 ${
          opp.se_owner
            ? 'border-brand-navy-30 text-brand-navy bg-white'
            : 'border-status-warning text-status-warning bg-status-warning/10 font-medium'
        }`}
      >
        {canUnassign && <option value="">Unassigned</option>}
        {visibleSes.map(se => (
          <option key={se.id} value={se.id}>{se.name}</option>
        ))}
      </select>

      {/* Out-of-territory inline confirmation bubble */}
      {pendingSeId !== null && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-64 bg-white border border-status-warning/40 rounded-xl shadow-lg p-3">
          <div className="flex items-start gap-2 mb-2.5">
            <svg className="w-3.5 h-3.5 text-status-warning mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-[11.5px] text-brand-navy leading-relaxed">
              <span className="font-medium">"{opp.team}"</span> is outside your territory
              {territories && <span className="text-brand-navy-70"> ({territories})</span>}.
              Assign to yourself anyway?
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => doAssign(pendingSeId)}
              className="flex-1 text-[11px] font-medium bg-status-warning/10 text-status-warning border border-status-warning/30 rounded-lg px-2 py-1 hover:bg-status-warning/20 transition-colors"
            >
              Assign anyway
            </button>
            <button
              onClick={() => setPendingSeId(null)}
              className="flex-1 text-[11px] font-medium bg-white text-brand-navy-70 border border-brand-navy-30 rounded-lg px-2 py-1 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kanban card ───────────────────────────────────────────────────────────────
function KanbanCard({
  opp,
  draggable,
  onDragStart,
  onClick,
}: {
  opp: Opportunity;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  const aeInitials = (opp.ae_owner_name ?? '')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const stageColor = STAGE_COLORS[opp.stage] ?? 'bg-gray-100 text-gray-600';

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={`bg-white rounded-xl border border-brand-navy-30/40 p-3 shadow-sm transition-shadow hover:shadow-md select-none ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      }`}
    >
      <p className="text-sm font-medium text-brand-navy leading-snug mb-2 line-clamp-2">{opp.name}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${stageColor}`}>
          {opp.stage}
        </span>
        {opp.close_date && (
          <span className="text-[10px] text-brand-navy-70">{formatDate(opp.close_date)}</span>
        )}
        {aeInitials && (
          <span className="ml-auto w-5 h-5 rounded-full bg-brand-navy-30/50 flex items-center justify-center text-[9px] font-bold text-brand-navy-70 flex-shrink-0">
            {aeInitials}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Kanban column ─────────────────────────────────────────────────────────────
function KanbanColumn({
  label,
  count,
  opps,
  canDrop,
  draggingOppId,
  onDrop,
  onCardDragStart,
  canDragCard,
  onCardClick,
}: {
  label: string;
  count: number;
  opps: Opportunity[];
  canDrop: boolean;
  draggingOppId: number | null;
  onDrop: () => void;
  onCardDragStart: (oppId: number) => void;
  canDragCard: (opp: Opportunity) => boolean;
  onCardClick: (oppId: number) => void;
}) {
  const [over, setOver] = useState(false);
  const isUnassigned = label === 'Unassigned';

  return (
    <div
      className="flex flex-col min-w-[220px] w-[220px] flex-shrink-0"
      onDragOver={e => { if (canDrop && draggingOppId !== null) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); if (canDrop) onDrop(); }}
    >
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-xl mb-2 ${
        isUnassigned ? 'bg-status-warning/10' : 'bg-brand-purple-30/30'
      }`}>
        <span className={`text-xs font-semibold truncate ${isUnassigned ? 'text-status-warning' : 'text-brand-navy'}`}>
          {label}
        </span>
        <span className={`text-[10px] font-bold rounded-full px-1.5 py-px ml-2 flex-shrink-0 ${
          isUnassigned ? 'bg-status-warning/20 text-status-warning' : 'bg-brand-purple/10 text-brand-purple'
        }`}>
          {count}
        </span>
      </div>

      {/* Drop zone */}
      <div className={`flex-1 flex flex-col gap-2 min-h-[80px] rounded-xl p-2 transition-colors ${
        over && canDrop ? 'bg-brand-purple-30/40 ring-2 ring-brand-purple ring-dashed' : 'bg-transparent'
      }`}>
        {opps.map(opp => (
          <KanbanCard
            key={opp.id}
            opp={opp}
            draggable={canDragCard(opp)}
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onCardDragStart(opp.id); }}
            onClick={() => onCardClick(opp.id)}
          />
        ))}
        {opps.length === 0 && (
          <div className={`flex-1 flex items-center justify-center text-xs text-brand-navy-30 rounded-lg border-2 border-dashed min-h-[60px] ${
            over && canDrop ? 'border-brand-purple' : 'border-brand-navy-30/30'
          }`}>
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SeDealMappingPage() {
  const { user: currentUser, setUser } = useAuthStore();
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [ses, setSes] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const defaultFilter: number | 'unassigned' | 'all' =
    currentUser?.role === 'se' && currentUser.id ? currentUser.id : 'all';
  const [filterSe, setFilterSe] = useState<number | 'unassigned' | 'all'>(defaultFilter);
  const [filterStages, setFilterStages] = useState<string[]>([]);
  const [filterFiscalPeriods, setFilterFiscalPeriods] = useState<string[]>([]);
  const [filterTeams, setFilterTeams] = useState<string[]>(['EMEA', 'NA Enterprise', 'NA Strategic', 'ANZ']);
  const [filterRecordTypes, setFilterRecordTypes] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [draggingOppId, setDraggingOppId] = useState<number | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const cols = getColumnsForPage('se_mapping', currentUser?.column_prefs ?? null);
    return cols.filter(c => c !== SE_OWNER_KEY);
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [oppsRes, usersRes] = await Promise.all([
      api.get<ApiResponse<Opportunity[]>>('/opportunities?include_qualify=true&sort=close_date'),
      listUsers(),
    ]);
    setOpps(oppsRes.data.data);
    const activeUsers = usersRes.filter(u => u.is_active);
    const seList = activeUsers.filter(u => u.role === 'se');
    // Always include the current user so they can self-assign regardless of role
    if (currentUser && !seList.some(u => u.id === currentUser.id)) {
      const me = activeUsers.find(u => u.id === currentUser.id);
      if (me) seList.push(me);
    }
    setSes(seList);
    setLoading(false);
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  function handleAssigned(oppId: number, se: { id: number; name: string; email: string } | null) {
    setOpps(prev => prev.map(o => o.id === oppId ? { ...o, se_owner: se } : o));
  }

  async function handleColumnsChange(cols: string[]) {
    setVisibleColumns(cols);
    try {
      const updatedUser = await updateMyPreferences({ column_prefs: { se_mapping: cols } });
      setUser(updatedUser);
    } catch {
      // persist failure is non-fatal
    }
  }

  // Drop a card onto a column (null seId = unassigned)
  async function handleDrop(targetSeId: number | null) {
    if (draggingOppId === null) return;
    const opp = opps.find(o => o.id === draggingOppId);
    if (!opp) return;
    // Already there — no-op
    if ((opp.se_owner?.id ?? null) === targetSeId) { setDraggingOppId(null); return; }

    // Permission check (mirrors server logic)
    const isManager = currentUser?.role === 'manager';
    const currentlyOwns = opp.se_owner?.id === currentUser?.id;
    if (!isManager) {
      // SE can only: assign themselves to unowned deal, or remove themselves
      if (targetSeId !== currentUser?.id && targetSeId !== null) { setDraggingOppId(null); return; }
      if (!currentlyOwns && targetSeId !== currentUser?.id) { setDraggingOppId(null); return; }
    }

    try {
      await api.patch(`/opportunities/${opp.id}`, { se_owner_id: targetSeId });
      const newSe = targetSeId ? (ses.find(s => s.id === targetSeId) ?? null) : null;
      handleAssigned(opp.id, newSe ? { id: newSe.id, name: newSe.name, email: newSe.email } : null);
    } catch { /* silent */ }
    setDraggingOppId(null);
  }

  function canDragCard(opp: Opportunity): boolean {
    if (currentUser?.role === 'manager') return true;
    return opp.se_owner?.id === currentUser?.id || !opp.se_owner;
  }

  function canDropOnColumn(targetSeId: number | null): boolean {
    if (currentUser?.role === 'manager') return true;
    // SE can drop onto themselves or unassigned (if they own the dragging card)
    if (draggingOppId === null) return false;
    const opp = opps.find(o => o.id === draggingOppId);
    if (!opp) return false;
    const currentlyOwns = opp.se_owner?.id === currentUser?.id;
    if (targetSeId === currentUser?.id) return true;
    if (targetSeId === null && currentlyOwns) return true;
    return false;
  }

  const { seIds, teamNames, filterOpp } = useTeamScope();
  const scopedOpps = useMemo(() =>
    // Always include unassigned opps so they can be assigned; for assigned opps apply normal scope filter
    opps.filter(o => !o.se_owner || filterOpp({ se_owner_id: o.se_owner.id, team: o.team })),
    [opps, filterOpp]
  );
  // In team mode all SEs are available for assignment; in SE mode restrict to team members
  const scopedSes = useMemo(() =>
    teamNames.size > 0 ? ses : seIds.size > 0 ? ses.filter(s => seIds.has(s.id)) : ses,
    [ses, seIds, teamNames]
  );

  const fiscalPeriods = [...new Set(scopedOpps.map(o => o.fiscal_period).filter(Boolean) as string[])].sort(sortFiscalPeriod);
  const teamOptions = [...new Set(scopedOpps.map(o => o.team).filter(Boolean) as string[])].sort();
  const recordTypeOptions = [...new Set(scopedOpps.map(o => o.record_type).filter(Boolean) as string[])].sort();
  const unassignedCount = scopedOpps.filter(o => !o.se_owner).length;

  const searchLower = search.trim().toLowerCase();
  const filtered = scopedOpps.filter(o => {
    if (filterSe === 'unassigned' && o.se_owner) return false;
    if (typeof filterSe === 'number' && o.se_owner?.id !== filterSe) return false;
    if (filterStages.length > 0 && !filterStages.includes(o.stage)) return false;
    if (filterFiscalPeriods.length > 0 && !filterFiscalPeriods.includes(o.fiscal_period ?? '')) return false;
    if (filterTeams.length > 0 && !filterTeams.includes(o.team ?? '')) return false;
    if (filterRecordTypes.length > 0 && !filterRecordTypes.includes(o.record_type ?? '')) return false;
    if (searchLower && !o.name.toLowerCase().includes(searchLower) && !(o.account_name ?? '').toLowerCase().includes(searchLower)) return false;
    return true;
  });

  // Kanban columns: Unassigned + one per SE (filtered by SE filter if active)
  const kanbanColumns: { seId: number | null; label: string }[] = [];
  if (filterSe !== 'all' && typeof filterSe !== 'number') {
    kanbanColumns.push({ seId: null, label: 'Unassigned' });
  } else if (filterSe === 'all') {
    kanbanColumns.push({ seId: null, label: 'Unassigned' });
  }
  if (typeof filterSe === 'number') {
    const se = scopedSes.find(s => s.id === filterSe);
    if (se) kanbanColumns.push({ seId: se.id, label: se.name });
    // Also show unassigned in SE filter mode so you can drop back
    kanbanColumns.unshift({ seId: null, label: 'Unassigned' });
  } else {
    scopedSes.forEach(se => kanbanColumns.push({ seId: se.id, label: se.name }));
  }

  function oppsForColumn(seId: number | null) {
    return filtered.filter(o => (o.se_owner?.id ?? null) === seId);
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-6 pb-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold text-brand-navy">SE Deal Mapping</h1>
            <p className="text-sm text-brand-navy-70 mt-0.5">Assign SEs to opportunities and manage coverage</p>
          </div>
          {unassignedCount > 0 && (
            <span className="ml-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-status-warning/15 text-status-warning border border-status-warning/30">
              {unassignedCount} unassigned
            </span>
          )}

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1 bg-brand-navy-30/20 rounded-lg p-0.5">
            <button
              onClick={() => setView('table')}
              title="Table view"
              className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-white shadow-sm text-brand-purple' : 'text-brand-navy-70 hover:text-brand-navy'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
              </svg>
            </button>
            <button
              onClick={() => setView('kanban')}
              title="Kanban view"
              className={`p-1.5 rounded-md transition-colors ${view === 'kanban' ? 'bg-white shadow-sm text-brand-purple' : 'text-brand-navy-70 hover:text-brand-navy'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search + Filter pills */}
        {!loading && (
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-navy-30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search opportunities…"
                className="pl-8 pr-3 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-30 focus:outline-none focus:ring-2 focus:ring-brand-purple w-52"
              />
            </div>
            <MultiSelectFilter options={STAGES} selected={filterStages} onChange={setFilterStages} placeholder="All stages" />
            <MultiSelectFilter options={fiscalPeriods} selected={filterFiscalPeriods} onChange={setFilterFiscalPeriods} placeholder="All periods" />
            <MultiSelectFilter options={teamOptions} selected={filterTeams} onChange={setFilterTeams} placeholder="All teams" />
            <MultiSelectFilter options={recordTypeOptions} selected={filterRecordTypes} onChange={setFilterRecordTypes} placeholder="All types" />
            <button
              onClick={() => setFilterSe('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filterSe === 'all'
                  ? 'bg-brand-purple text-white border-brand-purple'
                  : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy'
              }`}
            >
              All deals <span className="ml-1 opacity-70">{scopedOpps.length}</span>
            </button>
            <button
              onClick={() => setFilterSe('unassigned')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filterSe === 'unassigned'
                  ? 'bg-status-warning text-white border-status-warning'
                  : 'border-status-warning/50 text-status-warning hover:border-status-warning'
              }`}
            >
              Unassigned <span className="ml-1 opacity-70">{unassignedCount}</span>
            </button>
            {scopedSes.map(se => {
              const count = scopedOpps.filter(o => o.se_owner?.id === se.id).length;
              return (
                <button
                  key={se.id}
                  onClick={() => setFilterSe(se.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    filterSe === se.id
                      ? 'bg-brand-purple text-white border-brand-purple'
                      : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy'
                  }`}
                >
                  {se.name} <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
            {view === 'table' && (
              <div className="ml-auto">
                <ColumnPicker
                  visibleColumns={visibleColumns}
                  defaultColumns={DEFAULT_SE_MAPPING_COLS}
                  onChange={handleColumnsChange}
                  excludeKeys={[SE_OWNER_KEY]}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Table view ── */}
      {view === 'table' && (
        <div className="flex-1 overflow-y-auto overflow-x-auto px-8 pb-6">
          {loading ? (
            <div className="text-sm text-brand-navy-70 py-10 text-center">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-brand-navy-70 py-10 text-center">No deals match this filter.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-brand-navy-30/40">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide whitespace-nowrap">
                      SE Owner
                    </th>
                    {visibleColumns.map(col => (
                      <th key={col} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide whitespace-nowrap">
                        {COLUMN_BY_KEY[col]?.label ?? col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(opp => {
                    const isUnassigned = !opp.se_owner;
                    return (
                      <tr
                        key={opp.id}
                        onClick={() => setSelectedId(opp.id)}
                        className={`border-b border-brand-navy-30/20 last:border-0 cursor-pointer transition-colors ${
                          isUnassigned
                            ? 'bg-status-warning/5 hover:bg-status-warning/10 border-l-2 border-l-status-warning'
                            : 'hover:bg-brand-purple-30/10'
                        }`}
                      >
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <SeAssignSelect opp={opp} ses={ses} currentUser={currentUser!} onAssigned={handleAssigned} />
                        </td>
                        {visibleColumns.map(col => (
                          <td key={col} className="px-4 py-3 whitespace-nowrap">
                            {renderOpportunityCell(opp, col)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Kanban view ── */}
      {view === 'kanban' && (
        <div
          className="flex-1 overflow-x-auto overflow-y-auto px-8 pb-6"
          onDragEnd={() => setDraggingOppId(null)}
        >
          {loading ? (
            <div className="text-sm text-brand-navy-70 py-10 text-center">Loading…</div>
          ) : (
            <div className="flex gap-3 h-full items-start pt-1">
              {kanbanColumns.map(({ seId, label }) => {
                const colOpps = oppsForColumn(seId);
                return (
                  <KanbanColumn
                    key={seId ?? 'unassigned'}
                    label={label}
                    count={colOpps.length}
                    opps={colOpps}
                    canDrop={canDropOnColumn(seId)}
                    draggingOppId={draggingOppId}
                    onDrop={() => handleDrop(seId)}
                    onCardDragStart={id => setDraggingOppId(id)}
                    canDragCard={canDragCard}
                    onCardClick={id => setSelectedId(id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <Drawer open={selectedId !== null} onClose={() => setSelectedId(null)}>
        {selectedId !== null && (
          <OpportunityDetail key={selectedId} oppId={selectedId} onRefreshList={load} />
        )}
      </Drawer>
    </div>
  );
}
