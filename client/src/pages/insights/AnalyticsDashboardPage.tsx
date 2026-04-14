/**
 * Pipeline Analytics Dashboard (Issue #71)
 *
 * Visual dashboard with custom SVG charts: pipeline funnel, ARR by SE,
 * ARR by record type, ARR by close month, stage velocity, key deals.
 * Design matches the % to Target page style (white cards, brand colors, SVG charts).
 */
import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { formatARR } from '../../utils/formatters';
import { Loading, PageHeader } from './shared';

// ── Types ────────────────────────────────────────────────────────────────────

interface FunnelItem { stage: string; arr: number; count: number }
interface BySeItem { se_owner_name: string; total_arr: number; stages: { stage: string; arr: number }[] }
interface ByRecordType { record_type: string; arr: number; count: number }
interface ByCloseMonth { month: string; arr: number; count: number }
interface StageVelocity { stage: string; avg_days: number; count: number }
interface KeyDeals { total_arr: number; count: number }
interface Summary { total_arr: number; total_count: number; total_arr_converted: number }

interface AnalyticsData {
  funnel: FunnelItem[];
  by_se: BySeItem[];
  by_record_type: ByRecordType[];
  by_close_month: ByCloseMonth[];
  key_deals: KeyDeals;
  stage_velocity: StageVelocity[];
  summary: Summary;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  'Qualify':                '#9CA3AF', // gray
  'Develop Solution':       '#6366F1', // indigo
  'Build Value':            '#10B981', // emerald
  'Proposal Sent':          '#8B5CF6', // purple
  'Submitted for Booking':  '#F59E0B', // amber
  'Negotiate':              '#3B82F6', // blue
};

const CHART_COLORS = ['#6A2CF5', '#F10090', '#00E5B6', '#FFAB00', '#00DDFF', '#1A0C42', '#9C72F8', '#FF464C'];

function stageColor(stage: string): string {
  return STAGE_COLORS[stage] || '#665D81';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortMonth(m: string): string {
  // "2026-04" → "Apr"
  const [, mm] = m.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[parseInt(mm, 10) - 1] || m;
}

function shortStage(s: string): string {
  const map: Record<string, string> = {
    'Qualify': 'Qualify',
    'Develop Solution': 'Dev Sol',
    'Build Value': 'Build Val',
    'Proposal Sent': 'Proposal',
    'Submitted for Booking': 'Sub Book',
    'Negotiate': 'Negotiate',
  };
  return map[s] || s;
}

// ── SVG Chart Components ─────────────────────────────────────────────────────

/** Horizontal bar chart for pipeline funnel (ARR by stage). */
function FunnelChart({ data }: { data: FunnelItem[] }) {
  const maxArr = Math.max(...data.map(d => d.arr), 1);
  const barH = 28;
  const gap = 10;
  const leftPad = 90;
  const chartW = 500;
  const totalH = data.length * (barH + gap) - gap + 10;

  return (
    <svg viewBox={`0 0 ${leftPad + chartW + 80} ${totalH}`} className="w-full" style={{ maxHeight: 240 }}>
      {data.map((d, i) => {
        const y = i * (barH + gap);
        const w = (d.arr / maxArr) * chartW;
        return (
          <g key={d.stage}>
            <text x={leftPad - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize="11" fill="#1A0C42" fontWeight="500">
              {shortStage(d.stage)}
            </text>
            <rect x={leftPad} y={y} width={Math.max(w, 2)} height={barH} rx="4" fill={stageColor(d.stage)} opacity="0.85" />
            <text x={leftPad + Math.max(w, 2) + 6} y={y + barH / 2 + 4} fontSize="11" fill="#665D81" fontWeight="500">
              {formatARR(d.arr)} ({d.count})
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Stacked horizontal bar chart for ARR by SE owner. */
function BySeChart({ data }: { data: BySeItem[] }) {
  const sorted = useMemo(() => [...data].sort((a, b) => b.total_arr - a.total_arr), [data]);
  const maxArr = Math.max(...sorted.map(d => d.total_arr), 1);
  const barH = 24;
  const gap = 8;
  const leftPad = 110;
  const chartW = 440;
  const totalH = sorted.length * (barH + gap) - gap + 10;

  return (
    <svg viewBox={`0 0 ${leftPad + chartW + 80} ${totalH}`} className="w-full" style={{ maxHeight: Math.max(200, totalH) }}>
      {sorted.map((se, i) => {
        const y = i * (barH + gap);
        let xOffset = leftPad;
        return (
          <g key={se.se_owner_name}>
            <text x={leftPad - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize="10" fill="#1A0C42" fontWeight="500">
              {se.se_owner_name.length > 14 ? se.se_owner_name.slice(0, 13) + '...' : se.se_owner_name}
            </text>
            {se.stages.map((s, si) => {
              const w = (s.arr / maxArr) * chartW;
              const x = xOffset;
              xOffset += w;
              return (
                <rect key={si} x={x} y={y} width={Math.max(w, 0)} height={barH} fill={stageColor(s.stage)} opacity="0.8"
                  rx={si === 0 ? 4 : 0}
                />
              );
            })}
            <text x={xOffset + 6} y={y + barH / 2 + 4} fontSize="10" fill="#665D81" fontWeight="500">
              {formatARR(se.total_arr)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Donut chart for record type breakdown. */
function RecordTypeDonut({ data }: { data: ByRecordType[] }) {
  const total = data.reduce((s, d) => s + d.arr, 0) || 1;
  const C = 2 * Math.PI * 56;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="w-36 h-36 flex-shrink-0">
        <circle cx="70" cy="70" r="56" fill="none" stroke="#CCC9D5" strokeWidth="16" opacity="0.3" />
        {data.map((d, i) => {
          const dash = (d.arr / total) * C;
          const o = offset;
          offset += dash;
          return (
            <circle key={d.record_type} cx="70" cy="70" r="56" fill="none"
              stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="16"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-o}
              transform="rotate(-90 70 70)"
            />
          );
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="11" fill="#665D81" fontWeight="500">Total</text>
        <text x="70" y="82" textAnchor="middle" fontSize="14" fill="#1A0C42" fontWeight="700">{formatARR(total)}</text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {data.map((d, i) => (
          <div key={d.record_type} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-brand-navy font-medium">{d.record_type}</span>
            <span className="text-brand-navy-70">{formatARR(d.arr)} ({d.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vertical bar chart for ARR by close month. */
function CloseMonthChart({ data }: { data: ByCloseMonth[] }) {
  const maxArr = Math.max(...data.map(d => d.arr), 1);
  const barW = 36;
  const gap = 12;
  const bottomPad = 30;
  const chartH = 160;
  const leftPad = 10;
  const totalW = leftPad + data.length * (barW + gap);

  return (
    <svg viewBox={`0 0 ${Math.max(totalW, 200)} ${chartH + bottomPad}`} className="w-full" style={{ maxHeight: 220 }}>
      {data.map((d, i) => {
        const x = leftPad + i * (barW + gap);
        const h = (d.arr / maxArr) * (chartH - 20);
        const y = chartH - h;
        return (
          <g key={d.month}>
            <rect x={x} y={y} width={barW} height={h} rx="4" fill="#6A2CF5" opacity="0.8" />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fill="#665D81" fontWeight="500">
              {formatARR(d.arr)}
            </text>
            <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize="10" fill="#1A0C42" fontWeight="500">
              {shortMonth(d.month)}
            </text>
            <text x={x + barW / 2} y={chartH + 25} textAnchor="middle" fontSize="8" fill="#665D81">
              {d.count} deal{d.count !== 1 ? 's' : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal bar chart for stage velocity (avg days in stage). */
function VelocityChart({ data }: { data: StageVelocity[] }) {
  const maxDays = Math.max(...data.map(d => d.avg_days), 1);
  const barH = 26;
  const gap = 8;
  const leftPad = 90;
  const chartW = 400;
  const totalH = data.length * (barH + gap) - gap + 10;

  return (
    <svg viewBox={`0 0 ${leftPad + chartW + 100} ${totalH}`} className="w-full" style={{ maxHeight: 220 }}>
      {data.map((d, i) => {
        const y = i * (barH + gap);
        const w = (d.avg_days / maxDays) * chartW;
        const color = d.avg_days > 30 ? '#FF464C' : d.avg_days > 14 ? '#FFAB00' : '#00E5B6';
        return (
          <g key={d.stage}>
            <text x={leftPad - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize="11" fill="#1A0C42" fontWeight="500">
              {shortStage(d.stage)}
            </text>
            <rect x={leftPad} y={y} width={Math.max(w, 2)} height={barH} rx="4" fill={color} opacity="0.75" />
            <text x={leftPad + Math.max(w, 2) + 6} y={y + barH / 2 + 4} fontSize="11" fill="#665D81" fontWeight="500">
              {d.avg_days}d avg ({d.count} deals)
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ summary, keyDeals }: { summary: Summary; keyDeals: KeyDeals }) {
  const cards = [
    { label: 'Total Pipeline ARR', value: formatARR(summary.total_arr), sub: `${summary.total_count} deals` },
    { label: 'ARR (Converted)', value: formatARR(summary.total_arr_converted), sub: 'Local currency' },
    { label: 'Key Deals', value: String(keyDeals.count), sub: formatARR(keyDeals.total_arr) },
    { label: 'Avg Deal Size', value: formatARR(summary.total_count > 0 ? summary.total_arr / summary.total_count : 0), sub: `across ${summary.total_count} deals` },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-2xl border border-brand-navy-30/40 p-5">
          <p className="text-[11px] font-medium text-brand-navy-70 uppercase tracking-wide">{c.label}</p>
          <p className="text-2xl font-bold text-brand-navy mt-1">{c.value}</p>
          <p className="text-xs text-brand-navy-70 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── Stage Legend ──────────────────────────────────────────────────────────────

function StageLegend() {
  const stages = Object.entries(STAGE_COLORS);
  return (
    <div className="flex flex-wrap gap-3 mt-3">
      {stages.map(([name, color]) => (
        <div key={name} className="flex items-center gap-1.5 text-[10px] text-brand-navy-70">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          {name}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<ApiResponse<AnalyticsData>>('/insights/analytics');
        if (!cancelled) setData(res.data.data);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.error || 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Loading />;
  if (error || !data) return <div className="text-center py-16 text-sm text-status-overdue">{error || 'No data'}</div>;

  return (
    <div>
      <PageHeader title="Pipeline Analytics" subtitle="Visual breakdown of the active pipeline" />

      <SummaryCards summary={data.summary} keyDeals={data.key_deals} />

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Pipeline Funnel */}
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-5">
          <h2 className="text-sm font-semibold text-brand-navy mb-4">Pipeline Funnel</h2>
          <FunnelChart data={data.funnel} />
        </div>

        {/* ARR by Record Type */}
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-5">
          <h2 className="text-sm font-semibold text-brand-navy mb-4">ARR by Record Type</h2>
          <RecordTypeDonut data={data.by_record_type} />
        </div>
      </div>

      {/* ARR by SE Owner */}
      <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-brand-navy">ARR by SE Owner</h2>
          <StageLegend />
        </div>
        <BySeChart data={data.by_se} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* ARR by Close Month */}
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-5">
          <h2 className="text-sm font-semibold text-brand-navy mb-4">ARR by Close Month</h2>
          {data.by_close_month.length > 0
            ? <CloseMonthChart data={data.by_close_month} />
            : <p className="text-xs text-brand-navy-70 py-8 text-center">No close dates set</p>
          }
        </div>

        {/* Stage Velocity */}
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-5">
          <h2 className="text-sm font-semibold text-brand-navy mb-4">Stage Velocity</h2>
          {data.stage_velocity.length > 0
            ? <VelocityChart data={data.stage_velocity} />
            : <p className="text-xs text-brand-navy-70 py-8 text-center">No stage change data</p>
          }
        </div>
      </div>
    </div>
  );
}
