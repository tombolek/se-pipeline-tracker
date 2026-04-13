import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { ApiResponse, User } from '../../types';
import { useAuthStore } from '../../store/auth';
import { listUsers } from '../../api/users';
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
  account_segment: string | null;
  account_industry: string | null;
  engaged_competitors: string | null;
  ae_owner_name: string | null;
  closed_at: string | null;
  first_seen_at: string | null;
  days_in_pipeline: number | null;
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

// Reserved colour for the synthetic "Other" bucket
const OTHER_LABEL = 'Other';
const OTHER_COLOR = '#CCC9D5'; // navy-30 — visually muted, distinct from the palette

// ── SVG Pie chart ─────────────────────────────────────────────────────────────
interface Slice {
  label: string;
  count: number;
  arr: number;
}

/**
 * If there are more than 6 slices, fold slices that account for <5% of the
 * active metric into a synthetic "Other" bucket. Returns both the visible
 * slices (with "Other" appended at the end if any were folded) and the list
 * of hidden slices that make up "Other" (for the expandable legend).
 */
function foldSmallSlices(
  slices: Slice[],
  metric: 'count' | 'arr'
): { visible: Slice[]; hidden: Slice[] } {
  if (slices.length <= 6) return { visible: slices, hidden: [] };

  const total = slices.reduce((s, sl) => s + (metric === 'count' ? sl.count : sl.arr), 0);
  if (total === 0) return { visible: slices, hidden: [] };

  const keep: Slice[] = [];
  const fold: Slice[] = [];
  for (const sl of slices) {
    const v = metric === 'count' ? sl.count : sl.arr;
    const pct = (v / total) * 100;
    if (pct < 5) fold.push(sl); else keep.push(sl);
  }
  // Guard: if folding would leave no "Other" slice (all >= 5%), keep as-is.
  if (fold.length === 0) return { visible: slices, hidden: [] };
  // Guard: if folding leaves fewer than 2 items in "Other", not worth it —
  // rendering one item under "Other" just hides it pointlessly.
  if (fold.length < 2) return { visible: slices, hidden: [] };

  const other: Slice = {
    label: OTHER_LABEL,
    count: fold.reduce((s, sl) => s + sl.count, 0),
    arr:   fold.reduce((s, sl) => s + sl.arr,   0),
  };
  return { visible: [...keep, other], hidden: fold };
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
    const color   = sl.label === OTHER_LABEL ? OTHER_COLOR : colorFor(i);
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
  const { visible, hidden } = useMemo(() => foldSmallSlices(slices, metric), [slices, metric]);
  const [showOther, setShowOther] = useState(false);

  // Auto-expand "Other" when the active filter is one of its children
  useEffect(() => {
    if (activeSlice && hidden.some(h => h.label === activeSlice)) setShowOther(true);
  }, [activeSlice, hidden]);

  // Total uses the original slices so percentages always add to 100%
  const total = slices.reduce((s, sl) => s + (metric === 'count' ? sl.count : sl.arr), 0);

  function handlePieClick(label: string) {
    if (label === OTHER_LABEL) { setShowOther(v => !v); return; }
    onSliceClick(label);
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
      <div className="flex gap-5 items-start">
        {/* Pie */}
        <div className="flex-shrink-0">
          <PieChart
            slices={visible}
            metric={metric}
            activeSlice={activeSlice}
            onSliceClick={handlePieClick}
          />
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-1.5 overflow-y-auto max-h-[160px]">
          {visible.map((sl, i) => {
            const value = metric === 'count' ? sl.count : sl.arr;
            const pct   = total > 0 ? Math.round((value / total) * 100) : 0;
            const isOther = sl.label === OTHER_LABEL;
            const isActive = activeSlice === null || activeSlice === sl.label;
            const color = isOther ? OTHER_COLOR : colorFor(i);
            return (
              <div key={sl.label}>
                <button
                  onClick={() => (isOther ? setShowOther(v => !v) : onSliceClick(sl.label))}
                  className={`w-full flex items-center gap-2 text-left transition-opacity ${isActive ? 'opacity-100' : 'opacity-30'}`}
                >
                  {isOther ? (
                    <svg
                      className={`w-3 h-3 text-brand-navy-70 transition-transform flex-shrink-0 ${showOther ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                  ) : (
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  <span className={`text-xs truncate flex-1 ${isOther ? 'text-brand-navy-70 italic' : 'text-brand-navy'}`}>
                    {isOther ? `Other (${hidden.length})` : sl.label}
                  </span>
                  <span className="text-xs font-medium text-brand-navy-70 flex-shrink-0">
                    {metric === 'count' ? sl.count : formatARR(sl.arr.toString())}
                  </span>
                  <span className="text-[10px] text-brand-navy-30 flex-shrink-0 w-8 text-right">{pct}%</span>
                </button>
                {isOther && showOther && (
                  <div className="pl-5 mt-1.5 space-y-1 border-l border-brand-navy-30/40 ml-1">
                    {hidden.map(h => {
                      const v = metric === 'count' ? h.count : h.arr;
                      const p = total > 0 ? ((v / total) * 100) : 0;
                      const pStr = p < 1 ? '<1%' : `${Math.round(p)}%`;
                      const childActive = activeSlice === null || activeSlice === h.label;
                      return (
                        <button
                          key={h.label}
                          onClick={() => onSliceClick(h.label)}
                          className={`w-full flex items-center gap-2 text-left transition-opacity ${childActive ? 'opacity-100' : 'opacity-30'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-navy-30 flex-shrink-0"/>
                          <span className="text-[11px] text-brand-navy-70 truncate flex-1">{h.label}</span>
                          <span className="text-[11px] font-medium text-brand-navy-70 flex-shrink-0">
                            {metric === 'count' ? h.count : formatARR(h.arr.toString())}
                          </span>
                          <span className="text-[10px] text-brand-navy-30 flex-shrink-0 w-8 text-right">{pStr}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupBy(deals: ClosedLostDeal[], key: Dimension): Slice[] {
  const map = new Map<string, Slice>();
  for (const d of deals) {
    let labels: string[];
    if (key === 'competitor') {
      const parsed = parseCompetitors(d.engaged_competitors);
      labels = parsed.length > 0 ? parsed : ['None listed'];
    } else {
      labels = [(d[key as keyof ClosedLostDeal] as string | null) ?? 'Unknown'];
    }
    for (const label of labels) {
      const entry = map.get(label) ?? { label, count: 0, arr: 0 };
      entry.count += 1;
      entry.arr   += parseFloat(d.arr) || 0;
      map.set(label, entry);
    }
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

type Dimension = 'stage' | 'record_type' | 'team' | 'ae_owner_name' | 'se_owner_name' | 'account_industry' | 'account_segment' | 'competitor';

const CHARTS: { key: Dimension; title: string }[] = [
  { key: 'stage',            title: 'By Stage at Close' },
  { key: 'competitor',       title: 'By Competitor' },
  { key: 'account_industry', title: 'By Industry' },
  { key: 'account_segment',  title: 'By Segment' },
  { key: 'record_type',      title: 'By Record Type' },
  { key: 'team',             title: 'By Team' },
  { key: 'se_owner_name',    title: 'By SE Owner' },
  { key: 'ae_owner_name',    title: 'By AE Owner' },
];

/** Parses free-text engaged_competitors into normalized names. Splits on common
 *  delimiters (comma, semicolon, slash, pipe, " and ", " & "). Trims and dedupes. */
function parseCompetitors(raw: string | null): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[,;/|]| and | & /i)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 60);
  return Array.from(new Set(parts.map(s => s.replace(/\s+/g, ' '))));
}

export default function ClosedLostStatsPage() {
  const [deals,   setDeals]   = useState<ClosedLostDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(0);
  const [metric,  setMetric]  = useState<'count' | 'arr'>('count');

  const currentUser = useAuthStore(s => s.user);
  const isManager = currentUser?.role === 'manager';
  const [seUsers, setSeUsers] = useState<User[]>([]);
  const [savingSeId, setSavingSeId] = useState<number | null>(null);

  useEffect(() => {
    if (!isManager) return;
    listUsers()
      .then(users => setSeUsers(users.filter(u => u.role === 'se' && u.is_active)))
      .catch(() => setSeUsers([]));
  }, [isManager]);

  async function updateSeOwner(oppId: number, newSeOwnerId: number | null) {
    setSavingSeId(oppId);
    try {
      await api.patch(`/opportunities/${oppId}`, { se_owner_id: newSeOwnerId });
      const newOwner = newSeOwnerId != null ? seUsers.find(u => u.id === newSeOwnerId) ?? null : null;
      setDeals(prev => prev.map(d => d.id === oppId
        ? { ...d, se_owner_id: newSeOwnerId, se_owner_name: newOwner?.name ?? null }
        : d));
    } catch (e) {
      alert('Failed to update SE Owner');
    } finally {
      setSavingSeId(null);
    }
  }

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
      if (dim === 'competitor') {
        const parsed = parseCompetitors(d.engaged_competitors);
        const labels = parsed.length > 0 ? parsed : ['None listed'];
        if (!labels.includes(active)) return false;
      } else {
        const val = (d[dim as keyof ClosedLostDeal] as string | null) ?? 'Unknown';
        if (val !== active) return false;
      }
    }
    return true;
  });

  const velocityDeals = filteredDeals.filter(d => d.days_in_pipeline != null && d.days_in_pipeline >= 0);
  const avgVelocity = velocityDeals.length > 0
    ? Math.round(velocityDeals.reduce((s, d) => s + (d.days_in_pipeline ?? 0), 0) / velocityDeals.length)
    : null;

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-6 pb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-brand-navy">Loss Analysis</h1>
            <p className="text-sm text-brand-navy-70 mt-0.5">Patterns in why deals are lost — by stage, competitor, segment, industry.</p>
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
              <div className="flex-1 min-w-[140px] bg-white rounded-2xl border border-brand-navy-30/40 p-4">
                <p className="text-xs text-brand-navy-70 mb-1">Avg Days in Pipeline</p>
                <p className="text-2xl font-bold text-brand-navy">
                  {avgVelocity != null ? `${avgVelocity}d` : '—'}
                </p>
                <p className="text-[10px] text-brand-navy-30 mt-0.5">first seen → closed lost</p>
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
            {filteredDeals.length > 0 && (
              <div className="mt-6 bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-navy-30/40 flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-navy">
                    {filteredDeals.length < deals.length ? 'Filtered Deals' : 'All Closed Lost Deals'}
                  </span>
                  <span className="text-[10px] bg-brand-navy-30/60 text-brand-navy-70 rounded-full px-1.5 py-px font-medium">
                    {filteredDeals.length}
                  </span>
                  {isManager && (
                    <span className="ml-auto text-[10px] text-brand-navy-30">Manager: SE Owner is editable</span>
                  )}
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
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">SE Owner</th>
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
                          <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                            {isManager ? (
                              <select
                                value={deal.se_owner_id ?? ''}
                                disabled={savingSeId === deal.id}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? null : parseInt(e.target.value);
                                  updateSeOwner(deal.id, val);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs border border-brand-navy-30 rounded px-1.5 py-0.5 bg-white hover:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple disabled:opacity-50 max-w-[140px]"
                              >
                                <option value="">— unassigned —</option>
                                {seUsers.map(u => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                            ) : (
                              deal.se_owner_name ?? '—'
                            )}
                          </td>
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
