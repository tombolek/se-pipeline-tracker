import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { useTeamScope } from '../../hooks/useTeamScope';
import OutOfTerritoryBanner from '../../components/shared/OutOfTerritoryBanner';
import TeamScopeSelector from '../../components/shared/TeamScopeSelector';
import { formatARR } from '../../utils/formatters';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import StageBadge from '../../components/shared/StageBadge';
import SortableHeader from '../../components/shared/SortableHeader';
import MultiSelectFilter from '../../components/shared/MultiSelectFilter';
import { sortRows, type SortDir, type ColType } from '../../utils/sortRows';

interface RfxOpp {
  id: number;
  name: string;
  account_name: string | null;
  stage: string;
  arr: number | null;
  arr_currency: string;
  rfx_status: string;
  team: string | null;
  record_type: string | null;
  ae_owner_name: string | null;
  se_owner_id: number | null;
  se_owner_name: string | null;
  is_closed_lost: boolean;
}

const COLUMNS = ['In Review', 'In Progress', 'Completed'] as const;

const COLUMN_COLORS: Record<string, string> = {
  'In Review':   'bg-status-warning/10 text-status-warning border-status-warning/20',
  'In Progress': 'bg-brand-purple/10 text-brand-purple border-brand-purple/20',
  'Completed':   'bg-status-success/10 text-status-success border-status-success/20',
};

const COLUMN_DOT: Record<string, string> = {
  'In Review':   'bg-status-warning',
  'In Progress': 'bg-brand-purple',
  'Completed':   'bg-status-success',
};

// Columns wide enough for 2 cards
const WIDE_COLUMNS = new Set(['In Progress', 'Completed']);

// ── Kanban card ───────────────────────────────────────────────────────────────
function RfxCard({ opp, onClick }: { opp: RfxOpp; onClick: () => void }) {
  return (
    <div onClick={onClick} className="bg-white rounded-xl border border-brand-navy-30/40 p-3.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <p className="text-sm font-semibold text-brand-navy leading-tight">{opp.name}</p>
        {opp.is_closed_lost && (
          <span className="text-[9px] font-semibold bg-brand-pink/10 text-brand-pink px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
            Closed
          </span>
        )}
      </div>
      <p className="text-xs text-brand-navy-70 mb-3">{opp.account_name ?? '—'}</p>

      <div className="space-y-1 mb-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] font-medium text-brand-navy-30 w-5 flex-shrink-0">AE</span>
          <span className="text-brand-navy truncate">{opp.ae_owner_name ?? '—'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] font-medium text-brand-navy-30 w-5 flex-shrink-0">SE</span>
          {opp.se_owner_name
            ? <span className="text-brand-navy truncate">{opp.se_owner_name}</span>
            : <span className="text-brand-navy-30 italic">Unassigned</span>
          }
        </div>
      </div>

      <div className="border-t border-brand-navy-30/30 pt-2 flex items-center justify-between">
        <span className="text-[11px] text-brand-navy-70 font-medium">{formatARR(opp.arr)}</span>
        <span className="text-[10px] text-brand-navy-30">{opp.stage}</span>
      </div>
    </div>
  );
}

// ── Kanban column (1-wide or 2-wide) ─────────────────────────────────────────
function RfxColumn({ title, cards, wide, onCardClick }: {
  title: string; cards: RfxOpp[]; wide: boolean; onCardClick: (id: number) => void;
}) {
  const colorClass = COLUMN_COLORS[title] ?? 'bg-brand-navy-30/20 text-brand-navy-70 border-brand-navy-30';
  const dotClass   = COLUMN_DOT[title]   ?? 'bg-brand-navy-30';

  return (
    <div className={`flex-shrink-0 flex flex-col h-full ${wide ? 'w-[600px]' : 'w-72'}`}>
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
        <h3 className="text-xs font-semibold text-brand-navy">{title}</h3>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${colorClass}`}>
          {cards.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {cards.length === 0 ? (
          <div className="text-xs text-brand-navy-30 text-center py-12 border-2 border-dashed border-brand-navy-30/30 rounded-xl">
            None
          </div>
        ) : wide ? (
          <div className="grid grid-cols-2 gap-3">
            {cards.map(c => <RfxCard key={c.id} opp={c} onClick={() => onCardClick(c.id)} />)}
          </div>
        ) : (
          <div className="space-y-3 pr-1">
            {cards.map(c => <RfxCard key={c.id} opp={c} onClick={() => onCardClick(c.id)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── List view cols ────────────────────────────────────────────────────────────
const LIST_COLS: { key: keyof RfxOpp; label: string; type: ColType }[] = [
  { key: 'rfx_status',    label: 'RFx Status', type: 'string' },
  { key: 'name',          label: 'Opportunity', type: 'string' },
  { key: 'account_name',  label: 'Account',     type: 'string' },
  { key: 'stage',         label: 'Stage',       type: 'string' },
  { key: 'ae_owner_name', label: 'AE Owner',    type: 'string' },
  { key: 'se_owner_name', label: 'SE Owner',    type: 'string' },
  { key: 'arr',           label: 'ARR',         type: 'number' },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RfxBoardPage() {
  const [opps, setOpps]       = useState<RfxOpp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const { filterOppUnion, isOutOfTerritory, teamNames } = useTeamScope();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView]       = useState<'kanban' | 'list'>('kanban');

  // List filters
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterSe, setFilterSe]         = useState<string[]>([]);
  const [filterAe, setFilterAe]         = useState<string[]>([]);
  const [filterTeams, setFilterTeams]       = useState<string[]>(['EMEA', 'NA Enterprise', 'NA Strategic', 'ANZ']);
  const [filterRecordTypes, setFilterRecordTypes] = useState<string[]>([]);

  // List sort
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); setSortDir('asc'); }
  }

  useEffect(() => {
    api.get<ApiResponse<RfxOpp[]>>('/insights/rfx')
      .then(r => setOpps(r.data.data))
      .catch(() => setError('Failed to load RFx data.'))
      .finally(() => setLoading(false));
  }, []);

  // Apply team scope (territory OR SE-owned), then page filters
  const scopedOpps = opps.filter(filterOppUnion);
  const outOfTerritoryItems = teamNames.size > 0
    ? scopedOpps.filter(o => isOutOfTerritory({ team: o.team }) && o.team)
        .map(o => ({ id: o.id, name: o.name, team: o.team! }))
    : [];
  const outOfTerritoryTeams = [...new Set(outOfTerritoryItems.map(o => o.team))].sort();

  // Kanban grouping (team + record type filters apply here too)
  const kanbanOpps = scopedOpps.filter(o => {
    if (filterTeams.length > 0 && !filterTeams.includes(o.team ?? '')) return false;
    if (filterRecordTypes.length > 0 && !filterRecordTypes.includes(o.record_type ?? '')) return false;
    return true;
  });
  const knownSet = new Set<string>(COLUMNS);
  const grouped: Record<string, RfxOpp[]> = {};
  for (const col of COLUMNS) grouped[col] = [];
  const other: RfxOpp[] = [];
  for (const opp of kanbanOpps) {
    if (knownSet.has(opp.rfx_status)) grouped[opp.rfx_status].push(opp);
    else other.push(opp);
  }

  // List filter options (unique values)
  const statusOptions = [...new Set(scopedOpps.map(o => o.rfx_status).filter(Boolean))].sort();
  const seOptions     = [...new Set(scopedOpps.map(o => o.se_owner_name).filter(Boolean) as string[])].sort();
  const aeOptions     = [...new Set(scopedOpps.map(o => o.ae_owner_name).filter(Boolean) as string[])].sort();
  const teamOptions       = [...new Set(scopedOpps.map(o => o.team).filter(Boolean) as string[])].sort();
  const recordTypeOptions = [...new Set(scopedOpps.map(o => o.record_type).filter(Boolean) as string[])].sort();

  // Apply list filters + sort
  const filtered = scopedOpps.filter(o => {
    if (filterStatus.length > 0 && !filterStatus.includes(o.rfx_status)) return false;
    if (filterSe.length > 0 && !filterSe.includes(o.se_owner_name ?? '')) return false;
    if (filterAe.length > 0 && !filterAe.includes(o.ae_owner_name ?? '')) return false;
    if (filterTeams.length > 0 && !filterTeams.includes(o.team ?? '')) return false;
    if (filterRecordTypes.length > 0 && !filterRecordTypes.includes(o.record_type ?? '')) return false;
    return true;
  });
  const colTypeMap = Object.fromEntries(LIST_COLS.map(c => [c.key, c.type])) as Record<string, ColType>;
  const displayed = sortKey
    ? sortRows(filtered, sortKey, sortDir, k => colTypeMap[k] ?? 'string')
    : filtered;

  const activeCount = scopedOpps.filter(o => !o.is_closed_lost).length;
  const closedCount = scopedOpps.filter(o => o.is_closed_lost).length;

  if (loading) return <div className="flex items-center justify-center h-full text-sm text-brand-navy-70">Loading…</div>;
  if (error)   return <div className="px-8 py-6 text-sm text-status-overdue">{error}</div>;

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-8 pt-6 pb-4 flex-shrink-0 space-y-3">
        {/* Row 1: title + scope + view toggle */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold text-brand-navy">RFx Board</h1>
            <p className="text-sm text-brand-navy-70 mt-0.5">
              {activeCount} active{closedCount > 0 ? `, ${closedCount} closed` : ''}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Scope selector */}
            <TeamScopeSelector />

            {/* View toggle */}
            <div className="flex items-center gap-1 bg-brand-navy-30/20 rounded-lg p-0.5">
              <button
                onClick={() => setView('list')}
                title="List view"
                className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-white shadow-sm text-brand-purple' : 'text-brand-navy-70 hover:text-brand-navy'}`}
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
        </div>

        {/* Row 2: filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter options={teamOptions}       selected={filterTeams}       onChange={setFilterTeams}       placeholder="All teams" />
          <MultiSelectFilter options={recordTypeOptions} selected={filterRecordTypes} onChange={setFilterRecordTypes} placeholder="All types" />
          {view === 'list' && (
            <>
              <MultiSelectFilter options={statusOptions} selected={filterStatus} onChange={setFilterStatus} placeholder="All statuses" />
              <MultiSelectFilter options={seOptions}     selected={filterSe}     onChange={setFilterSe}     placeholder="All SEs" />
              <MultiSelectFilter options={aeOptions}     selected={filterAe}     onChange={setFilterAe}     placeholder="All AEs" />
              <span className="text-xs text-brand-navy-70 ml-auto">{displayed.length} opportunit{displayed.length !== 1 ? 'ies' : 'y'}</span>
            </>
          )}
        </div>

        {/* Row 3: out-of-territory banner (only when applicable) */}
        {outOfTerritoryTeams.length > 0 && <OutOfTerritoryBanner teams={outOfTerritoryTeams} items={outOfTerritoryItems} />}
      </div>

      {opps.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-brand-navy-70">
          No opportunities with an RFx status set.
        </div>
      ) : (
        <>
          {/* ── List view ── */}
          {view === 'list' && (
            <div className="flex-1 overflow-y-auto overflow-x-auto px-8 pb-6">
              {displayed.length === 0 ? (
                <div className="text-sm text-brand-navy-70 py-10 text-center">No opportunities match this filter.</div>
              ) : (
                <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
                  <table className="w-full">
                    <thead className="border-b border-brand-navy-30/40">
                      <tr>
                        {LIST_COLS.map(c => (
                          <SortableHeader
                            key={c.key}
                            colKey={c.key}
                            label={c.label}
                            currentKey={sortKey}
                            currentDir={sortDir}
                            onSort={handleSort}
                            className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide whitespace-nowrap"
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map(opp => {
                        const dotClass = COLUMN_DOT[opp.rfx_status] ?? 'bg-brand-navy-30';
                        return (
                          <tr
                            key={opp.id}
                            onClick={() => setSelectedId(opp.id)}
                            className="border-b border-brand-navy-30/20 last:border-0 cursor-pointer hover:bg-brand-purple-30/10 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1.5 text-xs font-medium text-brand-navy">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
                                {opp.rfx_status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-brand-navy">{opp.name}</p>
                              {opp.is_closed_lost && (
                                <span className="text-[9px] font-semibold text-brand-pink">Closed</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-brand-navy-70">{opp.account_name ?? '—'}</td>
                            <td className="px-4 py-3"><StageBadge stage={opp.stage} /></td>
                            <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">{opp.ae_owner_name ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                              {opp.se_owner_name ?? <span className="italic text-brand-navy-30">Unassigned</span>}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-brand-navy whitespace-nowrap">{formatARR(opp.arr)}</td>
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
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-5 h-full px-8 pb-6" style={{ minWidth: 'max-content' }}>
                {COLUMNS.map(col => (
                  <RfxColumn
                    key={col}
                    title={col}
                    cards={grouped[col]}
                    wide={WIDE_COLUMNS.has(col)}
                    onCardClick={setSelectedId}
                  />
                ))}
                {other.length > 0 && (
                  <RfxColumn title="Other" cards={other} wide={false} onCardClick={setSelectedId} />
                )}
              </div>
            </div>
          )}
        </>
      )}

      <Drawer open={selectedId !== null} onClose={() => setSelectedId(null)}>
        {selectedId !== null && <OpportunityDetail key={selectedId} oppId={selectedId} />}
      </Drawer>
    </div>
  );
}
