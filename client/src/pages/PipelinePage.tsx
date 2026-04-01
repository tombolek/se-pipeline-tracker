import { useState, useEffect, useCallback } from 'react';
import type { Opportunity } from '../types';
import { listOpportunities } from '../api/opportunities';
import { updateMyPreferences } from '../api/users';
import { useAuthStore } from '../store/auth';
import { getColumnsForPage, DEFAULT_COLUMNS, COLUMN_BY_KEY } from '../constants/columnDefs';
import OpportunityDetail from '../components/OpportunityDetail';
import Drawer from '../components/Drawer';
import StageBadge from '../components/shared/StageBadge';
import ColumnPicker from '../components/shared/ColumnPicker';
import TruncatedCell from '../components/shared/TruncatedCell';
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

// ── Cell renderer ─────────────────────────────────────────────────────────────
function renderCell(opp: Opportunity, colKey: string): React.ReactNode {
  const dash = <span className="text-brand-navy-30">—</span>;
  const txt = (v: string | null | undefined) =>
    v ? <span className="text-xs text-brand-navy-70">{v}</span> : dash;

  switch (colKey) {
    case 'name':
      return (
        <div className="flex items-center gap-2 min-w-0">
          <FreshnessDot updatedAt={opp.se_comments_updated_at} />
          <span className="text-sm font-medium text-brand-navy truncate max-w-[260px]">{opp.name}</span>
        </div>
      );
    case 'account_name':    return txt(opp.account_name);
    case 'account_segment': return txt(opp.account_segment);
    case 'account_industry':return txt(opp.account_industry);
    case 'stage':           return <StageBadge stage={opp.stage} />;
    case 'record_type':     return txt(opp.record_type);
    case 'key_deal':
      return opp.key_deal
        ? <span className="text-xs font-medium text-brand-purple">Yes</span>
        : dash;
    case 'close_date': {
      const isOverdue = opp.close_date && new Date(opp.close_date) < new Date();
      return (
        <span className={`text-xs whitespace-nowrap ${isOverdue ? 'text-status-overdue font-medium' : 'text-brand-navy-70'}`}>
          {formatDate(opp.close_date)}
        </span>
      );
    }
    case 'close_month':     return txt(opp.close_month);
    case 'fiscal_period':   return txt(opp.fiscal_period);
    case 'fiscal_year':     return txt(opp.fiscal_year);
    case 'deploy_mode':     return txt(opp.deploy_mode);
    case 'deploy_location': return txt(opp.deploy_location);
    case 'sales_plays':
      return <TruncatedCell value={opp.sales_plays} className="text-xs text-brand-navy-70" />;
    case 'arr':
      return <span className="text-sm font-medium text-brand-navy whitespace-nowrap">{formatARR(opp.arr)}</span>;
    case 'arr_currency':    return txt(opp.arr_currency);
    case 'arr_converted':
      return <span className="text-sm font-medium text-brand-navy whitespace-nowrap">{formatARR(opp.arr_converted)}</span>;
    case 'ae_owner_name':   return txt(opp.ae_owner_name);
    case 'se_owner':
      return opp.se_owner
        ? <span className="text-xs text-brand-navy-70">{opp.se_owner.name}</span>
        : <span className="text-xs text-status-warning font-medium">Unassigned</span>;
    case 'team':               return txt(opp.team);
    case 'lead_source':        return txt(opp.lead_source);
    case 'opportunity_source': return txt(opp.opportunity_source);
    case 'channel_source':     return txt(opp.channel_source);
    case 'biz_dev':            return txt(opp.biz_dev);
    case 'open_task_count':
      return opp.open_task_count > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-brand-navy-70">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          {opp.open_task_count}
        </span>
      ) : dash;
    case 'se_comments_freshness':
      return <FreshnessDot updatedAt={opp.se_comments_updated_at} />;
    case 'next_step_sf':
      return <TruncatedCell value={opp.next_step_sf} className="text-xs text-brand-navy-70" />;
    case 'manager_comments':
      return <TruncatedCell value={opp.manager_comments} className="text-xs text-brand-navy-70" />;
    case 'se_comments':
      return <TruncatedCell value={opp.se_comments} className="text-xs text-brand-navy-70" />;
    case 'psm_comments':
      return <TruncatedCell value={opp.psm_comments} className="text-xs text-brand-navy-70" />;
    case 'technical_blockers':
      return <TruncatedCell value={opp.technical_blockers} className="text-xs text-brand-navy-70" />;
    case 'engaged_competitors':
      return <TruncatedCell value={opp.engaged_competitors} className="text-xs text-brand-navy-70" />;
    case 'budget':            return <TruncatedCell value={opp.budget} className="text-xs text-brand-navy-70" />;
    case 'authority':         return <TruncatedCell value={opp.authority} className="text-xs text-brand-navy-70" />;
    case 'need':              return <TruncatedCell value={opp.need} className="text-xs text-brand-navy-70" />;
    case 'timeline':          return <TruncatedCell value={opp.timeline} className="text-xs text-brand-navy-70" />;
    case 'metrics':           return <TruncatedCell value={opp.metrics} className="text-xs text-brand-navy-70" />;
    case 'economic_buyer':    return <TruncatedCell value={opp.economic_buyer} className="text-xs text-brand-navy-70" />;
    case 'decision_criteria': return <TruncatedCell value={opp.decision_criteria} className="text-xs text-brand-navy-70" />;
    case 'decision_process':  return <TruncatedCell value={opp.decision_process} className="text-xs text-brand-navy-70" />;
    case 'paper_process':     return <TruncatedCell value={opp.paper_process} className="text-xs text-brand-navy-70" />;
    case 'implicate_pain':    return <TruncatedCell value={opp.implicate_pain} className="text-xs text-brand-navy-70" />;
    case 'champion':          return <TruncatedCell value={opp.champion} className="text-xs text-brand-navy-70" />;
    case 'agentic_qual':      return <TruncatedCell value={opp.agentic_qual} className="text-xs text-brand-navy-70" />;
    case 'poc_status':        return txt(opp.poc_status);
    case 'poc_start_date':    return <span className="text-xs text-brand-navy-70">{formatDate(opp.poc_start_date)}</span>;
    case 'poc_end_date':      return <span className="text-xs text-brand-navy-70">{formatDate(opp.poc_end_date)}</span>;
    case 'poc_type':          return txt(opp.poc_type);
    case 'poc_deploy_type':   return txt(opp.poc_deploy_type);
    case 'rfx_status':        return txt(opp.rfx_status);
    case 'sourcing_partner':      return txt(opp.sourcing_partner);
    case 'sourcing_partner_tier': return txt(opp.sourcing_partner_tier);
    case 'influencing_partner':   return txt(opp.influencing_partner);
    case 'partner_manager':       return txt(opp.partner_manager);
    default:                      return dash;
  }
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
          {renderCell(opp, col)}
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
const STAGES = [
  'Qualify', 'Develop Solution', 'Build Value',
  'Proposal Sent', 'Submitted for Booking', 'Negotiate',
];

function FilterBar({
  search, setSearch,
  stage, setStage,
  includeQualify, setIncludeQualify,
  qualifyCount, total,
  columnPicker,
}: {
  search: string; setSearch: (v: string) => void;
  stage: string; setStage: (v: string) => void;
  includeQualify: boolean; setIncludeQualify: (v: boolean) => void;
  qualifyCount: number;
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
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [qualifyOpps, setQualifyOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [includeQualify, setIncludeQualify] = useState(user?.show_qualify ?? false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    getColumnsForPage('pipeline', user?.column_prefs ?? null)
  );

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

  async function handleColumnsChange(cols: string[]) {
    setVisibleColumns(cols);
    try {
      const updatedUser = await updateMyPreferences({ column_prefs: { pipeline: cols } });
      setUser(updatedUser);
    } catch {
      // persist failure is non-fatal — local state already updated
    }
  }

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
