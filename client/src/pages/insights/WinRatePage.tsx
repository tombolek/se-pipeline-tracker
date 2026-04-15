/**
 * Win Rate (Issue #92)
 *
 * Manager-only report with two perspectives on win rate:
 *
 *   1. Technical Win Rate  — among closed deals, how many reached Negotiate?
 *      Proxies "did the SE earn a technical win" before commercial terms took over.
 *   2. Negotiate Win Rate  — among deals that reached Negotiate, how many Closed Won?
 *      Proxies "once the technical side was solved, did we close?"
 *
 * Overall Win Rate (Won / (Won+Lost)) is also shown as the standard benchmark.
 * Broken down per SE. FY + quarter filters match Closed Won / % to Target.
 */
import { Fragment, useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { PageHeader, Loading } from './shared';
import { formatARR } from '../../utils/formatters';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useOppUrlSync } from '../../hooks/useOppUrlSync';

interface DealRow {
  id: number;
  sf_opportunity_id: string;
  name: string;
  account_name: string | null;
  team: string | null;
  arr_converted: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  reached_negotiate: boolean;
  closed_at: string | null;
  fiscal_period: string | null;
}

interface Bucket {
  closed_won: number;
  closed_lost: number;
  won_arr: number;
  lost_arr: number;
  reached_negotiate: number;
  negotiate_won: number;
  negotiate_lost: number;
  total_closed: number;
  overall_win_rate: number | null;
  technical_win_rate: number | null;
  negotiate_win_rate: number | null;
}

interface SeBreakdown extends Bucket {
  se_id: number | null;
  se_name: string;
  deals: DealRow[];
}

interface WinRateResponse {
  overall: Bucket;
  by_se: SeBreakdown[];
}

interface Meta {
  fiscal_years?: string[];
  filters?: { fiscal_year: string | null; fiscal_period: string | null };
}

type QuarterFilter = 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

function formatPct(n: number | null): string {
  if (n === null) return '—';
  return `${(n * 100).toFixed(0)}%`;
}

function ragForWinRate(pct: number | null): string {
  if (pct === null) return 'text-brand-navy-70';
  if (pct >= 0.5) return 'text-status-success';
  if (pct >= 0.3) return 'text-status-warning';
  return 'text-status-overdue';
}

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 px-4 py-4">
      <p className="text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1.5">{label}</p>
      <p className={`text-2xl font-semibold ${valueColor ?? 'text-brand-navy'}`}>{value}</p>
      {sub && <p className="text-[11px] text-brand-navy-70 font-light mt-0.5">{sub}</p>}
    </div>
  );
}

export default function WinRatePage() {
  const [data, setData] = useState<WinRateResponse | null>(null);
  const [fiscalYears, setFiscalYears] = useState<string[]>([]);
  const [fiscalYear, setFiscalYear] = useState<string | null>(null);
  const [quarter, setQuarter] = useState<QuarterFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [expandedSe, setExpandedSe] = useState<Set<number | string>>(new Set());
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);

  const oppRefsForUrlSync = useMemo(
    () => (data?.by_se ?? []).flatMap(s => s.deals.map(d => ({ id: d.id, sf_opportunity_id: d.sf_opportunity_id }))),
    [data],
  );
  useOppUrlSync(selectedOppId, setSelectedOppId, oppRefsForUrlSync);

  useEffect(() => {
    setLoading(true);
    const params = fiscalYear ? `?fiscal_year=${encodeURIComponent(fiscalYear)}` : '';
    api.get<ApiResponse<WinRateResponse> & { meta?: Meta }>(`/insights/win-rate${params}`)
      .then(r => {
        const years = r.data.meta?.fiscal_years ?? [];
        setFiscalYears(years);
        if (fiscalYear === null && years.length > 0) {
          setFiscalYear(years[0]);
        } else {
          setData(r.data.data);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear]);

  useEffect(() => { setExpandedSe(new Set()); }, [quarter, fiscalYear]);

  // Client-side quarter filter — mirrors the closed_at-based bucketing used on other pages.
  function dealMonth(d: DealRow): number | null {
    const src = d.closed_at;
    if (!src) return null;
    const m = new Date(src).getUTCMonth();
    return isNaN(m) ? null : m;
  }
  function qInRange(m: number | null, q: QuarterFilter): boolean {
    if (m === null) return false;
    if (q === 'ALL') return true;
    const endMap = { Q1: 2, Q2: 5, Q3: 8, Q4: 11 } as const;
    const end = endMap[q];
    const start = end - 2;
    return m >= start && m <= end;
  }

  function recompute(seList: SeBreakdown[]): { overall: Bucket; by_se: SeBreakdown[] } {
    function make(deals: DealRow[]): Bucket {
      let closed_won = 0, closed_lost = 0, won_arr = 0, lost_arr = 0;
      let reached_negotiate = 0, negotiate_won = 0, negotiate_lost = 0;
      for (const d of deals) {
        const arr = parseFloat(d.arr_converted ?? '0') || 0;
        if (d.is_closed_won) { closed_won += 1; won_arr += arr; if (d.reached_negotiate) negotiate_won += 1; }
        if (d.is_closed_lost){ closed_lost+= 1; lost_arr+= arr; if (d.reached_negotiate) negotiate_lost += 1; }
        if (d.reached_negotiate) reached_negotiate += 1;
      }
      const total_closed = closed_won + closed_lost;
      const neg = negotiate_won + negotiate_lost;
      return {
        closed_won, closed_lost, won_arr, lost_arr,
        reached_negotiate, negotiate_won, negotiate_lost,
        total_closed,
        overall_win_rate:   total_closed > 0 ? closed_won       / total_closed : null,
        technical_win_rate: total_closed > 0 ? reached_negotiate / total_closed : null,
        negotiate_win_rate: neg          > 0 ? negotiate_won    / neg           : null,
      };
    }

    const filteredSe = seList.map(s => {
      const deals = s.deals.filter(d => qInRange(dealMonth(d), quarter));
      return { ...s, ...make(deals), deals };
    }).filter(s => s.total_closed > 0)
      .sort((a, b) => b.total_closed - a.total_closed);

    const allDeals = filteredSe.flatMap(s => s.deals);
    return { overall: make(allDeals), by_se: filteredSe };
  }

  const view = useMemo(() => {
    if (!data) return null;
    return recompute(data.by_se);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, quarter]);

  function toggleExpand(key: number | string) {
    setExpandedSe(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (loading || !view) return <Loading />;

  return (
    <div className="flex flex-col gap-6">
      {/* Work-in-progress banner — see issue for follow-up. */}
      <div className="flex items-start gap-3 rounded-2xl border border-status-warning/40 bg-amber-50 px-4 py-3">
        <svg className="w-5 h-5 text-status-warning flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-semibold text-brand-navy">Work in progress</p>
          <p className="text-xs text-brand-navy-70 mt-0.5">
            This report is still being validated — the numbers may not yet be fully accurate. We'll revisit methodology (territory attribution, partial-quarter handling, and the "reached Negotiate" definition) in a follow-up pass.
          </p>
        </div>
      </div>

      <div className="flex items-end gap-4 flex-wrap">
        <PageHeader
          title="Win Rate"
          subtitle="Technical wins (reached Negotiate) and commercial close rate, per SE"
        />
        <div className="ml-auto flex items-center gap-2 mb-6 flex-wrap">
          {fiscalYears.length > 0 && (
            <select
              value={fiscalYear ?? ''}
              onChange={e => setFiscalYear(e.target.value || null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-brand-navy-30 text-brand-navy"
            >
              {fiscalYears.map(fy => <option key={fy} value={fy}>{fy}</option>)}
            </select>
          )}
          <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
            {(['ALL', 'Q1', 'Q2', 'Q3', 'Q4'] as QuarterFilter[]).map(q => (
              <button
                key={q}
                onClick={() => setQuarter(q)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  quarter === q ? 'bg-white text-brand-navy shadow-sm' : 'text-brand-navy-70 hover:text-brand-navy'
                }`}
              >
                {q === 'ALL' ? 'All' : q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard
          label="Deals Closed"
          value={String(view.overall.total_closed)}
          sub={`${view.overall.closed_won} won · ${view.overall.closed_lost} lost`}
        />
        <StatCard
          label="Overall Win Rate"
          value={formatPct(view.overall.overall_win_rate)}
          sub="Won / (Won + Lost)"
          valueColor={ragForWinRate(view.overall.overall_win_rate)}
        />
        <StatCard
          label="Technical Win Rate"
          value={formatPct(view.overall.technical_win_rate)}
          sub={`${view.overall.reached_negotiate} reached Negotiate`}
          valueColor={ragForWinRate(view.overall.technical_win_rate)}
        />
        <StatCard
          label="Negotiate Win Rate"
          value={formatPct(view.overall.negotiate_win_rate)}
          sub={`${view.overall.negotiate_won}/${view.overall.negotiate_won + view.overall.negotiate_lost} negotiating deals`}
          valueColor={ragForWinRate(view.overall.negotiate_win_rate)}
        />
        <StatCard
          label="ARR Won"
          value={formatARR(String(view.overall.won_arr))}
          sub={`Lost: ${formatARR(String(view.overall.lost_arr))}`}
          valueColor="text-status-success"
        />
      </div>

      {/* Per-SE table */}
      <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-navy-30/40">
          <h2 className="text-sm font-semibold text-brand-navy">By SE</h2>
          <p className="text-[11px] text-brand-navy-70 font-light mt-0.5">
            Click a row to expand the underlying deals.
          </p>
        </div>

        {view.by_se.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-brand-navy-70">No closed deals for this period.</div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">SE</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Closed</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Won</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Lost</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Overall WR</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide" title="Share of closed deals that reached Negotiate">Technical WR</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide" title="Among deals that reached Negotiate, share that Closed Won">Negotiate WR</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">ARR Won</th>
              </tr>
            </thead>
            <tbody>
              {view.by_se.map(s => {
                const key = s.se_id ?? 'unassigned';
                const isExpanded = expandedSe.has(key);
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => toggleExpand(key)}
                      className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-brand-navy">
                        <span className="inline-flex items-center gap-2">
                          <svg className={`w-3 h-3 text-brand-navy-30 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          {s.se_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-brand-navy">{s.total_closed}</td>
                      <td className="px-4 py-3 text-sm text-right text-status-success">{s.closed_won}</td>
                      <td className="px-4 py-3 text-sm text-right text-status-overdue">{s.closed_lost}</td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${ragForWinRate(s.overall_win_rate)}`}>{formatPct(s.overall_win_rate)}</td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${ragForWinRate(s.technical_win_rate)}`}>
                        {formatPct(s.technical_win_rate)}
                        <span className="block text-[10px] text-brand-navy-70 font-normal">{s.reached_negotiate}/{s.total_closed}</span>
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${ragForWinRate(s.negotiate_win_rate)}`}>
                        {formatPct(s.negotiate_win_rate)}
                        <span className="block text-[10px] text-brand-navy-70 font-normal">{s.negotiate_won}/{s.negotiate_won + s.negotiate_lost}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-brand-navy">{formatARR(String(s.won_arr))}</td>
                    </tr>
                    {isExpanded && s.deals.length > 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-2 bg-gray-50/60">
                          <table className="w-full">
                            <tbody>
                              {s.deals.map(d => (
                                <tr key={d.id} className="border-b border-brand-navy-30/20 last:border-0">
                                  <td className="px-2 py-1.5 text-sm text-brand-navy">
                                    <button onClick={e => { e.stopPropagation(); setSelectedOppId(d.id); }} className="text-left font-medium hover:text-brand-purple hover:underline">
                                      {d.name}
                                    </button>
                                    {d.account_name && <span className="ml-2 text-[11px] text-brand-navy-70">{d.account_name}</span>}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-xs">
                                    {d.is_closed_won ? (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-status-success text-[10px] font-semibold uppercase tracking-wide">Won</span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded bg-red-50 text-status-overdue text-[10px] font-semibold uppercase tracking-wide">Lost</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-xs">
                                    {d.reached_negotiate ? (
                                      <span className="px-1.5 py-0.5 rounded bg-brand-purple-30 text-brand-navy text-[10px] font-medium">Reached Negotiate</span>
                                    ) : (
                                      <span className="text-brand-navy-30 text-[10px]">Did not reach Negotiate</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-sm text-brand-navy">{formatARR(d.arr_converted)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={selectedOppId !== null} onClose={() => setSelectedOppId(null)}>
        {selectedOppId !== null && <OpportunityDetail key={selectedOppId} oppId={selectedOppId} />}
      </Drawer>
    </div>
  );
}
