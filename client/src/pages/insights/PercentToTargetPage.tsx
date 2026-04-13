/**
 * % to Target (Issue #94)
 *
 * Manager-only report showing Closed Won progress against quota targets.
 * Quotas are configured in Settings → Quotas. Each group can be:
 *   - global: all Closed Won counts
 *   - teams: deals where opportunity.team is in the group's list
 *   - ae_owners: deals where opportunity.ae_owner_name is in the group's list
 *
 * The page shows: a donut + sparkline per group, a combined month-over-month
 * pacing chart, and a breakdown table. Same record-type filter as the Closed
 * Won page (New Logo + Upsell + Cross-Sell).
 */
import { Fragment, useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { formatARR } from '../../utils/formatters';
import { Loading } from './shared';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useOppUrlSync } from '../../hooks/useOppUrlSync';
import type { QuotaRuleType } from '../../api/settings';

interface GroupDeal {
  id: number;
  sf_opportunity_id: string;
  name: string;
  account_name: string | null;
  team: string | null;
  ae_owner_name: string | null;
  se_owner_name: string | null;
  record_type: string | null;
  arr_converted: string | null;
  fiscal_period: string | null;
  close_date: string | null;
  closed_at: string | null;
}

interface GroupResult {
  id: number;
  name: string;
  rule_type: QuotaRuleType;
  rule_value: string[];
  target_amount: number;
  sort_order: number;
  total_arr: number;
  deal_count: number;
  pct: number;
  monthly_cumulative_arr: number[]; // length 12
  monthly_cumulative_pct: number[]; // length 12
  deals: GroupDeal[];
}

interface PercentToTargetMeta {
  fiscal_years?: string[];
  fiscal_year?: string | null;
  today?: string;
  current_month_index?: number;
}

type Quarter = 'YTD' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

const MONTH_LETTERS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Distinct, identifiable colors for the 4-line comparison chart (reused on cards too)
const GROUP_COLORS = ['#1A0C42', '#6A2CF5', '#F10090', '#00E5B6', '#FFAB00', '#00DDFF'];

function quarterEndIndex(q: Quarter, currentMonthIdx: number): number {
  switch (q) {
    case 'Q1': return 2;
    case 'Q2': return 5;
    case 'Q3': return 8;
    case 'Q4': return 11;
    case 'YTD': default: return currentMonthIdx;
  }
}

function ragColor(pct: number, asOfMonthIdx: number): string {
  // Compare to the linear pace at this month: pace = (asOfMonthIdx + 1) / 12 * 100
  const pace = ((asOfMonthIdx + 1) / 12) * 100;
  if (pct >= pace) return '#00E5B6';        // success — at or ahead of pace
  if (pct >= pace * 0.75) return '#FFAB00'; // warning — within 25% of pace
  return '#FF464C';                          // overdue — behind by >25%
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy-70 mb-1">{label}</p>
      <p className="text-2xl font-bold text-brand-navy">{value}</p>
      {sub && <p className="text-[11px] text-brand-navy-70 mt-0.5">{sub}</p>}
    </div>
  );
}

function pillBtn<T extends string>(current: T, value: T, onClick: (v: T) => void, label: string) {
  return (
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
}

/** Compact 12-month sparkline. Solid line through asOfMonthIdx (inclusive). */
function Sparkline({ pctSeries, asOfMonthIdx, color }: { pctSeries: number[]; asOfMonthIdx: number; color: string }) {
  // viewBox 240 x 60; x = 10 + m*20, y = 50 - pct*0.45
  const xs = (m: number) => 10 + m * 20;
  const ys = (p: number) => 50 - Math.max(0, Math.min(150, p)) * 0.45;
  const pts: string[] = [];
  for (let m = 0; m <= asOfMonthIdx; m++) pts.push(`${xs(m)},${ys(pctSeries[m] ?? 0)}`);
  const linePts = pts.join(' ');
  const areaPts = pts.length > 0 ? `${xs(0)},50 ${linePts} ${xs(asOfMonthIdx)},50` : '';
  const lastX = xs(asOfMonthIdx);
  const lastY = ys(pctSeries[asOfMonthIdx] ?? 0);

  return (
    <svg viewBox="0 0 240 60" preserveAspectRatio="none" className="w-full h-14 mt-2">
      <line x1="10" y1="50" x2="230" y2="50" stroke="#CCC9D5" strokeWidth="1" opacity="0.5"/>
      {/* Linear FY pace reference */}
      <line x1="10" y1="50" x2="230" y2="5" stroke="#665D81" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" fill="none"/>
      {pts.length > 0 && (
        <>
          <polygon points={areaPts} fill={color} opacity="0.15"/>
          <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
          <circle cx={lastX} cy={lastY} r="3" fill={color} stroke="white" strokeWidth="2"/>
        </>
      )}
      {MONTH_LETTERS.map((l, m) => (
        <text
          key={m}
          x={xs(m)}
          y="58"
          textAnchor="middle"
          fontSize="8"
          fill={m === asOfMonthIdx ? '#1A0C42' : '#665D81'}
          fontWeight={m === asOfMonthIdx ? 700 : 400}
        >{l}</text>
      ))}
    </svg>
  );
}

/** Donut chart showing % to target. */
function Donut({ pct, color }: { pct: number; color: string }) {
  const C = 2 * Math.PI * 56; // ≈ 351.86
  const dash = Math.min(pct, 100) / 100 * C;
  return (
    <svg viewBox="0 0 140 140" className="w-32 h-32">
      <circle cx="70" cy="70" r="56" fill="none" stroke="#CCC9D5" strokeWidth="16" opacity="0.4"/>
      <circle
        cx="70" cy="70" r="56" fill="none" stroke={color} strokeWidth="16"
        strokeDasharray={`${dash} ${C}`}
        strokeLinecap="round"
        transform="rotate(-90 70 70)"
      />
    </svg>
  );
}

function GroupCard({ group, asOfMonthIdx, onViewDeals }: {
  group: GroupResult;
  asOfMonthIdx: number;
  onViewDeals: (g: GroupResult) => void;
}) {
  const pctAtAsOf = group.monthly_cumulative_pct[asOfMonthIdx] ?? 0;
  const arrAtAsOf = group.monthly_cumulative_arr[asOfMonthIdx] ?? 0;
  const color = ragColor(pctAtAsOf, asOfMonthIdx);
  const monthlyForLabel = group.monthly_cumulative_pct
    .slice(0, asOfMonthIdx + 1)
    .map((p, m) => m === asOfMonthIdx ? `${Math.round(p)}%` : `${Math.round(p)}`)
    .join(' → ');

  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-navy truncate">{group.name}</p>
          <RuleChip group={group} />
        </div>
        <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color }}>{Math.round(pctAtAsOf)}%</span>
      </div>
      <div className="relative flex items-center justify-center py-2">
        <Donut pct={pctAtAsOf} color={color} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[11px] font-medium text-brand-navy-70">Closed</p>
          <p className="text-xl font-bold text-brand-navy leading-tight">{formatARR(arrAtAsOf)}</p>
          <p className="text-[10px] text-brand-navy-70">of {formatARR(group.target_amount)}</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-[10px] text-brand-navy-70 font-medium">
          <span>% to target — month over month</span>
          <span className="truncate ml-2 text-right">{monthlyForLabel}</span>
        </div>
        <Sparkline pctSeries={group.monthly_cumulative_pct} asOfMonthIdx={asOfMonthIdx} color={color} />
      </div>
      <div className="mt-2 pt-3 border-t border-brand-navy-30/40 flex items-center justify-between text-xs">
        <span className="text-brand-navy-70">{group.deal_count} deal{group.deal_count === 1 ? '' : 's'}</span>
        <button onClick={() => onViewDeals(group)} className="text-brand-purple font-medium hover:underline">View deals →</button>
      </div>
    </div>
  );
}

function RuleChip({ group }: { group: { rule_type: QuotaRuleType; rule_value: string[] } }) {
  if (group.rule_type === 'global') {
    return <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-navy-30/60 text-brand-navy">All Closed Won</span>;
  }
  if (group.rule_type === 'teams') {
    return <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-purple-30 text-brand-navy max-w-full truncate">Teams: {group.rule_value.join(', ')}</span>;
  }
  return <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-pink-30 text-[#33012A] max-w-full truncate">AE: {group.rule_value.join(', ')}</span>;
}

/** Combined month-over-month line chart. */
function ComparisonChart({ groups, asOfMonthIdx }: { groups: GroupResult[]; asOfMonthIdx: number }) {
  // viewBox 800 x 240; plot area x[50..754], y[20..210]
  const xs = (m: number) => 50 + m * 64;
  const ys = (p: number) => 210 - Math.max(0, Math.min(120, p)) * 1.9;
  const yGrid = [0, 25, 50, 75, 100];

  return (
    <svg viewBox="0 0 820 240" preserveAspectRatio="xMidYMid meet" className="w-full">
      {/* Y gridlines + labels */}
      {yGrid.map(p => (
        <Fragment key={p}>
          <line x1="50" y1={ys(p)} x2="770" y2={ys(p)} stroke="#CCC9D5" strokeWidth="1" opacity="0.4"/>
          <text x="42" y={ys(p) + 3} textAnchor="end" fontSize="10" fill="#665D81" fontWeight="500">{p}%</text>
        </Fragment>
      ))}
      {/* X month labels */}
      {MONTH_NAMES.map((n, m) => (
        <text
          key={m}
          x={xs(m)} y="228" textAnchor="middle" fontSize="10"
          fill={m === asOfMonthIdx ? '#1A0C42' : '#665D81'}
          fontWeight={m === asOfMonthIdx ? 700 : 500}
        >{n}{m === asOfMonthIdx ? '*' : ''}</text>
      ))}
      {/* Pace reference */}
      <line x1={xs(0)} y1={ys(0)} x2={xs(11)} y2={ys(100)} stroke="#665D81" strokeWidth="1.5" strokeDasharray="5 4" fill="none"/>
      {/* "as-of" vertical marker */}
      <line x1={xs(asOfMonthIdx)} y1="20" x2={xs(asOfMonthIdx)} y2="210" stroke="#665D81" strokeWidth="1" strokeDasharray="2 3" opacity="0.4"/>
      <text x={xs(asOfMonthIdx)} y="14" textAnchor="middle" fontSize="9" fill="#665D81">as of</text>

      {/* Group lines */}
      {groups.map((g, gi) => {
        const color = GROUP_COLORS[gi % GROUP_COLORS.length];
        const pts: string[] = [];
        for (let m = 0; m <= asOfMonthIdx; m++) {
          pts.push(`${xs(m)},${ys(g.monthly_cumulative_pct[m] ?? 0)}`);
        }
        const lastX = xs(asOfMonthIdx);
        const lastY = ys(g.monthly_cumulative_pct[asOfMonthIdx] ?? 0);
        return (
          <Fragment key={g.id}>
            <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
            {pts.map((p, m) => {
              const [x, y] = p.split(',').map(Number);
              return <circle key={m} cx={x} cy={y} r={m === asOfMonthIdx ? 4 : 3.5} fill={color} stroke="white" strokeWidth="2"/>;
            })}
            <text x={lastX + 8} y={lastY + 3} fontSize="10" fontWeight="700" fill={color}>{Math.round(g.monthly_cumulative_pct[asOfMonthIdx] ?? 0)}%</text>
          </Fragment>
        );
      })}
    </svg>
  );
}

export default function PercentToTargetPage() {
  const [groups, setGroups] = useState<GroupResult[]>([]);
  const [meta, setMeta] = useState<PercentToTargetMeta>({});
  const [fiscalYears, setFiscalYears] = useState<string[]>([]);
  const [fiscalYear, setFiscalYear] = useState<string | null>(null);
  const [quarter, setQuarter] = useState<Quarter>('YTD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);
  const [drillGroup, setDrillGroup] = useState<GroupResult | null>(null);

  // For URL sync: build flat list of {id, sf_opportunity_id} from all groups
  const allDeals = useMemo(() => {
    const seen = new Set<number>();
    const out: { id: number; sf_opportunity_id: string }[] = [];
    for (const g of groups) {
      for (const d of g.deals) {
        if (!seen.has(d.id)) { seen.add(d.id); out.push({ id: d.id, sf_opportunity_id: d.sf_opportunity_id }); }
      }
    }
    return out;
  }, [groups]);
  useOppUrlSync(selectedOppId, setSelectedOppId, allDeals);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = fiscalYear ? `?fiscal_year=${encodeURIComponent(fiscalYear)}` : '';
    api.get<ApiResponse<{ groups: GroupResult[] }> & { meta?: PercentToTargetMeta }>(`/insights/percent-to-target${params}`)
      .then(r => {
        setGroups(r.data.data.groups);
        const m = r.data.meta ?? {};
        setMeta(m);
        const years = m.fiscal_years ?? [];
        setFiscalYears(years);
        if (fiscalYear === null && years.length > 0) {
          setFiscalYear(years[0]);
        }
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear]);

  const currentMonthIdx = meta.current_month_index ?? new Date().getMonth();
  const asOfMonthIdx = quarterEndIndex(quarter, currentMonthIdx);

  // Aggregate headline (grand totals across groups would double-count if groups overlap;
  // instead use the Global group if present, else fall back to summing only the first group)
  const globalGroup = groups.find(g => g.rule_type === 'global');
  const headlineArr = globalGroup ? (globalGroup.monthly_cumulative_arr[asOfMonthIdx] ?? 0) : 0;
  const headlineTarget = globalGroup ? globalGroup.target_amount : 0;
  const headlinePct = globalGroup ? (globalGroup.monthly_cumulative_pct[asOfMonthIdx] ?? 0) : 0;
  const pacePct = ((asOfMonthIdx + 1) / 12) * 100;
  const paceArr = headlineTarget * (pacePct / 100);
  const paceGap = headlineArr - paceArr;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-brand-navy">% to Target</h1>
          <p className="text-sm text-brand-navy-70 mt-0.5">
            Closed Won progress toward quota targets — new business only. Configure groups in{' '}
            <a className="text-brand-purple underline" href="/settings/quotas">Settings → Quotas</a>.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {fiscalYears.length > 0 && (
            <select
              value={fiscalYear ?? ''}
              onChange={e => setFiscalYear(e.target.value || null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-brand-navy-30 text-brand-navy bg-white hover:border-brand-navy focus:outline-none focus:border-brand-purple"
            >
              {fiscalYears.map(fy => <option key={fy} value={fy}>{fy}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2">
            {pillBtn(quarter, 'YTD', setQuarter, 'All YTD')}
            {pillBtn(quarter, 'Q1', setQuarter, 'Q1')}
            {pillBtn(quarter, 'Q2', setQuarter, 'Q2')}
            {pillBtn(quarter, 'Q3', setQuarter, 'Q3')}
            {pillBtn(quarter, 'Q4', setQuarter, 'Q4')}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-status-overdue mb-3">{error}</p>}

      {/* Headline summary (only if a Global group exists) */}
      {globalGroup && (
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 px-6 py-4 mb-6 flex items-center gap-6 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy-70">Global progress</p>
            <p className="text-2xl font-bold text-brand-navy mt-0.5">{formatARR(headlineArr)} <span className="text-base font-medium text-brand-navy-70">/ {formatARR(headlineTarget)}</span></p>
            <p className="text-xs text-brand-navy-70 mt-1">
              {Math.round(headlinePct)}% to target ·
              {paceGap >= 0
                ? <span className="text-status-success font-semibold"> {formatARR(paceGap)} ahead of pace</span>
                : <span className="text-status-warning font-semibold"> {formatARR(Math.abs(paceGap))} behind pace</span>
              }
            </p>
          </div>
          <div className="flex-1 min-w-[400px]">
            <div className="h-3 w-full bg-brand-navy-30/40 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-brand-purple to-brand-pink rounded-full" style={{ width: `${Math.min(headlinePct, 100)}%` }}></div>
            </div>
            <div className="flex justify-between text-[10px] text-brand-navy-70 mt-1.5 font-medium">
              <span>$0</span>
              <span>Pace at as-of: {formatARR(paceArr)}</span>
              <span>Target: {formatARR(headlineTarget)}</span>
            </div>
          </div>
        </div>
      )}

      {loading ? <Loading /> : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 px-6 py-12 text-center">
          <p className="text-sm text-brand-navy-70">No quota groups configured yet.</p>
          <a href="/settings/quotas" className="inline-block mt-3 text-sm text-brand-purple font-medium hover:underline">Configure groups in Settings → Quotas →</a>
        </div>
      ) : (
        <>
          {/* Donut + sparkline cards */}
          <div className={`grid gap-4 mb-6 grid-cols-2 ${
            groups.length === 1 ? 'lg:grid-cols-1'
              : groups.length === 2 ? 'lg:grid-cols-2'
              : groups.length === 3 ? 'lg:grid-cols-3'
              : 'lg:grid-cols-4'
          }`}>
            {groups.map(g => (
              <GroupCard key={g.id} group={g} asOfMonthIdx={asOfMonthIdx} onViewDeals={setDrillGroup} />
            ))}
          </div>

          {/* Combined trend chart */}
          <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden mb-6">
            <div className="px-5 py-3.5 border-b border-brand-navy-30/40 flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-brand-navy">% to target — pacing by month</h2>
              <span className="text-xs text-brand-navy-70">Cumulative through end of each month. Dashed = linear FY pace.</span>
              <div className="ml-auto flex items-center gap-4 text-[11px] flex-wrap">
                {groups.map((g, gi) => (
                  <span key={g.id} className="text-brand-navy-70 inline-flex items-center">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: GROUP_COLORS[gi % GROUP_COLORS.length] }}></span>
                    {g.name}
                  </span>
                ))}
                <span className="text-brand-navy-70 inline-flex items-center">
                  <span className="inline-block w-2.5 h-2.5 mr-1.5" style={{ background: 'repeating-linear-gradient(90deg,#665D81 0 4px,transparent 4px 8px)' }}></span>
                  FY pace
                </span>
              </div>
            </div>
            <div className="p-5">
              <ComparisonChart groups={groups} asOfMonthIdx={asOfMonthIdx} />
              {meta.today && (
                <p className="text-[11px] text-brand-navy-70 mt-2">
                  As-of: {quarter === 'YTD' ? `today (${meta.today})` : `end of ${quarter}`}.
                  {asOfMonthIdx === currentMonthIdx && ' Current month is partial (month-to-date).'}
                </p>
              )}
            </div>
          </div>

          {/* Breakdown table */}
          <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-brand-navy-30/40 flex items-center gap-3">
              <h2 className="text-sm font-semibold text-brand-navy">Breakdown</h2>
              <span className="text-xs text-brand-navy-70">A single deal can count toward multiple groups.</span>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50/50 border-b border-brand-navy-30/40">
                <tr>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Group</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Rule</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Target</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Closed</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Gap</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Deals</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">%</th>
                  <th className="px-5 py-2.5 w-[20%]"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const arr = g.monthly_cumulative_arr[asOfMonthIdx] ?? 0;
                  const pct = g.monthly_cumulative_pct[asOfMonthIdx] ?? 0;
                  const gap = arr - g.target_amount;
                  const color = ragColor(pct, asOfMonthIdx);
                  return (
                    <tr key={g.id} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm font-semibold text-brand-navy">{g.name}</td>
                      <td className="px-5 py-3"><RuleChip group={g} /></td>
                      <td className="px-5 py-3 text-right text-sm text-brand-navy">{formatARR(g.target_amount)}</td>
                      <td className="px-5 py-3 text-right text-sm font-medium text-brand-navy">{formatARR(arr)}</td>
                      <td className="px-5 py-3 text-right text-sm font-medium" style={{ color }}>{gap >= 0 ? '+' : '−'}{formatARR(Math.abs(gap))}</td>
                      <td className="px-5 py-3 text-right text-sm text-brand-navy-70">{g.deal_count}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold" style={{ color }}>{Math.round(pct)}%</td>
                      <td className="px-5 py-3"><div className="h-1.5 bg-brand-navy-30/40 rounded"><div className="h-full rounded" style={{ width: `${Math.min(pct, 100)}%`, background: color }}></div></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Drill-down: list of deals counted toward a group */}
      {drillGroup && (
        <div className="fixed inset-0 z-40 bg-brand-navy/60 flex items-center justify-center p-4" onClick={() => setDrillGroup(null)}>
          <div className="bg-white rounded-2xl border border-brand-navy-30/40 shadow-xl max-w-[920px] w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-navy-30/40 flex items-center gap-3">
              <div>
                <h3 className="text-base font-semibold text-brand-navy">{drillGroup.name} — deals</h3>
                <p className="text-xs text-brand-navy-70 mt-0.5">{drillGroup.deal_count} deal{drillGroup.deal_count === 1 ? '' : 's'} · {formatARR(drillGroup.total_arr)} closed</p>
              </div>
              <button onClick={() => setDrillGroup(null)} className="ml-auto text-brand-navy-70 hover:text-brand-navy text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50/50 border-b border-brand-navy-30/40 sticky top-0">
                  <tr>
                    <th className="px-5 py-2 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Opportunity</th>
                    <th className="px-5 py-2 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Team</th>
                    <th className="px-5 py-2 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">AE</th>
                    <th className="px-5 py-2 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Period</th>
                    <th className="px-5 py-2 text-right text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">ARR (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {drillGroup.deals.map(d => (
                    <tr key={d.id} className="border-b border-brand-navy-30/20 hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedOppId(d.id); setDrillGroup(null); }}>
                      <td className="px-5 py-2.5 text-sm">
                        <p className="font-medium text-brand-navy">{d.name}</p>
                        <p className="text-xs text-brand-navy-70">{d.account_name ?? '—'} · {d.record_type ?? '—'}</p>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-brand-navy-70">{d.team ?? '—'}</td>
                      <td className="px-5 py-2.5 text-xs text-brand-navy-70">{d.ae_owner_name ?? '—'}</td>
                      <td className="px-5 py-2.5 text-xs text-brand-navy-70">{d.fiscal_period ?? '—'}</td>
                      <td className="px-5 py-2.5 text-right text-sm font-medium text-brand-navy">{formatARR(d.arr_converted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Drawer open={selectedOppId !== null} onClose={() => setSelectedOppId(null)}>
        {selectedOppId !== null && <OpportunityDetail key={selectedOppId} oppId={selectedOppId} />}
      </Drawer>
    </div>
  );
}
