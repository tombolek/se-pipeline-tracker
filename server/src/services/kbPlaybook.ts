import { callAnthropic } from './aiClient.js';
import { query, queryOne } from '../db/index.js';
import type { CitationSource, ResolvedCitation } from '../types/citations.js';
import { CITATION_INSTRUCTIONS, resolveCitations } from './citations.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface KbPlaybook {
  win_pattern: string;
  positioning: string;
  anticipate: string[];
  lead_with: string[];
  based_on: string[];  // customer names the playbook was synthesized from
  /** #135 — [N] markers in win_pattern / positioning / anticipate[] /
   *  lead_with[] resolve against this array. */
  citations?: ResolvedCitation[];
}

export interface KbPlaybookResponse {
  playbook: KbPlaybook | null;
  generated_at: string | null;
  is_stale: boolean;
  sources_available: number;
}

interface ActiveDeal {
  name: string;
  account_name: string | null;
  account_industry: string | null;
  account_segment: string | null;
  products: string[];
  engaged_competitors: string | null;
  need: string | null;
  technical_blockers: string | null;
  se_comments: string | null;
}

interface KbProofPoint {
  id: number;
  customer_name: string;
  about: string | null;
  vertical: string;
  products: string[];
  initiatives: string[];
  proof_point_text: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_SOURCES = 4;
const MAX_PROOF_TEXT_CHARS = 1200;

// Reverse of the mapping in similarDeals.ts — given a normalized industry,
// return the KB vertical prefix we'd look for in kb_proof_points.vertical.
// Multiple verticals may map to the same industry (e.g. three Finance files).
function industryToVerticalPrefixes(industry: string | null): string[] {
  if (!industry) return [];
  const s = industry.toLowerCase();
  if (s.includes('financial') || s === 'finance') return ['Finance'];
  if (s.includes('insurance')) return ['Insurance'];
  if (s.includes('life science') || s.includes('pharma')) return ['Manufacturing — Pharma'];
  if (s.includes('manufacturing')) return ['Manufacturing'];
  if (s.includes('healthcare')) return ['Healthcare', 'Other Verticals — Healthcare'];
  if (s.includes('technology') || s.includes('retail') || s.includes('energy') || s.includes('public')) {
    return ['Technology', 'Other Verticals'];
  }
  return [];
}

// ── Fetch matching sources ──────────────────────────────────────────────────

async function loadSources(active: ActiveDeal): Promise<KbProofPoint[]> {
  const prefixes = industryToVerticalPrefixes(active.account_industry);
  if (prefixes.length === 0 && active.products.length === 0) return [];

  // Build vertical filter (ILIKE on any prefix).
  const verticalClause = prefixes.length > 0
    ? `AND (${prefixes.map((_, i) => `vertical ILIKE $${i + 1}`).join(' OR ')})`
    : '';
  const verticalParams = prefixes.map(p => `${p}%`);

  // Pull candidates — vertical-matched first, then product-matched fallback.
  const candidates = await query<KbProofPoint>(
    `SELECT id, customer_name, about, vertical, products, initiatives, proof_point_text
     FROM kb_proof_points
     WHERE 1=1
       ${verticalClause}
     LIMIT 30`,
    verticalParams
  );

  // If nothing on vertical, fall back to product overlap alone.
  let pool = candidates;
  if (pool.length === 0 && active.products.length > 0) {
    pool = await query<KbProofPoint>(
      `SELECT id, customer_name, about, vertical, products, initiatives, proof_point_text
       FROM kb_proof_points
       WHERE products && $1::text[]
       LIMIT 30`,
      [active.products]
    );
  }

  // Rank: +3 if product overlap, +1 per overlapping initiative keyword.
  const activeProducts = new Set(active.products);
  const scored = pool.map(p => {
    let score = 0;
    const overlap = p.products.filter(x => activeProducts.has(x)).length;
    if (overlap > 0) score += 3 * overlap;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_SOURCES).map(s => s.p);
}

// ── Prompt + Claude call ────────────────────────────────────────────────────

function buildPrompt(active: ActiveDeal, sources: KbProofPoint[]): string {
  const activeBlock = [
    `Account: ${active.account_name ?? '(unknown)'}`,
    `Industry: ${active.account_industry ?? '(unknown)'}`,
    `Segment: ${active.account_segment ?? '(unknown)'}`,
    `Products being pitched: ${active.products.join(', ') || '(not specified)'}`,
    active.engaged_competitors ? `Engaged competitors: ${active.engaged_competitors}` : null,
    active.need ? `Need: ${active.need.slice(0, 400)}` : null,
    active.technical_blockers ? `Technical blockers: ${active.technical_blockers.slice(0, 400)}` : null,
    active.se_comments ? `SE notes: ${active.se_comments.slice(0, 400)}` : null,
  ].filter(Boolean).join('\n');

  // Each source gets a [N] id that Claude uses to cite inline. Same contract
  // as buildCitationSources() but tailored to KB proof points. #135.
  const sourceBlocks = sources.map((s, i) => {
    const n = i + 1;
    const trimmed = s.proof_point_text.length > MAX_PROOF_TEXT_CHARS
      ? s.proof_point_text.slice(0, MAX_PROOF_TEXT_CHARS) + '…'
      : s.proof_point_text;
    return `### [${n}] ${s.customer_name}
Vertical: ${s.vertical}
Products: ${s.products.join(', ') || '(none)'}
Initiatives: ${s.initiatives.join(', ') || '(none)'}

${trimmed}`;
  }).join('\n\n---\n\n');

  return `You are a sales engineer assistant. We have no direct historical deal matches for the active opportunity below, so instead we're mining our curated knowledge base of past customer wins in the same vertical to synthesize a short playbook.

## Active opportunity

${activeBlock}

## Relevant past customer wins (from our knowledge base) — CITE THESE BY [N]

${sourceBlocks}

${CITATION_INSTRUCTIONS}

## Task

Based ONLY on the proof points above, produce a compact playbook. Do not invent details that aren't in the sources. Cite every factual claim with [N] matching a source id above.

Respond with a JSON object, no preamble, no markdown fences:

{
  "win_pattern": "1-2 sentences on what typically wins us deals in this vertical with these products, drawn from the sources — each claim cited with [N]",
  "positioning": "1-2 sentences on how to position against likely competitors or incumbent tooling, drawn from the sources — each claim cited with [N]",
  "anticipate": ["2-4 short bullets, each naming a blocker/constraint/objection the sources describe, cited with [N]"],
  "lead_with": ["2-4 short bullets, each naming a capability/message that resonated in the sources, cited with [N]"],
  "based_on": ["customer name 1", "customer name 2", ...]  // echo the exact customer names you drew from
}`;
}

function parseResponse(raw: string): KbPlaybook | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try {
    const parsed = JSON.parse(cleaned) as Partial<KbPlaybook>;
    if (typeof parsed.win_pattern !== 'string' || typeof parsed.positioning !== 'string') return null;
    return {
      win_pattern: parsed.win_pattern,
      positioning: parsed.positioning,
      anticipate: Array.isArray(parsed.anticipate) ? parsed.anticipate.filter(x => typeof x === 'string') : [],
      lead_with: Array.isArray(parsed.lead_with) ? parsed.lead_with.filter(x => typeof x === 'string') : [],
      based_on: Array.isArray(parsed.based_on) ? parsed.based_on.filter(x => typeof x === 'string') : [],
    };
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Load cached playbook for an opp, if any.
 */
export async function getCachedPlaybook(oppId: number): Promise<KbPlaybookResponse> {
  const cached = await queryOne<{ content: string; generated_at: string }>(
    `SELECT content, generated_at FROM ai_summary_cache WHERE key = $1`,
    [`kb-playbook-${oppId}`]
  );

  // Count available sources (quick disk query, no AI) so the UI can decide
  // whether there's any point offering to generate.
  const active = await loadActiveDeal(oppId);
  const sources = active ? await loadSources(active) : [];

  if (!cached) {
    return { playbook: null, generated_at: null, is_stale: true, sources_available: sources.length };
  }

  const age = Date.now() - new Date(cached.generated_at).getTime();
  const isStale = age > CACHE_TTL_MS;
  let playbook: KbPlaybook | null = null;
  try { playbook = JSON.parse(cached.content); } catch { playbook = null; }

  return {
    playbook,
    generated_at: cached.generated_at,
    is_stale: isStale,
    sources_available: sources.length,
  };
}

async function loadActiveDeal(oppId: number): Promise<ActiveDeal | null> {
  return await queryOne<ActiveDeal>(
    `SELECT o.name, o.account_name, o.account_industry, o.account_segment, o.products,
            o.engaged_competitors, o.need, o.technical_blockers, o.se_comments
     FROM opportunities o
     WHERE o.id = $1 AND o.is_active = true`,
    [oppId]
  );
}

/**
 * Generate (and cache) a new KB playbook for the given opp.
 */
export async function generatePlaybook(oppId: number): Promise<KbPlaybookResponse> {
  const active = await loadActiveDeal(oppId);
  if (!active) return { playbook: null, generated_at: null, is_stale: true, sources_available: 0 };

  const sources = await loadSources(active);
  if (sources.length === 0) {
    return { playbook: null, generated_at: null, is_stale: true, sources_available: 0 };
  }

  const prompt = buildPrompt(active, sources);
  const { text: raw } = await callAnthropic({
    feature: 'kb-playbook',
    prompt,
    maxTokens: 800,
  });
  const playbook = parseResponse(raw);
  if (!playbook) {
    throw new Error('KB playbook response failed to parse as JSON');
  }

  // Resolve [N] markers across all prose fields against the source proof
  // points. #135. Click on a pill has no jump target (we don't have a KB
  // reader UI yet) but the hover preview shows the proof-point excerpt so
  // the SE can read the grounding without leaving the flow.
  const kbSources: CitationSource[] = sources.map(s => ({
    key: `kb-${s.id}`,
    kind: 'kb_proof_point' as const,
    label: `KB proof point · ${s.customer_name}`,
    meta: s.vertical,
    preview: s.proof_point_text.slice(0, 400),
    kb_proof_point_id: s.id,
  }));
  const allProse = [
    playbook.win_pattern,
    playbook.positioning,
    ...playbook.anticipate,
    ...playbook.lead_with,
  ].join(' ');
  const { citations } = resolveCitations(allProse, kbSources);
  playbook.citations = citations;

  const generatedAt = new Date().toISOString();
  await query(
    `INSERT INTO ai_summary_cache (key, content, generated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET content = $2, generated_at = $3`,
    [`kb-playbook-${oppId}`, JSON.stringify(playbook), generatedAt]
  );

  return {
    playbook,
    generated_at: generatedAt,
    is_stale: false,
    sources_available: sources.length,
  };
}
