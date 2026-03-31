import { useState, useEffect, useRef } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import StageBadge from '../../components/shared/StageBadge';
import { formatARR, formatDate } from '../../utils/formatters';
import { Loading } from './shared';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';

interface DeployDeal {
  id: number;
  name: string;
  account_name: string;
  stage: string;
  arr: string;
  arr_currency: string;
  deploy_mode: string | null;
  close_date: string | null;
  fiscal_period: string | null;
  se_comments: string | null;
  agentic_qual: string | null;
  technical_blockers: string | null;
  ae_owner_name: string | null;
  se_owner_name: string | null;
}

function dealQuarter(deal: DeployDeal): string {
  if (deal.fiscal_period) return deal.fiscal_period;
  if (!deal.close_date) return 'No Date';
  const d = new Date(deal.close_date);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q}-${d.getFullYear()}`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
const MODE_COLORS: Record<string, { bg: string; border: string; dot: string; text: string }> = {
  'PaaS+':  { bg: 'bg-brand-purple/10',  border: 'border-brand-purple',    dot: 'bg-brand-purple',    text: 'text-brand-purple' },
  'SaaS':   { bg: 'bg-status-info/10',   border: 'border-status-info',     dot: 'bg-status-info',     text: 'text-[#00BBDD]' },
  'Other':  { bg: 'bg-brand-navy-30/20', border: 'border-brand-navy-30',   dot: 'bg-brand-navy-30',   text: 'text-brand-navy-70' },
};

function modeColors(mode: string | null) {
  const key = mode ?? 'Other';
  return MODE_COLORS[key] ?? MODE_COLORS['Other'];
}

function StatCard({
  mode, count, arr, selected, onClick,
}: {
  mode: string | null;
  count: number;
  arr: number;
  selected: boolean;
  onClick: () => void;
}) {
  const c = modeColors(mode);
  const label = mode ?? 'No Deploy Mode';
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[160px] p-4 rounded-2xl border-2 text-left transition-all ${
        selected ? `${c.bg} ${c.border} shadow-md` : 'bg-white border-brand-navy-30/40 hover:border-brand-navy-30'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />
        <span className="text-sm font-semibold text-brand-navy">{label}</span>
      </div>
      <div className="space-y-1">
        <div>
          <span className={`text-2xl font-bold ${selected ? c.text : 'text-brand-navy'}`}>{count}</span>
          <span className="text-xs text-brand-navy-70 ml-1.5">active deals</span>
        </div>
        <div className="text-xs text-brand-navy-70">{formatARR(arr.toString())} total ARR</div>
      </div>
    </button>
  );
}

// ── Deal row ──────────────────────────────────────────────────────────────────
function DealRow({ deal, selected, onClick }: {
  deal: DeployDeal;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={`group border-b border-brand-navy-30/20 last:border-0 cursor-pointer transition-colors ${
        selected ? 'bg-brand-purple-30/20 border-l-2 border-l-brand-purple' : 'hover:bg-brand-purple-30/10'
      }`}
    >
      {/* Name + account */}
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-brand-navy truncate max-w-[200px]">{deal.name}</p>
        <p className="text-xs text-brand-navy-70 truncate max-w-[200px]">{deal.account_name}</p>
      </td>

      {/* Stage */}
      <td className="px-3 py-3 whitespace-nowrap">
        <StageBadge stage={deal.stage} />
      </td>

      {/* ARR */}
      <td className="px-3 py-3 text-sm font-medium text-brand-navy whitespace-nowrap">
        {formatARR(deal.arr)}
      </td>

      {/* Close date */}
      <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
        {formatDate(deal.close_date)}
      </td>

      {/* SE Comments */}
      <td className="px-3 py-3 max-w-[200px]">
        {deal.se_comments
          ? <p className="text-xs text-brand-navy line-clamp-2">{deal.se_comments}</p>
          : <span className="text-xs text-brand-navy-30 italic">—</span>
        }
      </td>

      {/* Agentic Qual */}
      <td className="px-3 py-3 max-w-[160px]">
        {deal.agentic_qual
          ? <p className="text-xs text-brand-navy line-clamp-2">{deal.agentic_qual}</p>
          : <span className="text-xs text-brand-navy-30 italic">—</span>
        }
      </td>

      {/* Technical Blockers */}
      <td className="px-3 py-3 max-w-[160px]">
        {deal.technical_blockers
          ? <p className="text-xs text-status-overdue line-clamp-2">{deal.technical_blockers}</p>
          : <span className="text-xs text-brand-navy-30 italic">—</span>
        }
      </td>

      {/* AE / SE */}
      <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
        <div>{deal.ae_owner_name ?? '—'}</div>
        <div className="text-brand-navy-30">{deal.se_owner_name ?? 'Unassigned'}</div>
      </td>

      {/* Chevron */}
      <td className="px-3 py-3 text-brand-navy-30">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DeployModePage() {
  const [deals, setDeals] = useState<DeployDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<string | null | 'ALL'>('ALL');
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([]);
  const [quarterDropdownOpen, setQuarterDropdownOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const quarterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (quarterDropdownRef.current && !quarterDropdownRef.current.contains(e.target as Node)) {
        setQuarterDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function load() {
    setLoading(true);
    api.get<ApiResponse<DeployDeal[]>>('/insights/deploy-mode')
      .then(r => setDeals(r.data.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  // Derive sorted unique quarters from deals
  const quarters = Array.from(new Set(deals.map(dealQuarter)))
    .sort((a, b) => {
      if (a === 'No Date') return 1;
      if (b === 'No Date') return -1;
      return a.localeCompare(b);
    });

  // Apply quarter filter first, then mode filter
  const quarterFiltered = selectedQuarters.length === 0
    ? deals
    : deals.filter(d => selectedQuarters.includes(dealQuarter(d)));

  function toggleQuarter(q: string) {
    setSelectedQuarters(prev =>
      prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q]
    );
  }

  const quarterLabel = selectedQuarters.length === 0
    ? 'All quarters'
    : selectedQuarters.length === 1
      ? selectedQuarters[0]
      : `${selectedQuarters.length} quarters`;

  // Build stats grouped by deploy_mode (from quarter-filtered deals)
  const modeMap = new Map<string | null, { count: number; arr: number }>();
  for (const d of quarterFiltered) {
    const key = d.deploy_mode;
    const entry = modeMap.get(key) ?? { count: 0, arr: 0 };
    entry.count += 1;
    entry.arr += parseFloat(d.arr) || 0;
    modeMap.set(key, entry);
  }
  const modes = Array.from(modeMap.entries()).sort((a, b) => b[1].arr - a[1].arr);
  const totalCount = quarterFiltered.length;
  const totalArr = quarterFiltered.reduce((s, d) => s + (parseFloat(d.arr) || 0), 0);

  const filtered = selectedMode === 'ALL'
    ? quarterFiltered
    : quarterFiltered.filter(d => d.deploy_mode === selectedMode);

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-6 pb-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold text-brand-navy">DeployMode Overview</h1>
            <p className="text-sm text-brand-navy-70 mt-0.5">Active pipeline breakdown by deployment model</p>
          </div>
          {!loading && quarters.length > 0 && (
            <div className="ml-auto" ref={quarterDropdownRef}>
              <div className="relative">
                <button
                  onClick={() => setQuarterDropdownOpen(o => !o)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selectedQuarters.length > 0
                      ? 'bg-brand-purple text-white border-brand-purple'
                      : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy bg-white'
                  }`}
                >
                  <span>{quarterLabel}</span>
                  {selectedQuarters.length > 0 && (
                    <span
                      onClick={e => { e.stopPropagation(); setSelectedQuarters([]); }}
                      className="ml-1 opacity-70 hover:opacity-100 leading-none"
                    >
                      ×
                    </span>
                  )}
                  <svg className={`w-3.5 h-3.5 transition-transform ${quarterDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {quarterDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-brand-navy-30/40 rounded-xl shadow-lg py-1 min-w-[160px]">
                    {quarters.map(q => (
                      <label key={q} className="flex items-center gap-2.5 px-3 py-2 hover:bg-brand-purple-30/20 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedQuarters.includes(q)}
                          onChange={() => toggleQuarter(q)}
                          className="accent-brand-purple w-3.5 h-3.5"
                        />
                        <span className="text-xs text-brand-navy font-medium">{q}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 pb-6">
        {loading ? <Loading /> : (
          <>
            {/* Stat cards */}
            <div className="flex gap-4 flex-wrap mb-6">
              {/* All card */}
              <button
                onClick={() => setSelectedMode('ALL')}
                className={`flex-1 min-w-[160px] p-4 rounded-2xl border-2 text-left transition-all ${
                  selectedMode === 'ALL'
                    ? 'bg-brand-navy/5 border-brand-navy shadow-md'
                    : 'bg-white border-brand-navy-30/40 hover:border-brand-navy-30'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-navy flex-shrink-0" />
                  <span className="text-sm font-semibold text-brand-navy">All</span>
                </div>
                <div className="space-y-1">
                  <div>
                    <span className={`text-2xl font-bold ${selectedMode === 'ALL' ? 'text-brand-navy' : 'text-brand-navy'}`}>{totalCount}</span>
                    <span className="text-xs text-brand-navy-70 ml-1.5">active deals</span>
                  </div>
                  <div className="text-xs text-brand-navy-70">{formatARR(totalArr.toString())} total ARR</div>
                </div>
              </button>

              {modes.map(([mode, stats]) => (
                <StatCard
                  key={mode ?? '__none'}
                  mode={mode}
                  count={stats.count}
                  arr={stats.arr}
                  selected={selectedMode === mode}
                  onClick={() => setSelectedMode(mode === selectedMode ? 'ALL' : mode)}
                />
              ))}
            </div>

            {/* Deal table */}
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-brand-navy-70">No deals found.</div>
            ) : (
              <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-navy-30/40 flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-navy">
                    {selectedMode === 'ALL' ? 'All Deals' : selectedMode ?? 'No Deploy Mode'}
                  </span>
                  <span className="text-[10px] bg-brand-navy-30/60 text-brand-navy-70 rounded-full px-1.5 py-px font-medium">{filtered.length}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-brand-navy-30/40 bg-gray-50/50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Opportunity</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Stage</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">ARR</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Close</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">SE Comments</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Agentic Qual</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Technical Blockers</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">AE / SE</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(deal => (
                        <DealRow
                          key={deal.id}
                          deal={deal}
                          selected={selectedId === deal.id}
                          onClick={() => setSelectedId(deal.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
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
