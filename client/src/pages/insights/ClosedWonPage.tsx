/**
 * Closed Won (Issue #94)
 *
 * Manager-only report for SE bonus calculation.
 * Aggregates Closed Won ARR (USD, arr_converted), filterable by fiscal year
 * and quarter. Two views: "By Territory" (Team → SE) and "By SE"
 * (SE → Team breakdown). New business only (New Logo + Upsell + Cross-Sell).
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

/** Extract "Q1" / "Q2" / "Q3" / "Q4" from a fiscal_period like "FY2026-Q1". */
function quarterOf(fp: string | null): 'Q1' | 'Q2' | 'Q3' | 'Q4' | null {
  if (!fp) return null;
  const m = fp.match(/Q([1-4])/i);
  if (!m) return null;
  return ('Q' + m[1]) as 'Q1' | 'Q2' | 'Q3' | 'Q4';
}

type QuarterFilter = 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
type ViewMode = 'territory' | 'se';

export default function ClosedWonPage() {
  const [allRows, setAllRows] = useState<WonDeal[]>([]);
  const [fiscalYears, setFiscalYears] = useState<string[]>([]);
  const [fiscalYear, setFiscalYear] = useState<string | null>(null);
  const [quarter, setQuarter] = useState<QuarterFilter>('ALL');
  const [view, setView] = useState<ViewMode>('se');
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

  // Collapse expansions when view/filter changes so stale keys don't leak between groupings
  useEffect(() => { setExpanded(new Set()); }, [view, quarter, fiscalYear]);

  // Quarter filter is client-side (cheap)
  const rows = useMemo(() => {
    if (quarter === 'ALL') return allRows;
    return allRows.filter(r => quarterOf(r.fiscal_period) === quarter);
  }, [allRows, quarter]);

  // ── Headline totals (same for both views) ──────────────────────────────────
  const { grandArr, grandDealCount, uniqueSes } = useMemo(() => {
    const grandArr = rows.reduce((s, r) => s + parseArr(r.arr_converted), 0);
    const uniqueSes = new Set(rows.map(r => r.se_owner_id ?? -1)).size;
    return { grandArr, grandDealCount: rows.length, uniqueSes };
  }, [rows]);

  // ── By Territory: Team → SE → deals ────────────────────────────────────────
  type LeafGroup = {
    label: string;
    isUnassigned?: boolean;
    deals: WonDeal[];
    arrTotal: number;
  };
  type ParentGroup = {
    label: string;
    leafGroups: LeafGroup[];
    dealCount: number;
    arrTotal: number;
    isUnassigned?: boolean;
  };

  const territoryGroups = useMemo<ParentGroup[]>(() => {
    const byTeam = new Map<string, Map<string, LeafGroup>>();
    for (const d of rows) {
      const team = d.team ?? NO_TEAM;
      const seName = d.se_owner_name ?? UNASSIGNED;
      const seKey = `${d.se_owner_id ?? 'unassigned'}|${seName}`;
      let teamMap = byTeam.get(team);
      if (!teamMap) { teamMap = new Map(); byTeam.set(team, teamMap); }
      let se = teamMap.get(seKey);
      if (!se) {
        se = { label: seName, deals: [], arrTotal: 0, isUnassigned: d.se_owner_id === null };
        teamMap.set(seKey, se);
      }
      se.deals.push(d);
      se.arrTotal += parseArr(d.arr_converted);
    }
    const groups: ParentGroup[] = [];
    for (const [team, seMap] of byTeam) {
      const leafGroups = Array.from(seMap.values()).sort((a, b) => b.arrTotal - a.arrTotal);
      const arrTotal = leafGroups.reduce((s, g) => s + g.arrTotal, 0);
      const dealCount = leafGroups.reduce((s, g) => s + g.deals.length, 0);
      groups.push({ label: team, leafGroups, arrTotal, dealCount, isUnassigned: team === NO_TEAM });
    }
    return groups.sort((a, b) => b.arrTotal - a.arrTotal);
  }, [rows]);

  // ── By SE: SE → Team → deals (SE totals are GLOBAL across territories) ─────
  const seGroups = useMemo<ParentGroup[]>(() => {
    const bySe = new Map<string, Map<string, LeafGroup>>();
    for (const d of rows) {
      const seName = d.se_owner_name ?? UNASSIGNED;
      const seKey = `${d.se_owner_id ?? 'unassigned'}|${seName}`;
      const team = d.team ?? NO_TEAM;
      let seMap = bySe.get(seKey);
      if (!seMap) { seMap = new Map(); bySe.set(seKey, seMap); }
      let teamLeaf = seMap.get(team);
      if (!teamLeaf) {
        teamLeaf = { label: team, deals: [], arrTotal: 0, isUnassigned: team === NO_TEAM };
        seMap.set(team, teamLeaf);
      }
      teamLeaf.deals.push(d);
      teamLeaf.arrTotal += parseArr(d.arr_converted);
    }
    const groups: ParentGroup[] = [];
    for (const [seKey, teamMap] of bySe) {
      const label = seKey.split('|').slice(1).join('|') || UNASSIGNED;
      const leafGroups = Array.from(teamMap.values()).sort((a, b) => b.arrTotal - a.arrTotal);
      const arrTotal = leafGroups.reduce((s, g) => s + g.arrTotal, 0);
      const dealCount = leafGroups.reduce((s, g) => s + g.deals.length, 0);
      groups.push({ label, leafGroups, arrTotal, dealCount, isUnassigned: label === UNASSIGNED });
    }
    return groups.sort((a, b) => b.arrTotal - a.arrTotal);
  }, [rows]);

  const parentGroups = view === 'territory' ? territoryGroups : seGroups;
  const parentHeaderLabel = view === 'territory' ? 'Team / SE' : 'SE / Team';

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const pillBtn = <T extends string>(
    current: T, value: T, onClick: (v: T) => void, label: string
  ) => (
    <button
      key={value}
      onClick={() => onClick(value)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        current === value
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
          title="Closed Won"
          subtitle="Closed Won ARR (USD) — new business only. For bonus calculation."
        />
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center gap-2">
            {pillBtn(view, 'territory', setView, 'By Territory')}
            {pillBtn(view, 'se', setView, 'By SE')}
          </div>
          <div className="h-5 w-px bg-brand-navy-30" />
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
            {pillBtn(quarter, 'ALL', setQuarter, 'All YTD')}
            {pillBtn(quarter, 'Q1', setQuarter, 'Q1')}
            {pillBtn(quarter, 'Q2', setQuarter, 'Q2')}
            {pillBtn(quarter, 'Q3', setQuarter, 'Q3')}
            {pillBtn(quarter, 'Q4', setQuarter, 'Q4')}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard label="Total ARR (USD)" value={formatARR(grandArr)} />
        <StatCard label="Deals" value={String(grandDealCount)} />
        <StatCard label="Unique SEs" value={String(uniqueSes)} />
      </div>

      {loading ? <Loading /> : parentGroups.length === 0 ? <Empty /> : (
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40 bg-gray-50/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide w-[40%]">{parentHeaderLabel}</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Deals</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">ARR (USD)</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {parentGroups.map((pg, pIdx) => (
                <Fragment key={`parent-${view}-${pIdx}-${pg.label}`}>
                  {/* Parent header row */}
                  <tr className="bg-brand-purple-30/30 border-t border-brand-navy-30/40">
                    <td className="px-4 py-2 text-sm font-semibold text-brand-navy">
                      {pg.isUnassigned
                        ? <span className="text-status-warning">{pg.label}</span>
                        : pg.label}
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-brand-navy">{pg.dealCount}</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-brand-navy">{formatARR(pg.arrTotal)}</td>
                    <td className="px-4 py-2" />
                  </tr>
                  {pg.leafGroups.map((lg, lIdx) => {
                    const key = `${view}::${pIdx}::${lIdx}::${lg.label}`;
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
                              {lg.isUnassigned
                                ? <span className="text-status-warning">{lg.label}</span>
                                : lg.label}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm text-brand-navy">{lg.deals.length}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-brand-navy">{formatARR(lg.arrTotal)}</td>
                          <td className="px-4 py-2.5" />
                        </tr>
                        {isExpanded && lg.deals.map(d => (
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
