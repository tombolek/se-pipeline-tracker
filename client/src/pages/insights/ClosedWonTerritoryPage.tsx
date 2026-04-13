/**
 * Closed Won by Territory (Issue #94)
 *
 * Manager-only report for SE bonus calculation.
 * Aggregates Closed Won ARR (USD, arr_converted) by team → SE, filterable by
 * fiscal year and quarter. New business only (New Logo + Upsell + Cross-Sell).
 */
import { Fragment, useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { formatARR, formatDate } from '../../utils/formatters';
import { PageHeader, Empty, Loading } from './shared';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useOppUrlSync } from '../../hooks/useOppUrlSync';

interface WonDeal {
  id: number;
  sf_opportunity_id: string;
  name: string;
  account_name: string | null;
  team: string | null;
  record_type: string | null;
  arr: string | null;
  arr_converted: string | null;
  arr_currency: string | null;
  fiscal_year: string | null;
  fiscal_period: string | null;
  close_date: string | null;
  closed_at: string | null;
  ae_owner_name: string | null;
  se_owner_id: number | null;
  se_owner_name: string | null;
}

interface Meta {
  fiscal_years?: string[];
}

const NO_TEAM = '(No team)';
const UNASSIGNED = '(Unassigned)';

function parseArr(s: string | null): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Extract "Q1" / "Q2" / "Q3" / "Q4" from a fiscal_period string like "FY2026-Q1" or "2026-Q1". */
function quarterOf(fp: string | null): 'Q1' | 'Q2' | 'Q3' | 'Q4' | null {
  if (!fp) return null;
  const m = fp.match(/Q([1-4])/i);
  if (!m) return null;
  return ('Q' + m[1]) as 'Q1' | 'Q2' | 'Q3' | 'Q4';
}

type QuarterFilter = 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

export default function ClosedWonTerritoryPage() {
  const [allRows, setAllRows] = useState<WonDeal[]>([]);
  const [fiscalYears, setFiscalYears] = useState<string[]>([]);
  const [fiscalYear, setFiscalYear] = useState<string | null>(null);
  const [quarter, setQuarter] = useState<QuarterFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);

  const oppRefsForUrlSync = useMemo(
    () => allRows.map(r => ({ id: r.id, sf_opportunity_id: r.sf_opportunity_id })),
    [allRows]
  );
  useOppUrlSync(selectedOppId, setSelectedOppId, oppRefsForUrlSync);

  // First load — fetch with no FY filter so we can learn the FY list, then lock to most recent
  useEffect(() => {
    setLoading(true);
    const params = fiscalYear ? `?fiscal_year=${encodeURIComponent(fiscalYear)}` : '';
    api.get<ApiResponse<WonDeal[]> & { meta?: Meta }>(`/insights/closed-won-by-territory${params}`)
      .then(r => {
        setAllRows(r.data.data);
        const years = r.data.meta?.fiscal_years ?? [];
        setFiscalYears(years);
        if (fiscalYear === null && years.length > 0) {
          setFiscalYear(years[0]); // most recent (API sorts DESC)
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear]);

  // Quarter filter is client-side (cheap) so switching feels instant
  const rows = useMemo(() => {
    if (quarter === 'ALL') return allRows;
    return allRows.filter(r => quarterOf(r.fiscal_period) === quarter);
  }, [allRows, quarter]);

  // ── Aggregate: Team → SE → deals ───────────────────────────────────────────
  type SeGroup = { seOwnerId: number | null; seOwnerName: string; deals: WonDeal[]; arrTotal: number };
  type TeamGroup = { team: string; seGroups: SeGroup[]; dealCount: number; arrTotal: number };

  const { teamGroups, grandDealCount, grandArr, uniqueSes } = useMemo(() => {
    const byTeam = new Map<string, Map<string, SeGroup>>();
    for (const d of rows) {
      const t = d.team ?? NO_TEAM;
      const seName = d.se_owner_name ?? UNASSIGNED;
      const seKey = `${d.se_owner_id ?? 'unassigned'}|${seName}`;
      let teamMap = byTeam.get(t);
      if (!teamMap) { teamMap = new Map(); byTeam.set(t, teamMap); }
      let se = teamMap.get(seKey);
      if (!se) {
        se = { seOwnerId: d.se_owner_id, seOwnerName: seName, deals: [], arrTotal: 0 };
        teamMap.set(seKey, se);
      }
      se.deals.push(d);
      se.arrTotal += parseArr(d.arr_converted);
    }

    const teamGroups: TeamGroup[] = [];
    for (const [team, seMap] of byTeam) {
      const seGroups = Array.from(seMap.values()).sort((a, b) => b.arrTotal - a.arrTotal);
      const arrTotal = seGroups.reduce((s, g) => s + g.arrTotal, 0);
      const dealCount = seGroups.reduce((s, g) => s + g.deals.length, 0);
      teamGroups.push({ team, seGroups, arrTotal, dealCount });
    }
    teamGroups.sort((a, b) => b.arrTotal - a.arrTotal);

    const grandArr = teamGroups.reduce((s, t) => s + t.arrTotal, 0);
    const grandDealCount = teamGroups.reduce((s, t) => s + t.dealCount, 0);
    const uniqueSes = new Set(rows.map(r => r.se_owner_id ?? -1)).size;

    return { teamGroups, grandArr, grandDealCount, uniqueSes };
  }, [rows]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const quarterBtn = (q: QuarterFilter, label: string) => (
    <button
      key={q}
      onClick={() => setQuarter(q)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        quarter === q
          ? 'bg-brand-purple text-white border-brand-purple'
          : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <PageHeader
          title="Closed Won by Territory"
          subtitle="Closed Won ARR (USD) by team and SE — new business only. For bonus calculation."
        />
        <div className="ml-auto flex items-center gap-3">
          {fiscalYears.length > 0 && (
            <select
              value={fiscalYear ?? ''}
              onChange={e => setFiscalYear(e.target.value || null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-brand-navy-30 text-brand-navy bg-white hover:border-brand-navy focus:outline-none focus:border-brand-purple"
            >
              {fiscalYears.map(fy => (
                <option key={fy} value={fy}>{fy}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            {quarterBtn('ALL', 'All YTD')}
            {quarterBtn('Q1', 'Q1')}
            {quarterBtn('Q2', 'Q2')}
            {quarterBtn('Q3', 'Q3')}
            {quarterBtn('Q4', 'Q4')}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard label="Total ARR (USD)" value={formatARR(grandArr)} />
        <StatCard label="Deals" value={String(grandDealCount)} />
        <StatCard label="Unique SEs" value={String(uniqueSes)} />
      </div>

      {loading ? <Loading /> : teamGroups.length === 0 ? <Empty /> : (
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40 bg-gray-50/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide w-[40%]">Team / SE</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Deals</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">ARR (USD)</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {teamGroups.map(tg => (
                <Fragment key={`team-wrap-${tg.team}`}>
                  {/* Team header row */}
                  <tr className="bg-brand-purple-30/30 border-t border-brand-navy-30/40">
                    <td className="px-4 py-2 text-sm font-semibold text-brand-navy">{tg.team}</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-brand-navy">{tg.dealCount}</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-brand-navy">{formatARR(tg.arrTotal)}</td>
                    <td className="px-4 py-2" />
                  </tr>
                  {tg.seGroups.map(se => {
                    const key = `${tg.team}::${se.seOwnerId ?? 'u'}::${se.seOwnerName}`;
                    const isExpanded = expanded.has(key);
                    return (
                      <Fragment key={key}>
                        <tr className="border-b border-brand-navy-30/20 hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(key)}>
                          <td className="px-4 py-2.5 pl-8 text-sm text-brand-navy">
                            <div className="flex items-center gap-2">
                              <svg
                                className={`w-3 h-3 text-brand-navy-70 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              {se.seOwnerName === UNASSIGNED
                                ? <span className="text-status-warning">{UNASSIGNED}</span>
                                : se.seOwnerName}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm text-brand-navy">{se.deals.length}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-brand-navy">{formatARR(se.arrTotal)}</td>
                          <td className="px-4 py-2.5" />
                        </tr>
                        {isExpanded && se.deals.map(d => (
                          <tr
                            key={`deal-${d.id}`}
                            className="border-b border-brand-navy-30/10 bg-gray-50/50 hover:bg-gray-100 cursor-pointer"
                            onClick={() => setSelectedOppId(d.id)}
                          >
                            <td className="px-4 py-2 pl-16 text-xs">
                              <p className="text-brand-navy font-medium">{d.name}</p>
                              <p className="text-brand-navy-70">{d.account_name ?? '—'} · {d.record_type ?? '—'} · {d.fiscal_period ?? '—'}</p>
                            </td>
                            <td className="px-4 py-2 text-right text-xs text-brand-navy-70">1</td>
                            <td className="px-4 py-2 text-right text-xs text-brand-navy">{formatARR(d.arr_converted)}</td>
                            <td className="px-4 py-2 text-right text-xs text-brand-navy-70 pr-4">{formatDate(d.closed_at ?? d.close_date)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
              {/* Grand total */}
              <tr className="bg-brand-navy/5 border-t-2 border-brand-navy/20">
                <td className="px-4 py-3 text-sm font-bold text-brand-navy uppercase tracking-wide">Grand Total</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-brand-navy">{grandDealCount}</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-brand-navy">{formatARR(grandArr)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={selectedOppId !== null} onClose={() => setSelectedOppId(null)}>
        {selectedOppId !== null && <OpportunityDetail key={selectedOppId} oppId={selectedOppId} />}
      </Drawer>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy-70 mb-1">{label}</p>
      <p className="text-2xl font-bold text-brand-navy">{value}</p>
    </div>
  );
}
