import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import type { ApiResponse } from '../types';
import { useAiJobAttach } from '../hooks/useAiJob';
import { TextWithCitations, makeScrollJumper } from './Citation';
import type { ResolvedCitation } from '../types/citations';
import { pdfInline, buildSourcesAppendix, PDF_CITATION_CSS, escHtml } from '../utils/pdfCitations';

/* ── Types ── */
interface ProofPointHighlight {
  customer: string;
  role: string; // "primary" | "scale" | "backup"
  why_relevant: string;
  key_stat: string;
  when_to_use: string;
}

interface DifferentiatorPlay {
  name: string;
  positioning: string;
  backed_by: string;
}

interface BriefData {
  deal_context: string;
  talking_points: string[];
  proof_point_highlights: ProofPointHighlight[];
  differentiator_plays: DifferentiatorPlay[];
  risks: { severity: string; text: string }[];
  discovery_questions: string[];
  /** Shared across every prose field — markers [N] point into this list. #135. */
  citations?: ResolvedCitation[];
}

interface ProofPoint {
  id: number;
  customer_name: string;
  about: string | null;
  vertical: string;
  products: string[];
  initiatives: string[];
  proof_point_text: string;
}

interface Differentiator {
  id: number;
  name: string;
  tagline: string | null;
  core_message: string | null;
  need_signals: string[];
  proof_points_json: unknown;
  competitive_positioning: string | null;
  relevance_score: number;
}

interface CallPrepResponse {
  brief: BriefData | null;
  generated_at: string | null;
  is_stale: boolean;
  proof_points: ProofPoint[];
  differentiators: Differentiator[];
  match_context: { products: string[]; industry: string | null; competitors: string | null };
}

/* ── Helpers ── */
/** Parses **bold** markers from AI text into <strong> elements */
function highlightBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return text; // no markers
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="text-brand-navy dark:text-fg-1 font-semibold">{part}</strong>
      : part
  );
}

const CSV_BADGE = <span className="inline-flex items-center gap-px text-[8px] font-bold bg-emerald-600 text-white px-1 py-px rounded align-middle mx-0.5 leading-none"><svg className="w-1.5 h-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>CSV</span>;
const DIFF_BADGE = <span className="inline-flex items-center gap-px text-[8px] font-bold bg-blue-600 text-white px-1 py-px rounded align-middle mx-0.5 leading-none">DIFF</span>;

/** Renders an AI-authored paragraph with [N] citation pills inline alongside the
 *  existing bold + entity-badge rendering. Citations and bold markers can overlap
 *  freely — we process citations on each text fragment after the bold split. */
function renderWithCitations(
  text: string,
  customerNames: string[],
  diffNames: string[],
  citations: ResolvedCitation[] | undefined,
  onJump: ((c: ResolvedCitation) => void) | undefined,
): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  const customerLower = customerNames.map(n => n.toLowerCase());
  const diffLower = diffNames.map(n => n.toLowerCase());

  return parts.map((part, i) => {
    if (i % 2 === 0) {
      // Plain text fragment — render citations inline here.
      return <TextWithCitations key={i} text={part} citations={citations} onJump={onJump} />;
    }
    // Bold segment — check if it matches a known entity, keep the badge behaviour.
    const lower = part.toLowerCase();
    const isCustomer = customerLower.some(c => lower.includes(c) || c.includes(lower));
    const isDiff = diffLower.some(d => lower.includes(d) || d.includes(lower));
    const boldNode = <strong className="text-brand-navy dark:text-fg-1 font-semibold">
      <TextWithCitations text={part} citations={citations} onJump={onJump} />
    </strong>;
    if (isCustomer) return <React.Fragment key={i}>{CSV_BADGE}{boldNode}</React.Fragment>;
    if (isDiff)     return <React.Fragment key={i}>{DIFF_BADGE}{boldNode}</React.Fragment>;
    return <React.Fragment key={i}>{boldNode}</React.Fragment>;
  });
}

/** Like highlightBold, but also injects CSV/DIFF badges next to recognized entity names */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function matchLabel(pp: ProofPoint, oppProducts: string[]): { label: string; color: string } {
  const overlap = pp.products.filter(p => oppProducts.includes(p)).length;
  if (overlap >= 2) return { label: 'Strong match', color: 'bg-green-100 text-green-700' };
  if (overlap === 1) return { label: 'Partial match', color: 'bg-yellow-100 text-yellow-700' };
  return { label: 'Weak', color: 'bg-gray-100 dark:bg-ink-3 text-gray-600' };
}

/* ── PDF Export ── */
function exportCallPrepPdf(data: CallPrepResponse, oppName: string) {
  const b = data.brief;
  if (!b) return;

  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  // Every AI-prose field in the brief shares the same citation list, so one
  // inline() closure captures it and gets used everywhere #135 markers appear.
  const inline = (t: string) => pdfInline(t, b.citations);

  const sections: string[] = [];

  sections.push(`
    <div class="section">
      <h2>Deal Context</h2>
      <p>${inline(b.deal_context)}</p>
    </div>
  `);

  if (b.talking_points.length) {
    sections.push(`
      <div class="section">
        <h2>Key Talking Points</h2>
        <ul>${b.talking_points.map(tp => `<li>${inline(tp)}</li>`).join('')}</ul>
      </div>
    `);
  }

  if (b.risks.length) {
    sections.push(`
      <div class="section">
        <h2>Risks &amp; Open Items</h2>
        <ul>${b.risks.map(r => `<li><span class="severity ${escHtml(r.severity)}">${escHtml(r.severity.toUpperCase())}</span> ${inline(r.text)}</li>`).join('')}</ul>
      </div>
    `);
  }

  if (b.discovery_questions.length) {
    sections.push(`
      <div class="section">
        <h2>Discovery Questions</h2>
        <ol>${b.discovery_questions.map(q => `<li>${inline(q)}</li>`).join('')}</ol>
      </div>
    `);
  }

  if (b.proof_point_highlights?.length) {
    sections.push(`
      <div class="section">
        <h2><span class="badge csv">CSV</span> Customer Stories to Mention</h2>
        ${b.proof_point_highlights.map(h => `
          <div class="card">
            <div class="card-header">
              <strong>${escHtml(h.customer)}</strong>
              <span class="role-badge ${escHtml(h.role)}">${escHtml(h.role)}</span>
            </div>
            <table class="card-grid">
              <tr><td class="label">Why relevant</td><td>${inline(h.why_relevant)}</td></tr>
              <tr><td class="label">Key stat</td><td>${inline(h.key_stat)}</td></tr>
              <tr><td class="label">When to use</td><td>${inline(h.when_to_use)}</td></tr>
            </table>
          </div>
        `).join('')}
      </div>
    `);
  }

  if (b.differentiator_plays?.length) {
    sections.push(`
      <div class="section">
        <h2><span class="badge diff">DIFF</span> Differentiators to Position</h2>
        ${b.differentiator_plays.map(dp => `
          <div class="card">
            <div class="card-header"><strong>${escHtml(dp.name)}</strong></div>
            <p>${inline(dp.positioning)}</p>
            ${dp.backed_by ? `<p class="backed-by">Backed by: <strong>${escHtml(dp.backed_by)}</strong></p>` : ''}
          </div>
        `).join('')}
      </div>
    `);
  }

  // Footnote-style appendix — every `[N]` above maps to a numbered entry here.
  const sourcesHtml = buildSourcesAppendix([b.citations]);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Pre-Call Brief — ${escHtml(oppName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 11pt; color: #1a0c42; line-height: 1.5; padding: 40px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 18pt; margin-bottom: 4px; }
  .subtitle { font-size: 10pt; color: #665d81; margin-bottom: 24px; }
  h2 { font-size: 12pt; color: #6a2cf5; border-bottom: 1px solid #ded0fd; padding-bottom: 4px; margin-bottom: 10px; margin-top: 20px; }
  .section { margin-bottom: 16px; }
  ul, ol { margin-left: 18px; }
  li { margin-bottom: 6px; }
  .severity { font-size: 9pt; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-right: 4px; }
  .severity.high { background: #ffe0e1; color: #c0392b; }
  .severity.medium { background: #fff3cd; color: #d68910; }
  .severity.low { background: #e8f8f5; color: #1e8449; }
  .card { border: 1px solid #ccc9d5; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; }
  .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .role-badge { font-size: 8pt; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
  .role-badge.primary { background: #d5f5e3; color: #1e8449; }
  .role-badge.scale { background: #d6eaf8; color: #2471a3; }
  .role-badge.backup { background: #fef9e7; color: #d68910; }
  .card-grid { width: 100%; font-size: 10pt; }
  .card-grid td { padding: 2px 8px 2px 0; vertical-align: top; }
  .card-grid .label { color: #665d81; white-space: nowrap; width: 90px; }
  .backed-by { font-size: 10pt; color: #665d81; margin-top: 6px; padding: 4px 8px; background: #f5f5f7; border-radius: 4px; }
  .badge { font-size: 8pt; font-weight: 700; color: white; padding: 2px 6px; border-radius: 3px; margin-right: 4px; }
  .badge.csv { background: #059669; }
  .badge.diff { background: #2563eb; }
  strong { font-weight: 600; }
${PDF_CITATION_CSS}
  @media print { body { padding: 20px; } }
</style></head><body>
<h1>Pre-Call Brief</h1>
<div class="subtitle">${escHtml(oppName)} — Generated ${now}${data.generated_at ? ' (' + timeAgo(data.generated_at) + ')' : ''}</div>
${sections.join('')}
${sourcesHtml}
<script>window.onload = function() { window.print(); }</script>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

/* ── Component ── */
export default function CallPrepTab({ oppId, oppName }: { oppId: number; oppName?: string }) {
  const [data, setData] = useState<CallPrepResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPP, setExpandedPP] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get<ApiResponse<CallPrepResponse>>(`/opportunities/${oppId}/call-prep`);
      setData(r.data.data);
      setError(null);
    } catch {
      setError('Failed to load call prep data');
    } finally {
      setLoading(false);
    }
  }, [oppId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-attach to in-flight call-prep generation if user navigates back mid-run.
  useAiJobAttach({
    key: `call-prep-${oppId}`,
    currentGeneratedAt: data?.generated_at ?? null,
    fetchCached: async () => {
      const r = await api.get<ApiResponse<CallPrepResponse>>(`/opportunities/${oppId}/call-prep`);
      return { generatedAt: r.data.data.generated_at ?? null };
    },
    onRunning: () => setGenerating(true),
    onFresh: async () => {
      const r = await api.get<ApiResponse<CallPrepResponse>>(`/opportunities/${oppId}/call-prep`);
      setData(r.data.data);
      setGenerating(false);
    },
    onTimeout: () => setGenerating(false),
  });

  // Auto-regenerate only when the existing brief has gone stale. If the opp
  // has no brief at all we surface a manual "Generate content" button instead
  // — the SE triggers the Claude call deliberately.
  useEffect(() => {
    if (data && data.brief && data.is_stale && !generating && data.match_context.products.length > 0) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.is_stale, data?.brief]);

  const generate = async () => {
    try {
      setGenerating(true);
      const r = await api.post<ApiResponse<{ brief: BriefData; generated_at: string }>>(
        `/opportunities/${oppId}/call-prep/generate`
      );
      setData(prev => prev ? { ...prev, brief: r.data.data.brief, generated_at: r.data.data.generated_at, is_stale: false } : prev);
    } catch {
      setError('Failed to generate brief');
    } finally {
      setGenerating(false);
    }
  };

  const copyBrief = () => {
    if (!data?.brief) return;
    const b = data.brief;
    const sections = [
      `DEAL CONTEXT:\n${b.deal_context}`,
      `\nKEY TALKING POINTS:\n${b.talking_points.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
    ];
    if (b.proof_point_highlights?.length) {
      sections.push(`\nCUSTOMER STORIES TO MENTION:\n${b.proof_point_highlights.map(h =>
        `- ${h.customer} [${h.role}]: ${h.key_stat} — Use when: ${h.when_to_use}`
      ).join('\n')}`);
    }
    if (b.differentiator_plays?.length) {
      sections.push(`\nDIFFERENTIATORS TO POSITION:\n${b.differentiator_plays.map(d =>
        `- ${d.name}: ${d.positioning} (backed by: ${d.backed_by})`
      ).join('\n')}`);
    }
    sections.push(`\nRISKS:\n${b.risks.map(r => `- [${r.severity.toUpperCase()}] ${r.text}`).join('\n')}`);
    sections.push(`\nDISCOVERY QUESTIONS:\n${b.discovery_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`);
    navigator.clipboard.writeText(sections.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="px-5 py-8 space-y-4">
        <div className="h-6 w-48 shimmer rounded" />
        <div className="h-32 shimmer rounded-lg" />
        <div className="h-24 shimmer rounded-lg" />
        <style>{`.shimmer{background:linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%);background-size:200% 100%;animation:shimmer 1.5s infinite}@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={fetchData} className="mt-2 text-xs text-brand-purple dark:text-accent-purple hover:text-brand-purple-70 dark:text-accent-purple">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const products = data.match_context.products;
  const noProducts = products.length === 0;

  return (
    <div className="px-5 py-5 space-y-6">

      {/* ── AI BRIEF ── */}
      {generating ? (
        <div className="rounded-lg border-2 border-dashed border-brand-purple/20 dark:border-accent-purple/30 bg-brand-purple-30/10 dark:bg-accent-purple-soft p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <svg className="w-5 h-5 animate-spin text-brand-purple dark:text-accent-purple" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20"/>
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            <span className="text-sm font-medium bg-gradient-to-r from-brand-pink to-brand-purple bg-clip-text text-transparent">
              Generating Pre-Call Brief...
            </span>
          </div>
          <p className="text-[12px] text-brand-navy-70 dark:text-fg-2">Analyzing deal context, MEDDPICC, tasks, notes, and knowledge base</p>
        </div>
      ) : data.brief ? (
        <div className="rounded-lg bg-gradient-to-r from-brand-pink/[0.04] via-brand-purple/[0.04] to-brand-purple/[0.04] dark:from-ink-1 dark:via-ink-1 dark:to-ink-1 dark:border-l-2 dark:border-l-accent-purple border border-brand-purple/15 dark:border-ink-border-soft p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#cpg)"/>
                <defs><linearGradient id="cpg" x1="2" y1="2" x2="22" y2="22"><stop stopColor="#F10090"/><stop offset="1" stopColor="#6A2CF5"/></linearGradient></defs>
              </svg>
              <span className="text-sm font-semibold text-brand-navy dark:text-fg-1">AI Pre-Call Brief</span>
              {data.generated_at && (
                <span className="text-[10px] text-brand-navy-70 dark:text-fg-2 bg-white/60 px-2 py-0.5 rounded-full">
                  {timeAgo(data.generated_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copyBrief} className="text-[11px] text-brand-navy-70 dark:text-fg-2 hover:text-brand-purple dark:text-accent-purple flex items-center gap-1 px-2 py-1 rounded hover:bg-white/50 transition-colors">
                {copied ? (
                  <><svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg><span className="text-green-600">Copied</span></>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</>
                )}
              </button>
              <button
                onClick={() => data && exportCallPrepPdf(data, oppName ?? `Opportunity #${oppId}`)}
                className="text-[11px] text-brand-navy-70 dark:text-fg-2 hover:text-brand-purple dark:text-accent-purple flex items-center gap-1 px-2 py-1 rounded hover:bg-white/50 transition-colors"
                title="Download as PDF"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                PDF
              </button>
              <button
                onClick={() => alert('Slack integration coming soon!')}
                className="text-[11px] text-brand-navy-70 dark:text-fg-2 hover:text-brand-purple dark:text-accent-purple flex items-center gap-1 px-2 py-1 rounded hover:bg-white/50 transition-colors"
                title="Send to Slack (coming soon)"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z"/></svg>
                Slack
              </button>
              <button onClick={generate} disabled={generating} className="text-[11px] text-brand-purple dark:text-accent-purple hover:text-brand-purple/80 flex items-center gap-1 px-2 py-1 rounded bg-white/60 hover:bg-white dark:bg-ink-1 transition-colors font-medium">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Regenerate
              </button>
            </div>
          </div>

          {/* Brief content */}
          {(() => {
            // Collect entity names for inline badge detection
            const csvNames = [
              ...data.proof_points.map(pp => pp.customer_name),
              ...(data.brief.proof_point_highlights?.map(h => h.customer) ?? []),
            ].filter((v, i, a) => a.indexOf(v) === i); // dedupe
            const diffNames = [
              ...data.differentiators.map(d => d.name),
              ...(data.brief.differentiator_plays?.map(d => d.name) ?? []),
            ].filter((v, i, a) => a.indexOf(v) === i);
            const citeJumper = makeScrollJumper();
            const citations = data.brief.citations;
            const render = (text: string) => renderWithCitations(text, csvNames, diffNames, citations, citeJumper);

            return (
          <div className="space-y-4 text-[13px] text-brand-navy dark:text-fg-1 leading-relaxed">
            {/* Deal Context — always visible */}
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2 font-semibold mb-1.5">Deal Context</h4>
              <p>{render(data.brief.deal_context)}</p>
            </div>

            {/* Talking Points — collapsible */}
            <details open className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none">
                <svg className="w-3 h-3 text-brand-navy-70 dark:text-fg-2 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
                <h4 className="text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2 font-semibold">Key Talking Points</h4>
                <span className="text-[10px] text-brand-navy-30 dark:text-fg-4 ml-0.5">{data.brief.talking_points.length}</span>
              </summary>
              <ul className="mt-1.5 space-y-1.5">
                {data.brief.talking_points.map((tp, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-brand-purple dark:text-accent-purple mt-0.5 text-xs">&#9679;</span>
                    <span>{render(tp)}</span>
                  </li>
                ))}
              </ul>
            </details>

            {/* Risks — collapsible */}
            <details open className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none">
                <svg className="w-3 h-3 text-brand-navy-70 dark:text-fg-2 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
                <h4 className="text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2 font-semibold">Risks & Open Items</h4>
                <span className="text-[10px] text-brand-navy-30 dark:text-fg-4 ml-0.5">{data.brief.risks.length}</span>
              </summary>
              <ul className="mt-1.5 space-y-1.5">
                {data.brief.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`mt-0.5 text-xs ${r.severity === 'high' ? 'text-status-overdue dark:text-status-d-overdue' : 'text-status-warning dark:text-status-d-warning'}`}>&#9679;</span>
                    <span>{render(r.text)}</span>
                  </li>
                ))}
              </ul>
            </details>

            {/* Discovery Questions — collapsible */}
            <details open className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none">
                <svg className="w-3 h-3 text-brand-navy-70 dark:text-fg-2 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
                <h4 className="text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2 font-semibold">Suggested Discovery Questions</h4>
                <span className="text-[10px] text-brand-navy-30 dark:text-fg-4 ml-0.5">{data.brief.discovery_questions.length}</span>
              </summary>
              <ol className="mt-1.5 space-y-1.5 list-decimal list-inside text-brand-navy-70 dark:text-fg-2">
                {data.brief.discovery_questions.map((q, i) => (
                  <li key={i}>{render(q)}</li>
                ))}
              </ol>
            </details>
          </div>
            );
          })()}
        </div>
      ) : noProducts ? (
        /* Empty state — no products */
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-full bg-brand-purple-30/30 dark:bg-accent-purple-soft flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-brand-purple/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-brand-navy dark:text-fg-1 mb-1">No product tags on this opportunity</p>
          <p className="text-[12px] text-brand-navy-70 dark:text-fg-2 mb-3">Add products in the Deal Info panel to see matching customer stories and differentiators.</p>
          <button onClick={generate} className="text-[12px] text-brand-purple dark:text-accent-purple font-medium hover:text-brand-purple/80 transition-colors">
            Generate brief anyway &rarr;
          </button>
        </div>
      ) : (
        /* Empty state — no brief yet. SE generates on demand; we no longer
           auto-fire on tab open to avoid surprise Claude calls. */
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-brand-purple-30/30 dark:bg-accent-purple-soft flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-brand-purple" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-brand-navy dark:text-fg-1 mb-1">No pre-call brief yet</p>
          <p className="text-[12px] text-brand-navy-70 dark:text-fg-2 mb-4 max-w-sm mx-auto">Generate an AI-powered brief using the deal's MEDDPICC, tasks, notes, and knowledge base.</p>
          <button
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-brand-purple text-white hover:bg-brand-purple-70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/>
            </svg>
            Generate content
          </button>
        </div>
      )}

      {/* ── CUSTOMER STORIES TO MENTION (AI-selected) ── */}
      {data.brief?.proof_point_highlights && data.brief.proof_point_highlights.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              CSV
            </span>
            <h3 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Customer Stories to Mention</h3>
            <span className="text-[10px] bg-brand-purple-30 dark:bg-accent-purple-soft text-brand-purple dark:text-accent-purple px-2 py-0.5 rounded-full font-medium">AI-selected</span>
            <span className="text-[10px] text-brand-navy-70 dark:text-fg-2 ml-auto">Top stories picked for this deal</span>
          </div>

          <div className="space-y-2">
            {data.brief.proof_point_highlights.map((h, i) => {
              const roleColors: Record<string, { bg: string; text: string; label: string }> = {
                primary: { bg: 'bg-green-100', text: 'text-green-700', label: 'Primary reference' },
                scale:   { bg: 'bg-blue-100',  text: 'text-blue-700',  label: 'Scale reference' },
                backup:  { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Backup reference' },
              };
              const rc = roleColors[h.role] || roleColors.backup;
              const isPrimary = h.role === 'primary';
              // Find matching DB proof point for product pills
              const dbPP = data.proof_points.find(pp => pp.customer_name.toLowerCase() === h.customer.toLowerCase());

              return (
                <div key={i} className={`rounded-lg border p-3 ${isPrimary ? 'border-green-200 bg-green-50/30' : 'border-brand-navy-30/40 dark:border-ink-border-soft bg-white'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-brand-navy dark:text-fg-1">{h.customer}</span>
                      {dbPP && dbPP.products.map(p => (
                        <span key={p} className="text-[10px] bg-brand-purple-30 dark:bg-accent-purple-soft text-brand-purple dark:text-accent-purple px-1.5 py-0.5 rounded">{p}</span>
                      ))}
                    </div>
                    <span className={`text-[10px] ${rc.bg} ${rc.text} px-1.5 py-0.5 rounded font-medium`}>{rc.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-[11px]">
                    <div>
                      <span className="text-brand-navy-70 dark:text-fg-2 block mb-0.5">Why relevant</span>
                      <span className="text-brand-navy dark:text-fg-1">{highlightBold(h.why_relevant)}</span>
                    </div>
                    <div>
                      <span className="text-brand-navy-70 dark:text-fg-2 block mb-0.5">Key stat</span>
                      <span className="text-brand-navy dark:text-fg-1 font-medium">{highlightBold(h.key_stat)}</span>
                    </div>
                    <div>
                      <span className="text-brand-navy-70 dark:text-fg-2 block mb-0.5">When to use</span>
                      <span className="text-brand-navy dark:text-fg-1">{highlightBold(h.when_to_use)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DIFFERENTIATORS TO POSITION (AI-selected, linked to proof points) ── */}
      {data.brief?.differentiator_plays && data.brief.differentiator_plays.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              DIFF
            </span>
            <h3 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Differentiators to Position</h3>
            <span className="text-[10px] bg-brand-purple-30 dark:bg-accent-purple-soft text-brand-purple dark:text-accent-purple px-2 py-0.5 rounded-full font-medium">
              {data.brief.differentiator_plays.length} relevant
            </span>
          </div>

          <div className="space-y-2">
            {data.brief.differentiator_plays.map((dp, i) => {
              // Find the full differentiator from KB data for signal badge
              const dbDiff = data.differentiators.find(d => d.name.toLowerCase().includes(dp.name.toLowerCase().split(' ')[0]));
              const signalMatch = dbDiff && data.match_context.competitors
                ? dbDiff.need_signals.find(s => data.match_context.competitors!.toLowerCase().includes(s.toLowerCase().split(' ')[0]))
                : null;

              return (
                <div key={i} className="rounded-lg border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
                  <div className="p-3 bg-gray-50 dark:bg-ink-2/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-medium text-brand-navy dark:text-fg-1">{dp.name}</span>
                      {signalMatch && (
                        <span className="text-[10px] bg-brand-pink-30 text-brand-pink dark:text-accent-pink px-1.5 py-0.5 rounded font-medium">
                          vs. {signalMatch}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-brand-navy-70 dark:text-fg-2 leading-relaxed mb-2">{highlightBold(dp.positioning)}</p>
                    {/* Linked proof point */}
                    {dp.backed_by && (
                      <div className="flex items-center gap-2 rounded bg-white dark:bg-ink-1 border border-brand-navy-30/30 dark:border-ink-border-soft px-2.5 py-1.5 text-[11px]">
                        <svg className="w-3 h-3 text-brand-purple dark:text-accent-purple flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                        </svg>
                        <span className="text-brand-navy-70 dark:text-fg-2">Backed by:</span>
                        <span className="text-brand-navy dark:text-fg-1 font-medium">{dp.backed_by}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── RAW KB MATCHES (collapsible, for deeper exploration) ── */}
      {data.proof_points.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-[11px] text-brand-navy-70 dark:text-fg-2 hover:text-brand-purple dark:text-accent-purple transition-colors py-1">
            <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7"/></svg>
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-gray-600 text-white px-1.5 py-0.5 rounded">KB</span>
            All matching stories ({data.proof_points.length})
          </summary>
          <div className="mt-2 space-y-2">
            {data.proof_points.map(pp => {
              const m = matchLabel(pp, products);
              const isExpanded = expandedPP === pp.id;
              return (
                <div
                  key={pp.id}
                  onClick={() => setExpandedPP(isExpanded ? null : pp.id)}
                  className="rounded-lg border border-brand-navy-30/40 dark:border-ink-border-soft p-3 hover:border-brand-purple/30 dark:hover:border-accent-purple/30 transition-colors cursor-pointer group/pp"
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-brand-navy dark:text-fg-1">{pp.customer_name}</span>
                      <span className={`text-[10px] ${m.color} px-1.5 py-0.5 rounded font-medium`}>{m.label}</span>
                    </div>
                    <div className="flex gap-1">
                      {pp.products.map(p => (
                        <span key={p} className={`text-[10px] px-1.5 py-0.5 rounded ${products.includes(p) ? 'bg-brand-purple-30 dark:bg-accent-purple-soft text-brand-purple' : 'bg-gray-100 dark:bg-ink-3 text-gray-500'}`}>{p}</span>
                      ))}
                    </div>
                  </div>
                  <p className="text-[12px] text-brand-navy-70 dark:text-fg-2 leading-relaxed">
                    {isExpanded ? pp.proof_point_text : pp.proof_point_text.slice(0, 180) + (pp.proof_point_text.length > 180 ? '...' : '')}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-brand-navy-70 dark:text-fg-2">
                    <span>{pp.vertical}</span>
                    {pp.about && <><span className="text-brand-navy-30 dark:text-fg-4">|</span><span>{pp.about.slice(0, 60)}{pp.about.length > 60 ? '...' : ''}</span></>}
                    <span className="text-brand-purple dark:text-accent-purple opacity-0 group-hover/pp:opacity-100 transition-opacity ml-auto">
                      {isExpanded ? 'Collapse' : 'Show full story'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* No KB data at all */}
      {data.proof_points.length === 0 && !data.brief?.proof_point_highlights?.length && !noProducts && (
        <div className="text-center py-4 text-[12px] text-brand-navy-70 dark:text-fg-2">
          No matching customer stories or differentiators found for the tagged products.
        </div>
      )}
    </div>
  );
}
