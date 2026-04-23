import { callAnthropic } from './aiClient.js';
import { renderAgentPrompt } from './agentRunner.js';
import { query, queryOne } from '../db/index.js';
import { findSimilarDeals, type SimilarDealResult } from './similarDeals.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface Insight {
  ref_type: 'opportunity' | 'kb';
  id: number;
  insight: string;
}

export interface InsightsResponse {
  insights: Insight[];
  generated_at: string | null;
  is_stale: boolean;
  candidates_considered: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_CANDIDATES_TO_GENERATE = 5;
const MAX_CANDIDATES_TO_SEND = 15;
// Only annotate candidates at or above this score. Below ~70 the AI has little
// substantive signal and ends up writing "limited relevance" filler on every
// row, which is clutter. Caller-side thresholds should match.
export const INSIGHT_SCORE_MIN = 70;

// ── Helpers ─────────────────────────────────────────────────────────────────

function cacheKey(oppId: number): string {
  return `similar-deals-insights-${oppId}`;
}

function normalizeInsights(raw: unknown): Insight[] {
  if (!Array.isArray(raw)) return [];
  const out: Insight[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || !item) continue;
    const r = item as Record<string, unknown>;
    if ((r.ref_type !== 'opportunity' && r.ref_type !== 'kb') || typeof r.id !== 'number') continue;
    if (typeof r.insight !== 'string' || !r.insight.trim()) continue;
    out.push({ ref_type: r.ref_type, id: r.id, insight: r.insight.trim() });
  }
  return out;
}

async function buildPrompt(active: {
  name: string;
  account_name: string | null;
  account_industry: string | null;
  products: string[];
  engaged_competitors: string[];
  need: string | null;
  technical_blockers: string | null;
  se_comments: string | null;
}, candidates: SimilarDealResult[]): Promise<string> {
  const activeBlock = [
    `Name: ${active.name}`,
    `Account: ${active.account_name ?? '(unknown)'}`,
    `Industry: ${active.account_industry ?? '(unknown)'}`,
    `Products: ${active.products.join(', ') || '(none)'}`,
    active.engaged_competitors.length > 0 ? `Competitors: ${active.engaged_competitors.join(', ')}` : null,
    active.need ? `Need: ${active.need.slice(0, 400)}` : null,
    active.technical_blockers ? `Technical blockers: ${active.technical_blockers.slice(0, 400)}` : null,
    active.se_comments ? `SE notes: ${active.se_comments.slice(0, 400)}` : null,
  ].filter(Boolean).join('\n');

  const candidateBlocks = candidates.map(c => {
    const outcome = c.outcome === 'won' ? 'Won'
      : c.outcome === 'lost' ? 'Lost'
      : c.outcome === 'in_flight' ? `In flight (${c.stage ?? 'open'})`
      : 'KB reference';
    return `### ${c.ref_type}:${c.id} — ${c.name}
Outcome: ${outcome}
Industry: ${c.account_industry ?? '(unknown)'}
Match chips: ${c.match_chips.map(ch => ch.label).join(' · ') || '(none)'}
Notes: ${(c.why_text ?? '').slice(0, 400)}`;
  }).join('\n\n');

  return renderAgentPrompt('similar-deals-insights', {
    active_block: activeBlock,
    candidate_blocks: candidateBlocks,
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getCachedInsights(oppId: number): Promise<InsightsResponse> {
  const cached = await queryOne<{ content: string; generated_at: string }>(
    `SELECT content, generated_at FROM ai_summary_cache WHERE key = $1`,
    [cacheKey(oppId)]
  );

  // Also report candidate count so the UI knows whether there's anything to generate from.
  const similar = await findSimilarDeals(oppId);
  const candidates_considered = similar ? similar.total_above_threshold : 0;

  if (!cached) {
    return { insights: [], generated_at: null, is_stale: true, candidates_considered };
  }

  const age = Date.now() - new Date(cached.generated_at).getTime();
  const isStale = age > CACHE_TTL_MS;
  let insights: Insight[] = [];
  try { insights = normalizeInsights(JSON.parse(cached.content)); } catch { insights = []; }

  return {
    insights,
    generated_at: cached.generated_at,
    is_stale: isStale,
    candidates_considered,
  };
}

export async function generateInsights(oppId: number): Promise<InsightsResponse> {
  const similar = await findSimilarDeals(oppId);
  if (!similar) {
    return { insights: [], generated_at: null, is_stale: true, candidates_considered: 0 };
  }

  const topCandidates = similar.results.slice(0, MAX_CANDIDATES_TO_SEND);
  // Only send strong matches (score ≥ 70) to Claude. Weaker matches produce
  // filler like "limited relevance — only shared the industry" which clutters
  // the UI. The rest fall back to the deterministic why_text on each row.
  const candidates = topCandidates.filter(c => c.score >= INSIGHT_SCORE_MIN);
  if (candidates.length < MIN_CANDIDATES_TO_GENERATE) {
    return { insights: [], generated_at: null, is_stale: true, candidates_considered: candidates.length };
  }

  // We need the active deal's raw text fields for the prompt; fetch them separately
  // rather than plumbing them through findSimilarDeals' return shape.
  const active = await queryOne<{
    name: string;
    account_name: string | null;
    account_industry: string | null;
    products: string[];
    engaged_competitors: string | null;
    need: string | null;
    technical_blockers: string | null;
    se_comments: string | null;
  }>(
    `SELECT name, account_name, account_industry, products, engaged_competitors,
            need, technical_blockers, se_comments
     FROM opportunities WHERE id = $1 AND is_active = true`,
    [oppId]
  );
  if (!active) {
    return { insights: [], generated_at: null, is_stale: true, candidates_considered: 0 };
  }

  const prompt = await buildPrompt({
    ...active,
    engaged_competitors: active.engaged_competitors
      ? active.engaged_competitors.split(/[,;|]/).map(s => s.trim()).filter(Boolean)
      : [],
  }, candidates);

  const { text: raw } = await callAnthropic({
    feature: 'similar-deals-insights',
    prompt,
    maxTokens: 1500,
  });
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); }
  catch { throw new Error('AI response failed to parse as JSON'); }

  const insights = normalizeInsights(parsed);
  if (insights.length === 0) {
    throw new Error('AI response had no usable insights');
  }

  const generatedAt = new Date().toISOString();
  await query(
    `INSERT INTO ai_summary_cache (key, content, generated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET content = $2, generated_at = $3`,
    [cacheKey(oppId), JSON.stringify(insights), generatedAt]
  );

  return {
    insights,
    generated_at: generatedAt,
    is_stale: false,
    candidates_considered: candidates.length,
  };
}
