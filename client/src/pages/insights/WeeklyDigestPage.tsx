import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { Opportunity } from '../../types';
import StageBadge from '../../components/shared/StageBadge';
import HealthScoreBadge from '../../components/shared/HealthScoreBadge';
import { formatARR, formatDate } from '../../utils/formatters';
import { computeHealthScore } from '../../utils/healthScore';
import { PageHeader, Empty, Loading } from './shared';
import { useTeamScope } from '../../hooks/useTeamScope';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useOppUrlSync } from '../../hooks/useOppUrlSync';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DigestOpp {
  id: number;
  name: string;
  account_name: string | null;
  arr: string | null;
  arr_currency: string | null;
  stage: string;
  ae_owner_name: string | null;
  se_owner_id: number | null;
  se_owner_name: string | null;
  team: string | null;
}

interface StageProgression extends DigestOpp {
  current_stage: string;
  previous_stage: string | null;
  stage_changed_at: string;
}

interface StaleOpp extends DigestOpp {
  days_stale: number | null;
}

interface PocOpp extends DigestOpp {
  poc_status: string | null;
  poc_start_date: string | null;
  poc_end_date: string | null;
  poc_type: string | null;
}

interface ClosedLostOpp extends DigestOpp {
  closed_at: string | null;
  previous_stage: string | null;
}

// at_risk_candidates carry the full set of fields needed by computeHealthScore
type AtRiskCandidate = DigestOpp & Pick<Opportunity,
  | 'metrics' | 'economic_buyer' | 'decision_criteria' | 'decision_process'
  | 'paper_process' | 'implicate_pain' | 'champion' | 'authority' | 'need'
  | 'se_comments_updated_at' | 'last_note_at' | 'stage_changed_at' | 'overdue_task_count'
>;

interface DigestSummary {
  arr_moved_forward: number;
  arr_closed_lost:   number;
  net_pipeline_change: number;
  new_opp_count: number;
  stale_count: number;
}

interface DigestData {
  summary:            DigestSummary;
  new_opps:           DigestOpp[];
  stage_progressions: StageProgression[];
  stale_deals:        StaleOpp[];
  pocs_started:       PocOpp[];
  pocs_ended:         PocOpp[];
  closed_lost:        ClosedLostOpp[];
  at_risk_candidates: AtRiskCandidate[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Badge({ count, variant }: { count: number; variant: 'purple' | 'red' | 'amber' | 'green' | 'blue' }) {
  const styles: Record<string, string> = {
    purple: 'bg-brand-purple-30 text-brand-purple',
    red:    'bg-red-50 text-status-overdue',
    amber:  'bg-amber-50 text-status-warning',
    green:  'bg-emerald-50 text-status-success',
    blue:   'bg-sky-50 text-status-info',
  };
  return (
    <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold ${styles[variant]}`}>
      {count}
    </span>
  );
}

const PREVIEW_COUNT = 5;

function CollapsibleSection<T>({ items, header, renderItems, emptyNode }: {
  items: T[];
  header: React.ReactNode;
  renderItems: (items: T[]) => React.ReactNode;
  emptyNode?: React.ReactNode;
}) {
  const count = items.length;
  const collapsible = count > PREVIEW_COUNT;
  const [expanded, setExpanded] = useState(false);
  const displayed = collapsible && !expanded ? items.slice(0, PREVIEW_COUNT) : items;
  const hidden = count - PREVIEW_COUNT;

  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-visible">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-brand-navy-30/40 rounded-t-2xl">
        {header}
      </div>
      {count === 0 ? (emptyNode ?? <Empty />) : (
        <>
          {renderItems(displayed)}
          {collapsible && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full px-5 py-2.5 text-xs font-medium text-brand-purple hover:bg-gray-50 border-t border-brand-navy-30/40 rounded-b-2xl flex items-center justify-center gap-1.5 transition-colors select-none"
            >
              {expanded ? 'Show less' : `Show ${hidden} more`}
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TH({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">
      {children}
    </th>
  );
}

function TR({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50 last:rounded-b-2xl">
      {children}
    </tr>
  );
}

function OppCell({ name, account, onClick }: { name: string; account: string | null; onClick?: () => void }) {
  return (
    <td className="px-4 py-3">
      {onClick
        ? <button onClick={onClick} className="text-sm font-medium text-brand-navy hover:text-brand-purple hover:underline text-left">{name}</button>
        : <p className="text-sm font-medium text-brand-navy">{name}</p>
      }
      {account && <p className="text-xs text-brand-navy-70">{account}</p>}
    </td>
  );
}

function ArrCell({ arr }: { arr: string | null }) {
  return <td className="px-4 py-3 text-sm font-medium text-brand-navy">{formatARR(arr)}</td>;
}

function MutedCell({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 text-xs text-brand-navy-70">{children}</td>;
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 ml-auto text-[11px] text-brand-navy-70 font-light">
      <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {children}
    </div>
  );
}

function formatARRNum(n: number): string {
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WeeklyDigestPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);
  useOppUrlSync(selectedOppId, setSelectedOppId);
  const { filterOpp } = useTeamScope();

  useEffect(() => {
    setLoading(true);
    api.get<{ data: DigestData }>(`/insights/weekly-digest?days=${days}`)
      .then(r => setData(r.data.data))
      .finally(() => setLoading(false));
  }, [days]);

  // Derive at-risk deals by running healthScore client-side
  const atRiskDeals = useMemo(() => {
    if (!data) return [];
    return data.at_risk_candidates
      .filter(c => computeHealthScore(c as unknown as Opportunity).rag === 'red')
      .filter(filterOpp);
  }, [data, filterOpp]);

  // Scoped sections
  const newOpps           = data?.new_opps.filter(filterOpp)           ?? [];
  const stageProgressions = data?.stage_progressions.filter(filterOpp) ?? [];
  const staleDeals        = data?.stale_deals.filter(filterOpp)        ?? [];
  const pocsStarted       = data?.pocs_started.filter(filterOpp)       ?? [];
  const pocsEnded         = data?.pocs_ended.filter(filterOpp)         ?? [];
  const closedLost        = data?.closed_lost.filter(filterOpp)        ?? [];

  // Recalculate summary after scope filter
  const arrMovedForward = stageProgressions.reduce((s, r) => s + (parseFloat(r.arr ?? '0') || 0), 0);
  const arrClosedLost   = closedLost.reduce((s, r) => s + (parseFloat(r.arr ?? '0') || 0), 0);
  const arrNew          = newOpps.reduce((s, r) => s + (parseFloat(r.arr ?? '0') || 0), 0);
  const netChange       = arrNew - arrClosedLost;

  if (loading) return <Loading />;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-end gap-4">
        <PageHeader
          title="Weekly Pipeline Digest"
          subtitle={`What changed over the last ${days} days`}
        />
        <div className="ml-auto flex items-center gap-2 mb-6">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                days === d
                  ? 'bg-brand-purple text-white border-brand-purple'
                  : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'ARR Moved Forward', value: formatARRNum(arrMovedForward), sub: `${stageProgressions.length} progressions`, color: 'text-status-success' },
          { label: 'ARR Closed Lost',   value: formatARRNum(-arrClosedLost),  sub: `${closedLost.length} deals`,             color: 'text-status-overdue' },
          { label: 'Net Pipeline',      value: formatARRNum(netChange),       sub: 'new minus closed lost',                  color: netChange >= 0 ? 'text-brand-purple' : 'text-status-overdue' },
          { label: 'New Qualified',      value: String(newOpps.length),        sub: 'entered Build Value',                    color: 'text-brand-navy' },
          { label: 'Stale Deals',       value: String(staleDeals.length),     sub: `no notes, tasks or SE comments in ${days}d+`, color: 'text-status-warning' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-brand-navy-30/40 px-4 py-4">
            <p className="text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1.5">{s.label}</p>
            <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-brand-navy-70 font-light mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* New Qualified Opportunities */}
      <CollapsibleSection
        items={newOpps}
        header={<>
          <span className="text-sm font-semibold text-brand-navy">New Qualified Opportunities</span>
          <Badge count={newOpps.length} variant="purple" />
          <span className="text-xs text-brand-navy-70 font-light">Entered Build Value this period</span>
        </>}
        renderItems={rows => (
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40">
              <tr><TH>Opportunity</TH><TH>Stage</TH><TH>ARR</TH><TH>Close Date</TH><TH>SE Owner</TH></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <TR key={r.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-purple flex-shrink-0" />
                      <div>
                        <button onClick={() => setSelectedOppId(r.id)} className="text-sm font-medium text-brand-navy hover:text-brand-purple hover:underline text-left">{r.name}</button>
                        {r.account_name && <p className="text-xs text-brand-navy-70">{r.account_name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StageBadge stage={r.stage} /></td>
                  <ArrCell arr={r.arr} />
                  <MutedCell>{formatDate(null)}</MutedCell>
                  <MutedCell>{r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}</MutedCell>
                </TR>
              ))}
            </tbody>
          </table>
        )}
      />

      {/* Stage Progressions */}
      <CollapsibleSection
        items={stageProgressions}
        header={<>
          <span className="text-sm font-semibold text-brand-navy">Stage Progressions</span>
          <Badge count={stageProgressions.length} variant="green" />
          <span className="text-xs text-brand-navy-70 font-light">Any stage movement this period</span>
        </>}
        renderItems={rows => (
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40">
              <tr><TH>Opportunity</TH><TH>Stage Change</TH><TH>ARR</TH><TH>Moved</TH><TH>SE Owner</TH></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <TR key={r.id}>
                  <OppCell name={r.name} account={r.account_name} onClick={() => setSelectedOppId(r.id)} />
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-brand-navy-70">{r.previous_stage ?? '—'}</span>
                      <svg className="w-3 h-3 text-brand-navy-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <StageBadge stage={r.current_stage} />
                    </div>
                  </td>
                  <ArrCell arr={r.arr} />
                  <MutedCell>{formatDate(r.stage_changed_at)}</MutedCell>
                  <MutedCell>{r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}</MutedCell>
                </TR>
              ))}
            </tbody>
          </table>
        )}
      />

      {/* Stale Deals */}
      <CollapsibleSection
        items={staleDeals}
        header={<>
          <span className="text-sm font-semibold text-brand-navy">Stale Deals</span>
          <Badge count={staleDeals.length} variant="amber" />
          <span className="text-xs text-brand-navy-70 font-light">No notes, tasks, or SE comments update in {days}+ days</span>
        </>}
        renderItems={rows => (
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40">
              <tr><TH>Opportunity</TH><TH>Stage</TH><TH>ARR</TH><TH>Last Activity</TH><TH>SE Owner</TH></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <TR key={r.id}>
                  <OppCell name={r.name} account={r.account_name} onClick={() => setSelectedOppId(r.id)} />
                  <td className="px-4 py-3"><StageBadge stage={r.stage} /></td>
                  <ArrCell arr={r.arr} />
                  <td className="px-4 py-3">
                    <span className="text-xs text-status-warning font-medium">
                      {r.days_stale != null ? `${r.days_stale}d ago` : 'Never'}
                    </span>
                  </td>
                  <MutedCell>{r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}</MutedCell>
                </TR>
              ))}
            </tbody>
          </table>
        )}
      />

      {/* PoCs Started + Ended — two columns */}
      <div className="grid grid-cols-2 gap-4">
        <CollapsibleSection
          items={pocsStarted}
          header={<>
            <span className="text-sm font-semibold text-brand-navy">PoCs Started</span>
            <Badge count={pocsStarted.length} variant="blue" />
            <span className="text-xs text-brand-navy-70 font-light">This period</span>
          </>}
          renderItems={rows => <>{rows.map(r => (
            <div key={r.id} className="px-5 py-3 border-b border-brand-navy-30/20 last:border-0">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedOppId(r.id)} className="text-sm font-medium text-brand-navy truncate hover:text-brand-purple hover:underline text-left">{r.name}</button>
                {r.poc_type && (
                  <span className="text-[10px] font-semibold text-status-info bg-sky-50 px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
                    {r.poc_type}
                  </span>
                )}
              </div>
              <p className="text-xs text-brand-navy-70 font-light mt-0.5">
                Started {formatDate(r.poc_start_date)}
                {r.poc_end_date && ` · Ends ${formatDate(r.poc_end_date)}`}
                {r.se_owner_name && ` · `}
                {r.se_owner_name && <strong className="font-medium">{r.se_owner_name}</strong>}
              </p>
            </div>
          ))}</>}
        />

        <CollapsibleSection
          items={pocsEnded}
          header={<>
            <span className="text-sm font-semibold text-brand-navy">PoCs Ended</span>
            <Badge count={pocsEnded.length} variant="green" />
            <span className="text-xs text-brand-navy-70 font-light">This period</span>
          </>}
          renderItems={rows => <>{rows.map(r => (
            <div key={r.id} className="px-5 py-3 border-b border-brand-navy-30/20 last:border-0">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedOppId(r.id)} className="text-sm font-medium text-brand-navy truncate hover:text-brand-purple hover:underline text-left">{r.name}</button>
                <span className="text-[10px] font-semibold text-status-success bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
                  {r.poc_status ?? 'Ended'}
                </span>
              </div>
              <p className="text-xs text-brand-navy-70 font-light mt-0.5">
                Ended {formatDate(r.poc_end_date)}
                {r.poc_start_date && ` · Started ${formatDate(r.poc_start_date)}`}
                {r.se_owner_name && ` · `}
                {r.se_owner_name && <strong className="font-medium">{r.se_owner_name}</strong>}
              </p>
            </div>
          ))}</>}
        />
      </div>

      {/* At-Risk Deals */}
      <CollapsibleSection
        items={atRiskDeals}
        header={<>
          <span className="text-sm font-semibold text-brand-navy">Deals Flagged At-Risk</span>
          <Badge count={atRiskDeals.length} variant="red" />
          <span className="text-xs text-brand-navy-70 font-light">Currently Red health score</span>
        </>}
        renderItems={rows => (
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40">
              <tr><TH>Opportunity</TH><TH>Stage</TH><TH>ARR</TH><TH>Health</TH><TH>Top Risk Factor</TH><TH>SE Owner</TH></tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const hs = computeHealthScore(r as unknown as Opportunity);
                const topFactor = hs.factors.sort((a, b) => b.deduction - a.deduction)[0];
                return (
                  <TR key={r.id}>
                    <OppCell name={r.name} account={r.account_name} onClick={() => setSelectedOppId(r.id)} />
                    <td className="px-4 py-3"><StageBadge stage={r.stage} /></td>
                    <ArrCell arr={r.arr} />
                    <td className="px-4 py-3">
                      <HealthScoreBadge opp={r as unknown as Opportunity} />
                    </td>
                    <td className="px-4 py-3 text-xs text-status-overdue">
                      {topFactor ? `${topFactor.label}: ${topFactor.detail}` : '—'}
                    </td>
                    <MutedCell>{r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}</MutedCell>
                  </TR>
                );
              })}
            </tbody>
          </table>
        )}
      />

      {/* Closed Lost */}
      <CollapsibleSection
        items={closedLost}
        header={<>
          <span className="text-sm font-semibold text-brand-navy">Closed Lost This Period</span>
          <Badge count={closedLost.length} variant="red" />
          <span className="text-xs text-brand-navy-70 font-light">Deals that dropped from the pipeline</span>
          <InfoNote>
            Based on opps that disappeared from the SF import (open → gone). Closed Lost history not loaded directly.
          </InfoNote>
        </>}
        renderItems={rows => (
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40">
              <tr><TH>Opportunity</TH><TH>Stage When Closed</TH><TH>ARR</TH><TH>Closed</TH><TH>SE Owner</TH></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50 border-l-2 border-l-status-overdue">
                  <OppCell name={r.name} account={r.account_name} onClick={() => setSelectedOppId(r.id)} />
                  <td className="px-4 py-3"><StageBadge stage={r.stage} /></td>
                  <td className="px-4 py-3 text-sm font-medium text-status-overdue">{formatARR(r.arr)}</td>
                  <MutedCell>{formatDate(r.closed_at)}</MutedCell>
                  <MutedCell>{r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}</MutedCell>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      />

      <Drawer open={selectedOppId !== null} onClose={() => setSelectedOppId(null)}>
        {selectedOppId !== null && <OpportunityDetail key={selectedOppId} oppId={selectedOppId} />}
      </Drawer>
    </div>
  );
}
