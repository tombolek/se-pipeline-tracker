import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getForecastingBrief, generateNarrative, bulkGenerateSummaries } from '../../api/forecastingBrief';
import type { ForecastingBriefData, ForecastOpp } from '../../api/forecastingBrief';
import { formatARR, formatDate } from '../../utils/formatters';
import { useTeamScope } from '../../hooks/useTeamScope';
import { Loading } from './shared';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';

// ── Initials helper ────────────────────────────────────────────────────────
function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name.split(/\s+/).map(w => w[0]?.toUpperCase() || '').join('');
}

// ── Hover Tooltip (positioned, portal-free) ────────────────────────────────
function HoverTooltip({ children, content, width = 260 }: {
  children: React.ReactNode;
  content: React.ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const handleEnter = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, rect.left + rect.width / 2 - width / 2),
    });
    setShow(true);
  };

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && pos && (
        <div
          className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-brand-navy-30/30 p-3 text-[11px] text-brand-navy leading-relaxed"
          style={{ top: pos.top, left: pos.left, width }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

// ── MEDDPICC helpers ────────────────────────────────────────────────────────
const MEDDPICC_FIELDS = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'economic_buyer', label: 'Econ Buyer' },
  { key: 'decision_criteria', label: 'Decision Crit' },
  { key: 'decision_process', label: 'Decision Proc' },
  { key: 'paper_process', label: 'Paper Process' },
  { key: 'implicate_pain', label: 'Pain' },
  { key: 'champion', label: 'Champion' },
  { key: 'authority', label: 'Authority' },
  { key: 'need', label: 'Need' },
] as const;

function meddpiccScore(opp: ForecastOpp): number {
  return MEDDPICC_FIELDS.filter(f => {
    const v = opp[f.key as keyof ForecastOpp];
    return v && String(v).trim().length > 0;
  }).length;
}

function meddpiccFilled(opp: ForecastOpp): Set<string> {
  const s = new Set<string>();
  for (const f of MEDDPICC_FIELDS) {
    const v = opp[f.key as keyof ForecastOpp];
    if (v && String(v).trim().length > 0) s.add(f.key);
  }
  return s;
}

// ── Freshness helpers ───────────────────────────────────────────────────────
function freshnessDot(daysAgo: number | null): { color: string; label: string } {
  if (daysAgo === null) return { color: 'bg-gray-300', label: 'never' };
  if (daysAgo <= 3) return { color: 'bg-status-success', label: `${daysAgo}d` };
  if (daysAgo <= 7) return { color: 'bg-status-warning', label: `${daysAgo}d` };
  return { color: 'bg-status-overdue', label: `${daysAgo}d` };
}

function daysInStage(stageChangedAt: string | null): number | null {
  if (!stageChangedAt) return null;
  return Math.floor((Date.now() - new Date(stageChangedAt).getTime()) / 86400000);
}

// ── Forecast category styling ───────────────────────────────────────────────
const FC_STYLES: Record<string, string> = {
  commit:      'bg-blue-100 text-blue-800',
  'most likely': 'bg-amber-100 text-amber-800',
  upside:      'bg-purple-100 text-purple-800',
  pipeline:    'bg-gray-100 text-gray-700',
  omitted:     'bg-gray-100 text-gray-500',
};

function ForecastBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-[9px] text-brand-navy-30 italic">—</span>;
  const style = FC_STYLES[category.toLowerCase()] || 'bg-gray-100 text-gray-600';
  return <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${style}`}>{category}</span>;
}

// ── Stage badge (lightweight inline version) ────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  'Qualify': 'bg-gray-50 text-gray-600 border-gray-200',
  'Build Value': 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  'Develop Solution': 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
  'Proposal Sent': 'bg-purple-50 text-purple-700 border-purple-200/60',
  'Negotiate': 'bg-blue-50 text-blue-700 border-blue-200/60',
  'Submitted for Booking': 'bg-amber-50 text-amber-700 border-amber-200/60',
};

function StagePill({ stage }: { stage: string }) {
  const style = STAGE_COLORS[stage] || 'bg-gray-50 text-gray-600 border-gray-200';
  return <span className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${style}`}>{stage}</span>;
}

// ── Health score (simple inline) ────────────────────────────────────────────
function HealthBadge({ opp }: { opp: ForecastOpp }) {
  const score = computeSimpleHealth(opp);
  const factors = computeHealthFactors(opp);
  const color = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-status-overdue';
  return (
    <HoverTooltip width={220} content={
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-brand-navy">Health Score</span>
          <span className={`text-[12px] font-bold ${color}`}>{score}/100</span>
        </div>
        <div className="space-y-1">
          {factors.map(f => (
            <div key={f.label} className="flex items-center justify-between text-[10px]">
              <span className="text-brand-navy-70">{f.label}</span>
              <span className={f.penalty > 0 ? 'text-status-overdue font-medium' : 'text-emerald-600 font-medium'}>
                {f.penalty > 0 ? `−${f.penalty}` : '✓'}
              </span>
            </div>
          ))}
        </div>
      </div>
    }>
      <span className={`text-[10px] font-semibold ${color} cursor-default`}>{score}</span>
    </HoverTooltip>
  );
}

function computeHealthFactors(opp: ForecastOpp): { label: string; penalty: number }[] {
  const factors: { label: string; penalty: number }[] = [];
  const mScore = meddpiccScore(opp);
  const meddpiccMax = opp.record_type?.toLowerCase()?.includes('upsell') ? 10 : 30;
  const mPenalty = Math.round(((9 - mScore) / 9) * meddpiccMax);
  factors.push({ label: `MEDDPICC (${mScore}/9)`, penalty: mPenalty });
  const daysAgo = opp.se_comments_days_ago;
  const cPenalty = daysAgo === null ? 15 : daysAgo > 21 ? 25 : daysAgo > 7 ? 10 : 0;
  factors.push({ label: `SE Comments (${daysAgo !== null ? `${daysAgo}d` : 'never'})`, penalty: cPenalty });
  const tPenalty = Math.min(opp.overdue_task_count * 7, 35);
  factors.push({ label: `Overdue Tasks (${opp.overdue_task_count})`, penalty: tPenalty });
  const stDays = daysInStage(opp.stage_changed_at);
  const sPenalty = stDays !== null && stDays > 45 ? 15 : stDays !== null && stDays > 30 ? 8 : 0;
  factors.push({ label: `Stage Velocity (${stDays !== null ? `${stDays}d` : '?'})`, penalty: sPenalty });
  return factors;
}

function computeSimpleHealth(opp: ForecastOpp): number {
  let score = 100;
  // MEDDPICC deduction
  const mScore = meddpiccScore(opp);
  const meddpiccPenalty = opp.record_type?.toLowerCase()?.includes('upsell') ? 10 : 30;
  score -= Math.round(((9 - mScore) / 9) * meddpiccPenalty);
  // SE comments freshness
  const daysAgo = opp.se_comments_days_ago;
  if (daysAgo === null) score -= 15;
  else if (daysAgo > 21) score -= 25;
  else if (daysAgo > 7) score -= 10;
  // Overdue tasks
  score -= Math.min(opp.overdue_task_count * 7, 35);
  // Stage velocity
  const stDays = daysInStage(opp.stage_changed_at);
  if (stDays !== null && stDays > 45) score -= 15;
  else if (stDays !== null && stDays > 30) score -= 8;
  return Math.max(0, Math.min(100, score));
}

// ── Territory grouping ──────────────────────────────────────────────────────
const NA_TEAMS = new Set(['NA Enterprise', 'NA Strategic']);
const INTL_TEAMS = new Set(['EMEA', 'ANZ']);

type ForecastRegion = 'NA' | 'INTL';

function detectDefaultRegion(userTeams: string[]): ForecastRegion {
  for (const t of userTeams) {
    if (NA_TEAMS.has(t)) return 'NA';
    if (INTL_TEAMS.has(t)) return 'INTL';
  }
  return 'NA'; // fallback
}

function regionFilter(opp: { team?: string | null }, region: ForecastRegion): boolean {
  const t = opp.team || '';
  if (region === 'NA') return NA_TEAMS.has(t);
  return INTL_TEAMS.has(t);
}

// ── Stage ordering for pipeline sort ────────────────────────────────────────
const STAGE_ORDER: Record<string, number> = {
  'Qualify': 1,
  'Build Value': 2,
  'Develop Solution': 3,
  'Proposal Sent': 4,
  'Negotiate': 5,
  'Submitted for Booking': 6,
};

// ── Forecast category ordering ──────────────────────────────────────────────
const FC_ORDER: Record<string, number> = {
  'commit': 1,
  'most likely': 2,
  'upside': 3,
  'pipeline': 4,
  'omitted': 5,
};

function getFcGroup(fc: string | null): string {
  if (!fc) return 'Uncategorized';
  return fc;
}

// ── FQ helpers ──────────────────────────────────────────────────────────────
function getCurrentFQ(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q}-${now.getFullYear()}`;
}

function getNextFQ(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  if (q === 4) return `Q1-${now.getFullYear() + 1}`;
  return `Q${q + 1}-${now.getFullYear()}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════════════════

export default function ForecastingBriefPage() {
  const { teamNames } = useTeamScope();
  const userTeams = useMemo(() => [...teamNames], [teamNames]);

  // Region + FQ state
  const [region, setRegion] = useState<ForecastRegion>(() => detectDefaultRegion(userTeams));
  const [showNextFQ, setShowNextFQ] = useState(false);
  const activeFQ = showNextFQ ? getNextFQ() : getCurrentFQ();

  // Update default region when user teams load
  useEffect(() => {
    if (userTeams.length > 0) setRegion(detectDefaultRegion(userTeams));
  }, [userTeams]);

  // Data state
  const [data, setData] = useState<ForecastingBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<'fq' | 'deals'>('fq');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [filterFc, setFilterFc] = useState<string>('');
  const [filterSe, setFilterSe] = useState<string>('');
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [dismissedAlert, setDismissedAlert] = useState(false);

  // Drawer state
  const [drawerOppId, setDrawerOppId] = useState<number | null>(null);

  // Bulk summary generation state
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number } | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getForecastingBrief(activeFQ);
      setData(result);
    } catch {
      setError('Failed to load forecasting brief');
    } finally {
      setLoading(false);
    }
  }, [activeFQ]);

  useEffect(() => { load(); }, [load]);

  // ── Auto-generate narrative on Friday if stale ──────────────────────────
  useEffect(() => {
    if (!data) return;
    const isFriday = new Date().getDay() === 5;
    if (!isFriday) return;
    if (data.narrative) {
      const genAge = (Date.now() - new Date(data.narrative.generated_at).getTime()) / 86400000;
      if (genAge < 1) return;
    }
    (async () => {
      setNarrativeLoading(true);
      try {
        const result = await generateNarrative(data.fiscal_period);
        setData(prev => prev ? { ...prev, narrative: result } : prev);
      } catch { /* silently fail */ }
      setNarrativeLoading(false);
    })();
  }, [data?.fiscal_period, data?.narrative?.generated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered + sorted opportunities ─────────────────────────────────────
  const filteredOpps = useMemo(() => {
    if (!data) return [];
    return data.opportunities
      .filter(o => regionFilter(o, region))
      .filter(o => !filterFc || (o.forecast_category || '').toLowerCase() === filterFc.toLowerCase())
      .filter(o => !filterSe || (o.se_owner_name || '') === filterSe)
      .sort((a, b) => {
        // Primary: forecast category order
        const fcA = FC_ORDER[(a.forecast_category || '').toLowerCase()] ?? 99;
        const fcB = FC_ORDER[(b.forecast_category || '').toLowerCase()] ?? 99;
        if (fcA !== fcB) return fcA - fcB;
        // Secondary: stage order (further along = first)
        const stA = STAGE_ORDER[a.stage] ?? 99;
        const stB = STAGE_ORDER[b.stage] ?? 99;
        if (stA !== stB) return stB - stA; // reverse: later stage first
        // Tertiary: ARR descending
        return (parseFloat(b.arr || '0') || 0) - (parseFloat(a.arr || '0') || 0);
      });
  }, [data, region, filterFc, filterSe]);

  // Group opps by forecast category for rendering
  const groupedOpps = useMemo(() => {
    const groups: { label: string; opps: ForecastOpp[] }[] = [];
    let currentGroup = '';
    for (const opp of filteredOpps) {
      const group = getFcGroup(opp.forecast_category);
      if (group !== currentGroup) {
        groups.push({ label: group, opps: [] });
        currentGroup = group;
      }
      groups[groups.length - 1].opps.push(opp);
    }
    return groups;
  }, [filteredOpps]);

  // Key deals (filtered by region)
  const keyDeals = useMemo(() => {
    if (!data) return [];
    return data.opportunities
      .filter(o => o.key_deal && regionFilter(o, region));
  }, [data, region]);

  // SE list for filter dropdown (scoped to region)
  const seList = useMemo(() => {
    if (!data) return [];
    const names = new Set(
      data.opportunities
        .filter(o => regionFilter(o, region))
        .map(o => o.se_owner_name)
        .filter(Boolean) as string[]
    );
    return Array.from(names).sort();
  }, [data, region]);

  // Recompute KPIs from region-filtered data
  const regionKpi = useMemo(() => {
    const opps = data?.opportunities.filter(o => regionFilter(o, region)) ?? [];
    let totalArr = 0, commitArr = 0, mlArr = 0, upsideArr = 0;
    let commitCount = 0, mlCount = 0;
    let staleCount = 0, unassignedCount = 0, activePocs = 0;
    let meddpiccSum = 0, meddpiccDenom = 0;

    for (const o of opps) {
      const arr = parseFloat(o.arr || '0') || 0;
      totalArr += arr;
      const fc = (o.forecast_category || '').toLowerCase();
      if (fc === 'commit') { commitArr += arr; commitCount++; }
      else if (fc === 'most likely') { mlArr += arr; mlCount++; }
      else if (fc === 'upside') { upsideArr += arr; }
      if (o.se_owner_id) {
        if (o.se_comments_days_ago != null && o.se_comments_days_ago > 7) staleCount++;
        else if (!o.se_comments_updated_at) staleCount++;
      }
      if (!o.se_owner_id) unassignedCount++;
      if (o.poc_status?.toLowerCase().includes('in progress')) activePocs++;
      if (fc === 'commit' || fc === 'most likely') {
        meddpiccSum += meddpiccScore(o);
        meddpiccDenom++;
      }
    }

    return {
      total_arr: totalArr, deal_count: opps.length,
      commit_arr: commitArr, commit_count: commitCount,
      most_likely_arr: mlArr, most_likely_count: mlCount,
      upside_arr: upsideArr,
      stale_comments_count: staleCount, unassigned_se_count: unassignedCount,
      active_pocs: activePocs,
      avg_meddpicc_commit_ml: meddpiccDenom > 0 ? Math.round((meddpiccSum / meddpiccDenom) * 10) / 10 : 0,
    };
  }, [data, region]);

  // Thursday stale alert check
  const isThursday = new Date().getDay() === 4;
  const showStaleAlert = isThursday && !dismissedAlert && regionKpi.stale_comments_count > 0;

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleGenerateNarrative = async () => {
    if (!data) return;
    setNarrativeLoading(true);
    try {
      const result = await generateNarrative(data.fiscal_period);
      setData(prev => prev ? { ...prev, narrative: result } : prev);
    } catch { /* silently fail */ }
    setNarrativeLoading(false);
  };

  const toggleRow = (id: number) => {
    setExpandedRow(prev => prev === id ? null : id);
  };

  // Opps needing a summary refresh (no summary or >5 days old)
  const oppsNeedingSummary = useMemo(() => {
    if (!data) return [];
    const fiveDaysMs = 5 * 86400000;
    return data.opportunities.filter(o => {
      if (!o.ai_summary_generated_at) return true;
      return Date.now() - new Date(o.ai_summary_generated_at).getTime() > fiveDaysMs;
    });
  }, [data]);

  const handleBulkGenerate = async () => {
    setBulkConfirmOpen(false);
    setBulkRunning(true);
    setBulkResult(null);
    const ids = oppsNeedingSummary.map(o => o.id);
    setBulkProgress({ done: 0, total: ids.length });

    // Process in batches of 10 to show progress updates
    const batchSize = 10;
    let totalSucceeded = 0;
    let totalFailed = 0;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      try {
        const result = await bulkGenerateSummaries(batch);
        totalSucceeded += result.succeeded;
        totalFailed += result.failed;
      } catch {
        totalFailed += batch.length;
      }
      setBulkProgress({ done: Math.min(i + batchSize, ids.length), total: ids.length });
    }

    setBulkRunning(false);
    setBulkProgress(null);
    setBulkResult({ succeeded: totalSucceeded, failed: totalFailed });
    // Refresh data to pick up new summaries
    load();
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) return <Loading />;
  if (error || !data) return (
    <div className="flex items-center justify-center py-16 text-sm text-status-overdue">{error || 'No data'}</div>
  );

  const { narrative, fiscal_period } = data;
  const kpi = regionKpi;
  const regionTeams = region === 'NA' ? 'NA Enterprise + NA Strategic' : 'EMEA + ANZ';

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-brand-navy">Forecasting Brief</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-purple/10 text-brand-purple border border-brand-purple/20">
              {fiscal_period}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {region} — {regionTeams}
            </span>
          </div>
          <p className="text-[12px] text-brand-navy-70 mt-0.5">SE perspective for your forecast call. Auto-refreshed Fridays.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Region toggle */}
          <div className="flex rounded-lg border border-brand-navy-30/40 overflow-hidden">
            <button
              onClick={() => setRegion('NA')}
              className={`px-3 py-1.5 text-[10px] font-semibold transition-colors ${region === 'NA' ? 'bg-brand-purple text-white' : 'bg-white text-brand-navy-70 hover:bg-gray-50'}`}
            >
              NA
            </button>
            <button
              onClick={() => setRegion('INTL')}
              className={`px-3 py-1.5 text-[10px] font-semibold transition-colors border-l border-brand-navy-30/40 ${region === 'INTL' ? 'bg-brand-purple text-white' : 'bg-white text-brand-navy-70 hover:bg-gray-50'}`}
            >
              INTL
            </button>
          </div>

          {/* FQ toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-[10px] text-brand-navy-70">Next FQ</span>
            <div
              onClick={() => setShowNextFQ(!showNextFQ)}
              className={`relative w-8 h-[18px] rounded-full transition-colors cursor-pointer ${showNextFQ ? 'bg-brand-purple' : 'bg-brand-navy-30/60'}`}
            >
              <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${showNextFQ ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
            </div>
          </label>

          {narrative && (
            <span className="text-[10px] text-brand-navy-30">
              Refreshed {new Date(narrative.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[11px] font-medium hover:bg-brand-purple-70 transition-colors shadow-sm"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stale Comments Alert Banner (Thursday) */}
      {showStaleAlert && (
        <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200/60 px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-status-warning/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-status-warning" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"/></svg>
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-semibold text-amber-900">{kpi.stale_comments_count} deal{kpi.stale_comments_count !== 1 ? 's have' : ' has'} stale SE comments (&gt;7 days old)</p>
            <p className="text-[11px] text-amber-700 mt-0.5">Forecast brief refreshes tomorrow morning. Consider notifying SEs to update their comments.</p>
          </div>
          <button className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-medium hover:bg-amber-200 transition-colors border border-amber-200/60">
            Notify SEs
          </button>
          <button onClick={() => setDismissedAlert(true)} className="text-[11px] text-amber-600 hover:text-amber-800 font-medium">
            Dismiss
          </button>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-0.5 mb-5">
        <button
          onClick={() => setActiveTab('fq')}
          className={`px-5 py-2.5 text-xs font-semibold rounded-t-xl border border-b-0 transition-colors ${activeTab === 'fq' ? 'bg-white text-brand-purple border-brand-navy-30/40 z-10' : 'bg-transparent text-brand-navy-70 border-transparent hover:text-brand-navy hover:bg-white/50'}`}
          style={activeTab === 'fq' ? { marginBottom: '-1px' } : undefined}
        >
          Current FQ
        </button>
        <button
          onClick={() => setActiveTab('deals')}
          className={`px-5 py-2.5 text-xs font-semibold rounded-t-xl border border-b-0 transition-colors ${activeTab === 'deals' ? 'bg-white text-brand-purple border-brand-navy-30/40 z-10' : 'bg-transparent text-brand-navy-70 border-transparent hover:text-brand-navy hover:bg-white/50'}`}
          style={activeTab === 'deals' ? { marginBottom: '-1px' } : undefined}
        >
          Key Deals
        </button>
      </div>
      <div className="border-t border-brand-navy-30/40 -mt-[5px]" />

      {/* ═══ TAB 1: CURRENT FQ ═══ */}
      {activeTab === 'fq' && (
        <div className="pt-5">
          {/* AI Forecast Narrative (collapsible, above pipeline) */}
          <details open className="mb-5 bg-white rounded-xl border border-brand-navy-30/40 shadow-sm overflow-hidden group">
            <summary className="px-4 py-3 border-b border-brand-navy-30/20 bg-gradient-to-r from-brand-pink/[0.03] to-brand-purple/[0.03] flex items-center justify-between cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2">
                <svg className="w-3 h-3 text-brand-navy-30 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#sg-fb)"/>
                  <defs><linearGradient id="sg-fb" x1="2" y1="2" x2="22" y2="22"><stop stopColor="#F10090"/><stop offset="1" stopColor="#6A2CF5"/></linearGradient></defs>
                </svg>
                <h3 className="text-[12px] font-semibold text-brand-navy">AI Forecast Narrative — SE Perspective</h3>
                {narrative && (
                  <span className="text-[9px] text-brand-navy-30 ml-2">
                    Generated {new Date(narrative.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
              <button
                onClick={(e) => { e.preventDefault(); handleGenerateNarrative(); }}
                disabled={narrativeLoading}
                className="text-[10px] text-brand-purple font-medium hover:text-brand-purple-70 disabled:opacity-50"
              >
                {narrativeLoading ? 'Generating…' : narrative ? 'Regenerate' : 'Generate'}
              </button>
            </summary>
            <div className="p-4">
              {narrativeLoading && !narrative ? (
                <div className="space-y-2">
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-3/5" />
                </div>
              ) : narrative ? (
                <NarrativeContent content={narrative.content} />
              ) : (
                <div className="text-center py-6">
                  <p className="text-[12px] text-brand-navy-70 mb-2">No narrative generated yet for {fiscal_period}.</p>
                  <button
                    onClick={handleGenerateNarrative}
                    className="px-4 py-2 rounded-lg bg-brand-purple text-white text-[11px] font-medium hover:bg-brand-purple-70 transition-colors"
                  >
                    Generate Narrative
                  </button>
                </div>
              )}
            </div>
          </details>

          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* Pipeline Total */}
            <div className="bg-white rounded-xl border border-brand-navy-30/40 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider">Sales Pipeline</span>
                <span className="text-[9px] text-brand-navy-30">{kpi.deal_count} deals</span>
              </div>
              <div className="text-2xl font-bold text-brand-navy">{formatARR(kpi.total_arr)}</div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  {kpi.total_arr > 0 && (
                    <>
                      <div className="h-full bg-blue-400 rounded-l-full" style={{ width: `${(kpi.commit_arr / kpi.total_arr) * 100}%` }} />
                      <div className="h-full bg-amber-400" style={{ width: `${(kpi.most_likely_arr / kpi.total_arr) * 100}%` }} />
                      <div className="h-full bg-purple-300 rounded-r-full" style={{ width: `${(kpi.upside_arr / kpi.total_arr) * 100}%` }} />
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[9px] text-brand-navy-70">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />Commit {formatARR(kpi.commit_arr)}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />ML {formatARR(kpi.most_likely_arr)}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-300" />Upside {formatARR(kpi.upside_arr)}</span>
              </div>
            </div>

            {/* Commit + Most Likely */}
            <div className="bg-white rounded-xl border border-brand-navy-30/40 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider">Commit + Most Likely</span>
                <span className="text-[9px] text-brand-navy-30">{kpi.commit_count + kpi.most_likely_count} deals</span>
              </div>
              <div className="text-2xl font-bold text-brand-navy">{formatARR(kpi.commit_arr + kpi.most_likely_arr)}</div>
              <div className="mt-2 flex items-center gap-3 text-[10px]">
                {kpi.deal_count - kpi.stale_comments_count - kpi.unassigned_se_count > 0 && (
                  <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg>
                    {kpi.deal_count - kpi.stale_comments_count - kpi.unassigned_se_count} with fresh SE comments
                  </span>
                )}
                {kpi.stale_comments_count > 0 && (
                  <>
                    {kpi.deal_count - kpi.stale_comments_count - kpi.unassigned_se_count > 0 && <span className="text-brand-navy-30">|</span>}
                    <span className="text-status-overdue font-medium">{kpi.stale_comments_count} stale</span>
                  </>
                )}
              </div>
            </div>

            {/* SE Engagement Health */}
            <div className="bg-white rounded-xl border border-brand-navy-30/40 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider">SE Engagement Health</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-lg font-bold text-status-overdue">{kpi.stale_comments_count}</div>
                  <div className="text-[10px] text-brand-navy-70">Stale SE Comments</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-status-warning">{kpi.unassigned_se_count}</div>
                  <div className="text-[10px] text-brand-navy-70">No SE Assigned</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-brand-purple">{kpi.active_pocs}</div>
                  <div className="text-[10px] text-brand-navy-70">Active PoCs</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-brand-navy">{kpi.avg_meddpicc_commit_ml}</div>
                  <div className="text-[10px] text-brand-navy-70">Avg MEDDPICC (C+ML)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Forecast Table */}
          <div className="bg-white rounded-xl border border-brand-navy-30/40 shadow-sm overflow-hidden mb-5">
            <div className="px-4 py-3 border-b border-brand-navy-30/20 flex items-center justify-between bg-gray-50/50">
              <h3 className="text-[12px] font-semibold text-brand-navy uppercase tracking-wider">Pipeline — {fiscal_period}</h3>
              <div className="flex items-center gap-2">
                <select
                  value={filterFc}
                  onChange={e => setFilterFc(e.target.value)}
                  className="text-[10px] border border-brand-navy-30/40 rounded px-2 py-1 text-brand-navy-70 bg-white"
                >
                  <option value="">All Forecast Categories</option>
                  <option value="Commit">Commit</option>
                  <option value="Most Likely">Most Likely</option>
                  <option value="Upside">Upside</option>
                  <option value="Pipeline">Pipeline</option>
                </select>
                <select
                  value={filterSe}
                  onChange={e => setFilterSe(e.target.value)}
                  className="text-[10px] border border-brand-navy-30/40 rounded px-2 py-1 text-brand-navy-70 bg-white"
                >
                  <option value="">All SEs</option>
                  {seList.map(se => <option key={se} value={se}>{se}</option>)}
                </select>
                <button
                  onClick={() => setBulkConfirmOpen(true)}
                  disabled={bulkRunning || oppsNeedingSummary.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-brand-purple/30 bg-brand-purple/5 text-brand-purple text-[10px] font-medium hover:bg-brand-purple/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/></svg>
                  {bulkRunning ? `Generating ${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0}…` : `Refresh Summaries${oppsNeedingSummary.length > 0 ? ` (${oppsNeedingSummary.length})` : ''}`}
                </button>
              </div>
            </div>

            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50/80 border-b border-brand-navy-30/20 text-[9px] font-semibold text-brand-navy-70 uppercase tracking-wider">
                  <th className="text-left px-3 py-2">Opportunity</th>
                  <th className="text-right px-3 py-2 w-20">ARR</th>
                  <th className="text-center px-2 py-2 w-24">Stage</th>
                  <th className="text-left px-3 py-2 w-14">SE</th>
                  <th className="text-left px-3 py-2">SE Comments</th>
                  <th className="text-center px-2 py-2 w-16">Health</th>
                  <th className="text-left px-3 py-2 w-40">Tech Next Step</th>
                  <th className="text-center px-2 py-2 w-12">
                    <svg className="w-3 h-3 mx-auto text-brand-navy-70" viewBox="0 0 20 20" fill="currentColor" aria-label="Blockers"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z"/></svg>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-navy-30/15">
                {groupedOpps.map(group => (
                  <React.Fragment key={group.label}>
                    {/* Forecast category group header */}
                    <tr className="border-t-2 border-brand-navy-30/40">
                      <td colSpan={8} className="px-3 py-2.5 bg-gradient-to-r from-gray-100/90 to-gray-50/60">
                        <div className="flex items-center gap-2.5">
                          <ForecastBadge category={group.label === 'Uncategorized' ? null : group.label} />
                          <span className="text-[11px] font-bold text-brand-navy">
                            {group.opps.length} deal{group.opps.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-[11px] font-semibold text-brand-navy-70">
                            {formatARR(group.opps.reduce((s, o) => s + (parseFloat(o.arr || '0') || 0), 0))}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {group.opps.map(opp => {
                      const freshness = freshnessDot(opp.se_comments_days_ago);
                      const isExpanded = expandedRow === opp.id;
                      const hasBlocker = !!opp.technical_blockers;
                      const rowBg = !opp.se_owner_id ? 'bg-amber-50/20' : hasBlocker ? 'bg-red-50/20' : '';

                      return (
                        <OppRow
                          key={opp.id}
                          opp={opp}
                          isExpanded={isExpanded}
                          rowBg={rowBg}
                          freshness={freshness}
                          hasBlocker={hasBlocker}
                          onToggle={() => toggleRow(opp.id)}
                          onOpenDetail={() => setDrawerOppId(opp.id)}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {/* Table footer */}
            <div className="px-4 py-2.5 border-t border-brand-navy-30/20 bg-gray-50/50 flex items-center justify-between text-[10px] text-brand-navy-70">
              <span>Showing {filteredOpps.length} deals ({region})</span>
              <div className="flex items-center gap-4">
                <span className="font-semibold text-brand-navy">Total: {formatARR(filteredOpps.reduce((s, o) => s + (parseFloat(o.arr || '0') || 0), 0))}</span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ═══ TAB 2: KEY DEALS ═══ */}
      {activeTab === 'deals' && (
        <div className="pt-5">
          <p className="text-[11px] text-brand-navy-70 mb-4">Quick-access summaries for your key deals. Click to expand full detail.</p>
          {keyDeals.length === 0 ? (
            <div className="text-center py-12 text-sm text-brand-navy-70">No key deals in {fiscal_period}.</div>
          ) : (
            <div className="space-y-4">
              {keyDeals.map(opp => (
                <KeyDealCard
                  key={opp.id}
                  opp={opp}
                  onOpenDetail={() => setDrawerOppId(opp.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Slide-in drawer */}
      <Drawer open={drawerOppId !== null} onClose={() => setDrawerOppId(null)}>
        {drawerOppId !== null && (
          <OpportunityDetail
            key={drawerOppId}
            oppId={drawerOppId}
            onRefreshList={load}
          />
        )}
      </Drawer>

      {/* Bulk Summary Confirmation Modal */}
      {bulkConfirmOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center">
          <div className="absolute inset-0 bg-brand-navy/40 backdrop-blur-sm" onClick={() => setBulkConfirmOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-brand-navy-30/40 w-[420px] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-purple/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-purple" viewBox="0 0 24 24" fill="none"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/></svg>
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-brand-navy">Refresh AI Summaries</h3>
                <p className="text-[11px] text-brand-navy-70">Generate summaries for deals missing or with stale (&gt;5 days) summaries</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-brand-navy-70">Deals to process</span>
                <span className="font-bold text-brand-navy text-[16px]">{oppsNeedingSummary.length}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-brand-navy-70 mt-1">
                <span>Total deals in {fiscal_period}</span>
                <span>{data.opportunities.length}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-brand-navy-70 mt-0.5">
                <span>Already up to date</span>
                <span>{data.opportunities.length - oppsNeedingSummary.length}</span>
              </div>
            </div>
            <p className="text-[11px] text-brand-navy-70 mb-5">
              This will make <strong>{oppsNeedingSummary.length}</strong> API calls to Claude. Each deal takes ~2-3 seconds.
              Estimated time: <strong>~{Math.ceil(oppsNeedingSummary.length * 2.5 / 60)} min</strong>.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setBulkConfirmOpen(false)}
                className="px-4 py-2 rounded-lg text-[11px] font-medium text-brand-navy-70 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkGenerate}
                className="px-4 py-2 rounded-lg bg-brand-purple text-white text-[11px] font-medium hover:bg-brand-purple-70 transition-colors shadow-sm"
              >
                Generate {oppsNeedingSummary.length} Summaries
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Summary Progress Overlay */}
      {bulkRunning && bulkProgress && (
        <div className="fixed bottom-6 right-6 z-[9999] bg-white rounded-xl shadow-2xl border border-brand-navy-30/40 p-4 w-[300px]">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-brand-purple animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.49-8.49l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93"/></svg>
            <span className="text-[12px] font-semibold text-brand-navy">Generating AI Summaries…</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-brand-purple rounded-full transition-all duration-300"
              style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-brand-navy-70">{bulkProgress.done} of {bulkProgress.total} deals processed</span>
        </div>
      )}

      {/* Bulk Summary Result Toast */}
      {bulkResult && !bulkRunning && (
        <div className="fixed bottom-6 right-6 z-[9999] bg-white rounded-xl shadow-2xl border border-brand-navy-30/40 p-4 w-[300px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
              </span>
              <div>
                <span className="text-[12px] font-semibold text-brand-navy">Summaries Generated</span>
                <p className="text-[10px] text-brand-navy-70">
                  {bulkResult.succeeded} succeeded{bulkResult.failed > 0 ? `, ${bulkResult.failed} failed` : ''}
                </p>
              </div>
            </div>
            <button onClick={() => setBulkResult(null)} className="text-brand-navy-30 hover:text-brand-navy">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════════════════════════

function OppRow({ opp, isExpanded, rowBg, freshness, hasBlocker, onToggle, onOpenDetail }: {
  opp: ForecastOpp;
  isExpanded: boolean;
  rowBg: string;
  freshness: { color: string; label: string };
  hasBlocker: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
}) {
  const filled = meddpiccFilled(opp);
  const score = meddpiccScore(opp);
  const stDays = daysInStage(opp.stage_changed_at);

  return (
    <>
      <tr
        onClick={onToggle}
        className={`hover:bg-brand-purple-30/10 cursor-pointer transition-colors ${rowBg} ${isExpanded ? 'bg-brand-purple-30/10' : ''}`}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <svg
              className={`w-3 h-3 text-brand-navy-30 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
            ><path d="M9 5l7 7-7 7"/></svg>
            <span className="font-medium text-brand-navy">{opp.name}</span>
            {opp.key_deal && <span className="text-[8px] font-semibold bg-yellow-100 text-yellow-700 px-1 py-px rounded-full">KEY</span>}
          </div>
          <div className="text-[10px] text-brand-navy-70 ml-[18px]">{opp.account_name}{opp.account_industry ? ` · ${opp.account_industry}` : ''}</div>
        </td>
        <td className="text-right px-3 py-2.5 font-semibold">{formatARR(opp.arr)}</td>
        <td className="text-center px-2 py-2.5"><StagePill stage={opp.stage} /></td>
        <td className="px-3 py-2.5 text-[10px] text-brand-navy-70">
          {opp.se_owner_name ? (
            <span className="font-semibold cursor-default" title={opp.se_owner_name}>{initials(opp.se_owner_name)}</span>
          ) : <span className="text-status-overdue font-medium italic">—</span>}
        </td>
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          {opp.se_comments ? (
            <HoverTooltip width={320} content={
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`w-2 h-2 rounded-full ${freshness.color}`} />
                  <span className="text-[10px] font-semibold text-brand-navy-70">
                    SE: {opp.se_owner_name || 'Unassigned'} · Updated {opp.se_comments_days_ago !== null ? `${opp.se_comments_days_ago} days ago` : 'unknown'}
                  </span>
                </div>
                <p className="text-[11px] text-brand-navy whitespace-pre-wrap">{opp.se_comments}</p>
              </div>
            }>
              <div className="flex items-center gap-1.5 cursor-default">
                <span className={`w-1.5 h-1.5 rounded-full ${freshness.color} flex-shrink-0`} />
                <span className="text-[10px] text-brand-navy-70 truncate max-w-[180px]">{opp.se_comments}</span>
                <span className={`text-[9px] flex-shrink-0 font-medium ${opp.se_comments_days_ago !== null && opp.se_comments_days_ago > 7 ? 'text-status-overdue' : opp.se_comments_days_ago !== null && opp.se_comments_days_ago > 3 ? 'text-status-warning' : 'text-brand-navy-30'}`}>
                  {freshness.label}
                </span>
              </div>
            </HoverTooltip>
          ) : opp.se_owner_id ? (
            <span className="text-[10px] text-brand-navy-30 italic">No SE comments</span>
          ) : null}
        </td>
        <td className="text-center px-2 py-2.5"><HealthBadge opp={opp} /></td>
        <td className="px-3 py-2.5 text-[10px] text-brand-navy-70 truncate max-w-[160px]">{opp.next_step_sf || '—'}</td>
        <td className="text-center px-2 py-2.5">
          {hasBlocker ? (
            <span className="text-status-overdue" title={opp.technical_blockers || undefined}>
              <svg className="w-3.5 h-3.5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z"/></svg>
            </span>
          ) : '—'}
        </td>
      </tr>

      {/* Expansion row */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <div className={`border-l-4 px-5 py-4 ${!opp.se_owner_id ? 'bg-amber-50/40 border-status-warning' : hasBlocker ? 'bg-red-50/40 border-status-overdue' : 'bg-brand-purple-30/10 border-brand-purple'}`}>
              <div className="grid grid-cols-4 gap-4">
                {/* AI Summary */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <svg className="w-3 h-3 text-brand-purple" viewBox="0 0 24 24" fill="none"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/></svg>
                    <h4 className="text-[10px] font-semibold text-brand-navy uppercase tracking-wider">AI Summary</h4>
                  </div>
                  {opp.ai_summary ? (
                    <>
                      <p className="text-[11px] text-brand-navy leading-relaxed">{opp.ai_summary}</p>
                      {opp.ai_summary_generated_at && (
                        <p className="text-[9px] text-brand-navy-30 mt-1">Generated {formatDate(opp.ai_summary_generated_at)}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-[10px] text-brand-navy-30 italic">No AI summary cached. Open full detail to generate.</p>
                  )}
                </div>

                {/* SE Comments */}
                <div>
                  <h4 className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider mb-1.5">SE Comments</h4>
                  {opp.se_comments ? (
                    <>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${freshnessDot(opp.se_comments_days_ago).color}`} />
                        <span className={`text-[9px] font-medium ${opp.se_comments_days_ago !== null && opp.se_comments_days_ago > 7 ? 'text-status-overdue' : opp.se_comments_days_ago !== null && opp.se_comments_days_ago > 3 ? 'text-status-warning' : 'text-emerald-700'}`}>
                          Updated {opp.se_comments_days_ago !== null ? `${opp.se_comments_days_ago} days ago` : 'unknown'}
                          {opp.se_comments_days_ago !== null && opp.se_comments_days_ago > 7 && ' — STALE'}
                        </span>
                      </div>
                      <p className="text-[11px] text-brand-navy leading-relaxed">{opp.se_comments}</p>
                    </>
                  ) : !opp.se_owner_id ? (
                    <div className="mt-2 rounded-lg bg-amber-100/60 border border-amber-200/60 px-3 py-2 text-center">
                      <span className="text-[10px] text-amber-800 font-medium">No SE assigned — no comments available</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-brand-navy-30 italic">No SE comments yet.</p>
                  )}
                </div>

                {/* Technical Status */}
                <div>
                  <h4 className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider mb-1.5">Technical Status</h4>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-semibold text-brand-navy-70 w-16">PoC:</span>
                      {opp.poc_status ? (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${opp.poc_status.toLowerCase().includes('completed') ? 'bg-emerald-50 text-emerald-700' : opp.poc_status.toLowerCase().includes('in progress') ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                          {opp.poc_status}
                        </span>
                      ) : <span className="text-brand-navy-30">N/A</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-semibold text-brand-navy-70 w-16">Blockers:</span>
                      {opp.technical_blockers ? (
                        <span className="text-status-overdue font-semibold">{opp.technical_blockers}</span>
                      ) : <span className="text-emerald-600">None</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-semibold text-brand-navy-70 w-16">Compete:</span>
                      <span className="text-brand-navy">{opp.engaged_competitors || 'None'}</span>
                    </div>
                    {opp.deploy_mode && (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-semibold text-brand-navy-70 w-16">Deploy:</span>
                        <span className="text-brand-navy">{opp.deploy_mode}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* MEDDPICC Gaps */}
                <div>
                  <h4 className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider mb-1.5">MEDDPICC Gaps</h4>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {MEDDPICC_FIELDS.map(f => {
                      const isFilled = filled.has(f.key);
                      return (
                        <span
                          key={f.key}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${isFilled ? 'bg-emerald-50 text-emerald-700' : 'bg-status-overdue/10 text-status-overdue font-semibold border border-status-overdue/20'}`}
                        >
                          {f.label} {isFilled ? '✓' : '❌'}
                        </span>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-brand-navy-70">
                    Score: <strong className={score >= 7 ? 'text-emerald-600' : score >= 5 ? 'text-brand-navy' : 'text-status-overdue'}>{score}/9</strong>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-3 pt-2.5 border-t border-brand-navy-30/20 flex items-center justify-between">
                <div className="text-[10px] text-brand-navy-70">
                  Stage: {opp.stage} for <strong className={stDays !== null && stDays > 30 ? 'text-status-warning' : 'text-brand-navy'}>{stDays !== null ? `${stDays} days` : '—'}</strong>
                  {opp.close_date && <> · Close: {formatDate(opp.close_date)}</>}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onOpenDetail(); }}
                  className="flex items-center gap-1 text-[11px] text-brand-purple font-semibold hover:text-brand-purple-70 transition-colors"
                >
                  Open full detail
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Key Deal Card (Tab 2) ───────────────────────────────────────────────────

function KeyDealCard({ opp, onOpenDetail }: { opp: ForecastOpp; onOpenDetail: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const filled = meddpiccFilled(opp);
  const score = meddpiccScore(opp);
  const health = computeSimpleHealth(opp);
  const hasBlocker = !!opp.technical_blockers;
  const stDays = daysInStage(opp.stage_changed_at);
  const freshness = freshnessDot(opp.se_comments_days_ago);

  const borderColor = !opp.se_owner_id ? 'border-status-warning/30' : hasBlocker || health < 40 ? 'border-status-overdue/20' : 'border-brand-navy-30/40';
  const headerBg = !opp.se_owner_id ? 'hover:bg-amber-50/30 bg-amber-50/10' : hasBlocker || health < 40 ? 'hover:bg-red-50/30 bg-red-50/10' : 'hover:bg-gray-50/50';

  return (
    <div className={`bg-white rounded-xl border ${borderColor} shadow-sm overflow-hidden`}>
      <div
        className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer select-none transition-colors ${headerBg}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg
          className={`w-3.5 h-3.5 text-brand-navy-70 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
        ><path d="M9 5l7 7-7 7"/></svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[13px] text-brand-navy">{opp.name}</span>
            <span className="text-[8px] font-semibold bg-yellow-100 text-yellow-700 px-1.5 py-px rounded-full">KEY</span>
            <ForecastBadge category={opp.forecast_category} />
            {hasBlocker && <span className="text-[8px] px-1.5 py-0.5 rounded bg-status-overdue/10 text-status-overdue font-bold border border-status-overdue/20">BLOCKER</span>}
            {!opp.se_owner_id && <span className="text-[8px] px-1.5 py-0.5 rounded bg-status-warning/10 text-status-warning font-bold border border-status-warning/20">NO SE</span>}
          </div>
          <div className="text-[10px] text-brand-navy-70 mt-0.5">
            {opp.account_name} · {formatARR(opp.arr)} · {opp.stage}
            {opp.close_date && <> · Close {formatDate(opp.close_date)}</>}
            · SE: {opp.se_owner_name ? <span title={opp.se_owner_name}>{initials(opp.se_owner_name)}</span> : <span className="text-status-overdue font-medium">Unassigned</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${health >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : health >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            Health {health}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-purple-30 text-brand-purple border border-brand-purple/20">
            MEDDPICC {score}/9
          </span>
        </div>
      </div>

      {isOpen && (
        <div className={`px-5 pb-4 border-t ${!opp.se_owner_id ? 'border-status-warning/20 bg-amber-50/10' : hasBlocker || health < 40 ? 'border-status-overdue/20 bg-red-50/10' : 'border-brand-navy-30/20 bg-gray-50/30'}`}>
          <div className="grid grid-cols-3 gap-5 pt-3">
            {/* SE Perspective */}
            <div>
              <h4 className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider mb-1.5">SE Comments</h4>
              {opp.se_comments ? (
                <>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${freshness.color}`} />
                    <span className={`text-[9px] font-medium ${opp.se_comments_days_ago !== null && opp.se_comments_days_ago > 7 ? 'text-status-overdue font-bold' : opp.se_comments_days_ago !== null && opp.se_comments_days_ago > 3 ? 'text-status-warning' : 'text-emerald-700'}`}>
                      Updated {opp.se_comments_days_ago !== null ? `${opp.se_comments_days_ago} days ago` : 'unknown'}
                    </span>
                  </div>
                  <p className="text-[11px] text-brand-navy leading-relaxed">{opp.se_comments}</p>
                </>
              ) : (
                <p className="text-[10px] text-brand-navy-30 italic">{opp.se_owner_id ? 'No SE comments yet.' : 'No SE assigned.'}</p>
              )}
            </div>

            {/* Technical Status */}
            <div>
              <h4 className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider mb-1.5">Technical Status</h4>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-semibold text-brand-navy-70 w-20">PoC Status:</span>
                  {opp.poc_status ? (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${opp.poc_status.toLowerCase().includes('completed') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {opp.poc_status}
                    </span>
                  ) : <span className="text-brand-navy-30">N/A</span>}
                </div>
                {opp.engaged_competitors && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-semibold text-brand-navy-70 w-20">Competitors:</span>
                    <span className="text-brand-navy">{opp.engaged_competitors}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-semibold text-brand-navy-70 w-20">Blockers:</span>
                  {opp.technical_blockers ? (
                    <span className="text-status-overdue font-semibold">{opp.technical_blockers}</span>
                  ) : <span className="text-emerald-600">None</span>}
                </div>
              </div>
            </div>

            {/* Next Steps + Velocity */}
            <div>
              <h4 className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider mb-1.5">Next Steps & Velocity</h4>
              {opp.next_step_sf && (
                <div className="space-y-1.5 text-[11px] mb-2">
                  <div className="flex items-start gap-1.5">
                    <span className="text-brand-purple mt-0.5">●</span>
                    <span className="text-brand-navy">{opp.next_step_sf}</span>
                  </div>
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-brand-navy-30/20">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-brand-navy-70">In {opp.stage} for:</span>
                  <span className={`font-semibold ${stDays !== null && stDays > 30 ? 'text-status-warning' : 'text-brand-navy'}`}>
                    {stDays !== null ? `${stDays} days` : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] mt-0.5">
                  <span className="text-brand-navy-70">MEDDPICC gaps:</span>
                  <span className="text-status-overdue font-medium">
                    {MEDDPICC_FIELDS.filter(f => !filled.has(f.key)).map(f => f.label).join(', ') || 'None'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Quick Take */}
          {opp.ai_summary && (
            <div className={`mt-3 rounded-lg px-3 py-2 flex items-start gap-2 ${hasBlocker || health < 40 ? 'bg-red-50 border border-status-overdue/20' : !opp.se_owner_id ? 'bg-amber-50 border border-amber-200/60' : 'bg-brand-purple-30/20 border border-brand-purple/10'}`}>
              <svg className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${hasBlocker || health < 40 ? 'text-status-overdue' : !opp.se_owner_id ? 'text-status-warning' : 'text-brand-purple'}`} viewBox="0 0 24 24" fill="none"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/></svg>
              <p className="text-[11px] text-brand-navy leading-relaxed"><strong>AI Quick Take:</strong> {opp.ai_summary}</p>
            </div>
          )}

          {/* Open detail link */}
          <div className="mt-3 pt-2.5 border-t border-brand-navy-30/20 flex justify-end">
            <button
              onClick={e => { e.stopPropagation(); onOpenDetail(); }}
              className="flex items-center gap-1 text-[11px] text-brand-purple font-semibold hover:text-brand-purple-70 transition-colors"
            >
              Open full detail
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Narrative renderer ──────────────────────────────────────────────────────

function NarrativeContent({ content }: { content: string }) {
  // Parse markdown-like sections: **On Track**, **At Risk**, **Needs Attention**
  const sections = content.split(/\*\*(On Track|At Risk|Needs Attention)\*\*/i);

  if (sections.length <= 1) {
    // No section headers found, render as plain text
    return <p className="text-[12px] text-brand-navy leading-relaxed whitespace-pre-wrap">{content}</p>;
  }

  const rendered: React.JSX.Element[] = [];
  // sections[0] is text before first header (usually empty)
  if (sections[0].trim()) {
    rendered.push(<p key="intro" className="text-[12px] text-brand-navy leading-relaxed mb-2">{sections[0].trim()}</p>);
  }

  for (let i = 1; i < sections.length; i += 2) {
    const title = sections[i];
    const body = sections[i + 1]?.trim() || '';
    const colorClass = title.toLowerCase().includes('on track')
      ? 'text-emerald-700'
      : title.toLowerCase().includes('at risk')
        ? 'text-status-warning'
        : 'text-status-overdue';

    rendered.push(
      <div key={title} className="mb-3">
        <h4 className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${colorClass}`}>{title}</h4>
        <p className="text-[12px] text-brand-navy leading-relaxed">{highlightBold(body)}</p>
      </div>
    );
  }

  return <div className="space-y-1">{rendered}</div>;
}

/** Convert **text** to <strong> */
function highlightBold(text: string): (string | React.JSX.Element)[] {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}
