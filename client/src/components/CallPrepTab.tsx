import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import type { ApiResponse } from '../types';

/* ── Types ── */
interface BriefData {
  deal_context: string;
  talking_points: string[];
  risks: { severity: string; text: string }[];
  discovery_questions: string[];
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
  return { label: 'Weak', color: 'bg-gray-100 text-gray-600' };
}

/* ── Component ── */
export default function CallPrepTab({ oppId }: { oppId: number }) {
  const [data, setData] = useState<CallPrepResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDiff, setExpandedDiff] = useState<number | null>(null);
  const [showAllPP, setShowAllPP] = useState(false);
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

  // Auto-generate if brief is missing or stale
  useEffect(() => {
    if (data && (data.is_stale || !data.brief) && !generating && data.match_context.products.length > 0) {
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
    const text = [
      `DEAL CONTEXT:\n${b.deal_context}`,
      `\nKEY TALKING POINTS:\n${b.talking_points.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
      `\nRISKS:\n${b.risks.map(r => `- [${r.severity.toUpperCase()}] ${r.text}`).join('\n')}`,
      `\nDISCOVERY QUESTIONS:\n${b.discovery_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
    ].join('\n');
    navigator.clipboard.writeText(text);
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
        <button onClick={fetchData} className="mt-2 text-xs text-brand-purple hover:text-brand-purple-70">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const products = data.match_context.products;
  const noProducts = products.length === 0;
  const visiblePP = showAllPP ? data.proof_points : data.proof_points.slice(0, 3);
  const topDiffs = data.differentiators.filter(d => d.relevance_score > 0).slice(0, 5);

  return (
    <div className="px-5 py-5 space-y-6">

      {/* ── AI BRIEF ── */}
      {generating ? (
        <div className="rounded-lg border-2 border-dashed border-brand-purple/20 bg-brand-purple-30/10 p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <svg className="w-5 h-5 animate-spin text-brand-purple" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20"/>
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            <span className="text-sm font-medium bg-gradient-to-r from-brand-pink to-brand-purple bg-clip-text text-transparent">
              Generating Pre-Call Brief...
            </span>
          </div>
          <p className="text-[12px] text-brand-navy-70">Analyzing deal context, MEDDPICC, tasks, notes, and knowledge base</p>
        </div>
      ) : data.brief ? (
        <div className="rounded-lg bg-gradient-to-r from-brand-pink/[0.04] via-brand-purple/[0.04] to-brand-purple/[0.04] border border-brand-purple/15 p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#cpg)"/>
                <defs><linearGradient id="cpg" x1="2" y1="2" x2="22" y2="22"><stop stopColor="#F10090"/><stop offset="1" stopColor="#6A2CF5"/></linearGradient></defs>
              </svg>
              <span className="text-sm font-semibold text-brand-navy">AI Pre-Call Brief</span>
              {data.generated_at && (
                <span className="text-[10px] text-brand-navy-70 bg-white/60 px-2 py-0.5 rounded-full">
                  {timeAgo(data.generated_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copyBrief} className="text-[11px] text-brand-navy-70 hover:text-brand-purple flex items-center gap-1 px-2 py-1 rounded hover:bg-white/50 transition-colors">
                {copied ? (
                  <><svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg><span className="text-green-600">Copied</span></>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</>
                )}
              </button>
              <button onClick={generate} disabled={generating} className="text-[11px] text-brand-purple hover:text-brand-purple/80 flex items-center gap-1 px-2 py-1 rounded bg-white/60 hover:bg-white transition-colors font-medium">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Regenerate
              </button>
            </div>
          </div>

          {/* Brief content */}
          <div className="space-y-4 text-[13px] text-brand-navy leading-relaxed">
            {/* Deal Context */}
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-brand-navy-70 font-semibold mb-1.5">Deal Context</h4>
              <p>{data.brief.deal_context}</p>
            </div>

            {/* Talking Points */}
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-brand-navy-70 font-semibold mb-1.5">Key Talking Points</h4>
              <ul className="space-y-1.5">
                {data.brief.talking_points.map((tp, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-brand-purple mt-0.5 text-xs">&#9679;</span>
                    <span>{tp}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Risks */}
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-brand-navy-70 font-semibold mb-1.5">Risks & Open Items</h4>
              <ul className="space-y-1.5">
                {data.brief.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`mt-0.5 text-xs ${r.severity === 'high' ? 'text-status-overdue' : 'text-status-warning'}`}>&#9679;</span>
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Discovery Questions */}
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-brand-navy-70 font-semibold mb-1.5">Suggested Discovery Questions</h4>
              <ol className="space-y-1.5 list-decimal list-inside text-brand-navy-70">
                {data.brief.discovery_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      ) : noProducts ? (
        /* Empty state — no products */
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-full bg-brand-purple-30/30 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-brand-purple/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-brand-navy mb-1">No product tags on this opportunity</p>
          <p className="text-[12px] text-brand-navy-70 mb-3">Add products in the Deal Info panel to see matching customer stories and differentiators.</p>
          <button onClick={generate} className="text-[12px] text-brand-purple font-medium hover:text-brand-purple/80 transition-colors">
            Generate brief anyway &rarr;
          </button>
        </div>
      ) : null}

      {/* ── MATCHING PROOF POINTS ── */}
      {data.proof_points.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-brand-navy">Matching Customer Stories</h3>
              <span className="text-[10px] bg-brand-purple-30 text-brand-purple px-2 py-0.5 rounded-full font-medium">
                {data.proof_points.length} match{data.proof_points.length !== 1 ? 'es' : ''}
              </span>
            </div>
            <span className="text-[10px] text-brand-navy-70">By product + industry relevance</span>
          </div>

          <div className="space-y-2">
            {visiblePP.map(pp => {
              const m = matchLabel(pp, products);
              const isExpanded = expandedPP === pp.id;
              return (
                <div
                  key={pp.id}
                  onClick={() => setExpandedPP(isExpanded ? null : pp.id)}
                  className="rounded-lg border border-brand-navy-30/40 p-3 hover:border-brand-purple/30 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-brand-navy">{pp.customer_name}</span>
                      <span className={`text-[10px] ${m.color} px-1.5 py-0.5 rounded font-medium`}>{m.label}</span>
                    </div>
                    <div className="flex gap-1">
                      {pp.products.map(p => (
                        <span key={p} className={`text-[10px] px-1.5 py-0.5 rounded ${products.includes(p) ? 'bg-brand-purple-30 text-brand-purple' : 'bg-gray-100 text-gray-500'}`}>{p}</span>
                      ))}
                    </div>
                  </div>
                  <p className="text-[12px] text-brand-navy-70 leading-relaxed">
                    {isExpanded ? pp.proof_point_text : pp.proof_point_text.slice(0, 180) + (pp.proof_point_text.length > 180 ? '...' : '')}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-brand-navy-70">
                    <span>{pp.vertical}</span>
                    {pp.about && <><span className="text-brand-navy-30">|</span><span>{pp.about.slice(0, 60)}{pp.about.length > 60 ? '...' : ''}</span></>}
                    <span className="text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                      {isExpanded ? 'Collapse' : 'Show full story'}
                    </span>
                  </div>
                </div>
              );
            })}

            {data.proof_points.length > 3 && !showAllPP && (
              <button
                onClick={() => setShowAllPP(true)}
                className="w-full text-center text-[11px] text-brand-purple hover:text-brand-purple/80 py-2 rounded-lg hover:bg-brand-purple-30/20 transition-colors"
              >
                + {data.proof_points.length - 3} more match{data.proof_points.length - 3 !== 1 ? 'es' : ''}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── MATCHING DIFFERENTIATORS ── */}
      {topDiffs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-brand-navy">Relevant Differentiators</h3>
              <span className="text-[10px] bg-brand-purple-30 text-brand-purple px-2 py-0.5 rounded-full font-medium">
                {topDiffs.length} matched
              </span>
            </div>
            <span className="text-[10px] text-brand-navy-70">Based on competitor & need signals</span>
          </div>

          <div className="space-y-2">
            {topDiffs.map(d => {
              const isExpanded = expandedDiff === d.id;
              // Find top signal
              const signalMatch = data.match_context.competitors
                ? d.need_signals.find(s => data.match_context.competitors!.toLowerCase().includes(s.toLowerCase().split(' ')[0]))
                : null;

              return (
                <div key={d.id} className="rounded-lg border border-brand-navy-30/40 overflow-hidden">
                  <div
                    onClick={() => setExpandedDiff(isExpanded ? null : d.id)}
                    className={`p-3 cursor-pointer hover:bg-gray-50/80 transition-colors ${isExpanded ? 'bg-gray-50/50' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[13px] font-medium text-brand-navy">{d.name}</span>
                          {signalMatch && (
                            <span className="text-[10px] bg-brand-pink-30 text-brand-pink px-1.5 py-0.5 rounded font-medium">
                              Signal: {signalMatch}
                            </span>
                          )}
                        </div>
                        {d.tagline && <p className="text-[11px] text-brand-navy-70 italic">{d.tagline}</p>}
                      </div>
                      <svg className={`w-4 h-4 text-brand-navy-30 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path d="M19 9l-7 7-7-7"/>
                      </svg>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-brand-navy-30/20 pt-2">
                      {d.core_message && <p className="text-[12px] text-brand-navy-70 leading-relaxed mb-2">{d.core_message}</p>}
                      {d.competitive_positioning && (
                        <div className="text-[11px] text-brand-navy-70 bg-gray-50 rounded p-2 mt-1">
                          <span className="font-medium">vs. competition: </span>{d.competitive_positioning}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No KB data at all */}
      {data.proof_points.length === 0 && topDiffs.length === 0 && !noProducts && (
        <div className="text-center py-4 text-[12px] text-brand-navy-70">
          No matching customer stories or differentiators found for the tagged products.
        </div>
      )}
    </div>
  );
}
