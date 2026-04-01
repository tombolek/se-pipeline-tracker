import { useState, useEffect, useCallback } from 'react';
import type { Opportunity } from '../types';
import { listOpportunities } from '../api/opportunities';
import { useAuthStore } from '../store/auth';
import OpportunityDetail from '../components/OpportunityDetail';
import Drawer from '../components/Drawer';
import StageBadge from '../components/shared/StageBadge';
import RowCapture from '../components/RowCapture';
import { formatARR, formatDate } from '../utils/formatters';

// ── Freshness dot ─────────────────────────────────────────────────────────────
function FreshnessDot({ updatedAt }: { updatedAt: string | null }) {
  if (!updatedAt) return <span className="w-2 h-2 rounded-full bg-brand-navy-30 inline-block" title="Never" />;
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (days <= 7) return <span className="w-2 h-2 rounded-full bg-status-success inline-block" title={`${days}d ago`} />;
  if (days <= 21) return <span className="w-2 h-2 rounded-full bg-status-warning inline-block" title={`${days}d ago`} />;
  return <span className="w-2 h-2 rounded-full bg-status-overdue inline-block" title={`${days}d ago`} />;
}

// ── Opportunity row ───────────────────────────────────────────────────────────
function OppRow({ opp, selected, onClick, onRefreshList }: {
  opp: Opportunity;
  selected: boolean;
  onClick: () => void;
  onRefreshList?: () => void;
}) {
  const isOverdue = opp.close_date && new Date(opp.close_date) < new Date();

  return (
    <tr
      onClick={onClick}
      className={`group border-b border-brand-navy-30/30 cursor-pointer transition-colors ${
        selected
          ? 'bg-brand-purple-30/20 border-l-2 border-l-brand-purple'
          : 'hover:bg-brand-purple-30/10'
      }`}
    >
      {/* Name + account */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <FreshnessDot updatedAt={opp.se_comments_updated_at} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-navy truncate max-w-[260px]">{opp.name}</p>
            <p className="text-xs text-brand-navy-70 truncate max-w-[260px]">{opp.account_name ?? '—'}</p>
          </div>
        </div>
      </td>

      {/* Stage */}
      <td className="px-3 py-3 whitespace-nowrap">
        <StageBadge stage={opp.stage} />
      </td>

      {/* ARR */}
      <td className="px-3 py-3 text-sm font-medium text-brand-navy whitespace-nowrap">
        {formatARR(opp.arr)}
      </td>

      {/* Close date */}
      <td className={`px-3 py-3 text-xs whitespace-nowrap ${isOverdue ? 'text-status-overdue font-medium' : 'text-brand-navy-70'}`}>
        {formatDate(opp.close_date)}
      </td>

      {/* AE owner */}
      <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
        {opp.ae_owner_name ?? <span className="text-brand-navy-30">—</span>}
      </td>

      {/* SE owner */}
      <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
        {opp.se_owner_name ?? <span className="text-status-warning font-medium">Unassigned</span>}
      </td>

      {/* Tasks */}
      <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
        {opp.open_task_count > 0 ? (
          <span className="inline-flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {opp.open_task_count}
          </span>
        ) : (
          <span className="text-brand-navy-30">—</span>
        )}
      </td>

      {/* Chevron + row capture */}
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
}: {
  search: string; setSearch: (v: string) => void;
  stage: string; setStage: (v: string) => void;
  includeQualify: boolean; setIncludeQualify: (v: boolean) => void;
  qualifyCount: number;
  total: number;
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
      <span className="text-xs text-brand-navy-70 ml-auto">
        {total} opportunit{total !== 1 ? 'ies' : 'y'}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const { user } = useAuthStore();
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [qualifyOpps, setQualifyOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [includeQualify, setIncludeQualify] = useState(user?.show_qualify ?? false);

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
      />

      {/* Opportunity table */}
      <div className="flex-1 overflow-y-auto bg-white">
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
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Opportunity</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Stage</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">ARR</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Close</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">AE Owner</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">SE Owner</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Tasks</th>
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
