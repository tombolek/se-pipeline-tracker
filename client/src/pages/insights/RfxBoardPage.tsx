import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { formatARR } from '../../utils/formatters';

interface RfxOpp {
  id: number;
  name: string;
  account_name: string | null;
  stage: string;
  arr: number | null;
  arr_currency: string;
  rfx_status: string;
  ae_owner_name: string | null;
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

function RfxCard({ opp }: { opp: RfxOpp }) {
  return (
    <div className="bg-white rounded-xl border border-brand-navy-30/40 p-3.5 shadow-sm hover:shadow-md transition-shadow">
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

function RfxColumn({ title, cards }: { title: string; cards: RfxOpp[] }) {
  const colorClass = COLUMN_COLORS[title] ?? 'bg-brand-navy-30/20 text-brand-navy-70 border-brand-navy-30';
  const dotClass = COLUMN_DOT[title] ?? 'bg-brand-navy-30';

  return (
    <div className="w-72 flex-shrink-0 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
        <h3 className="text-xs font-semibold text-brand-navy">{title}</h3>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${colorClass}`}>
          {cards.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4">
        {cards.length === 0 ? (
          <div className="text-xs text-brand-navy-30 text-center py-12 border-2 border-dashed border-brand-navy-30/30 rounded-xl">
            None
          </div>
        ) : (
          cards.map(c => <RfxCard key={c.id} opp={c} />)
        )}
      </div>
    </div>
  );
}

export default function RfxBoardPage() {
  const [opps, setOpps] = useState<RfxOpp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ApiResponse<RfxOpp[]>>('/insights/rfx')
      .then(r => setOpps(r.data.data))
      .catch(() => setError('Failed to load RFx data.'))
      .finally(() => setLoading(false));
  }, []);

  const knownSet = new Set<string>(COLUMNS);
  const grouped: Record<string, RfxOpp[]> = {};
  for (const col of COLUMNS) grouped[col] = [];
  const other: RfxOpp[] = [];

  for (const opp of opps) {
    if (knownSet.has(opp.rfx_status)) grouped[opp.rfx_status].push(opp);
    else other.push(opp);
  }

  const activeCount = opps.filter(o => !o.is_closed_lost).length;
  const closedCount = opps.filter(o => o.is_closed_lost).length;

  if (loading) return <div className="flex items-center justify-center h-full text-sm text-brand-navy-70">Loading…</div>;
  if (error)   return <div className="px-8 py-6 text-sm text-status-overdue">{error}</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-brand-navy">RFx Board</h1>
          <span className="text-sm text-brand-navy-70">{activeCount} active{closedCount > 0 ? `, ${closedCount} closed` : ''}</span>
        </div>
        <p className="text-sm text-brand-navy-70 mt-0.5">Opportunities with an active RFx process</p>
      </div>

      {opps.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-brand-navy-70">
          No opportunities with an RFx status set.
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-5 h-full px-8 pb-6" style={{ minWidth: 'max-content' }}>
            {COLUMNS.map(col => (
              <RfxColumn key={col} title={col} cards={grouped[col]} />
            ))}
            {other.length > 0 && (
              <RfxColumn title="Other" cards={other} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
