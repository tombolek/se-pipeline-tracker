import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import type { ApiResponse } from '../types';
import { useAiJobAttach } from '../hooks/useAiJob';

/* ── Types ── */
interface DemoQuestion {
  question_number: number;
  question: string;
  confidence: 'strong' | 'partial' | 'missing';
  answer: string;
  evidence: { source: string; text: string }[];
  missing?: { category: string; detail: string }[];
  coaching_tip: string;
  suggested_commitments?: string[];
}

interface DemoPrepData {
  demo_level: 'D1' | 'D2' | 'D3' | 'D4';
  demo_level_label: string;
  demo_level_reasoning: string;
  questions_answered: number;
  total_questions: number;
  questions: DemoQuestion[];
  overall_assessment: string;
  before_you_demo: { text: string; done: boolean }[];
}

interface DemoPrepResponse {
  demo_prep: DemoPrepData | null;
  generated_at: string | null;
  is_stale: boolean;
}

/* ── Helpers ── */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function highlightBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="text-brand-navy font-semibold">{part}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

const DEMO_LEVELS = [
  { key: 'D1', label: 'D1 Exploratory', color: 'bg-amber-100 text-amber-700 border-amber-200/60', activeRing: 'ring-amber-300/40 border-amber-300' },
  { key: 'D2', label: 'D2 Informed',    color: 'bg-rose-100 text-rose-700 border-rose-200/60',     activeRing: 'ring-rose-300/40 border-rose-300' },
  { key: 'D3', label: 'D3 Prescriptive', color: 'bg-cyan-100 text-cyan-700 border-cyan-200/60',    activeRing: 'ring-cyan-300/40 border-cyan-300' },
  { key: 'D4', label: 'D4 Executive',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200/60', activeRing: 'ring-emerald-300/40 border-emerald-300' },
];

const CONFIDENCE_CONFIG = {
  strong:  { label: 'Strong',  badge: 'bg-status-success/10 text-emerald-700 border-status-success/30', iconBg: 'bg-status-success/15', iconColor: 'text-status-success' },
  partial: { label: 'Partial', badge: 'bg-status-warning/10 text-amber-700 border-status-warning/30',   iconBg: 'bg-status-warning/15', iconColor: 'text-status-warning' },
  missing: { label: 'Missing', badge: 'bg-status-overdue/10 text-red-700 border-status-overdue/30',     iconBg: 'bg-status-overdue/15', iconColor: 'text-status-overdue' },
};

/* ── PDF Export ── */
function exportDemoPrepPdf(dp: DemoPrepData, oppName: string, generatedAt: string | null) {
  const stripBold = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const questionsHtml = dp.questions.map(q => {
    const evHtml = q.evidence.length
      ? `<div class="block"><div class="block-label">${q.confidence === 'partial' ? 'What we know' : 'Evidence'}</div><ul>${q.evidence.map(e => `<li><strong>${e.source}:</strong> ${stripBold(e.text)}</li>`).join('')}</ul></div>`
      : '';
    const missHtml = q.missing && q.missing.length
      ? `<div class="block"><div class="block-label">What's missing</div><ul>${q.missing.map(m => `<li><strong>${m.category}:</strong> ${stripBold(m.detail)}</li>`).join('')}</ul></div>`
      : '';
    const commitHtml = q.suggested_commitments && q.suggested_commitments.length
      ? `<div class="block"><div class="block-label">Suggested commitments</div><ul>${q.suggested_commitments.map(c => `<li>${stripBold(c)}</li>`).join('')}</ul></div>`
      : '';
    return `
      <div class="card">
        <div class="card-header">
          <span class="qnum">Q${q.question_number}</span>
          <strong class="qtext">${q.question}</strong>
          <span class="conf conf-${q.confidence}">${q.confidence.toUpperCase()}</span>
        </div>
        <div class="block"><div class="block-label">${q.confidence === 'missing' ? 'Assessment' : 'Answer'}</div><p>${stripBold(q.answer)}</p></div>
        ${evHtml}
        ${missHtml}
        ${commitHtml}
        <div class="tip tip-${q.confidence}"><strong>Demo tip:</strong> ${stripBold(q.coaching_tip)}</div>
      </div>
    `;
  }).join('');

  const beforeHtml = dp.before_you_demo.length
    ? `<div class="section"><h2>Before You Demo</h2><ul class="checklist">${dp.before_you_demo.map(b => `<li>${b.done ? '☑' : '☐'} ${stripBold(b.text)}</li>`).join('')}</ul></div>`
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Demo Prep — ${oppName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 11pt; color: #1a0c42; line-height: 1.5; padding: 40px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 18pt; margin-bottom: 4px; }
  .subtitle { font-size: 10pt; color: #665d81; margin-bottom: 16px; }
  .level-banner { display: inline-block; padding: 6px 14px; border-radius: 6px; color: white; font-weight: 600; font-size: 11pt; margin-bottom: 6px; background: #6a2cf5; }
  .level-banner.D1 { background: #f59e0b; }
  .level-banner.D2 { background: #f43f5e; }
  .level-banner.D3 { background: #06b6d4; }
  .level-banner.D4 { background: #10b981; }
  .reasoning { font-size: 10pt; color: #665d81; font-style: italic; margin-bottom: 18px; }
  .readiness { font-size: 10pt; color: #1a0c42; margin-bottom: 24px; }
  h2 { font-size: 12pt; color: #6a2cf5; border-bottom: 1px solid #ded0fd; padding-bottom: 4px; margin-bottom: 10px; margin-top: 20px; }
  .section { margin-bottom: 16px; }
  .card { border: 1px solid #ccc9d5; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; page-break-inside: avoid; }
  .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .qnum { font-size: 9pt; font-weight: 700; color: #ccc9d5; }
  .qtext { flex: 1; font-size: 11pt; color: #1a0c42; }
  .conf { font-size: 8pt; font-weight: 700; padding: 2px 6px; border-radius: 3px; }
  .conf-strong  { background: #d1fae5; color: #065f46; }
  .conf-partial { background: #fef3c7; color: #92400e; }
  .conf-missing { background: #fee2e2; color: #991b1b; }
  .block { margin-top: 6px; }
  .block-label { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #665d81; margin-bottom: 3px; }
  ul, ol { margin-left: 18px; }
  li { margin-bottom: 3px; font-size: 10pt; }
  .tip { margin-top: 8px; padding: 6px 10px; border-radius: 4px; font-size: 10pt; }
  .tip-strong  { background: #ede9fe; color: #1a0c42; }
  .tip-partial { background: #fffbeb; color: #78350f; }
  .tip-missing { background: #fef2f2; color: #7f1d1d; }
  .checklist { list-style: none; margin-left: 0; }
  .checklist li { font-size: 10pt; margin-bottom: 4px; }
  strong { font-weight: 600; }
  @media print { body { padding: 20px; } .card { page-break-inside: avoid; } }
</style></head><body>
<h1>Demo Prep</h1>
<div class="subtitle">${oppName} — Generated ${now}</div>
<div><span class="level-banner ${dp.demo_level}">${dp.demo_level} ${dp.demo_level_label}</span></div>
<div class="reasoning">${stripBold(dp.demo_level_reasoning)}</div>
<div class="readiness"><strong>Demo Readiness:</strong> ${dp.questions_answered} of ${dp.total_questions} questions answered with sufficient evidence.${generatedAt ? ' (Last refreshed ' + new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ')' : ''}</div>

<div class="section"><h2>6-Question Demo Check</h2>${questionsHtml}</div>

<div class="section"><h2>Overall Assessment</h2><p>${stripBold(dp.overall_assessment)}</p></div>

${beforeHtml}

<script>window.onload = function() { window.print(); }</script>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

/* ── Component ── */
export default function DemoPrepTab({ oppId, oppName }: { oppId: number; oppName?: string }) {
  const [data, setData] = useState<DemoPrepResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get<ApiResponse<DemoPrepResponse>>(`/opportunities/${oppId}/demo-prep`);
      setData(r.data.data);
      setError(null);
    } catch {
      setError('Failed to load demo prep data');
    } finally {
      setLoading(false);
    }
  }, [oppId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-attach to in-flight demo-prep generation if user navigates back mid-run.
  useAiJobAttach({
    key: `demo-prep-${oppId}`,
    currentGeneratedAt: data?.generated_at ?? null,
    fetchCached: async () => {
      const r = await api.get<ApiResponse<DemoPrepResponse>>(`/opportunities/${oppId}/demo-prep`);
      return { generatedAt: r.data.data.generated_at ?? null };
    },
    onRunning: () => setGenerating(true),
    onFresh: async () => {
      const r = await api.get<ApiResponse<DemoPrepResponse>>(`/opportunities/${oppId}/demo-prep`);
      setData(r.data.data);
      setGenerating(false);
    },
    onTimeout: () => setGenerating(false),
  });

  // Auto-generate if missing or stale
  useEffect(() => {
    if (data && (data.is_stale || !data.demo_prep) && !generating) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.is_stale, data?.demo_prep]);

  const generate = async () => {
    try {
      setGenerating(true);
      const r = await api.post<ApiResponse<{ demo_prep: DemoPrepData; generated_at: string }>>(
        `/opportunities/${oppId}/demo-prep/generate`
      );
      setData(prev => prev
        ? { ...prev, demo_prep: r.data.data.demo_prep, generated_at: r.data.data.generated_at, is_stale: false }
        : { demo_prep: r.data.data.demo_prep, generated_at: r.data.data.generated_at, is_stale: false }
      );
      // Auto-expand first non-strong question
      const firstGap = r.data.data.demo_prep.questions.find(q => q.confidence !== 'strong');
      if (firstGap) setExpandedQ(firstGap.question_number);
    } catch {
      setError('Failed to generate demo prep');
    } finally {
      setGenerating(false);
    }
  };

  // Loading shimmer
  if (loading) {
    return (
      <div className="py-8 space-y-4">
        <div className="h-20 shimmer rounded-xl" />
        <div className="h-14 shimmer rounded-xl" />
        <div className="h-14 shimmer rounded-xl" />
        <div className="h-14 shimmer rounded-xl" />
        <style>{`.shimmer{background:linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%);background-size:200% 100%;animation:shimmer 1.5s infinite}@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={fetchData} className="mt-2 text-xs text-brand-purple hover:text-brand-purple-70">Retry</button>
      </div>
    );
  }

  // Generating state (no cached data yet)
  if (generating && !data?.demo_prep) {
    return (
      <div className="py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-pink/20 to-brand-purple/20 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-brand-purple animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
        <p className="text-sm font-medium text-brand-navy mb-1">Analyzing demo readiness...</p>
        <p className="text-[11px] text-brand-navy-70">Evaluating the 6-Question Demo Check against your deal data</p>
      </div>
    );
  }

  if (!data?.demo_prep) return null;

  const dp = data.demo_prep;
  const readinessPercent = dp.questions_answered / dp.total_questions;
  // SVG ring calc: circumference = 2*PI*24 ≈ 150.8
  const circumference = 150.8;
  const offset = circumference * (1 - readinessPercent);
  const ringClass = readinessPercent >= 0.8 ? 'stroke-status-success' : readinessPercent >= 0.5 ? 'stroke-status-warning' : 'stroke-status-overdue';

  return (
    <div className="space-y-5">

      {/* ── Readiness Header ── */}
      <div className="rounded-xl bg-gradient-to-r from-brand-pink/[0.04] via-brand-purple/[0.04] to-brand-purple/[0.04] border border-brand-purple/15 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Ring */}
            <div className="relative w-14 h-14 flex-shrink-0">
              <svg className="w-14 h-14" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" strokeWidth="5" stroke="#EDE9FE" />
                <circle cx="28" cy="28" r="24" fill="none" strokeWidth="5" strokeLinecap="round"
                  className={ringClass}
                  strokeDasharray={circumference} strokeDashoffset={offset}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-semibold text-brand-navy">{dp.questions_answered}/{dp.total_questions}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-brand-navy">Demo Readiness</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm ${
                  dp.demo_level === 'D1' ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                  dp.demo_level === 'D2' ? 'bg-gradient-to-r from-rose-400 to-rose-500' :
                  dp.demo_level === 'D3' ? 'bg-gradient-to-r from-cyan-400 to-cyan-500' :
                  'bg-gradient-to-r from-emerald-400 to-emerald-500'
                }`}>
                  {dp.demo_level} {dp.demo_level_label}
                </span>
              </div>
              <p className="text-[11px] text-brand-navy-70 mt-0.5">
                {dp.questions_answered} of {dp.total_questions} questions answered with sufficient evidence.
                {dp.total_questions - dp.questions_answered > 0 && ` ${dp.total_questions - dp.questions_answered} gap${dp.total_questions - dp.questions_answered > 1 ? 's' : ''} need discovery.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {data.generated_at && (
              <span className="text-[10px] text-brand-navy-30">{timeAgo(data.generated_at)}</span>
            )}
            <button
              onClick={() => exportDemoPrepPdf(dp, oppName ?? `Opportunity #${oppId}`, data.generated_at)}
              className="text-[11px] text-brand-navy-70 hover:text-brand-purple flex items-center gap-1 px-2 py-1.5 rounded hover:bg-white/70 transition-colors"
              title="Download as PDF"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              PDF
            </button>
            <button
              onClick={() => alert('Slack integration coming soon!')}
              className="text-[11px] text-brand-navy-70 hover:text-brand-purple flex items-center gap-1 px-2 py-1.5 rounded hover:bg-white/70 transition-colors"
              title="Send to Slack (coming soon)"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z"/></svg>
              Slack
            </button>
            <button
              onClick={generate}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[11px] font-medium hover:bg-brand-purple-70 transition-colors shadow-sm disabled:opacity-50"
            >
              {generating ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              )}
              {generating ? 'Generating...' : data.generated_at ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Demo level calibration bar */}
        <div className="mt-3 pt-3 border-t border-brand-purple/10">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold text-brand-navy-70 uppercase tracking-wider w-20 flex-shrink-0">Demo Level:</span>
            <div className="flex items-center gap-1 flex-1 flex-wrap">
              {DEMO_LEVELS.map((lvl, i) => (
                <React.Fragment key={lvl.key}>
                  {i > 0 && <svg className="w-3 h-3 text-brand-navy-30 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7"/></svg>}
                  <span className={`px-2 py-0.5 rounded text-[9px] font-semibold border ${
                    dp.demo_level === lvl.key
                      ? `${lvl.color.split(' ').slice(0, 2).join(' ')} ${lvl.activeRing} ring-2`
                      : `${lvl.color} opacity-40`
                  }`}>
                    {lvl.label}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-brand-navy-70 mt-1.5 ml-20 italic">{dp.demo_level_reasoning}</p>
        </div>
      </div>

      {/* ── 6-Question Demo Check ── */}
      <div className="space-y-3">
        {dp.questions.map((q) => {
          const conf = CONFIDENCE_CONFIG[q.confidence];
          const isExpanded = expandedQ === q.question_number;
          const isMissing = q.confidence === 'missing';
          const isPartial = q.confidence === 'partial';

          return (
            <div
              key={q.question_number}
              className={`rounded-xl border overflow-hidden ${
                isMissing ? 'border-status-overdue/20' : 'border-brand-navy-30/40'
              }`}
            >
              {/* Summary row */}
              <button
                onClick={() => setExpandedQ(isExpanded ? null : q.question_number)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  isMissing ? 'bg-red-50/30 hover:bg-red-50/50' : 'bg-white hover:bg-gray-50/50'
                }`}
              >
                <svg className={`w-3.5 h-3.5 text-brand-navy-70 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
                <span className={`w-5 h-5 rounded-full ${conf.iconBg} flex items-center justify-center flex-shrink-0`}>
                  {q.confidence === 'strong' && (
                    <svg className={`w-3 h-3 ${conf.iconColor}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
                  )}
                  {q.confidence === 'partial' && (
                    <svg className={`w-3 h-3 ${conf.iconColor}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"/></svg>
                  )}
                  {q.confidence === 'missing' && (
                    <svg className={`w-3 h-3 ${conf.iconColor}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-brand-navy-30">Q{q.question_number}</span>
                    <h4 className="text-[13px] font-semibold text-brand-navy">{q.question}</h4>
                  </div>
                  <p className={`text-[11px] mt-0.5 truncate ${
                    isMissing ? 'text-status-overdue' : isPartial ? 'text-status-warning' : 'text-brand-navy-70'
                  }`}>
                    {highlightBold(q.answer.length > 120 ? q.answer.slice(0, 120) + '...' : q.answer)}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border flex-shrink-0 ${conf.badge}`}>
                  {conf.label}
                </span>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className={`px-4 pb-4 pt-1 border-t ${
                  isMissing ? 'border-status-overdue/20 bg-red-50/20' : 'border-brand-navy-30/20 bg-gray-50/30'
                }`}>
                  {/* Answer */}
                  <div className="mb-3">
                    <span className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider">
                      {isMissing ? 'Assessment' : 'Answer'}
                    </span>
                    <p className="text-[12px] text-brand-navy mt-1 leading-relaxed">{highlightBold(q.answer)}</p>
                  </div>

                  {/* Evidence */}
                  {q.evidence.length > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider">
                        {isPartial ? 'What we know' : 'Evidence'}
                      </span>
                      <div className="mt-1 space-y-1">
                        {q.evidence.map((e, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px]">
                            <span className={`mt-0.5 ${q.confidence === 'strong' ? 'text-brand-purple' : 'text-status-success'}`}>&#9679;</span>
                            <span className="text-brand-navy-70">
                              <strong className="text-brand-navy">{e.source}:</strong> {highlightBold(e.text)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing items */}
                  {q.missing && q.missing.length > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider">What&apos;s missing</span>
                      <div className="mt-1 space-y-1">
                        {q.missing.map((m, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px]">
                            <span className="text-status-overdue mt-0.5">&#9679;</span>
                            <span className="text-brand-navy-70">
                              <strong className="text-brand-navy">{m.category}:</strong> {highlightBold(m.detail)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested commitments (Q6 only) */}
                  {q.suggested_commitments && q.suggested_commitments.length > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] font-semibold text-brand-navy-70 uppercase tracking-wider">Suggested commitments for this stage</span>
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        {q.suggested_commitments.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-brand-navy-30/40 text-[11px] text-brand-navy">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-purple flex-shrink-0"></span>
                            {c}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Coaching tip */}
                  <div className={`rounded-lg px-3 py-2.5 ${
                    isMissing ? 'bg-red-50 border border-status-overdue/20' :
                    isPartial ? 'bg-amber-50 border border-amber-200/60' :
                    'bg-brand-purple-30/20 border border-brand-purple/10'
                  }`}>
                    <div className="flex items-start gap-2">
                      <svg className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                        isMissing ? 'text-status-overdue' : isPartial ? 'text-amber-600' : 'text-brand-purple'
                      }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                      </svg>
                      <div>
                        {(isMissing || isPartial) && (
                          <p className={`text-[11px] font-semibold mb-1 ${isMissing ? 'text-red-800' : 'text-amber-900'}`}>
                            {isMissing ? 'Critical gap — address before the demo' : 'Action needed'}
                          </p>
                        )}
                        <p className={`text-[11px] leading-relaxed ${
                          isMissing ? 'text-red-700' : isPartial ? 'text-amber-800' : 'text-brand-navy'
                        }`}>
                          {isMissing || isPartial ? highlightBold(q.coaching_tip) : <><strong>Demo tip:</strong> {highlightBold(q.coaching_tip)}</>}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Overall Assessment ── */}
      <details open className="group">
        <summary className="flex items-center gap-2 cursor-pointer select-none mb-2 list-none [&::-webkit-details-marker]:hidden">
          <svg className="w-3.5 h-3.5 text-brand-navy-70 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
          <h3 className="text-[12px] font-semibold text-brand-navy uppercase tracking-wider">Overall Assessment</h3>
        </summary>
        <div className="rounded-xl border border-brand-navy-30/40 bg-gradient-to-br from-white to-gray-50/50 p-4">
          <p className="text-[12px] text-brand-navy leading-relaxed mb-4">{highlightBold(dp.overall_assessment)}</p>

          {/* Before You Demo checklist */}
          <div className="rounded-lg bg-brand-purple-30/20 border border-brand-purple/10 p-3">
            <h4 className="text-[11px] font-semibold text-brand-purple uppercase tracking-wider mb-2">Before You Demo</h4>
            <div className="space-y-1.5">
              {dp.before_you_demo.map((item, i) => (
                <label key={i} className="flex items-center gap-2 text-[11px] text-brand-navy cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={item.done}
                    className="rounded border-brand-navy-30 text-brand-purple focus:ring-brand-purple"
                  />
                  {highlightBold(item.text)}
                </label>
              ))}
            </div>
          </div>
        </div>
      </details>

    </div>
  );
}
