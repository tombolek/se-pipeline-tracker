import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import type { ApiResponse } from '../types';

/* ── Types ── */
type Outcome = 'won' | 'lost' | 'in_flight' | 'kb_reference';

interface MatchChip {
  label: string;
  kind: 'match' | 'competitor' | 'warn' | 'product';
}

interface SimilarDeal {
  id: number;
  ref_type: 'opportunity' | 'kb';
  sf_opportunity_id: string | null;
  name: string;
  account_name: string | null;
  outcome: Outcome;
  stage: string | null;
  closed_date: string | null;
  arr: number | null;
  se_owner_name: string | null;
  account_industry: string | null;
  score: number;
  match_chips: MatchChip[];
  why_text: string | null;
  snippets: { source: string; text: string }[];
}

interface ActiveSignature {
  account_industry: string | null;
  account_segment: string | null;
  arr_band: string | null;
  deploy_mode: string | null;
  record_type: string | null;
  products: string[];
  engaged_competitors: string[];
}

interface PlaybookSummary {
  total_won: number;
  total_lost: number;
  against_competitor: string | null;
  against_competitor_won: number;
  against_competitor_lost: number;
}

interface SimilarDealsResponse {
  active: ActiveSignature;
  results: SimilarDeal[];
  total_candidates: number;
  total_above_threshold: number;
  counts_by_outcome: { won: number; lost: number; in_flight: number; kb_reference: number };
  playbook: PlaybookSummary;
}

/* ── Helpers ── */
function fmtArr(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function fmtClosedDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function chipClass(kind: MatchChip['kind']): string {
  switch (kind) {
    case 'match':      return 'bg-emerald-50 text-emerald-700';
    case 'competitor': return 'bg-red-50 text-red-700';
    case 'warn':       return 'bg-amber-50 text-amber-700';
    case 'product':    return 'bg-brand-purple-30/70 text-brand-purple';
  }
}

function outcomeBadge(r: SimilarDeal): { label: string; class: string } {
  switch (r.outcome) {
    case 'won':          return { label: 'Won',          class: 'text-status-success bg-emerald-50' };
    case 'lost':         return { label: 'Lost',         class: 'text-status-overdue bg-red-50' };
    case 'in_flight':    return { label: r.stage ? `In flight · ${r.stage}` : 'In flight', class: 'text-cyan-700 bg-cyan-50' };
    case 'kb_reference': return { label: 'KB reference', class: 'text-brand-purple bg-brand-purple-30/60' };
  }
}

function whyLabel(outcome: Outcome): string {
  switch (outcome) {
    case 'won':          return 'Notes:';
    case 'lost':         return 'Why it lost:';
    case 'in_flight':    return "What they're doing:";
    case 'kb_reference': return 'Proof point:';
  }
}

function metaLine(r: SimilarDeal): string {
  const parts: string[] = [];
  if (r.outcome === 'kb_reference') {
    if (r.account_industry) parts.push(r.account_industry);
  } else {
    if (r.outcome === 'in_flight') {
      parts.push('open');
    } else {
      parts.push(fmtClosedDate(r.closed_date));
    }
    parts.push(fmtArr(r.arr));
    if (r.se_owner_name) parts.push(`${r.se_owner_name} (SE)`);
  }
  return parts.join(' · ');
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const deg = Math.round((pct / 100) * 360);
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: `conic-gradient(#6A2CF5 ${deg}deg, #E5E7EB 0)` }}
    >
      <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
        <span className="text-[10px] font-bold text-brand-purple tabular-nums">{score}</span>
      </div>
    </div>
  );
}

type SortKey = 'score' | 'recency' | 'arr';

/* ── Playbook types ── */
interface KbPlaybook {
  win_pattern: string;
  positioning: string;
  anticipate: string[];
  lead_with: string[];
  based_on: string[];
}

interface KbPlaybookResponse {
  playbook: KbPlaybook | null;
  generated_at: string | null;
  is_stale: boolean;
  sources_available: number;
}

const PLAYBOOK_THRESHOLD = 3; // fetch/offer playbook when below this
const INSIGHTS_THRESHOLD = 5; // fetch/offer insights when at or above this
const INSIGHT_SCORE_MIN = 70; // only annotate strong matches; must match server-side INSIGHT_SCORE_MIN

interface Insight {
  ref_type: 'opportunity' | 'kb';
  id: number;
  insight: string;
}

interface InsightsResponse {
  insights: Insight[];
  generated_at: string | null;
  is_stale: boolean;
  candidates_considered: number;
}

/* ── Component ── */
export default function SimilarDealsTab({ oppId }: { oppId: number; oppName?: string }) {
  const [, setSearchParams] = useSearchParams();

  // Swap the drawer to a different opportunity by updating the shared
  // `?oppId=<sf_opportunity_id>` query param. The parent page's useOppUrlSync
  // hook resolves the sfId and re-renders the drawer with the new deal.
  const openSimilarDeal = useCallback((sfId: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('oppId', sfId);
      return next;
    });
  }, [setSearchParams]);

  const [data, setData] = useState<SimilarDealsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWon, setShowWon] = useState(true);
  const [showLost, setShowLost] = useState(true);
  const [showInFlight, setShowInFlight] = useState(true);
  const [showKb, setShowKb] = useState(true);
  const [sort, setSort] = useState<SortKey>('score');

  const [playbook, setPlaybook] = useState<KbPlaybookResponse | null>(null);
  const [playbookGenerating, setPlaybookGenerating] = useState(false);
  const [playbookError, setPlaybookError] = useState<string | null>(null);

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [insightsGenerating, setInsightsGenerating] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get<ApiResponse<SimilarDealsResponse>>(`/opportunities/${oppId}/similar-deals`);
      setData(r.data.data);
      setError(null);
    } catch {
      setError('Failed to load similar deals');
    } finally {
      setLoading(false);
    }
  }, [oppId]);

  const fetchCachedPlaybook = useCallback(async () => {
    try {
      const r = await api.get<ApiResponse<KbPlaybookResponse>>(`/opportunities/${oppId}/kb-playbook/cached`);
      setPlaybook(r.data.data);
    } catch {
      /* silent — playbook is optional */
    }
  }, [oppId]);

  const generatePlaybook = useCallback(async () => {
    setPlaybookGenerating(true);
    setPlaybookError(null);
    try {
      const r = await api.post<ApiResponse<KbPlaybookResponse>>(`/opportunities/${oppId}/kb-playbook/generate`);
      setPlaybook(r.data.data);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? (e as Error).message;
      setPlaybookError(msg ?? 'Generation failed');
    } finally {
      setPlaybookGenerating(false);
    }
  }, [oppId]);

  const fetchCachedInsights = useCallback(async () => {
    try {
      const r = await api.get<ApiResponse<InsightsResponse>>(`/opportunities/${oppId}/similar-deals/insights/cached`);
      setInsights(r.data.data);
    } catch {
      /* silent — insights are optional */
    }
  }, [oppId]);

  const generateInsights = useCallback(async () => {
    setInsightsGenerating(true);
    setInsightsError(null);
    try {
      const r = await api.post<ApiResponse<InsightsResponse>>(`/opportunities/${oppId}/similar-deals/insights/generate`);
      setInsights(r.data.data);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? (e as Error).message;
      setInsightsError(msg ?? 'Generation failed');
    } finally {
      setInsightsGenerating(false);
    }
  }, [oppId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Count strong matches (score ≥ 70) — only these are worth AI annotation.
  const strongMatchCount = data ? data.results.filter(r => r.score >= INSIGHT_SCORE_MIN).length : 0;

  // When we have enough strong matches, fetch cached insights and auto-generate if missing.
  useEffect(() => {
    if (!data) return;
    if (strongMatchCount < INSIGHTS_THRESHOLD) return;
    fetchCachedInsights();
  }, [data, strongMatchCount, fetchCachedInsights]);

  useEffect(() => {
    if (!data || !insights) return;
    if (strongMatchCount < INSIGHTS_THRESHOLD) return;
    if (insights.insights.length === 0 && !insightsGenerating && !insightsError) {
      generateInsights();
    }
  }, [data, insights, strongMatchCount, insightsGenerating, insightsError, generateInsights]);

  // When the corpus is thin, pull cached playbook; if there isn't one and we
  // have KB sources available, auto-generate so the empty state isn't empty.
  useEffect(() => {
    if (!data) return;
    if (data.total_above_threshold >= PLAYBOOK_THRESHOLD) return;
    fetchCachedPlaybook();
  }, [data, fetchCachedPlaybook]);

  useEffect(() => {
    if (!data || !playbook) return;
    if (data.total_above_threshold >= PLAYBOOK_THRESHOLD) return;
    if (playbook.playbook === null && playbook.sources_available > 0 && !playbookGenerating && !playbookError) {
      generatePlaybook();
    }
  }, [data, playbook, playbookGenerating, playbookError, generatePlaybook]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const rows = data.results.filter(r =>
      (r.outcome === 'won'          && showWon)      ||
      (r.outcome === 'lost'         && showLost)     ||
      (r.outcome === 'in_flight'    && showInFlight) ||
      (r.outcome === 'kb_reference' && showKb)
    );
    const sorted = [...rows];
    if (sort === 'recency') {
      sorted.sort((a, b) => (b.closed_date ?? '').localeCompare(a.closed_date ?? ''));
    } else if (sort === 'arr') {
      sorted.sort((a, b) => (b.arr ?? 0) - (a.arr ?? 0));
    }
    return sorted;
  }, [data, showWon, showLost, showInFlight, showKb, sort]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-gray-50 rounded-xl animate-pulse" />
        <div className="h-24 bg-gray-50 rounded-xl animate-pulse" />
        <div className="h-40 bg-gray-50 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[12px] text-red-700">
        {error ?? 'No data'}
      </div>
    );
  }

  const renderPlaybookCard = () => {
    if (data.total_above_threshold >= PLAYBOOK_THRESHOLD) return null;
    if (!playbook) return null;

    if (playbookGenerating || (playbook.playbook === null && playbook.sources_available > 0 && !playbookError)) {
      return (
        <div className="bg-gradient-to-br from-brand-purple-30/40 to-brand-pink-30/30 border border-brand-purple/20 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] text-brand-navy-70">Synthesizing a playbook from {playbook.sources_available} matching KB proof point{playbook.sources_available === 1 ? '' : 's'}…</span>
          </div>
        </div>
      );
    }

    if (playbookError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-[11px] text-red-700">Playbook generation failed: {playbookError}</span>
          <button onClick={generatePlaybook} className="text-[10px] font-semibold text-red-700 hover:text-red-800 underline">Retry</button>
        </div>
      );
    }

    if (playbook.playbook === null && playbook.sources_available === 0) {
      return null; // nothing in KB to draw from — empty-state message below handles it
    }

    const p = playbook.playbook;
    if (!p) return null;

    return (
      <div className="bg-gradient-to-br from-brand-purple-30/40 to-brand-pink-30/30 border border-brand-purple/20 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-brand-purple/10 bg-white/30">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#pbg)" />
            <defs><linearGradient id="pbg" x1="2" y1="2" x2="22" y2="22"><stop stopColor="#F10090" /><stop offset="1" stopColor="#6A2CF5" /></linearGradient></defs>
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple">Synthesized Playbook</span>
          <span className="text-[10px] text-brand-navy-70 ml-1">no direct matches — drawn from KB proof points</span>
          <button
            onClick={generatePlaybook}
            disabled={playbookGenerating}
            className="ml-auto text-[10px] font-semibold text-brand-navy-70 hover:text-brand-purple disabled:opacity-40"
          >
            Refresh
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div>
            <p className="text-[10px] font-semibold text-brand-purple uppercase tracking-wide mb-1">Win pattern</p>
            <p className="text-[11px] text-brand-navy leading-relaxed">{p.win_pattern}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-brand-purple uppercase tracking-wide mb-1">Positioning</p>
            <p className="text-[11px] text-brand-navy leading-relaxed">{p.positioning}</p>
          </div>
          {p.lead_with.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-brand-purple uppercase tracking-wide mb-1">Lead with</p>
              <ul className="text-[11px] text-brand-navy leading-relaxed space-y-0.5 list-disc pl-4 marker:text-brand-purple">
                {p.lead_with.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          {p.anticipate.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-brand-purple uppercase tracking-wide mb-1">Anticipate</p>
              <ul className="text-[11px] text-brand-navy leading-relaxed space-y-0.5 list-disc pl-4 marker:text-brand-purple">
                {p.anticipate.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          {p.based_on.length > 0 && (
            <div className="pt-2 border-t border-brand-purple/10">
              <p className="text-[10px] text-brand-navy-70">
                Based on: <span className="font-medium text-brand-navy">{p.based_on.join(' · ')}</span>
                {playbook.generated_at && <span className="text-brand-navy-30"> · generated {new Date(playbook.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (data.total_above_threshold === 0) {
    return (
      <div className="space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 mb-1">Not enough historical signal yet</p>
          <p className="text-[11px] text-amber-700 leading-relaxed">
            Scanned {data.total_candidates} closed + in-flight deals and KB proof points but none scored ≥ 40. {playbook && playbook.sources_available > 0
              ? 'Pulling a synthesized playbook from the KB below.'
              : 'Matching improves as the corpus grows and as this deal\'s fields (industry, products, competitors, MEDDPICC) get filled in.'}
          </p>
        </div>
        {renderPlaybookCard()}
      </div>
    );
  }

  const pb = data.playbook;
  const hasCompetitorPlaybook = pb.against_competitor &&
    (pb.against_competitor_won > 0 || pb.against_competitor_lost > 0);
  const counts = data.counts_by_outcome;

  const insightByKey = new Map<string, string>();
  if (insights) {
    for (const i of insights.insights) insightByKey.set(`${i.ref_type}-${i.id}`, i.insight);
  }
  const showInsightsStrip = strongMatchCount >= INSIGHTS_THRESHOLD;

  return (
    <div className="space-y-4">
      {/* Tab heading + controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-brand-navy flex items-center gap-2">
            Similar Deals
            <span className="text-[10px] font-normal text-brand-navy-70">
              top {filtered.length} of {data.total_above_threshold} matches · 18 mo window
            </span>
          </h2>
          <p className="text-[11px] text-brand-navy-70 mt-0.5">
            Historical closed, in-flight deals in advanced stages, and KB proof points — ranked by industry, segment, ARR band, products, competitor, and free-text overlap.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-[10px] text-brand-navy-70">
            <input type="checkbox" checked={showWon} onChange={e => setShowWon(e.target.checked)} className="w-3 h-3 accent-brand-purple" />
            Won {counts.won > 0 && <span className="text-brand-navy-30">({counts.won})</span>}
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-brand-navy-70">
            <input type="checkbox" checked={showLost} onChange={e => setShowLost(e.target.checked)} className="w-3 h-3 accent-brand-purple" />
            Lost {counts.lost > 0 && <span className="text-brand-navy-30">({counts.lost})</span>}
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-brand-navy-70">
            <input type="checkbox" checked={showInFlight} onChange={e => setShowInFlight(e.target.checked)} className="w-3 h-3 accent-brand-purple" />
            In flight {counts.in_flight > 0 && <span className="text-brand-navy-30">({counts.in_flight})</span>}
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-brand-navy-70">
            <input type="checkbox" checked={showKb} onChange={e => setShowKb(e.target.checked)} className="w-3 h-3 accent-brand-purple" />
            KB {counts.kb_reference > 0 && <span className="text-brand-navy-30">({counts.kb_reference})</span>}
          </label>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="text-[10px] border border-brand-navy-30 rounded px-2 py-1 text-brand-navy-70 bg-white"
          >
            <option value="score">Sort: Match score</option>
            <option value="recency">Sort: Recency</option>
            <option value="arr">Sort: ARR</option>
          </select>
        </div>
      </div>

      {/* Signature strip */}
      <div className="bg-gradient-to-br from-brand-pink-30/30 to-brand-purple-30/30 border border-brand-purple/20 rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap text-[10px] text-brand-navy-70">
        <span className="font-semibold text-brand-navy uppercase tracking-wide text-[10px]">This deal</span>
        <span className="text-brand-navy-30">·</span>
        {data.active.account_industry && <span className="bg-white px-1.5 py-0.5 rounded border border-brand-purple/20">{data.active.account_industry}</span>}
        {data.active.account_segment && <span className="bg-white px-1.5 py-0.5 rounded border border-brand-purple/20">{data.active.account_segment}</span>}
        {data.active.arr_band && <span className="bg-white px-1.5 py-0.5 rounded border border-brand-purple/20">${data.active.arr_band}</span>}
        {data.active.deploy_mode && <span className="bg-white px-1.5 py-0.5 rounded border border-brand-purple/20">{data.active.deploy_mode}</span>}
        {data.active.record_type && <span className="bg-white px-1.5 py-0.5 rounded border border-brand-purple/20">{data.active.record_type}</span>}
        {data.active.products.length > 0 && (
          <span className="bg-white px-1.5 py-0.5 rounded border border-brand-purple/20">{data.active.products.join(' + ')}</span>
        )}
        {data.active.engaged_competitors.map(c => (
          <span key={c} className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-200">vs. {c}</span>
        ))}
      </div>

      {/* AI insights status strip — only rendered when we have plenty of candidates */}
      {showInsightsStrip && (
        insightsGenerating ? (
          <div className="flex items-center gap-2 text-[10px] text-brand-navy-70 bg-brand-purple-30/20 border border-brand-purple/20 rounded-lg px-3 py-1.5">
            <div className="w-2.5 h-2.5 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />
            Generating AI insights for the top {insights?.candidates_considered ?? ''} candidates…
          </div>
        ) : insightsError ? (
          <div className="flex items-center justify-between gap-2 text-[10px] bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            <span className="text-red-700">AI insights failed: {insightsError}</span>
            <button onClick={generateInsights} className="font-semibold text-red-700 hover:text-red-800 underline">Retry</button>
          </div>
        ) : insights && insights.insights.length > 0 ? (
          <div className="flex items-center justify-between gap-2 text-[10px] text-brand-navy-70 bg-brand-purple-30/20 border border-brand-purple/20 rounded-lg px-3 py-1.5">
            <span>AI "why it matches" captions shown inline on each result
              {insights.generated_at && <> · generated {new Date(insights.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
            </span>
            <button onClick={generateInsights} disabled={insightsGenerating} className="font-semibold text-brand-purple hover:text-brand-purple-70 disabled:opacity-40">
              Refresh
            </button>
          </div>
        ) : null
      )}

      {/* Synthesized KB playbook — only rendered when matches are thin */}
      {renderPlaybookCard()}

      {/* Playbook summary */}
      {hasCompetitorPlaybook && (
        <div className="bg-gradient-to-br from-brand-purple-30/40 to-brand-pink-30/30 border border-brand-purple/20 rounded-xl px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <svg className="w-3.5 h-3.5 text-brand-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple">Playbook Summary</span>
          </div>
          <p className="text-[11px] text-brand-navy leading-relaxed">
            Against <strong>{pb.against_competitor}</strong>{data.active.account_industry ? <> in <strong>{data.active.account_industry}</strong></> : null}:{' '}
            <strong>{pb.against_competitor_won}</strong> won, <strong>{pb.against_competitor_lost}</strong> lost in the last 18 months. Review the scored matches below to pattern-match on what won or lost them.
          </p>
        </div>
      )}

      {/* Results list */}
      <div className="border border-brand-navy-30/40 rounded-xl divide-y divide-brand-navy-30/20 overflow-hidden bg-white">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-brand-navy-70">No matches for the selected filters.</div>
        ) : filtered.map(r => {
          const badge = outcomeBadge(r);
          return (
            <div key={`${r.ref_type}-${r.id}`} className="px-4 py-3 hover:bg-brand-purple-30/10 transition-colors">
              <div className="flex items-start gap-3">
                <ScoreRing score={r.score} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-brand-navy">{r.name}</span>
                    <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${badge.class}`}>
                      {badge.label}
                    </span>
                    <span className="text-[10px] text-brand-navy-70">{metaLine(r)}</span>
                  </div>

                  {r.match_chips.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                      {r.match_chips.map((c, i) => (
                        <span key={i} className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${chipClass(c.kind)}`}>
                          {c.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {(() => {
                    // Only show AI caption on strong matches; guards against stale cached
                    // insights generated before the ≥ 70 threshold was introduced.
                    const aiInsight = r.score >= INSIGHT_SCORE_MIN
                      ? insightByKey.get(`${r.ref_type}-${r.id}`)
                      : undefined;
                    if (aiInsight) {
                      return (
                        <div className="mt-2 bg-brand-purple-30/20 rounded-lg px-3 py-2 border border-brand-purple/10">
                          <div className="flex items-center gap-1 mb-0.5">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
                              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#iig)" />
                              <defs><linearGradient id="iig" x1="2" y1="2" x2="22" y2="22"><stop stopColor="#F10090" /><stop offset="1" stopColor="#6A2CF5" /></linearGradient></defs>
                            </svg>
                            <span className="text-[9px] font-semibold text-brand-purple uppercase tracking-wide">Why it matches</span>
                          </div>
                          <p className="text-[11px] text-brand-navy leading-relaxed">{aiInsight}</p>
                        </div>
                      );
                    }
                    if (r.why_text) {
                      return (
                        <p className="text-[11px] text-brand-navy-70 mt-2 leading-relaxed">
                          <span className="font-semibold text-brand-navy">{whyLabel(r.outcome)}</span>{' '}
                          {r.why_text}
                        </p>
                      );
                    }
                    return null;
                  })()}

                  <div className="flex items-center gap-3 mt-2">
                    {r.ref_type === 'opportunity' && r.sf_opportunity_id ? (
                      <button
                        type="button"
                        onClick={() => openSimilarDeal(r.sf_opportunity_id!)}
                        className="text-[10px] font-semibold text-brand-purple hover:text-brand-purple-70"
                      >
                        Open deal →
                      </button>
                    ) : (
                      <span className="text-[10px] font-semibold text-brand-purple">KB proof point</span>
                    )}
                    {r.account_industry && (
                      <>
                        <span className="text-brand-navy-30 text-[10px]">·</span>
                        <span className="text-[10px] text-brand-navy-70">{r.account_industry}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-brand-navy-70">
          Scanned {data.total_candidates} records · score ≥ 40 · {data.total_above_threshold} total matches
        </span>
      </div>
    </div>
  );
}
