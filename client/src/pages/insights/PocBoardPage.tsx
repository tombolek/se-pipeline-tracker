import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { useTeamScope } from '../../hooks/useTeamScope';
import OutOfTerritoryBanner from '../../components/shared/OutOfTerritoryBanner';
import TeamScopeSelector from '../../components/shared/TeamScopeSelector';
import { formatDate, formatARR } from '../../utils/formatters';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useOppUrlSync } from '../../hooks/useOppUrlSync';

interface PocOpp {
  id: number;
  name: string;
  account_name: string | null;
  stage: string;
  arr: number | null;
  arr_currency: string;
  poc_status: string;
  poc_start_date: string | null;
  poc_end_date: string | null;
  poc_type: string | null;
  poc_deploy_type: string | null;
  ae_owner_name: string | null;
  team: string | null;
  se_owner_id: number | null;
  se_owner_name: string | null;
  is_closed_lost: boolean;
  days_remaining: number | null;
}

const COLUMNS = ['Identified', 'In Deployment', 'In Progress', 'Wrapping Up'] as const;

const COLUMN_BORDER_TOP: Record<string, string> = {
  'Identified':    'border-t-brand-purple',
  'In Deployment': 'border-t-status-info',
  'In Progress':   'border-t-status-warning',
  'Wrapping Up':   'border-t-status-success',
};

const COLUMN_COUNT_BG: Record<string, string> = {
  'Identified':    'bg-brand-purple-30/50 text-brand-purple',
  'In Deployment': 'bg-sky-50 text-sky-700',
  'In Progress':   'bg-amber-50 text-amber-700',
  'Wrapping Up':   'bg-emerald-50 text-emerald-700',
};

const COLUMN_DOT: Record<string, string> = {
  'Identified':    'bg-brand-purple',
  'In Deployment': 'bg-status-info',
  'In Progress':   'bg-status-warning',
  'Wrapping Up':   'bg-status-success',
};

function initials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function isOverdueOpp(opp: PocOpp) {
  if (!opp.poc_end_date || opp.is_closed_lost) return false;
  return new Date(opp.poc_end_date) < new Date();
}

function DaysRemaining({ days, overdue }: { days: number | null; overdue: boolean }) {
  if (overdue) return <span className="text-[10px] font-bold bg-status-overdue/10 text-status-overdue px-1.5 py-0.5 rounded">OVERDUE</span>;
  if (days === null) return <span className="text-brand-navy-30">—</span>;
  if (days === 0) return <span className="text-[10px] font-semibold text-status-overdue">Due today</span>;
  if (days <= 7) return <span className="text-[10px] font-semibold text-status-warning">{days}d left</span>;
  return <span className="text-[10px] text-brand-navy-70">{days}d left</span>;
}

// ── Full card ─────────────────────────────────────────────────────────────────
function PocCardFull({ opp, onClick }: { opp: PocOpp; onClick: () => void }) {
  const overdue = isOverdueOpp(opp);
  return (
    <div onClick={onClick} className="bg-white rounded-xl border border-brand-navy-30/40 p-3.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <p className="text-sm font-semibold text-brand-navy leading-tight">{opp.name}</p>
        {opp.is_closed_lost && (
          <span className="text-[9px] font-semibold bg-brand-pink/10 text-brand-pink px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">Closed</span>
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
            : <span className="text-brand-navy-30 italic">Unassigned</span>}
        </div>
      </div>

      <div className="border-t border-brand-navy-30/30 pt-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-brand-navy-30 font-medium w-9 flex-shrink-0">Start</span>
          <span className="text-brand-navy-70">{formatDate(opp.poc_start_date) ?? '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-brand-navy-30 font-medium w-9 flex-shrink-0">End</span>
          <span className={overdue ? 'text-status-overdue font-semibold' : 'text-brand-navy-70'}>{formatDate(opp.poc_end_date) ?? '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-brand-navy-30 font-medium w-9 flex-shrink-0">Left</span>
          <DaysRemaining days={opp.days_remaining} overdue={overdue} />
        </div>
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[11px] text-brand-navy-70 font-medium">{formatARR(opp.arr)}</span>
          <div className="flex flex-col items-end gap-0.5 min-w-0">
            {opp.poc_type && <span className="text-[10px] text-brand-navy-30 truncate max-w-[120px]">{opp.poc_type}</span>}
            {opp.poc_deploy_type && <span className="text-[10px] text-brand-navy-30 truncate max-w-[120px]">{opp.poc_deploy_type}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compact card ──────────────────────────────────────────────────────────────
function PocCardCompact({ opp, expanded, onToggleExpand, onClick }: {
  opp: PocOpp; expanded: boolean; onToggleExpand: () => void; onClick: () => void;
}) {
  const overdue = isOverdueOpp(opp);

  return (
    <div className="bg-white rounded-xl border border-brand-navy-30/40 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* 2-row collapsed layout — click opens drawer */}
      <div className="px-3 pt-2 pb-1.5 cursor-pointer" onClick={onClick}>
        {/* Row 1: name + expand toggle */}
        <div className="flex items-start gap-1.5">
          <p className="text-xs font-semibold text-brand-navy flex-1 leading-snug">{opp.name}</p>
          <button
            onClick={e => { e.stopPropagation(); onToggleExpand(); }}
            className="flex-shrink-0 mt-0.5 p-0.5 text-brand-navy-30 hover:text-brand-navy transition-colors"
            title={expanded ? 'Collapse' : 'Expand details'}
          >
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
          </button>
        </div>
        {/* Row 2: days remaining + SE initials */}
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex items-center gap-1.5 text-[10px] flex-1 text-brand-navy-70">
            <span>{formatDate(opp.poc_end_date) ?? '—'}</span>
            <DaysRemaining days={opp.days_remaining} overdue={overdue} />
          </div>
          {opp.se_owner_name && (
            <div className="w-5 h-5 rounded-full bg-brand-purple flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white" title={opp.se_owner_name}>
              {initials(opp.se_owner_name)}
            </div>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2.5 border-t border-brand-navy-30/20 pt-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-brand-navy-30 w-9 flex-shrink-0">Account</span>
            <span className="text-brand-navy-70 truncate">{opp.account_name ?? '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-brand-navy-30 w-9 flex-shrink-0">AE</span>
            <span className="text-brand-navy-70 truncate">{opp.ae_owner_name ?? '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-brand-navy-30 w-9 flex-shrink-0">Start</span>
            <span className="text-brand-navy-70">{formatDate(opp.poc_start_date) ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] text-brand-navy-70 font-medium">{formatARR(opp.arr)}</span>
            <div className="flex flex-col items-end gap-0.5 min-w-0">
              {opp.poc_type && <span className="text-[10px] text-brand-navy-30 truncate max-w-[120px]">{opp.poc_type}</span>}
              {opp.poc_deploy_type && <span className="text-[10px] text-brand-navy-30 truncate max-w-[120px]">{opp.poc_deploy_type}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────
function KanbanColumn({ title, cards, compact, wide, expandedCards, onToggleExpand, onCardClick }: {
  title: string; cards: PocOpp[]; compact: boolean; wide: boolean;
  expandedCards: Set<number>; onToggleExpand: (id: number) => void;
  onCardClick: (id: number) => void;
}) {
  const dotClass   = COLUMN_DOT[title]        ?? 'bg-brand-navy-30';
  const borderTop  = COLUMN_BORDER_TOP[title]  ?? 'border-t-brand-navy-30';
  const countBg    = COLUMN_COUNT_BG[title]    ?? 'bg-brand-navy-30/20 text-brand-navy-70';

  return (
    <div className={`flex-shrink-0 flex flex-col h-full bg-white/60 rounded-2xl border border-brand-navy-30/30 border-t-[3px] ${borderTop} ${wide ? 'w-96' : 'w-72'}`}>
      <div className="px-4 py-3 flex items-center gap-2 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
        <h3 className="text-xs font-semibold text-brand-navy">{title}</h3>
        <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${countBg}`}>{cards.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 px-3 pb-3">
        {cards.length === 0 ? (
          <div className="text-xs text-brand-navy-30 text-center py-12 border-2 border-dashed border-brand-navy-30/30 rounded-xl">None</div>
        ) : compact ? (
          cards.map(c => (
            <PocCardCompact
              key={c.id} opp={c}
              expanded={expandedCards.has(c.id)}
              onToggleExpand={() => onToggleExpand(c.id)}
              onClick={() => onCardClick(c.id)}
            />
          ))
        ) : (
          cards.map(c => <PocCardFull key={c.id} opp={c} onClick={() => onCardClick(c.id)} />)
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PocBoardPage() {
  const [opps, setOpps]       = useState<PocOpp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const { filterOppUnion, isOutOfTerritory, teamNames } = useTeamScope();
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  useOppUrlSync(selectedId, setSelectedId);
  const [hideEmpty, setHideEmpty]     = useState(true);   // default ON
  const [compact, setCompact]         = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [filterSe, setFilterSe]             = useState('');
  const [filterPocType, setFilterPocType]   = useState('');
  const [filterDeployType, setFilterDeployType] = useState('');

  useEffect(() => {
    api.get<ApiResponse<PocOpp[]>>('/insights/poc')
      .then(r => setOpps(r.data.data))
      .catch(() => setError('Failed to load PoC data.'))
      .finally(() => setLoading(false));
  }, []);

  function toggleCardExpand(id: number) {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Apply team scope (territory OR SE-owned)
  const scopedOpps = opps.filter(filterOppUnion);
  const outOfTerritoryItems = teamNames.size > 0
    ? scopedOpps.filter(o => isOutOfTerritory({ team: o.team }) && o.team)
        .map(o => ({ id: o.id, name: o.name, team: o.team! }))
    : [];
  const outOfTerritoryTeams = [...new Set(outOfTerritoryItems.map(o => o.team))].sort();

  // Derive filter options from scoped data
  const seOptions = [...new Set(scopedOpps.map(o => o.se_owner_name).filter(Boolean))].sort() as string[];
  const pocTypeOptions = [...new Set(scopedOpps.map(o => o.poc_type).filter(Boolean))].sort() as string[];
  const deployTypeOptions = [...new Set(scopedOpps.map(o => o.poc_deploy_type).filter(Boolean))].sort() as string[];

  // Apply filters — SE filter only applies if the value is still valid in the current scope
  const filteredOpps = scopedOpps.filter(o =>
    (!filterSe || !seOptions.includes(filterSe) || o.se_owner_name === filterSe) &&
    (!filterPocType || o.poc_type === filterPocType) &&
    (!filterDeployType || o.poc_deploy_type === filterDeployType)
  );

  const filtersActive = !!(filterSe || filterPocType || filterDeployType);

  // Group into known columns only; unrecognised statuses are silently dropped
  const knownSet = new Set<string>(COLUMNS);
  const grouped: Record<string, PocOpp[]> = {};
  for (const col of COLUMNS) grouped[col] = [];
  for (const opp of filteredOpps) {
    if (knownSet.has(opp.poc_status)) grouped[opp.poc_status].push(opp);
  }

  const visibleCols = hideEmpty ? COLUMNS.filter(col => grouped[col].length > 0) : [...COLUMNS];

  const activeCount = filteredOpps.filter(o => !o.is_closed_lost).length;
  const closedCount = filteredOpps.filter(o => o.is_closed_lost).length;

  if (loading) return <div className="flex items-center justify-center h-full text-sm text-brand-navy-70">Loading…</div>;
  if (error)   return <div className="px-8 py-6 text-sm text-status-overdue">{error}</div>;

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-8 pt-6 pb-4 flex-shrink-0 space-y-4">
        {/* Row 1: title + view controls */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold text-brand-navy">PoC Board</h1>
            <p className="text-sm text-brand-navy-70 mt-0.5">
              {activeCount} active{closedCount > 0 ? `, ${closedCount} closed` : ''}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Scope selector */}
            <TeamScopeSelector />

            {/* Hide empty toggle */}
            <button
              onClick={() => setHideEmpty(v => !v)}
              title={hideEmpty ? 'Show empty columns' : 'Hide empty columns'}
              className={`p-1.5 rounded-lg border transition-colors ${
                hideEmpty
                  ? 'bg-brand-purple/10 border-brand-purple text-brand-purple'
                  : 'border-brand-navy-30 text-brand-navy-70 hover:text-brand-navy'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {hideEmpty
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                }
              </svg>
            </button>

            {/* Compact mode toggle */}
            <button
              onClick={() => setCompact(v => !v)}
              title={compact ? 'Full cards' : 'Compact cards'}
              className={`p-1.5 rounded-lg border transition-colors ${
                compact
                  ? 'bg-brand-purple/10 border-brand-purple text-brand-purple'
                  : 'border-brand-navy-30 text-brand-navy-70 hover:text-brand-navy'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {compact
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12H12m-8.25 5.25h16.5" />
                }
              </svg>
            </button>
          </div>
        </div>

        {/* Row 2: filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterSe}
            onChange={e => setFilterSe(e.target.value)}
            className="text-xs border border-brand-navy-30 rounded-lg px-2.5 py-1.5 text-brand-navy bg-white focus:outline-none focus:border-brand-purple"
          >
            <option value="">All SEs</option>
            {seOptions.map(se => <option key={se} value={se}>{se}</option>)}
          </select>

          <select
            value={filterPocType}
            onChange={e => setFilterPocType(e.target.value)}
            className="text-xs border border-brand-navy-30 rounded-lg px-2.5 py-1.5 text-brand-navy bg-white focus:outline-none focus:border-brand-purple"
          >
            <option value="">All PoC Types</option>
            {pocTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={filterDeployType}
            onChange={e => setFilterDeployType(e.target.value)}
            className="text-xs border border-brand-navy-30 rounded-lg px-2.5 py-1.5 text-brand-navy bg-white focus:outline-none focus:border-brand-purple"
          >
            <option value="">All Deploy Types</option>
            {deployTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {filtersActive && (
            <button
              onClick={() => { setFilterSe(''); setFilterPocType(''); setFilterDeployType(''); }}
              className="text-xs text-brand-pink hover:text-brand-pink-70 font-medium transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Row 4: out-of-territory banner (only when applicable) */}
        {outOfTerritoryTeams.length > 0 && <OutOfTerritoryBanner teams={outOfTerritoryTeams} items={outOfTerritoryItems} />}
      </div>

      {/* Board */}
      {opps.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-brand-navy-70">
          No opportunities with a PoC status set.
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-5 h-full px-8 pb-6" style={{ minWidth: 'max-content' }}>
            {visibleCols.map(col => (
              <KanbanColumn
                key={col}
                title={col}
                cards={grouped[col] ?? []}
                compact={compact}
                wide={visibleCols.length <= 3}
                expandedCards={expandedCards}
                onToggleExpand={toggleCardExpand}
                onCardClick={setSelectedId}
              />
            ))}
          </div>
        </div>
      )}

      <Drawer open={selectedId !== null} onClose={() => setSelectedId(null)}>
        {selectedId !== null && <OpportunityDetail key={selectedId} oppId={selectedId} />}
      </Drawer>
    </div>
  );
}
