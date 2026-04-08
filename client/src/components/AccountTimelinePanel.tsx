import { useState, useEffect } from 'react';
import api from '../api/client';
import type { ApiResponse } from '../types';
import { formatARR } from '../utils/formatters';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AccountOpp {
  id: number;
  name: string;
  stage: string;
  is_active: boolean;
  is_closed_lost: boolean;
  closed_at: string | null;
  close_date: string | null;
  first_seen_at: string | null;
  arr: number | null;
  arr_currency: string | null;
  record_type: string | null;
  ae_owner_name: string | null;
  se_owner_name: string | null;
}

type DealStatus = 'open' | 'won' | 'closed';

function dealStatus(o: AccountOpp): DealStatus {
  if (o.is_active) return 'open';
  if (o.stage === 'Closed Won') return 'won';
  return 'closed';
}

function dealYear(o: AccountOpp): number {
  const d = o.closed_at ?? o.close_date ?? o.first_seen_at;
  return d ? new Date(d).getFullYear() : new Date().getFullYear();
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

function StatusChip({ status, stage }: { status: DealStatus; stage: string }) {
  if (status === 'open') {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-brand-purple-30 text-brand-purple">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-purple" />
        {stage}
      </span>
    );
  }
  if (status === 'won') {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-status-success/10 text-status-success">
        <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
        Closed Won
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-status-overdue/10 text-status-overdue">
      <span className="w-1.5 h-1.5 rounded-full bg-status-overdue" />
      Closed Lost
    </span>
  );
}

function OwnerChip({ initial, name, variant }: { initial: string; name: string; variant: 'se' | 'ae' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] text-brand-navy-70 bg-brand-navy-30/25 px-2 py-0.5 rounded-full">
      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-semibold text-white flex-shrink-0 ${variant === 'se' ? 'bg-brand-purple' : 'bg-brand-navy-70'}`}>
        {initial}
      </span>
      {name}
    </span>
  );
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// Expandable notes section for a closed deal
function DealNotes({ oppId }: { oppId: number }) {
  const [notes, setNotes] = useState<{ id: number; content: string; author_name: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ApiResponse<{ id: number; content: string; author_name: string; created_at: string }[]>>(
      `/opportunities/${oppId}/notes`
    )
      .then(r => setNotes(r.data.data))
      .finally(() => setLoading(false));
  }, [oppId]);

  if (loading) return <p className="text-xs text-brand-navy-70 py-2 italic">Loading…</p>;
  if (notes.length === 0) return <p className="text-xs text-brand-navy-70 py-2 italic">No notes recorded.</p>;

  return (
    <div className="space-y-2">
      {notes.map(n => (
        <div key={n.id} className="flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-status-info mt-1.5 flex-shrink-0" />
          <div>
            <p className="text-[11.5px] text-brand-navy-70 font-light leading-relaxed">{n.content}</p>
            <p className="text-[10.5px] text-brand-navy-30 mt-0.5">
              {n.author_name} · {fmtDate(n.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DealCard({ opp, currentOppId }: { opp: AccountOpp; currentOppId: number }) {
  const [expanded, setExpanded] = useState(false);
  const status = dealStatus(opp);
  const isCurrent = opp.id === currentOppId;
  const isExpandable = !isCurrent; // don't drill into the deal you're already on

  const closeLabel = status === 'open'
    ? `Close: ${fmtDate(opp.close_date)}`
    : `Closed: ${fmtDate(opp.closed_at ?? opp.close_date)}`;

  return (
    <div className={`rounded-xl border overflow-hidden transition-shadow ${
      isCurrent
        ? 'border-brand-purple shadow-[0_0_0_1px_theme(colors.brand.purple-30)]'
        : 'border-brand-navy-30/50 hover:shadow-sm'
    } ${isExpandable ? 'cursor-pointer' : ''}`}
      onClick={isExpandable ? () => setExpanded(e => !e) : undefined}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-medium text-brand-navy leading-snug">{opp.name}</span>
            {isCurrent && (
              <span className="text-[10px] font-medium text-brand-purple bg-brand-purple-30 px-1.5 py-0.5 rounded-full">Viewing</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <StatusChip status={status} stage={opp.stage} />
            {opp.record_type && (
              <span className="text-[10.5px] text-brand-navy-70 bg-brand-navy-30/25 px-2 py-0.5 rounded-full">{opp.record_type}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[13px] font-semibold text-brand-navy">
            {opp.arr ? formatARR(opp.arr, opp.arr_currency ?? 'USD') : '—'}
          </span>
          <span className="text-[11px] text-brand-navy-70 font-light">{closeLabel}</span>
        </div>
      </div>

      {/* Owners row */}
      <div className="flex items-center gap-1.5 px-4 pb-3 flex-wrap">
        {opp.se_owner_name && <OwnerChip initial={initials(opp.se_owner_name)} name={`SE: ${opp.se_owner_name}`} variant="se" />}
        {opp.ae_owner_name && <OwnerChip initial={initials(opp.ae_owner_name)} name={`AE: ${opp.ae_owner_name}`} variant="ae" />}
        {isExpandable && (
          <span className="ml-auto text-[10px] text-brand-navy-70 flex items-center gap-0.5">
            {expanded ? 'Hide notes' : 'Show notes'}
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        )}
      </div>

      {/* Expandable notes drill-in */}
      {expanded && (
        <div className="border-t border-brand-navy-30/40 px-4 py-3 bg-[#fafafa]" onClick={e => e.stopPropagation()}>
          <p className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-2">Notes</p>
          <DealNotes oppId={opp.id} />
        </div>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

interface Props {
  accountName: string;
  currentOppId: number;
  onClose: () => void;
}

export default function AccountTimelinePanel({ accountName, currentOppId, onClose }: Props) {
  const [opps, setOpps] = useState<AccountOpp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<ApiResponse<AccountOpp[]>>(`/opportunities/by-account?name=${encodeURIComponent(accountName)}`)
      .then(r => setOpps(r.data.data))
      .finally(() => setLoading(false));
  }, [accountName]);

  // Summary counts
  const openCount   = opps.filter(o => dealStatus(o) === 'open').length;
  const wonCount    = opps.filter(o => dealStatus(o) === 'won').length;
  const closedCount = opps.filter(o => dealStatus(o) === 'closed').length;
  const lifetimeArr = opps.reduce((sum, o) => sum + (o.arr ?? 0), 0);
  const arrCurrency = opps.find(o => o.arr_currency)?.arr_currency ?? 'USD';

  // Group by year
  const byYear = opps.reduce<Record<number, AccountOpp[]>>((acc, o) => {
    const y = dealYear(o);
    (acc[y] ??= []).push(o);
    return acc;
  }, {});
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  return (
    <div className="absolute inset-y-0 right-0 w-[480px] bg-white shadow-[−4px_0_24px_rgba(26,12,66,0.12)] flex flex-col z-20 border-l border-brand-navy-30/40"
      style={{ boxShadow: '-4px 0 24px rgba(26,12,66,0.12)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-brand-navy-30/40 flex-shrink-0">
        <div>
          <p className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wide">Account History</p>
          <p className="text-[15px] font-semibold text-brand-navy">{accountName}</p>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:bg-[#F5F5F7] hover:text-brand-navy transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Summary bar */}
      {!loading && (
        <div className="flex items-stretch gap-0 border-b border-brand-navy-30/40 bg-[#fafafa] flex-shrink-0">
          {[
            { label: 'Total', value: opps.length, color: 'text-brand-navy' },
            { label: 'Open',  value: openCount,   color: 'text-brand-purple' },
            { label: 'Won',   value: wonCount,    color: 'text-status-success' },
            { label: 'Lost',  value: closedCount, color: 'text-status-overdue' },
          ].map((s, i) => (
            <div key={s.label} className={`flex-1 flex flex-col items-center py-3 ${i < 3 ? 'border-r border-brand-navy-30/40' : ''}`}>
              <span className={`text-[16px] font-semibold ${s.color}`}>{s.value}</span>
              <span className="text-[10px] text-brand-navy-70 uppercase tracking-wide">{s.label}</span>
            </div>
          ))}
          <div className="flex-1 flex flex-col items-center py-3">
            <span className="text-[16px] font-semibold text-brand-navy">{formatARR(lifetimeArr, arrCurrency)}</span>
            <span className="text-[10px] text-brand-navy-70 uppercase tracking-wide">Lifetime ARR</span>
          </div>
        </div>
      )}

      {/* Data caveat */}
      <div className="mx-4 mt-3 flex-shrink-0">
        <div className="flex items-start gap-2 bg-status-warning/8 border border-status-warning/30 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 text-status-warning mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-[11px] text-brand-navy-70 font-light leading-relaxed">
            <span className="font-medium text-brand-navy">Incomplete view.</span> Only New Logo and Expansion deals are currently synced from Salesforce. Renewals and Professional Services are not yet included.
          </p>
        </div>
      </div>

      {/* Deal list */}
      <div className="flex-1 overflow-y-auto py-3 px-4 space-y-1">
        {loading && (
          <p className="text-sm text-brand-navy-70 text-center py-8 italic">Loading…</p>
        )}

        {!loading && opps.length === 0 && (
          <div className="text-center py-10">
            <svg className="w-8 h-8 text-brand-navy-30 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5"/>
            </svg>
            <p className="text-sm text-brand-navy-70 italic">No other deals found for this account.</p>
          </div>
        )}

        {!loading && years.map(year => (
          <div key={year}>
            {/* Year separator */}
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-brand-navy-30/40" />
              <span className="text-[11px] font-medium text-brand-navy-70">{year}</span>
              <div className="flex-1 h-px bg-brand-navy-30/40" />
            </div>
            <div className="space-y-2">
              {byYear[year].map(o => (
                <DealCard key={o.id} opp={o} currentOppId={currentOppId} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
