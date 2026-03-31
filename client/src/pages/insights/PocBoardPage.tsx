import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { formatDate, formatARR } from '../../utils/formatters';

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
  ae_owner_name: string | null;
  se_owner_name: string | null;
  is_closed_lost: boolean;
}

const COLUMNS = ['Identified', 'In Deployment', 'In Progress', 'Wrapping Up'] as const;

const COLUMN_COLORS: Record<string, string> = {
  'Identified':   'bg-brand-purple/10 text-brand-purple border-brand-purple/20',
  'In Deployment':'bg-status-info/10 text-status-info border-status-info/20',
  'In Progress':  'bg-status-warning/10 text-status-warning border-status-warning/20',
  'Wrapping Up':  'bg-status-success/10 text-status-success border-status-success/20',
};

const COLUMN_DOT: Record<string, string> = {
  'Identified':    'bg-brand-purple',
  'In Deployment': 'bg-status-info',
  'In Progress':   'bg-status-warning',
  'Wrapping Up':   'bg-status-success',
};

function PocCard({ opp }: { opp: PocOpp }) {
  const today = new Date();
  const endDate = opp.poc_end_date ? new Date(opp.poc_end_date) : null;
  const isOverdue = endDate && endDate < today && !opp.is_closed_lost;

  return (
    <div className="bg-white rounded-xl border border-brand-navy-30/40 p-3.5 shadow-sm hover:shadow-md transition-shadow">
      {/* Name + badges */}
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <p className="text-sm font-semibold text-brand-navy leading-tight">{opp.name}</p>
        {opp.is_closed_lost && (
          <span className="text-[9px] font-semibold bg-brand-pink/10 text-brand-pink px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
            Closed
          </span>
        )}
      </div>
      <p className="text-xs text-brand-navy-70 mb-3">{opp.account_name ?? '—'}</p>

      {/* AE + SE */}
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

      {/* Footer: dates + ARR */}
      <div className="border-t border-brand-navy-30/30 pt-2 space-y-1">
        {(opp.poc_start_date || opp.poc_end_date) && (
          <div className={`flex items-center gap-1 text-[11px] ${isOverdue ? 'text-status-overdue font-medium' : 'text-brand-navy-70'}`}>
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{formatDate(opp.poc_start_date)}</span>
            {opp.poc_end_date && (
              <>
                <span className="text-brand-navy-30 mx-0.5">→</span>
                <span>{formatDate(opp.poc_end_date)}</span>
              </>
            )}
            {isOverdue && <span className="ml-1 text-[9px] font-bold">OVERDUE</span>}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-brand-navy-70 font-medium">{formatARR(opp.arr)}</span>
          {opp.poc_type && (
            <span className="text-[10px] text-brand-navy-30 truncate max-w-[120px]">{opp.poc_type}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ title, cards }: { title: string; cards: PocOpp[] }) {
  const colorClass = COLUMN_COLORS[title] ?? 'bg-brand-navy-30/20 text-brand-navy-70 border-brand-navy-30';
  const dotClass = COLUMN_DOT[title] ?? 'bg-brand-navy-30';

  return (
    <div className="w-72 flex-shrink-0 flex flex-col h-full">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
        <h3 className="text-xs font-semibold text-brand-navy">{title}</h3>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${colorClass}`}>
          {cards.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4">
        {cards.length === 0 ? (
          <div className="text-xs text-brand-navy-30 text-center py-12 border-2 border-dashed border-brand-navy-30/30 rounded-xl">
            None
          </div>
        ) : (
          cards.map(c => <PocCard key={c.id} opp={c} />)
        )}
      </div>
    </div>
  );
}

export default function PocBoardPage() {
  const [opps, setOpps] = useState<PocOpp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ApiResponse<PocOpp[]>>('/insights/poc')
      .then(r => setOpps(r.data.data))
      .catch(() => setError('Failed to load PoC data.'))
      .finally(() => setLoading(false));
  }, []);

  // Group into known columns; anything else goes in "Other"
  const grouped: Record<string, PocOpp[]> = {};
  const knownSet = new Set<string>(COLUMNS);
  for (const col of COLUMNS) grouped[col] = [];
  const other: PocOpp[] = [];

  for (const opp of opps) {
    if (knownSet.has(opp.poc_status)) {
      grouped[opp.poc_status].push(opp);
    } else {
      other.push(opp);
    }
  }

  const activeCount = opps.filter(o => !o.is_closed_lost).length;
  const closedCount = opps.filter(o => o.is_closed_lost).length;

  if (loading) return <div className="flex items-center justify-center h-full text-sm text-brand-navy-70">Loading…</div>;
  if (error)   return <div className="px-8 py-6 text-sm text-status-overdue">{error}</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-brand-navy">PoC Board</h1>
          <span className="text-sm text-brand-navy-70">{activeCount} active{closedCount > 0 ? `, ${closedCount} closed` : ''}</span>
        </div>
        <p className="text-sm text-brand-navy-70 mt-0.5">Opportunities with an active PoC status</p>
      </div>

      {/* Board */}
      {opps.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-brand-navy-70">
          No opportunities with a PoC status set.
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-5 h-full px-8 pb-6" style={{ minWidth: 'max-content' }}>
            {COLUMNS.map(col => (
              <KanbanColumn key={col} title={col} cards={grouped[col]} />
            ))}
            {other.length > 0 && (
              <KanbanColumn title="Other" cards={other} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
