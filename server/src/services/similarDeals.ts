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

export interface SimilarDealResult {
  id: number;
  sf_opportunity_id: string;
  name: string;
  account_name: string | null;
  outcome: 'won' | 'lost';
  closed_date: string | null; // YYYY-MM-DD, best available
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
const MAX_RESULTS = 5;
const MIN_SCORE = 40;
const MAX_PER_QUERY = 200; // cap corpus load to keep scoring cheap

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
  // Light normalization for the common SF free-text drift we see.
  if (s.startsWith('financial')) return 'financial services';
  if (s === 'finance') return 'financial services';
  if (s.startsWith('life science')) return 'life sciences';
  if (s === 'pharma' || s === 'pharmaceutical' || s === 'pharmaceuticals') return 'life sciences';
  return s;
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
  // Prefer SF-reported close date, fall back to detected-close timestamp.
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

// ── Scoring ─────────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  total: number;
  chips: MatchChip[];
}

function scorePair(active: DealRow, historical: DealRow): ScoreBreakdown {
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

  // Segment (10) — exact only; "one tier" is a fuzzy concept we can refine later
  if (active.account_segment && historical.account_segment &&
      active.account_segment === historical.account_segment) {
    total += 10;
    chips.push({ label: 'Segment ✓', kind: 'match' });
  }

  // ARR band (10) — adjacent gives 5
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

  // Products (15) — Jaccard × 15
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

  // Competitors (10) — any overlap
  const aComp = new Set(parseCompetitors(active.engaged_competitors));
  const hComp = new Set(parseCompetitors(historical.engaged_competitors));
  const sharedComp = [...aComp].filter(c => hComp.has(c));
  if (sharedComp.length > 0) {
    total += 10;
    // Use the original-case name from the historical deal if we can find it.
    const raw = (historical.engaged_competitors ?? '').split(/[,;|]/).map(s => s.trim()).find(
      s => s.toLowerCase() === sharedComp[0]
    );
    const displayName = raw ?? sharedComp[0];
    chips.push({ label: `Same competitor: ${displayName}`, kind: 'competitor' });
  }

  // Use-case text (15) — Jaccard on need + technical_blockers + se_comments
  const aUseCase = tokenize(
    [active.need, active.technical_blockers, active.se_comments].filter(Boolean).join(' ')
  );
  const hUseCase = tokenize(
    [historical.need, historical.technical_blockers, historical.se_comments].filter(Boolean).join(' ')
  );
  const useCaseJacc = jaccard(aUseCase, hUseCase);
  total += Math.round(useCaseJacc * 15);

  // MEDDPICC shape (10) — Jaccard on metrics + decision_criteria + paper_process
  const aMedd = tokenize(
    [active.metrics, active.decision_criteria, active.paper_process].filter(Boolean).join(' ')
  );
  const hMedd = tokenize(
    [historical.metrics, historical.decision_criteria, historical.paper_process].filter(Boolean).join(' ')
  );
  const meddJacc = jaccard(aMedd, hMedd);
  total += Math.round(meddJacc * 10);

  return { total: Math.min(total, 100), chips };
}

// ── "Why" text extraction ───────────────────────────────────────────────────

function buildWhyText(row: DealRow): { why: string | null; snippets: { source: string; text: string }[] } {
  const snippets: { source: string; text: string }[] = [];
  if (row.technical_blockers) {
    snippets.push({ source: 'Technical Blockers', text: row.technical_blockers.slice(0, 300) });
  }
  if (row.se_comments) {
    snippets.push({ source: 'SE Comments', text: row.se_comments.slice(0, 300) });
  }
  if (snippets.length === 0 && row.need) {
    snippets.push({ source: 'Need', text: row.need.slice(0, 300) });
  }

  // Rule-of-thumb first line: for won deals, surface technical_blockers as the
  // headline (what they were worried about that we overcame). For lost deals,
  // surface SE comments (usually the post-mortem).
  let why: string | null = null;
  if (row.is_closed_won && row.technical_blockers) why = row.technical_blockers.slice(0, 240);
  else if (row.is_closed_lost && row.se_comments) why = row.se_comments.slice(0, 240);
  else if (row.se_comments) why = row.se_comments.slice(0, 240);
  else if (row.technical_blockers) why = row.technical_blockers.slice(0, 240);
  else if (row.need) why = row.need.slice(0, 240);

  return { why, snippets };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function findSimilarDeals(oppId: number): Promise<SimilarDealsResponse | null> {
  const columns = `
    o.id, o.sf_opportunity_id, o.name, o.account_name, o.account_industry, o.account_segment,
    o.stage, o.record_type, o.arr_converted::text AS arr_converted, o.products, o.deploy_mode,
    o.engaged_competitors, o.technical_blockers, o.se_comments, o.need,
    o.metrics, o.decision_criteria, o.paper_process,
    o.is_closed_won, o.is_closed_lost, o.closed_at,
    o.stage_date_closed_won, o.stage_date_closed_lost, o.close_date,
    u.name AS se_owner_name
  `;

  const active = await queryOne<DealRow>(
    `SELECT ${columns}
     FROM opportunities o
     LEFT JOIN users u ON u.id = o.se_owner_id
     WHERE o.id = $1 AND o.is_active = true`,
    [oppId]
  );
  if (!active) return null;

  const corpus = await query<DealRow>(
    `SELECT ${columns}
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

  const scored = corpus.map(h => {
    const { total, chips } = scorePair(active, h);
    const { why, snippets } = buildWhyText(h);
    return {
      id: h.id,
      sf_opportunity_id: h.sf_opportunity_id,
      name: h.name,
      account_name: h.account_name,
      outcome: (h.is_closed_won ? 'won' : 'lost') as 'won' | 'lost',
      closed_date: bestClosedDate(h),
      arr: arrNumber(h),
      se_owner_name: h.se_owner_name,
      account_industry: h.account_industry,
      score: total,
      match_chips: chips,
      why_text: why,
      snippets,
    };
  });

  const aboveThreshold = scored.filter(r => r.score >= MIN_SCORE);
  aboveThreshold.sort((a, b) => b.score - a.score);

  // Playbook summary: counts vs. first listed competitor
  const activeCompetitors = parseCompetitors(active.engaged_competitors);
  const primaryCompetitor = activeCompetitors[0] ?? null;
  const primaryCompetitorDisplay = primaryCompetitor
    ? (active.engaged_competitors ?? '').split(/[,;|]/).map(s => s.trim()).find(
        s => s.toLowerCase() === primaryCompetitor
      ) ?? primaryCompetitor
    : null;

  let againstWon = 0, againstLost = 0;
  if (primaryCompetitor) {
    for (const r of scored) {
      const rowComp = new Set(
        (corpus.find(c => c.id === r.id)?.engaged_competitors ?? '')
          .split(/[,;|]/).map(s => s.trim().toLowerCase()).filter(Boolean)
      );
      if (rowComp.has(primaryCompetitor)) {
        if (r.outcome === 'won') againstWon++;
        else againstLost++;
      }
    }
  }

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
    total_candidates: corpus.length,
    total_above_threshold: aboveThreshold.length,
    playbook: {
      total_won: scored.filter(r => r.outcome === 'won').length,
      total_lost: scored.filter(r => r.outcome === 'lost').length,
      against_competitor: primaryCompetitorDisplay,
      against_competitor_won: againstWon,
      against_competitor_lost: againstLost,
    },
  };
}
