/**
 * Server-side citation support for AI features (#135). Three jobs:
 *
 *   1. Build the list of `CitationSource`s an opportunity can be cited against
 *      — SF fields, notes, tasks, Tech Discovery prose, KB proof points.
 *   2. Format that list for the prompt so Claude knows exactly what ids are
 *      available and how to cite them.
 *   3. Validate the response: strip any citations whose ref doesn't resolve
 *      to a real source, and flag `[N]` markers in the text that point to a
 *      missing citation so the client can render the "unsupported claim"
 *      error state.
 */
import { query, queryOne } from '../db/index.js';
import type { CitationSource, ResolvedCitation } from '../types/citations.js';

// ── Build sources ───────────────────────────────────────────────────────────

/**
 * The SF / app fields we'll expose as citable sources. These are the fields
 * the AI is allowed to point at when making claims. Order matters: the list
 * also controls the numeric id each source gets in the prompt.
 */
const FIELD_LABELS: Array<[string, string]> = [
  ['se_comments',          'SE Comments'],
  ['technical_blockers',   'Technical Blockers / Risk'],
  ['metrics',              'Metrics'],
  ['economic_buyer',       'Economic Buyer'],
  ['decision_criteria',    'Decision Criteria'],
  ['decision_process',     'Decision Process'],
  ['paper_process',        'Paper Process'],
  ['implicate_pain',       'Implicate the Pain'],
  ['champion',             'Champion'],
  ['engaged_competitors',  'Engaged Competitors'],
  ['budget',               'Budget'],
  ['authority',            'Authority'],
  ['need',                 'Need'],
  ['timeline',             'Timeline'],
  ['agentic_qual',         'Agentic Qual'],
  ['next_step_sf',         'Next Step (SF)'],
  ['manager_comments',     'Manager Comments'],
];

const TECH_DISCOVERY_PROSE: Array<[string, string]> = [
  ['current_incumbent_solutions', 'Current & Incumbent Solutions'],
  ['tier1_integrations',          'Priority (Tier 1) Integrations'],
  ['data_details_and_users',      'Data Details & Users'],
  ['ingestion_sources',           'Ingestion Sources'],
  ['planned_ingestion_sources',   'Planned Ingestion Sources'],
  ['data_cleansing_remediation',  'Data Cleansing & Remediation'],
  ['deployment_preference',       'Deployment Preference'],
  ['technical_constraints',       'Technical Constraints'],
  ['open_technical_requirements', 'Open Technical Requirements'],
];

/**
 * Gather every source the AI is allowed to cite for the given opportunity.
 * Results are ordered (SF fields first, then Tech Discovery prose, then
 * recent notes, then open tasks) so the prompt reads naturally.
 */
export async function buildCitationSources(oppId: number): Promise<CitationSource[]> {
  const sources: CitationSource[] = [];

  // 1. Opp SF fields — only include populated ones (empty fields aren't citable)
  const opp = await queryOne<Record<string, unknown>>(
    `SELECT ${FIELD_LABELS.map(([k]) => k).join(', ')}
     FROM opportunities WHERE id = $1`,
    [oppId]
  );
  if (opp) {
    for (const [key, label] of FIELD_LABELS) {
      const value = opp[key];
      if (typeof value === 'string' && value.trim()) {
        sources.push({
          key: `field-${key}`,
          kind: 'field',
          label: `Salesforce field · ${label}`,
          preview: value.trim().slice(0, 300),
          field_name: key,
        });
      }
    }
  }

  // 2. Tech Discovery prose fields
  const td = await queryOne<Record<string, string | null>>(
    `SELECT ${TECH_DISCOVERY_PROSE.map(([k]) => k).join(', ')}
     FROM opportunity_tech_discovery WHERE opportunity_id = $1`,
    [oppId]
  );
  if (td) {
    for (const [path, label] of TECH_DISCOVERY_PROSE) {
      const value = td[path];
      if (typeof value === 'string' && value.trim()) {
        sources.push({
          key: `td-${path}`,
          kind: 'tech_discovery',
          label: `Tech Discovery · ${label}`,
          preview: value.trim().slice(0, 300),
          tech_discovery_path: path,
        });
      }
    }
  }

  // 3. Recent notes (non-deleted), newest first
  const notes = await query<{ id: number; content: string; author_name: string; created_at: string }>(
    `SELECT n.id, n.content, u.name AS author_name, n.created_at
     FROM notes n JOIN users u ON u.id = n.author_id
     WHERE n.opportunity_id = $1 AND n.is_deleted = false
     ORDER BY n.created_at DESC
     LIMIT 20`,
    [oppId]
  );
  for (const n of notes) {
    const date = new Date(n.created_at).toISOString().slice(0, 10);
    sources.push({
      key: `note-${n.id}`,
      kind: 'note',
      label: `Note · ${n.author_name}`,
      meta: date,
      preview: n.content.trim().slice(0, 300),
      note_id: n.id,
    });
  }

  // 4. Open tasks (status != 'done', not deleted), most recently updated
  const tasks = await query<{ id: number; title: string; status: string }>(
    `SELECT id, title, status FROM tasks
     WHERE opportunity_id = $1 AND is_deleted = false AND status <> 'done'
     ORDER BY updated_at DESC LIMIT 10`,
    [oppId]
  );
  for (const t of tasks) {
    sources.push({
      key: `task-${t.id}`,
      kind: 'task',
      label: `Task (${t.status})`,
      preview: t.title,
      task_id: t.id,
    });
  }

  return sources;
}

// ── Prompt formatting ───────────────────────────────────────────────────────

/**
 * Render the source list as a `[N] Kind · Label — preview` block to paste
 * into a Claude prompt. IDs are 1-based and stable within this response.
 * Claude is told to cite by `[N]` inline and NEVER invent ids.
 */
export function formatSourcesForPrompt(sources: CitationSource[]): string {
  if (sources.length === 0) return '(no citable sources available on this opportunity)';
  return sources
    .map((s, i) => {
      const id = i + 1;
      const meta = s.meta ? ` (${s.meta})` : '';
      const preview = s.preview.replace(/\s+/g, ' ').slice(0, 200);
      return `  [${id}] ${s.label}${meta}: "${preview}"`;
    })
    .join('\n');
}

/**
 * Standard citation instructions. Inlined into AI prompts that opt into
 * provenance. Keep terse — tokens count.
 */
export const CITATION_INSTRUCTIONS = `
CITATIONS — every factual claim MUST be followed by [N] referencing an id from the sources list above (e.g., "The champion is Anna Fischer [3]."). Multiple ids are OK: [1][3]. Opinions, generic sales advice, and AI-generated suggestions don't need citations. NEVER invent an id. If no source backs a claim, rewrite to remove the claim.`.trim();

// ── Validation ──────────────────────────────────────────────────────────────

const MARKER_REGEX = /\[(\d+)\]/g;

/**
 * Extract all `[N]` marker ids referenced in a text blob.
 */
export function extractMarkers(text: string): Set<number> {
  const out = new Set<number>();
  const matches = text.matchAll(MARKER_REGEX);
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n)) out.add(n);
  }
  return out;
}

/**
 * Given the raw AI response text and the ordered source list, resolve each
 * `[N]` marker to a `ResolvedCitation`. Returns only the citations actually
 * referenced in the text, in ascending id order. Dangling markers (ids that
 * don't map to a known source) are reported separately so the client can
 * render the "unsupported claim" state.
 */
export function resolveCitations(
  text: string,
  sources: CitationSource[],
): { citations: ResolvedCitation[]; unsupportedMarkerIds: number[] } {
  const referenced = extractMarkers(text);
  const citations: ResolvedCitation[] = [];
  const unsupported: number[] = [];

  for (const markerId of Array.from(referenced).sort((a, b) => a - b)) {
    const source = sources[markerId - 1]; // markers are 1-based, array is 0-based
    if (!source) { unsupported.push(markerId); continue; }
    citations.push({
      id: markerId,
      kind: source.kind,
      label: source.label,
      meta: source.meta,
      preview: source.preview,
      note_id: source.note_id,
      task_id: source.task_id,
      field_name: source.field_name,
      tech_discovery_path: source.tech_discovery_path,
      kb_proof_point_id: source.kb_proof_point_id,
      history_field: source.history_field,
    });
  }

  return { citations, unsupportedMarkerIds: unsupported };
}

// ── Phase 3: Low-confidence detection (Issue #136) ─────────────────────────────
//
// Paragraphs of prose that carry zero `[N]` citation markers are suspicious —
// the model wrote a claim-sized block without anchoring it to any source. We
// flag those so the frontend can show a "may be ungrounded" warning on the
// specific spans, without hiding the content outright (dampen, don't delete —
// the user can still read and judge).
//
// What we DON'T flag:
//  • Short paragraphs (intros, transitions) under minChars.
//  • Paragraphs explicitly marked as recommendations/CTAs (they're the model's
//    opinion, not a factual claim — citations don't apply).
//  • Markdown headings (`##`, `#`).
//  • Empty or whitespace-only paragraphs.

export interface LowConfidenceSpan {
  /** Character offset into the original text where the span begins. */
  start: number;
  /** Character offset where the span ends (exclusive). */
  end: number;
  /** The flagged paragraph, lightly trimmed — ≤240 chars for display. */
  text: string;
  /** Short machine-readable reason (e.g. 'no-citations'). */
  reason: string;
}

export interface DetectLowConfidenceOpts {
  /** Paragraph must be at least this many chars to be considered a claim. Default 120. */
  minChars?: number;
  /** Case-insensitive prefixes that opt a paragraph out of citation requirement. */
  skipPrefixes?: string[];
}

const DEFAULT_SKIP_PREFIXES = [
  'recommended next action:',
  '**recommended next action:**',
  'recommendation:',
  '**recommendation:**',
  '## opportunities to revisit',
  '## top priorities for',
];

/**
 * Identify paragraphs in AI prose output that carry no `[N]` citation markers
 * and look substantial enough to be factual claims. The frontend renders these
 * with a muted warning so the reader knows to treat them with skepticism.
 */
export function detectLowConfidenceSpans(
  text: string,
  opts: DetectLowConfidenceOpts = {},
): LowConfidenceSpan[] {
  const minChars = opts.minChars ?? 120;
  const skipPrefixes = (opts.skipPrefixes ?? DEFAULT_SKIP_PREFIXES).map(p => p.toLowerCase());

  const spans: LowConfidenceSpan[] = [];
  // Split on blank lines but track offsets so UI can highlight the exact range.
  const paragraphRegex = /(?:^|\n\n+)([^\n][\s\S]*?)(?=\n\n|$)/g;
  for (const match of text.matchAll(paragraphRegex)) {
    const body = match[1].trim();
    if (body.length < minChars) continue;
    if (body.startsWith('#')) continue;
    const lowerBody = body.toLowerCase();
    if (skipPrefixes.some(p => lowerBody.startsWith(p))) continue;
    if (MARKER_REGEX.test(body)) { MARKER_REGEX.lastIndex = 0; continue; }
    MARKER_REGEX.lastIndex = 0; // reset between calls (regex is /g)

    const bodyIndex = text.indexOf(body, match.index);
    if (bodyIndex < 0) continue;
    spans.push({
      start: bodyIndex,
      end: bodyIndex + body.length,
      text: body.length > 240 ? body.slice(0, 237) + '…' : body,
      reason: 'no-citations',
    });
  }
  return spans;
}
