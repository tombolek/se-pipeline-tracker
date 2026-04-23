import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { PageHeader, Loading } from './shared';
import { formatARR } from '../../utils/formatters';

interface Buckets {
  progressed: number;
  lost: number;
  stuck_assumed_lost: number;
  skipped: number;
  in_flight: number;
}

interface Row {
  se_id: number | null;
  se_name: string;
  is_active: boolean;
  bv: Buckets;
  bv_to_ds_pct: number | null;
  ds: Buckets;
  ds_to_ps_pct: number | null;
  closed_arr: number;
  closed_deal_count: number;
  contributed_arr: number;
  contributed_deal_count: number;
  poc_ended: number;
  poc_won: number;
  poc_conversion_pct: number | null;
  open_owned: number;
  fresh_owned: number;
  hygiene_pct: number | null;
}

interface Payload {
  config: { lookback_days: number; stuck_cutoff_days: number };
  team: Omit<Row, 'se_id' | 'se_name' | 'is_active' | 'closed_deal_count' | 'contributed_deal_count'> & {
    closed_deal_count?: number; contributed_deal_count?: number;
  };
  per_se: Row[];
  no_owner: Row;
}

const PERIOD_OPTIONS = [
  { label: 'Last 90d',   days: 90 },
  { label: 'Last 12mo',  days: 365 },
  { label: 'Last 2y',    days: 730 },
];

const RESOLVED_MIN = 5; // noise floor for dampening per-SE rates

function resolved(b: Buckets): number {
  return b.progressed + b.lost + b.stuck_assumed_lost;
}

function Pct({ value, denom, dampen }: { value: number | null; denom: number; dampen?: boolean }) {
  if (value === null) return <span className="text-brand-navy-70 dark:text-fg-2">—</span>;
  if (dampen && denom < RESOLVED_MIN) {
    return (
      <span className="text-brand-navy-70 dark:text-fg-2" title={`Only ${denom} resolved — too few for a reliable rate`}>
        {value}%<sup className="ml-0.5 text-[9px]">·</sup>
      </span>
    );
  }
  return <span className="font-semibold text-brand-navy dark:text-fg-1">{value}%</span>;
}

function ConversionCell({ b, pct }: { b: Buckets; pct: number | null }) {
  const den = resolved(b);
  return (
    <div className="text-center">
      <Pct value={pct} denom={den} dampen />
      <div className="text-[10px] text-brand-navy-70 dark:text-fg-2 mt-0.5 whitespace-nowrap">
        {b.progressed}/{den}
        {b.stuck_assumed_lost > 0 && (
          <span className="ml-1 text-brand-navy-70 dark:text-fg-2" title={`${b.stuck_assumed_lost} stuck ≥180d (counted as lost)`}>
            ·{b.stuck_assumed_lost}s
          </span>
        )}
      </div>
    </div>
  );
}

export default function SeContributionPage() {
  const [days, setDays] = useState(365);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<ApiResponse<Payload>>(`/insights/se-contribution?days=${days}`)
      .then(r => setData(r.data.data))
      .finally(() => setLoading(false));
  }, [days]);

  const teamRow: Row | null = data && {
    se_id: 0, se_name: 'Team total', is_active: true,
    bv: data.team.bv, bv_to_ds_pct: data.team.bv_to_ds_pct,
    ds: data.team.ds, ds_to_ps_pct: data.team.ds_to_ps_pct,
    closed_arr: data.team.closed_arr,
    closed_deal_count: 0,
    contributed_arr: data.team.contributed_arr,
    contributed_deal_count: 0,
    poc_ended: data.team.poc_ended,
    poc_won: data.team.poc_won,
    poc_conversion_pct: data.team.poc_conversion_pct,
    open_owned: data.team.open_owned,
    fresh_owned: data.team.fresh_owned,
    hygiene_pct: data.team.hygiene_pct,
  };

  // Order: team total → active SEs → inactive SEs → "No current SE owner"
  const seRows = data ? [
    ...data.per_se.filter(r => r.is_active),
    ...data.per_se.filter(r => !r.is_active),
    data.no_owner,
  ] : [];

  return (
    <div>
      <PageHeader
        title="SE Contribution"
        subtitle="Per-SE pipeline conversion, closed ARR, PoC conversion, and data hygiene"
      />

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-brand-navy-70 dark:text-fg-2">Period:</span>
        {PERIOD_OPTIONS.map(o => (
          <button
            key={o.days}
            onClick={() => setDays(o.days)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              days === o.days
                ? 'bg-brand-purple dark:bg-accent-purple text-white'
                : 'bg-white dark:bg-ink-1 text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 border border-brand-navy-30'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {loading || !data ? <Loading /> : (
        <>
          <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5F7] dark:bg-ink-0 text-brand-navy-70 dark:text-fg-2 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">SE</th>
                  <th className="px-3 py-2 font-medium" colSpan={2}>Conversion</th>
                  <th className="text-right px-3 py-2 font-medium">Closed ARR</th>
                  <th className="text-right px-3 py-2 font-medium">Contrib ARR</th>
                  <th className="px-3 py-2 font-medium">PoC win</th>
                  <th className="px-3 py-2 font-medium">Hygiene 14d</th>
                </tr>
                <tr className="border-t border-brand-navy-30/30 dark:border-ink-border-soft">
                  <th />
                  <th className="px-3 pb-2 font-normal text-center">BV→DS</th>
                  <th className="px-3 pb-2 font-normal text-center">DS→PS</th>
                  <th /><th /><th /><th />
                </tr>
              </thead>
              <tbody>
                {teamRow && (
                  <tr className="border-t border-brand-navy-30/30 dark:border-ink-border-soft bg-brand-purple-30/20 font-semibold">
                    <td className="px-4 py-3 text-brand-navy dark:text-fg-1">{teamRow.se_name}</td>
                    <td className="px-3 py-3"><ConversionCell b={teamRow.bv} pct={teamRow.bv_to_ds_pct} /></td>
                    <td className="px-3 py-3"><ConversionCell b={teamRow.ds} pct={teamRow.ds_to_ps_pct} /></td>
                    <td className="px-3 py-3 text-right">{formatARR(teamRow.closed_arr)}</td>
                    <td className="px-3 py-3 text-right">{formatARR(teamRow.contributed_arr)}</td>
                    <td className="px-3 py-3 text-center">
                      <Pct value={teamRow.poc_conversion_pct} denom={teamRow.poc_ended} dampen />
                      <div className="text-[10px] font-normal text-brand-navy-70 dark:text-fg-2 mt-0.5">
                        {teamRow.poc_won}/{teamRow.poc_ended}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Pct value={teamRow.hygiene_pct} denom={teamRow.open_owned} />
                      <div className="text-[10px] font-normal text-brand-navy-70 dark:text-fg-2 mt-0.5">
                        {teamRow.fresh_owned}/{teamRow.open_owned}
                      </div>
                    </td>
                  </tr>
                )}
                {seRows.map(r => {
                  const isOrphan = r.se_id === null;
                  const isInactive = !r.is_active && !isOrphan;
                  const empty = resolved(r.bv) + resolved(r.ds) + r.closed_deal_count +
                                r.contributed_deal_count + r.poc_ended + r.open_owned === 0;
                  if (empty && !isOrphan) return null; // hide SEs with no activity
                  return (
                    <tr key={r.se_id ?? 'no-owner'}
                        className={`border-t border-brand-navy-30/30 dark:border-ink-border-soft ${isOrphan ? 'bg-[#FAFAFC] italic' : ''}`}>
                      <td className="px-4 py-3 text-brand-navy dark:text-fg-1">
                        {r.se_name}
                        {isInactive && <span className="ml-2 text-[10px] font-normal text-brand-navy-70 dark:text-fg-2">(inactive)</span>}
                      </td>
                      <td className="px-3 py-3"><ConversionCell b={r.bv} pct={r.bv_to_ds_pct} /></td>
                      <td className="px-3 py-3"><ConversionCell b={r.ds} pct={r.ds_to_ps_pct} /></td>
                      <td className="px-3 py-3 text-right">{formatARR(r.closed_arr)}</td>
                      <td className="px-3 py-3 text-right">{formatARR(r.contributed_arr)}</td>
                      <td className="px-3 py-3 text-center">
                        <Pct value={r.poc_conversion_pct} denom={r.poc_ended} dampen />
                        <div className="text-[10px] text-brand-navy-70 dark:text-fg-2 mt-0.5">
                          {r.poc_won}/{r.poc_ended}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Pct value={r.hygiene_pct} denom={r.open_owned} />
                        <div className="text-[10px] text-brand-navy-70 dark:text-fg-2 mt-0.5">
                          {r.fresh_owned}/{r.open_owned}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-[11px] text-brand-navy-70 dark:text-fg-2 space-y-1">
            <p>
              <strong>Conversion rate</strong> = progressed ÷ (progressed + explicit-lost + stuck ≥{data.config.stuck_cutoff_days}d).
              Deals that have been in a stage for {data.config.stuck_cutoff_days}+ days without progressing are
              counted as <em>assumed lost</em>. In-flight and stage-skipping deals are excluded from the denominator.
            </p>
            <p>
              <strong>Rates marked with a small dot</strong> (e.g. <span className="text-brand-navy dark:text-fg-1">50%·</span>) have fewer than {RESOLVED_MIN} resolved deals —
              treat as directional only.
            </p>
            <p>
              <strong>Hygiene</strong> = share of an SE's open owned deals (excluding Qualify) with a note or
              SE-comments update in the last 14 days.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
