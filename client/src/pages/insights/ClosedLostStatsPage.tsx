import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { useTeamScope } from '../../hooks/useTeamScope';
import { formatARR, formatDate } from '../../utils/formatters';
import { Loading } from './shared';

interface ClosedLostDeal {
  id: number;
  name: string;
  account_name: string | null;
  stage: string | null;
  previous_stage: string | null;
  arr: string;
  arr_currency: string;
  record_type: string | null;
  team: string | null;
  ae_owner_name: string | null;
  closed_at: string | null;
  se_owner_id: number | null;
  se_owner_name: string | null;
}

// ── Colour palette for pie slices ─────────────────────────────────────────────
const SLICE_COLORS = [
  '#6A2CF5', // brand purple
  '#00DDFF', // status info
  '#00E5B6', // status success
  '#FFAB00', // status warning
  '#F10090', // brand pink
  '#FF464C', // status overdue
  '#9C72F8', // purple-70
  '#F655B5', // pink-70
  '#665D81', // navy-70
  '#1A0C42', // navy
];

function colorFor(index: number) {
  return SLICE_COLORS[index % SLICE_COLORS.length];
}

// ── SVG Pie chart ─────────────────────────────────────────────────────────────
interface Slice {
  label: string;
  count: number;
  arr: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function slicePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end   = polarToCartesian(cx, cy, r, endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
}

function PieChart({
  slices,
  metric,
  activeSlice,
  onSliceClick,
}: {
  slices: Slice[];
  metric: 'count' | 'arr';
  activeSlice: string | null;
  onSliceClick: (label: string) => void;
}) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2 - 6;

  const total = slices.reduce((s, sl) => s + (metric === 'count' ? sl.count : sl.arr), 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-xs text-brand-navy-30">No data</span>
      </div>
    );
  }

  let angle = -Math.PI / 2; // start at top
  const paths = slices.map((sl, i) => {
    const value   = metric === 'count' ? sl.count : sl.arr;
    const sweep   = (value / total) * 2 * Math.PI;
    const start   = angle;
    const end     = angle + sweep;
    angle         = end;
    const color   = colorFor(i);
    const isActive = activeSlice === null || activeSlice === sl.label;
    return (
      <path
        key={sl.label}
        d={slicePath(cx, cy, r, start, end)}
        fill={color}
        opacity={isActive ? 1 : 0.25}
        stroke="white"
        strokeWidth={2}
        className="cursor-pointer transition-opacity"
        onClick={() => onSliceClick(sl.label)}
      />
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
    </svg>
  );
}

// ── Chart card ────────────────────────────────────────────────────────────────
function ChartCard({
  title,
  slices,
  metric,
  activeSlice,
  onSliceClick,
}: {
  title: string;
  slices: Slice[];
  metric: 'count' | 'arr';
  activeSlice: string | null;
  onSliceClick: (label: string) => void;
}) {
  const total = slices.reduce((s, sl) => s + (metric === 'count' ? sl.count : sl.arr), 0);

  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
      <div className="flex gap-5 items-start">
        {/* Pie */}
        <div className="flex-shrink-0">
          <PieChart
            slices={slices}
            metric={metric}
            activeSlice={activeSlice}
            onSliceClick={onSliceClick}
          />
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-1.5 overflow-y-auto max-h-[140px]">
          {slices.map((sl, i) => {
            const value = metric === 'count' ? sl.count : sl.arr;
            const pct   = total > 0 ? Math.round((value / total) * 100) : 0;
            const isActive = activeSlice === null || activeSlice === sl.label;
            return (
              <button
                key={sl.label}
                onClick={() => onSliceClick(sl.label)}
                className={`w-full flex items-center gap-2 text-left transition-opacity ${isActive ? 'opacity-100' : 'opacity-30'}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colorFor(i) }}
                />
                <span className="text-xs text-brand-navy truncate flex-1">{sl.label}</span>
                <span className="text-xs font-medium text-brand-navy-70 flex-shrink-0">
                  {metric === 'count' ? sl.count : formatARR(sl.arr.toString())}
                </span>
                <span className="text-[10px] text-brand-navy-30 flex-shrink-0 w-8 text-right">{pct}%</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupBy(deals: ClosedLostDeal[], key: keyof ClosedLostDeal): Slice[] {
  const map = new Map<string, Slice>();
  for (const d of deals) {
    const label = (d[key] as string | null) ?? 'Unknown';
    const entry = map.get(label) ?? { label, count: 0, arr: 0 };
    entry.count += 1;
    entry.arr   += parseFloat(d.arr) || 0;
    map.set(label, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// ── Page ──────────────────────────────────────────────────────────────────────
const TIME_OPTIONS = [
  { label: '30d',   days: 30 },
  { label: '90d',   days: 90 },
  { label: '1yr',   days: 365 },
  { label: 'All',   days: 0 },
];

type Dimension = 'stage' | 'record_type' | 'team' | 'ae_owner_name';

const CHARTS: { key: Dimension; title: string }[] = [
  { key: 'stage',         title: 'By Stage at Close' },
  { key: 'record_type',   title: 'By Record Type' },
  { key: 'team',          title: 'By Team' },
  { key: 'ae_owner_name', title: 'By AE Owner' },
];

export default function ClosedLostStatsPage() {
  const [deals,   setDeals]   = useState<ClosedLostDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(0);
  const [metric,  setMetric]  = useState<'count' | 'arr'>('count');

  // Per-chart active slice (null = all shown)
  const [activeSlices, setActiveSlices] = useState<Partial<Record<Dimension, string | null>>>({});

  useEffect(() => {
    setLoading(true);
    api.get<ApiResponse<ClosedLostDeal[]>>(`/insights/closed-lost-stats${days > 0 ? `?days=${days}` : ''}`)
      .then(r => setDeals(r.data.data))
      .finally(() => setLoading(false));
  }, [days]);

  function toggleSlice(dim: Dimension, label: string) {
    setActiveSlices(prev => ({
      ...prev,
      [dim]: prev[dim] === label ? null : label,
    }));
  }

  const { filterOpp } = useTeamScope();
  const scopedDeals = useMemo(() => deals.filter(filterOpp), [deals, filterOpp]);

  const totalArr = scopedDeals.reduce((s, d) => s + (parseFloat(d.arr) || 0), 0);

  // Apply cross-chart filter: show deals matching ALL active slice selections
  const filteredDeals = scopedDeals.filter(d => {
    for (const [dim, active] of Object.entries(activeSlices) as [Dimension, string | null][]) {
      if (!active) continue;
      const val = (d[dim] as string | null) ?? 'Unknown';
      if (val !== active) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-6 pb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-brand-navy">Closed Lost Stats</h1>
            <p className="text-sm text-brand-navy-70 mt-0.5">Why are we losing deals?</p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Metric toggle */}
            <div className="flex items-center gap-1 bg-brand-navy-30/20 rounded-lg p-0.5">
              {(['count', 'arr'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    metric === m
                      ? 'bg-white text-brand-navy shadow-sm'
                      : 'text-brand-navy-70 hover:text-brand-navy'
                  }`}
                >
                  {m === 'count' ? '# Deals' : 'ARR'}
                </button>
              ))}
            </div>

            {/* Time filter */}
            <div className="flex items-center gap-1 bg-brand-navy-30/20 rounded-lg p-0.5">
              {TIME_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  onClick={() => setDays(opt.days)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    days === opt.days
                      ? 'bg-white text-brand-navy shadow-sm'
                      : 'text-brand-navy-70 hover:text-brand-navy'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-6">
        {loading ? <Loading /> : (
          <>
            {/* Summary strip */}
            <div className="flex gap-4 flex-wrap mb-6">
              <div className="flex-1 min-w-[140px] bg-white rounded-2xl border border-brand-navy-30/40 p-4">
                <p className="text-xs text-brand-navy-70 mb-1">Deals Lost</p>
                <p className="text-2xl font-bold text-brand-navy">{filteredDeals.length}</p>
                {filteredDeals.length !== deals.length && (
                  <p className="text-[10px] text-brand-navy-30 mt-0.5">of {deals.length} total</p>
                )}
              </div>
              <div className="flex-1 min-w-[140px] bg-white rounded-2xl border border-brand-navy-30/40 p-4">
                <p className="text-xs text-brand-navy-70 mb-1">ARR Lost</p>
                <p className="text-2xl font-bold text-status-overdue">
                  {formatARR(filteredDeals.reduce((s, d) => s + (parseFloat(d.arr) || 0), 0).toString())}
                </p>
                {filteredDeals.length !== deals.length && (
                  <p className="text-[10px] text-brand-navy-30 mt-0.5">of {formatARR(totalArr.toString())} total</p>
                )}
              </div>
              <div className="flex-1 min-w-[140px] bg-white rounded-2xl border border-brand-navy-30/40 p-4">
                <p className="text-xs text-brand-navy-70 mb-1">Avg Deal Size</p>
                <p className="text-2xl font-bold text-brand-navy">
                  {filteredDeals.length > 0
                    ? formatARR((filteredDeals.reduce((s, d) => s + (parseFloat(d.arr) || 0), 0) / filteredDeals.length).toString())
                    : '—'}
                </p>
              </div>
              {Object.values(activeSlices).some(v => v !== null && v !== undefined) && (
                <button
                  onClick={() => setActiveSlices({})}
                  className="flex-shrink-0 self-center px-3 py-1.5 rounded-lg text-xs font-medium border border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Pie chart grid */}
            {deals.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-sm text-brand-navy-70">
                No closed lost deals found{days > 0 ? ` in the last ${days} days` : ''}.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {CHARTS.map(({ key, title }) => {
                  const slices = groupBy(filteredDeals.length < deals.length ? filteredDeals : deals, key);
                  return (
                    <ChartCard
                      key={key}
                      title={title}
                      slices={slices}
                      metric={metric}
                      activeSlice={activeSlices[key] ?? null}
                      onSliceClick={label => toggleSlice(key, label)}
                    />
                  );
                })}
              </div>
            )}

            {/* Deal table */}
            {filteredDeals.length > 0 && filteredDeals.length < deals.length && (
              <div className="mt-6 bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-navy-30/40 flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-navy">Filtered Deals</span>
                  <span className="text-[10px] bg-brand-navy-30/60 text-brand-navy-70 rounded-full px-1.5 py-px font-medium">
                    {filteredDeals.length}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-brand-navy-30/40 bg-gray-50/50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Opportunity</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Stage</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">ARR</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Record Type</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Team</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">AE</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeals.map(deal => (
                        <tr key={deal.id} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-brand-purple-30/10">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-brand-navy truncate max-w-[200px]">{deal.name}</p>
                            <p className="text-xs text-brand-navy-70 truncate max-w-[200px]">{deal.account_name}</p>
                          </td>
                          <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">{deal.stage ?? '—'}</td>
                          <td className="px-3 py-3 text-sm font-medium text-brand-navy whitespace-nowrap">{formatARR(deal.arr)}</td>
                          <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">{deal.record_type ?? '—'}</td>
                          <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">{deal.team ?? '—'}</td>
                          <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">{deal.ae_owner_name ?? '—'}</td>
                          <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">{formatDate(deal.closed_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
