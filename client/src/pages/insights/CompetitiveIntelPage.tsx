/**
 * Competitive Intelligence Rollup (Issue #72)
 *
 * Aggregates engaged_competitors across all open pipeline deals.
 * Shows: ranked competitor list, ARR at risk, win/loss context,
 * SE matchups, stale-comment warnings, and expandable deal lists.
 * Design matches Pipeline Analytics / % to Target card style.
 */
import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { formatARR } from '../../utils/formatters';
import { Loading, PageHeader } from './shared';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useOppUrlSync } from '../../hooks/useOppUrlSync';
import { useTeamScope } from '../../hooks/useTeamScope';

// ── Types ────────────────────────────────────────────────────────────────────

interface Deal {
  id: number;
  sf_opportunity_id: string;
  name: string;
  account_name: string | null;
  stage: string;
  arr: number;
  se_owner_name: string | null;
  team: string | null;
  se_comments_stale: boolean;
}

interface SeBreakdown { se_name: string; count: number }

interface Competitor {
  name: string;
  open_count: number;
  open_arr: number;
  closed_lost_count: number;
  closed_lost_arr: number;
  closed_won_count: number;
  closed_won_arr: number;
  total_count: number;
  se_breakdown: SeBreakdown[];
  deals: Deal[];
  stale_comment_count: number;
}

interface CompetitiveData {
  competitors: Competitor[];
  summary: {
    total_open_deals_with_competitors: number;
    unique_competitors: number;
    total_open_arr: number;
  };
}

// ── Chart Colors ─────────────────────────────────────────────────────────────

const BAR_COLORS = ['#6A2CF5', '#F10090', '#00E5B6', '#FFAB00', '#00DDFF', '#1A0C42', '#9C72F8', '#FF464C', '#665D81', '#F655B5'];

// ── SVG Chart: Top Competitors Bar Chart ─────────────────────────────────────

function TopCompetitorsChart({ data }: { data: Competitor[] }) {
  const top = data.slice(0, 12);
  const maxCount = Math.max(...top.map(c => c.open_count), 1);
  const barH = 26;
  const gap = 8;
  const leftPad = 130;
  const chartW = 380;
  const totalH = top.length * (barH + gap) - gap + 10;

  return (
    <svg viewBox={`0 0 ${leftPad + chartW + 90} ${totalH}`} className="w-full" style={{ maxHeight: Math.max(200, totalH) }}>
      {top.map((c, i) => {
        const y = i * (barH + gap);
        const w = (c.open_count / maxCount) * chartW;
        return (
          <g key={c.name}>
            <text x={leftPad - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize="11" fill="#1A0C42" fontWeight="500">
              {c.name.length > 16 ? c.name.slice(0, 15) + '…' : c.name}
            </text>
            <rect x={leftPad} y={y} width={Math.max(w, 3)} height={barH} rx="4"
              fill={BAR_COLORS[i % BAR_COLORS.length]} opacity="0.8" />
            <text x={leftPad + Math.max(w, 3) + 6} y={y + barH / 2 + 4} fontSize="11" fill="#665D81" fontWeight="500">
              {c.open_count} deals · {formatARR(c.open_arr)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── SVG Chart: Win/Loss Donut ────────────────────────────────────────────────

function WinLossDonut({ competitor }: { competitor: Competitor }) {
  const won = competitor.closed_won_count;
  const lost = competitor.closed_lost_count;
  const open = competitor.open_count;
  const total = won + lost + open || 1;
  const C = 2 * Math.PI * 40;
  const segments = [
    { count: open, color: '#6A2CF5', label: 'Open' },
    { count: lost, color: '#FF464C', label: 'Lost' },
    { count: won, color: '#00E5B6', label: 'Won' },
  ];
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-20 h-20 flex-shrink-0">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#CCC9D5" strokeWidth="12" opacity="0.3" />
        {segments.map(s => {
          if (s.count === 0) return null;
          const dash = (s.count / total) * C;
          const o = offset;
          offset += dash;
          return (
            <circle key={s.label} cx="50" cy="50" r="40" fill="none"
              stroke={s.color} strokeWidth="12"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-o}
              transform="rotate(-90 50 50)"
            />
          );
        })}
        <text x="50" y="54" textAnchor="middle" fontSize="14" fill="#1A0C42" fontWeight="700">
          {total}
        </text>
      </svg>
      <div className="flex flex-col gap-1">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-brand-navy-70">{s.label}</span>
            <span className="text-brand-navy font-semibold">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Competitor Card ──────────────────────────────────────────────────────────

function CompetitorCard({
  competitor,
  rank,
  onDealClick,
}: {
  competitor: Competitor;
  rank: number;
  onDealClick: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-purple-30 flex items-center justify-center text-xs font-bold text-brand-purple">
            {rank}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-brand-navy truncate">{competitor.name}</h3>
            <p className="text-[11px] text-brand-navy-70">
              {competitor.open_count} open deal{competitor.open_count !== 1 ? 's' : ''} · {formatARR(competitor.open_arr)} at risk
            </p>
          </div>
        </div>
        {competitor.stale_comment_count > 0 && (
          <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-status-warning/15 text-amber-700">
            {competitor.stale_comment_count} stale
          </span>
        )}
      </div>

      {/* Body: Win/Loss + SE Breakdown side by side */}
      <div className="flex gap-6 mb-3">
        <div className="flex-shrink-0">
          <p className="text-[10px] font-medium text-brand-navy-70 uppercase tracking-wide mb-1.5">Win / Loss</p>
          <WinLossDonut competitor={competitor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-brand-navy-70 uppercase tracking-wide mb-1.5">SE Matchups</p>
          <div className="flex flex-col gap-1">
            {competitor.se_breakdown.slice(0, 5).map(se => (
              <div key={se.se_name} className="flex items-center justify-between text-xs">
                <span className="text-brand-navy truncate mr-2">{se.se_name}</span>
                <span className="text-brand-navy-70 flex-shrink-0">{se.count} deal{se.count !== 1 ? 's' : ''}</span>
              </div>
            ))}
            {competitor.se_breakdown.length > 5 && (
              <span className="text-[10px] text-brand-navy-70">+{competitor.se_breakdown.length - 5} more</span>
            )}
          </div>
        </div>
      </div>

      {/* Expand deals */}
      <div className="border-t border-brand-navy-30/40 pt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium text-brand-purple hover:underline"
        >
          {expanded ? 'Hide deals ▴' : `View ${competitor.deals.length} deal${competitor.deals.length !== 1 ? 's' : ''} ▾`}
        </button>
        {expanded && (
          <div className="mt-2 space-y-1">
            {competitor.deals.map(d => (
              <button
                key={d.id}
                onClick={() => onDealClick(d.id)}
                className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-brand-purple-30/30 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-brand-navy truncate group-hover:text-brand-purple">{d.name}</p>
                  <p className="text-[10px] text-brand-navy-70 truncate">{d.account_name} · {d.stage} · {d.se_owner_name || 'Unassigned'}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {d.se_comments_stale && (
                    <span className="w-1.5 h-1.5 rounded-full bg-status-warning" title="SE comments stale" />
                  )}
                  <span className="text-xs text-brand-navy-70">{formatARR(d.arr)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ summary, topThreat }: {
  summary: CompetitiveData['summary'];
  topThreat: Competitor | null;
}) {
  const cards = [
    { label: 'Unique Competitors', value: String(summary.unique_competitors), sub: 'across open pipeline' },
    { label: 'Deals with Competitors', value: String(summary.total_open_deals_with_competitors), sub: formatARR(summary.total_open_arr) + ' ARR' },
    { label: 'Top Threat', value: topThreat?.name ?? '—', sub: topThreat ? `${topThreat.open_count} deals · ${formatARR(topThreat.open_arr)}` : '' },
    { label: 'Highest ARR at Risk', value: topThreat ? formatARR(
      Math.max(...(topThreat ? [topThreat] : []).map(c => c.open_arr), 0)
    ) : '—', sub: topThreat?.name ?? '' },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-2xl border border-brand-navy-30/40 p-5">
          <p className="text-[11px] font-medium text-brand-navy-70 uppercase tracking-wide">{c.label}</p>
          <p className="text-2xl font-bold text-brand-navy mt-1 truncate">{c.value}</p>
          <p className="text-xs text-brand-navy-70 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CompetitiveIntelPage() {
  const [data, setData] = useState<CompetitiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);

  // Team scope filtering
  const { filterOpp } = useTeamScope();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<ApiResponse<CompetitiveData>>('/insights/competitive');
        if (!cancelled) setData(res.data.data);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.error || 'Failed to load competitive data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build opp refs for URL sync from all deals across competitors
  const allDeals = useMemo(() => {
    if (!data) return [];
    const seen = new Set<number>();
    const deals: { id: number; sf_opportunity_id: string; team: string | null }[] = [];
    for (const c of data.competitors) {
      for (const d of c.deals) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          deals.push({ id: d.id, sf_opportunity_id: d.sf_opportunity_id, team: d.team });
        }
      }
    }
    return deals;
  }, [data]);

  useOppUrlSync(selectedOppId, setSelectedOppId, allDeals);

  // Apply team scope filter to competitor data
  const filtered = useMemo(() => {
    if (!data) return null;
    return data.competitors.map(c => ({
      ...c,
      deals: c.deals.filter(d => filterOpp(d)),
      open_count: c.deals.filter(d => filterOpp(d)).length,
      open_arr: c.deals.filter(d => filterOpp(d)).reduce((s, d) => s + d.arr, 0),
      stale_comment_count: c.deals.filter(d => filterOpp(d) && d.se_comments_stale).length,
    })).filter(c => c.open_count > 0).sort((a, b) => b.open_count - a.open_count);
  }, [data, filterOpp]);

  if (loading) return <Loading />;
  if (error || !data || !filtered) return <div className="text-center py-16 text-sm text-status-overdue">{error || 'No data'}</div>;

  // Find the competitor with highest ARR at risk for the 4th summary card
  const byArr = [...filtered].sort((a, b) => b.open_arr - a.open_arr);
  const highestArrComp = byArr[0] ?? null;
  const topByCount = filtered[0] ?? null;

  const summaryCards = [
    { label: 'Unique Competitors', value: String(filtered.length), sub: 'in open pipeline' },
    { label: 'Deals with Competitors', value: String(new Set(filtered.flatMap(c => c.deals.map(d => d.id))).size), sub: formatARR(data.summary.total_open_arr) + ' total ARR' },
    { label: 'Most Frequent', value: topByCount?.name ?? '—', sub: topByCount ? `${topByCount.open_count} deals` : '' },
    { label: 'Highest ARR at Risk', value: highestArrComp ? formatARR(highestArrComp.open_arr) : '—', sub: highestArrComp?.name ?? '' },
  ];

  return (
    <div>
      <PageHeader title="Competitive Intelligence" subtitle="Competitor presence across the active pipeline" />

      {/* Summary KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {summaryCards.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-brand-navy-30/40 p-5">
            <p className="text-[11px] font-medium text-brand-navy-70 uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-bold text-brand-navy mt-1 truncate">{c.value}</p>
            <p className="text-xs text-brand-navy-70 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Top competitors chart */}
      <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-5 mb-4">
        <h2 className="text-sm font-semibold text-brand-navy mb-4">Competitor Frequency (Open Pipeline)</h2>
        <TopCompetitorsChart data={filtered} />
      </div>

      {/* Competitor cards grid */}
      <h2 className="text-sm font-semibold text-brand-navy mb-3">Competitor Breakdown</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        {filtered.map((c, i) => (
          <CompetitorCard
            key={c.name}
            competitor={c}
            rank={i + 1}
            onDealClick={setSelectedOppId}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-sm text-brand-navy-70">No competitors found in current scope.</div>
      )}

      {/* Opportunity Drawer */}
      <Drawer open={selectedOppId !== null} onClose={() => setSelectedOppId(null)}>
        {selectedOppId !== null && <OpportunityDetail opportunityId={selectedOppId} isDrawer />}
      </Drawer>
    </div>
  );
}
