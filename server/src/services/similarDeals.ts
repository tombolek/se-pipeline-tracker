import { query, queryOne } from '../db/index.js';

// ── Types ───────────────────────────────────────────────────────────────────

interface DealRow {
  id: number;
  sf_opportunity_id: string;
  name: string;
  account_name: string | null;
  account_industry: string | null;
  account_segment: string | null;
  stage: string;
  record_type: string | null;
  arr_converted: string | null; // NUMERIC comes back as string from pg
  products: string[];
  deploy_mode: string | null;
  engaged_competitors: string | null;
  technical_blockers: string | null;
  se_comments: string | null;
  next_step_sf: string | null;
  need: string | null;
  metrics: string | null;
  decision_criteria: string | null;
  paper_process: string | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  closed_at: string | null;
  stage_date_closed_won: string | null;
  stage_date_closed_lost: string | null;
  close_date: string | null;
  se_owner_name: string | null;
}

interface TechDiscoveryLite {
  opportunity_id: number;
  tech_stack: Record<string, unknown>;
  initiatives: Record<string, unknown>;
  existing_dmg: Record<string, unknown>;
}

interface KbRow {
  id: number;
  customer_name: string;
  about: string | null;
  vertical: string;
  sub_vertical: string | null;
  products: string[];
  initiatives: string[];
  proof_point_text: string;
  source_file: string | null;
}

export type Outcome = 'won' | 'lost' | 'in_flight' | 'kb_reference';

export interface SimilarDealResult {
  id: number;
  ref_type: 'opportunity' | 'kb';
  sf_opportunity_id: string | null;
  name: string;
  account_name: string | null;
  outcome: Outcome;
  stage: string | null;          // populated for in_flight
  closed_date: string | null;
  arr: number | null;
  se_owner_name: string | null;
  account_industry: string | null;
  score: number;
  match_chips: MatchChip[];
  why_text: string | null;
  snippets: { source: string; text: string }[];
}

export interface MatchChip {
  label: string;
  kind: 'match' | 'competitor' | 'warn' | 'product';
}

export interface SimilarDealsResponse {
  active: {
    account_industry: string | null;
    account_segment: string | null;
    arr_band: string | null;
    deploy_mode: string | null;
    record_type: string | null;
    products: string[];
    engaged_competitors: string[];
  };
  results: SimilarDealResult[];
  total_candidates: number;
  total_above_threshold: number;
  counts_by_outcome: { won: number; lost: number; in_flight: number; kb_reference: number };
  playbook: PlaybookSummary;
}

export interface PlaybookSummary {
  total_won: number;
  total_lost: number;
  against_competitor: string | null;
  against_competitor_won: number;
  against_competitor_lost: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const LOOKBACK_MONTHS = 18;
const MAX_RESULTS = 8;
const MIN_SCORE = 40;
const MAX_PER_QUERY = 200;

// Known tech-stack category keys that match on overlap. Kept in sync with the
// frontend checklist groups. Enterprise systems and existing DMG tools use a
// different shape (specify-value) — scored separately.
const TECH_STACK_CATEGORIES = [
  'data_infrastructure',
  'data_lake',
  'data_lake_metastore',
  'data_warehouse',
  'database',
  'datalake_processing',
  'etl',
  'business_intelligence',
  'nosql',
  'streaming',
];

// In-flight stages we count as "playbook is ripe enough to mine"
const IN_FLIGHT_STAGES = ['Negotiate', 'Proposal Sent', 'Submitted for Booking'];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'has',
  'have', 'had', 'will', 'would', 'should', 'can', 'could', 'we', 'our', 'us',
  'i', 'my', 'me', 'you', 'your',
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function arrBand(arr: number | null): string | null {
  if (arr == null) return null;
  if (arr < 50_000) return '<50k';
  if (arr < 150_000) return '50-150k';
  if (arr < 350_000) return '150-350k';
  return '350k+';
}

function arrBandIndex(band: string | null): number {
  const order = ['<50k', '50-150k', '150-350k', '350k+'];
  return band ? order.indexOf(band) : -1;
}

function normalizeIndustry(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.startsWith('financial')) return 'financial services';
  if (s === 'finance') return 'financial services';
  if (s.startsWith('life science')) return 'life sciences';
  if (s === 'pharma' || s === 'pharmaceutical' || s === 'pharmaceuticals') return 'life sciences';
  return s;
}

// Map a KB vertical label (e.g. "Finance — Banking & Credit Unions") to the
// normalized industry name we use for opportunity records.
function kbVerticalToIndustry(vertical: string): string {
  const v = vertical.toLowerCase();
  if (v.startsWith('finance')) return 'financial services';
  if (v.startsWith('insurance')) return 'insurance';
  if (v.includes('pharma') || v.includes('life sciences')) return 'life sciences';
  if (v.startsWith('manufacturing')) return 'manufacturing';
  if (v.includes('healthcare')) return 'healthcare';
  if (v.includes('technology') || v.includes('energy') || v.includes('retail') || v.includes('public')) {
    return 'technology';
  }
  return v;
}

function parseCompetitors(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(/[,;|]/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

function tokenize(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function bestClosedDate(row: DealRow): string | null {
  if (row.is_closed_won && row.stage_date_closed_won) return row.stage_date_closed_won;
  if (row.is_closed_lost && row.stage_date_closed_lost) return row.stage_date_closed_lost;
  if (row.closed_at) return row.closed_at.slice(0, 10);
  return row.close_date;
}

function arrNumber(row: DealRow): number | null {
  if (row.arr_converted == null) return null;
  const n = parseFloat(row.arr_converted);
  return Number.isFinite(n) ? n : null;
}

function dealOutcome(row: DealRow): Outcome {
  if (row.is_closed_won) return 'won';
  if (row.is_closed_lost) return 'lost';
  return 'in_flight';
}

// ── Scoring ─────────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  total: number;
  chips: MatchChip[];
}

/**
 * Tech-stack Jaccard across all categories. Same-vendor same-category
 * overlap is a strong signal ("this deal uses Snowflake + dbt, so does that
 * one"). Initiatives overlap catches strategic alignment (both are Cloud
 * Migration + Data Mesh).
 *
 * Max contribution: 15 points (10 stack + 5 initiatives), pushed on top of
 * the base 100 and clamped at 100 by the caller — keeps v1 simple at the
 * cost of losing some resolution at the high end.
 */
function scoreTechDiscoveryPair(
  active: TechDiscoveryLite | undefined,
  historical: TechDiscoveryLite | undefined,
): ScoreBreakdown {
  let total = 0;
  const chips: MatchChip[] = [];
  if (!active || !historical) return { total, chips };

  const aStack = active.tech_stack ?? {};
  const hStack = historical.tech_stack ?? {};

  // Aggregate overlap across all categories, not per-category (we don't want
  // to quadruple-count a deal that shares four tools in four categories).
  const aItems = new Set<string>();
  const hItems = new Set<string>();
  const perCategoryOverlaps: Array<{ category: string; items: string[] }> = [];
  for (const cat of TECH_STACK_CATEGORIES) {
    const a = Array.isArray((aStack as Record<string, unknown>)[cat]) ? ((aStack as Record<string, string[]>)[cat] ?? []) : [];
    const h = Array.isArray((hStack as Record<string, unknown>)[cat]) ? ((hStack as Record<string, string[]>)[cat] ?? []) : [];
    a.forEach(x => aItems.add(`${cat}:${x.toLowerCase()}`));
    h.forEach(x => hItems.add(`${cat}:${x.toLowerCase()}`));
    const catOverlap = a.filter(x => h.map(y => y.toLowerCase()).includes(x.toLowerCase()));
    if (catOverlap.length > 0) perCategoryOverlaps.push({ category: cat, items: catOverlap });
  }
  const stackJacc = jaccard(aItems, hItems);
  total += Math.round(stackJacc * 10);
  if (perCategoryOverlaps.length > 0) {
    // Pick the most informative category for the chip label — prefer
    // data_warehouse > etl > database; fall back to the first one.
    const priority = ['data_warehouse', 'etl', 'database', 'data_infrastructure'];
    const picked = priority.map(p => perCategoryOverlaps.find(o => o.category === p)).find(x => x)
                   ?? perCategoryOverlaps[0];
    if (picked) {
      chips.push({ label: `Same stack: ${picked.items.join('+')}`, kind: 'product' });
    }
  }

  // Initiatives overlap — only boolean true flags count.
  const aInit = active.initiatives ?? {};
  const hInit = historical.initiatives ?? {};
  const aFlags = new Set(Object.keys(aInit).filter(k => (aInit as Record<string, unknown>)[k] === true));
  const hFlags = new Set(Object.keys(hInit).filter(k => (hInit as Record<string, unknown>)[k] === true));
  const initJacc = jaccard(aFlags, hFlags);
  total += Math.round(initJacc * 5);

  return { total, chips };
}

function scoreDealPair(active: DealRow, historical: DealRow): ScoreBreakdown {
  let total = 0;
  const chips: MatchChip[] = [];

  // Industry (20)
  const aInd = normalizeIndustry(active.account_industry);
  const hInd = normalizeIndustry(historical.account_industry);
  if (aInd && hInd && aInd === hInd) {
    total += 20;
    chips.push({ label: 'Industry ✓', kind: 'match' });
  } else if (aInd && hInd) {
    chips.push({ label: 'Adjacent industry', kind: 'warn' });
  }

  // Segment (10)
  if (active.account_segment && historical.account_segment &&
      active.account_segment === historical.account_segment) {
    total += 10;
    chips.push({ label: 'Segment ✓', kind: 'match' });
  }

  // ARR band (10 / 5)
  const aArr = arrNumber(active);
  const hArr = arrNumber(historical);
  const aBand = arrBand(aArr);
  const hBand = arrBand(hArr);
  if (aBand && hBand && aBand === hBand) {
    total += 10;
    chips.push({ label: 'ARR band ✓', kind: 'match' });
  } else if (aBand && hBand) {
    const diff = Math.abs(arrBandIndex(aBand) - arrBandIndex(hBand));
    if (diff === 1) total += 5;
  }

  // Products (15)
  const aProducts = new Set(active.products ?? []);
  const hProducts = new Set(historical.products ?? []);
  const productJacc = jaccard(aProducts, hProducts);
  total += Math.round(productJacc * 15);
  if (productJacc > 0) {
    const overlap = [...aProducts].filter(p => hProducts.has(p));
    chips.push({ label: `Products: ${overlap.join('+')}`, kind: 'product' });
  }

  // Deploy mode (5)
  if (active.deploy_mode && historical.deploy_mode &&
      active.deploy_mode === historical.deploy_mode) {
    total += 5;
  }

  // Record type (5)
  if (active.record_type && historical.record_type &&
      active.record_type === historical.record_type) {
    total += 5;
  }

  // Competitors (10)
  const aComp = new Set(parseCompetitors(active.engaged_competitors));
  const hComp = new Set(parseCompetitors(historical.engaged_competitors));
  const sharedComp = [...aComp].filter(c => hComp.has(c));
  if (sharedComp.length > 0) {
    total += 10;
    const raw = (historical.engaged_competitors ?? '').split(/[,;|]/).map(s => s.trim()).find(
      s => s.toLowerCase() === sharedComp[0]
    );
    const displayName = raw ?? sharedComp[0];
    chips.push({ label: `Same competitor: ${displayName}`, kind: 'competitor' });
  }

  // Use-case text (15)
  const aUseCase = tokenize(
    [active.need, active.technical_blockers, active.se_comments].filter(Boolean).join(' ')
  );
  const hUseCase = tokenize(
    [historical.need, historical.technical_blockers, historical.se_comments].filter(Boolean).join(' ')
  );
  total += Math.round(jaccard(aUseCase, hUseCase) * 15);

  // MEDDPICC shape (10)
  const aMedd = tokenize(
    [active.metrics, active.decision_criteria, active.paper_process].filter(Boolean).join(' ')
  );
  const hMedd = tokenize(
    [historical.metrics, historical.decision_criteria, historical.paper_process].filter(Boolean).join(' ')
  );
  total += Math.round(jaccard(aMedd, hMedd) * 10);

  return { total: Math.min(total, 100), chips };
}

function scoreKbPair(active: DealRow, kb: KbRow): ScoreBreakdown {
  // KB rows don't have segment, ARR, deploy mode, record type, competitor, or
  // MEDDPICC — so we allocate extra weight to the fields they do have.
  // Max = 100: industry 25, products 35, use-case text 30, initiatives 10.
  let total = 0;
  const chips: MatchChip[] = [];

  const aInd = normalizeIndustry(active.account_industry);
  const kInd = kbVerticalToIndustry(kb.vertical);
  if (aInd && aInd === kInd) {
    total += 25;
    chips.push({ label: 'Industry ✓', kind: 'match' });
  }

  const aProducts = new Set(active.products ?? []);
  const kProducts = new Set(kb.products ?? []);
  const productJacc = jaccard(aProducts, kProducts);
  total += Math.round(productJacc * 35);
  if (productJacc > 0) {
    const overlap = [...aProducts].filter(p => kProducts.has(p));
    chips.push({ label: `Products: ${overlap.join('+')}`, kind: 'product' });
  }

  const aText = tokenize(
    [active.need, active.technical_blockers, active.se_comments, active.metrics].filter(Boolean).join(' ')
  );
  const kText = tokenize([kb.about, kb.proof_point_text].filter(Boolean).join(' '));
  total += Math.round(jaccard(aText, kText) * 30);

  const aInitiatives = tokenize(
    [active.need, active.metrics, active.decision_criteria].filter(Boolean).join(' ')
  );
  const kInitiatives = new Set(kb.initiatives.map(i => i.toLowerCase()));
  // Check if any active-deal word appears inside any KB initiative token set.
  let initiativeHit = false;
  for (const init of kInitiatives) {
    for (const word of tokenize(init)) {
      if (aInitiatives.has(word)) { initiativeHit = true; break; }
    }
    if (initiativeHit) break;
  }
  if (initiativeHit) total += 10;

  return { total: Math.min(total, 100), chips };
}

// ── "Why" text extraction ───────────────────────────────────────────────────

function buildWhyForDeal(row: DealRow): { why: string | null; snippets: { source: string; text: string }[] } {
  const snippets: { source: string; text: string }[] = [];
  if (row.technical_blockers) snippets.push({ source: 'Technical Blockers', text: row.technical_blockers.slice(0, 300) });
  if (row.se_comments) snippets.push({ source: 'SE Comments', text: row.se_comments.slice(0, 300) });
  if (snippets.length === 0 && row.need) snippets.push({ source: 'Need', text: row.need.slice(0, 300) });

  let why: string | null = null;
  const outcome = dealOutcome(row);
  if (outcome === 'won' && row.technical_blockers) why = row.technical_blockers.slice(0, 240);
  else if (outcome === 'lost' && row.se_comments) why = row.se_comments.slice(0, 240);
  else if (outcome === 'in_flight' && (row.se_comments || row.next_step_sf)) {
    why = (row.se_comments ?? row.next_step_sf ?? '').slice(0, 240);
  }
  else if (row.se_comments) why = row.se_comments.slice(0, 240);
  else if (row.technical_blockers) why = row.technical_blockers.slice(0, 240);
  else if (row.need) why = row.need.slice(0, 240);

  return { why, snippets };
}

function buildWhyForKb(kb: KbRow): { why: string | null; snippets: { source: string; text: string }[] } {
  // Trim at a sentence boundary if possible — KB proof points are long.
  const text = kb.proof_point_text.trim();
  const firstTwoSentences = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  const why = firstTwoSentences.length > 30 ? firstTwoSentences.slice(0, 320) : text.slice(0, 320);
  return {
    why,
    snippets: [{ source: 'Proof Point', text: text.slice(0, 400) }],
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function findSimilarDeals(oppId: number): Promise<SimilarDealsResponse | null> {
  const dealColumns = `
    o.id, o.sf_opportunity_id, o.name, o.account_name, o.account_industry, o.account_segment,
    o.stage, o.record_type, o.arr_converted::text AS arr_converted, o.products, o.deploy_mode,
    o.engaged_competitors, o.technical_blockers, o.se_comments, o.next_step_sf, o.need,
    o.metrics, o.decision_criteria, o.paper_process,
    o.is_closed_won, o.is_closed_lost, o.closed_at,
    o.stage_date_closed_won, o.stage_date_closed_lost, o.close_date,
    u.name AS se_owner_name
  `;

  const active = await queryOne<DealRow>(
    `SELECT ${dealColumns}
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.id = $1 AND o.is_active = true`,
    [oppId]
  );
  if (!active) return null;

  // Historical corpus: closed-won + closed-lost in the lookback window.
  const closedCorpus = await query<DealRow>(
    `SELECT ${dealColumns}
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.id <> $1
       AND o.is_active = true
       AND (o.is_closed_won = true OR o.is_closed_lost = true)
       AND COALESCE(o.stage_date_closed_won, o.stage_date_closed_lost, o.closed_at::date, o.close_date)
           > (CURRENT_DATE - ($2 || ' months')::interval)
     ORDER BY COALESCE(o.stage_date_closed_won, o.stage_date_closed_lost, o.closed_at::date, o.close_date) DESC
     LIMIT ${MAX_PER_QUERY}`,
    [oppId, String(LOOKBACK_MONTHS)]
  );

  // In-flight corpus: open deals in advanced stages (MEDDPICC likely filled in).
  const inFlightCorpus = await query<DealRow>(
    `SELECT ${dealColumns}
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.id <> $1
       AND o.is_active = true
       AND o.is_closed_won = false
       AND o.is_closed_lost = false
       AND o.stage = ANY($2::text[])
     ORDER BY o.updated_at DESC
     LIMIT ${MAX_PER_QUERY}`,
    [oppId, IN_FLIGHT_STAGES]
  );

  // KB proof points — optional fallback tier, not bounded by date.
  const kbCorpus = await query<KbRow>(
    `SELECT id, customer_name, about, vertical, sub_vertical, products, initiatives,
            proof_point_text, source_file
     FROM kb_proof_points
     LIMIT ${MAX_PER_QUERY}`,
    []
  );

  // Fetch Tech Discovery rows for the active opp + every candidate in one
  // query so tech-stack overlap scoring is cheap. Candidates without a row
  // in this table simply contribute 0 — the feature is forward-compatible
  // with the existing corpus that has never filled it out.
  const allCandidateIds = [oppId, ...closedCorpus.map(c => c.id), ...inFlightCorpus.map(c => c.id)];
  const techDiscoveryRows = await query<TechDiscoveryLite>(
    `SELECT opportunity_id, tech_stack, initiatives, existing_dmg
     FROM opportunity_tech_discovery
     WHERE opportunity_id = ANY($1::int[])`,
    [allCandidateIds]
  );
  const techDiscoveryById = new Map(techDiscoveryRows.map(r => [r.opportunity_id, r]));
  const activeTechDiscovery = techDiscoveryById.get(oppId);

  // Score each corpus and merge.
  const scoredDeals: SimilarDealResult[] = [];
  for (const h of [...closedCorpus, ...inFlightCorpus]) {
    const { total: baseTotal, chips } = scoreDealPair(active, h);
    const { total: techTotal, chips: techChips } = scoreTechDiscoveryPair(
      activeTechDiscovery,
      techDiscoveryById.get(h.id)
    );
    const total = Math.min(baseTotal + techTotal, 100);
    const allChips = [...chips, ...techChips];
    const { why, snippets } = buildWhyForDeal(h);
    const outcome = dealOutcome(h);
    scoredDeals.push({
      id: h.id,
      ref_type: 'opportunity',
      sf_opportunity_id: h.sf_opportunity_id,
      name: h.name,
      account_name: h.account_name,
      outcome,
      stage: outcome === 'in_flight' ? h.stage : null,
      closed_date: outcome === 'in_flight' ? null : bestClosedDate(h),
      arr: arrNumber(h),
      se_owner_name: h.se_owner_name,
      account_industry: h.account_industry,
      score: total,
      match_chips: allChips,
      why_text: why,
      snippets,
    });
  }

  const scoredKb: SimilarDealResult[] = kbCorpus.map(k => {
    const { total, chips } = scoreKbPair(active, k);
    const { why, snippets } = buildWhyForKb(k);
    return {
      id: k.id,
      ref_type: 'kb',
      sf_opportunity_id: null,
      name: k.customer_name,
      account_name: k.customer_name,
      outcome: 'kb_reference',
      stage: null,
      closed_date: null,
      arr: null,
      se_owner_name: null,
      account_industry: kbVerticalToIndustry(k.vertical),
      score: total,
      match_chips: chips,
      why_text: why,
      snippets,
    };
  });

  const allScored = [...scoredDeals, ...scoredKb];
  const aboveThreshold = allScored.filter(r => r.score >= MIN_SCORE);
  aboveThreshold.sort((a, b) => b.score - a.score);

  // Playbook summary — only counts actual closed deals (not in-flight or KB).
  const activeCompetitors = parseCompetitors(active.engaged_competitors);
  const primaryCompetitor = activeCompetitors[0] ?? null;
  const primaryCompetitorDisplay = primaryCompetitor
    ? (active.engaged_competitors ?? '').split(/[,;|]/).map(s => s.trim()).find(
        s => s.toLowerCase() === primaryCompetitor
      ) ?? primaryCompetitor
    : null;

  let againstWon = 0, againstLost = 0;
  if (primaryCompetitor) {
    for (const h of closedCorpus) {
      const rowComp = new Set(parseCompetitors(h.engaged_competitors));
      if (rowComp.has(primaryCompetitor)) {
        if (h.is_closed_won) againstWon++;
        else if (h.is_closed_lost) againstLost++;
      }
    }
  }

  const counts = {
    won:          aboveThreshold.filter(r => r.outcome === 'won').length,
    lost:         aboveThreshold.filter(r => r.outcome === 'lost').length,
    in_flight:    aboveThreshold.filter(r => r.outcome === 'in_flight').length,
    kb_reference: aboveThreshold.filter(r => r.outcome === 'kb_reference').length,
  };

  return {
    active: {
      account_industry: active.account_industry,
      account_segment: active.account_segment,
      arr_band: arrBand(arrNumber(active)),
      deploy_mode: active.deploy_mode,
      record_type: active.record_type,
      products: active.products ?? [],
      engaged_competitors: parseCompetitors(active.engaged_competitors),
    },
    results: aboveThreshold.slice(0, MAX_RESULTS),
    total_candidates: closedCorpus.length + inFlightCorpus.length + kbCorpus.length,
    total_above_threshold: aboveThreshold.length,
    counts_by_outcome: counts,
    playbook: {
      total_won: closedCorpus.filter(r => r.is_closed_won).length,
      total_lost: closedCorpus.filter(r => r.is_closed_lost).length,
      against_competitor: primaryCompetitorDisplay,
      against_competitor_won: againstWon,
      against_competitor_lost: againstLost,
    },
  };
}
