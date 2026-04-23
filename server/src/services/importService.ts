import * as cheerio from 'cheerio';
import * as XLSX from 'xlsx';
import { query, queryOne } from '../db/index.js';
import { parseSeCommentDate } from '../utils/parseSeCommentDate.js';
import { deriveProducts, needsProductTaggingTask } from '../utils/deriveProducts.js';

// ── Column mapping: SF export header → DB field ────────────────────────────
// Keys are normalized (trimmed + lowercased). null = store in sf_raw_fields only.
const COLUMN_MAP: Record<string, string | null> = {
  'opportunity id':                     'sf_opportunity_id',
  'account id':                         'account_id',
  'account name':                       'account_name',
  'account segment':                    'account_segment',
  'account industry':                   'account_industry',
  'target account':                     'key_deal',
  'opportunity name':                   'name',
  'close date':                         'close_date',
  'close month':                        'close_month',
  'fiscal period':                      'fiscal_period',
  'fiscal year':                        'fiscal_year',
  'annualized arr currency':            'arr_currency',
  'annualized arr':                     'arr',
  'annualized arr (converted) currency':null,
  'annualized arr (converted)':         'arr_converted',
  'opportunity owner':                  'ae_owner_name',
  'opportunity record type':            'record_type',
  'team':                               'team',
  'deploymode':                         'deploy_mode',
  'deployloc':                          'deploy_location',
  'stage':                              'stage',
  'key deal':                           'key_deal',
  'potential pull forward':             null,
  'sales plays':                        'sales_plays',
  'lead source':                        'lead_source',
  'opportunity source':                 'opportunity_source',
  'channel source (grouped)':           'channel_source',
  'bizdev':                             'biz_dev',
  'next step':                          'next_step_sf',
  'manager comments':                   'manager_comments',
  'sales engineering comments':         'se_comments',
  'psm comments':                       'psm_comments',
  'budget':                             'budget',
  'authority':                          'authority',
  'need':                               'need',
  'timeline':                           'timeline',
  'metrics':                            'metrics',
  'economic buyer':                     'economic_buyer',
  'decision criteria':                  'decision_criteria',
  'decision process':                   'decision_process',
  'paper process':                      'paper_process',
  'implicate the pain':                 'implicate_pain',
  'champion':                           'champion',
  'engaged competitors':                'engaged_competitors',
  'agentic qualification':              'agentic_qual',
  'sourcing partner':                   'sourcing_partner',
  'sourcing partner - internal tier':   'sourcing_partner_tier',
  'influencing partner':                'influencing_partner',
  'partner manager':                    'partner_manager',
  'poc status':                         'poc_status',
  'poc estimated start date':           'poc_start_date',
  'poc estimated end date':             'poc_end_date',
  'poc type':                           'poc_type',
  'poc deployment type':                'poc_deploy_type',
  'rfx status':                         'rfx_status',
  'rfx recieved':                       'rfx_received_date',
  'rfx response deadline':              'rfx_submission_date',
  'technical blockers/risk':            'technical_blockers',
  // 'forecast category' is intentionally NOT mapped — we only use Forecast Status.
  'forecast status':                    'forecast_status',
  'stage date: qualify':                'stage_date_qualify',
  'stage date: build value':            'stage_date_build_value',
  'stage date: develop solution':       'stage_date_develop_solution',
  'stage date: proposal sent':          'stage_date_proposal_sent',
  'stage date: negotiate':              'stage_date_negotiate',
  'stage date: submitted for booking':  'stage_date_submitted_for_booking',
  'stage date: closed - won':           'stage_date_closed_won',
  'stage date: closed - lost':          'stage_date_closed_lost',
  'lost reason':                        'lost_reason',
  'lost sub reason':                    'lost_sub_reason',
  'lost reason (comments)':             'lost_reason_comments',
  '(lost to) competitor':               'lost_to_competitor',
};

// DB fields that are booleans in the opportunities table
const BOOLEAN_FIELDS = new Set(['key_deal']);

/**
 * Normalize a SF-exported date string to ISO `YYYY-MM-DD`.
 *
 * SF exports dates as `M/D/YY` or `M/D/YYYY` (e.g. `11/20/26`). Postgres
 * happily ingests these for DATE columns, but on readback we get
 * `YYYY-MM-DD`. Without normalization, the field-history change detector
 * sees `"11/20/26" !== "2026-11-20"` and records a phantom change on every
 * import even when the underlying value is identical. Normalising both sides
 * to ISO eliminates that.
 *
 * Returns null for empty/unparseable input.
 */
function normalizeDateToIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Already ISO YYYY-MM-DD or YYYY-MM-DDT...
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // M/D/YY or M/D/YYYY (SF's default export format)
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (usMatch) {
    const m = usMatch[1].padStart(2, '0');
    const d = usMatch[2].padStart(2, '0');
    let y = usMatch[3];
    if (y.length === 2) y = (parseInt(y, 10) >= 70 ? '19' : '20') + y;
    return `${y}-${m}-${d}`;
  }

  // Last-resort: let Date parse it and reformat.
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

// DB fields that are DATE type
const DATE_FIELDS = new Set([
  'close_date', 'close_month', 'poc_start_date', 'poc_end_date',
  'rfx_received_date', 'rfx_submission_date',
  'stage_date_qualify', 'stage_date_build_value', 'stage_date_develop_solution',
  'stage_date_proposal_sent', 'stage_date_negotiate', 'stage_date_submitted_for_booking',
  'stage_date_closed_won', 'stage_date_closed_lost',
]);

// DB fields that are NUMERIC type
const NUMERIC_FIELDS = new Set(['arr', 'arr_converted']);

// SF-owned fields that the import is allowed to update (never touches app-managed fields)
const SF_OWNED_FIELDS = new Set(Object.values(COLUMN_MAP).filter(Boolean) as string[]);

export interface ParsedRow {
  dbFields: Record<string, unknown>;
  rawFields: Record<string, string>;
}

export interface ImportStats {
  rowCount: number;
  added: number;
  updated: number;
  closedLost: number;     // deals transitioning to Closed Lost in this import
  closedWon: number;      // deals transitioning to Closed Won in this import
  stale: number;          // previously-active deals missing from the feed (deleted/merged in SF)
  errors: string[];
}

// Stages that mean the opportunity is closed (SF now exports these directly).
const CLOSED_LOST_STAGE = 'Closed Lost';
const CLOSED_WON_STAGE  = 'Closed Won';

/** Returns the authoritative closed-at date for a row, derived from SF
 *  stage dates with a close_date fallback. Returns null if no date available.
 *  Input values are date strings as they came from the SF export (ISO or
 *  m/d/yyyy — Postgres accepts both via implicit cast when we feed it back). */
function pickClosedAt(dbFields: Record<string, unknown>): string | null {
  const stage = dbFields['stage'] as string | null;
  if (stage === CLOSED_WON_STAGE) {
    return (dbFields['stage_date_closed_won'] as string | null)
        || (dbFields['close_date']            as string | null)
        || null;
  }
  if (stage === CLOSED_LOST_STAGE) {
    return (dbFields['stage_date_closed_lost'] as string | null)
        || (dbFields['close_date']             as string | null)
        || null;
  }
  return null;
}

// ── Build ParsedRow[] from a 2-D string matrix (shared by all parsers) ───────
function buildParsedRows(matrix: string[][]): ParsedRow[] {
  if (matrix.length < 2) {
    throw new Error('File has no data rows (only a header row or is empty).');
  }

  const headers = matrix[0].map(h => String(h ?? '').trim().toLowerCase());

  if (!headers.includes('opportunity id')) {
    throw new Error('Required column "Opportunity ID" not found. Check file format.');
  }

  const parsed: ParsedRow[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];

    const rawFields: Record<string, string> = {};
    headers.forEach((h, idx) => { rawFields[h] = String(cells[idx] ?? '').trim(); });

    const dbFields: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      const dbField = COLUMN_MAP[header];
      if (dbField === undefined) return;
      if (dbField === null) return;

      const trimmed = String(cells[idx] ?? '').trim();

      if (BOOLEAN_FIELDS.has(dbField)) {
        dbFields[dbField] = trimmed.toLowerCase() === 'true' || trimmed === '1' || trimmed.toLowerCase() === 'yes';
      } else if (DATE_FIELDS.has(dbField)) {
        // Normalise to ISO YYYY-MM-DD so it matches what Postgres returns on readback.
        // Without this, change-detection sees "11/20/26" vs "2026-11-20" as different on every import.
        dbFields[dbField] = normalizeDateToIso(trimmed);
      } else if (NUMERIC_FIELDS.has(dbField)) {
        const cleaned = trimmed.replace(/[^0-9.-]/g, '');
        dbFields[dbField] = cleaned ? parseFloat(cleaned) : null;
      } else {
        dbFields[dbField] = trimmed || null;
      }
    });

    if (!dbFields['sf_opportunity_id']) continue;

    parsed.push({ dbFields, rawFields });
  }

  return parsed;
}

// ── File-decode stage: raw buffer → 2-D string matrix ─────────────────────
// Split out of the old single-step parser so the staged pipeline can treat
// file decode and row-level validation as separate stages with their own
// stage_log entries. parseImportFile() below is kept for the /import/preview
// path and wraps the two halves.

export type ImportFormat = 'xlsx' | 'csv' | 'html';

function decodeHtml(html: string): string[][] {
  const $ = cheerio.load(html);
  const table = $('table').first();
  if (!table.length) {
    throw new Error('No table found in file. Expected HTML-in-XLS, .xlsx, or .csv format.');
  }
  const rows = table.find('tr').toArray();
  return rows.map(row =>
    $(row).find('th, td').toArray().map(el => $(el).text().trim())
  );
}

function decodeXlsx(buffer: Buffer): string[][] {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('No worksheet found in Excel file.');
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][];
}

function decodeCsv(buffer: Buffer): string[][] {
  let text: string;
  // UTF-16 LE BOM: FF FE
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    text = new TextDecoder('utf-16le').decode(buffer);
  // UTF-16 BE BOM: FE FF (including double-BOM variant FF FE FF FE)
  } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    text = new TextDecoder('utf-16be').decode(buffer);
  // UTF-8 BOM: EF BB BF
  } else if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    text = buffer.slice(3).toString('utf8');
  } else {
    text = buffer.toString('utf8');
  }
  // Strip all leading BOM characters (handles single and double BOMs)
  text = text.replace(/^\uFEFF+/, '');
  const wb = XLSX.read(text, { type: 'string' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('No worksheet found in CSV.');
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][];
}

/** Decode the uploaded buffer into a 2-D string matrix (no row-level
 *  validation yet). Detects format from magic bytes. Used by the staged
 *  pipeline's `parse` stage. */
export function readRawMatrix(buffer: Buffer): { matrix: string[][]; format: ImportFormat } {
  // OOXML .xlsx — ZIP magic: PK (50 4B 03 04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    return { matrix: decodeXlsx(buffer), format: 'xlsx' };
  }
  // UTF-16 LE or BE BOM → CSV
  if ((buffer[0] === 0xFF && buffer[1] === 0xFE) ||
      (buffer[0] === 0xFE && buffer[1] === 0xFF)) {
    return { matrix: decodeCsv(buffer), format: 'csv' };
  }
  // UTF-8 BOM → could be CSV or HTML; check for table tag
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    const text = buffer.slice(3).toString('utf8');
    return text.includes('<table')
      ? { matrix: decodeHtml(text), format: 'html' }
      : { matrix: decodeCsv(buffer), format: 'csv' };
  }
  // Plain text — HTML-in-XLS or plain UTF-8 CSV
  const text = buffer.toString('utf8');
  if (text.includes('<table')) {
    return { matrix: decodeHtml(text), format: 'html' };
  }
  return { matrix: decodeCsv(buffer), format: 'csv' };
}

// ── Main entry point — back-compat wrapper used by /import/preview ────────
export function parseImportFile(buffer: Buffer): ParsedRow[] {
  const { matrix } = readRawMatrix(buffer);
  return buildParsedRows(matrix);
}

// ── Product derivation for all opportunities ─────────────────────────────────
/** Scan every active opp's name for product keywords and (a) populate the
 *  `products` array if empty, and (b) create a product-tagging task when the
 *  deal has advanced past Build Value without tags. Returns counts for the
 *  staged import's `enrich` stage log. */
async function deriveProductsForAllOpps(): Promise<{ productsDerived: number; autoTasksCreated: number }> {
  const opps = await query<{ id: number; name: string; stage: string; se_owner_id: number | null; products: string[] }>(
    `SELECT id, name, stage, se_owner_id, products FROM opportunities WHERE is_active = true`,
    []
  );

  let productsDerived = 0;
  let autoTasksCreated = 0;

  for (const opp of opps) {
    const derived = deriveProducts(opp.name);

    // Only update if products is currently empty (don't overwrite manual edits)
    if (opp.products.length === 0 && derived.length > 0) {
      await query('UPDATE opportunities SET products = $1 WHERE id = $2', [derived, opp.id]);
      productsDerived++;
    }

    // Auto-create task if products still empty and deal is Build Value+
    const currentProducts = opp.products.length > 0 ? opp.products : derived;
    if (needsProductTaggingTask(currentProducts, opp.stage) && opp.se_owner_id) {
      const existing = await queryOne(
        `SELECT id FROM tasks WHERE opportunity_id = $1 AND title LIKE '%Add product tags%' AND is_deleted = false AND status != 'done'`,
        [opp.id]
      );
      if (!existing) {
        await query(
          `INSERT INTO tasks (opportunity_id, title, status, is_next_step, assigned_to_id, created_by_id)
           VALUES ($1, $2, 'open', false, $3, $3)`,
          [opp.id, `Add product tags to "${opp.name}"`, opp.se_owner_id]
        );
        autoTasksCreated++;
      }
    }
  }

  return { productsDerived, autoTasksCreated };
}

// ── Shared types used by the staged pipeline ──────────────────────────────
interface FieldHistoryEntry { opportunity_id: number; field_name: string; old_value: string | null; new_value: string | null; }
interface ImportNoteEntry    { opportunity_id: number; content: string; created_at: Date | null; }

interface ReconcileResult {
  stats: ImportStats;
  snapshot: Record<string, unknown>[];
  addedIds: number[];
  fieldHistoryEntries: FieldHistoryEntry[];
  importNotes: ImportNoteEntry[];
  sfImportUserId: number | null;
}

// ── Reconcile phase: main insert/update/stale loop ────────────────────────
/** Runs the row-by-row reconcile loop plus stale-marking. Does NOT write the
 *  imports log, field history, notes, or product derivations — those happen
 *  in the enrich/finalize stages so the staged pipeline can attribute timings
 *  and counts to the right stage. */
async function doReconcile(rows: ParsedRow[]): Promise<ReconcileResult> {
  const stats: ImportStats = {
    rowCount: rows.length, added: 0, updated: 0,
    closedLost: 0, closedWon: 0, stale: 0, errors: [],
  };

  // Snapshot all currently active (live, non-stale) opps BEFORE making any
  // changes — used for rollback. Closed deals are left out because the
  // import pipeline no longer mutates them implicitly.
  const snapshot = await query<Record<string, unknown>>(
    `SELECT * FROM opportunities
      WHERE is_active = true AND is_closed_lost = false AND is_closed_won = false`
  );
  const addedIds: number[] = [];
  const fieldHistoryEntries: FieldHistoryEntry[] = [];
  const importNotes: ImportNoteEntry[] = [];

  // Look up the SF Import user once per import. Falls back to skipping note
  // creation if migration 030 hasn't run yet (defensive — should never happen
  // in prod).
  const sfImportUser = await queryOne<{ id: number }>(
    `SELECT id FROM users WHERE email = 'sf-import@system.local' LIMIT 1`
  );
  const sfImportUserId = sfImportUser?.id ?? null;

  // Load ALL existing opps keyed by sf_id so we can reconcile open AND closed
  // rows (the feed now includes Closed Won / Closed Lost directly).
  const existingOpps = await query<{
    id: number; sf_opportunity_id: string; stage: string;
    is_active: boolean; is_closed_lost: boolean; is_closed_won: boolean;
    se_comments: string | null; manager_comments: string | null;
    next_step_sf: string | null; next_step_updated_at: string | null;
    technical_blockers: string | null;
    agentic_qual: string | null; close_date: string | null; poc_status: string | null;
  }>(
    `SELECT id, sf_opportunity_id, stage, is_active, is_closed_lost, is_closed_won,
            se_comments, manager_comments, next_step_sf, next_step_updated_at,
            technical_blockers,
            agentic_qual, close_date, poc_status
       FROM opportunities`
  );
  const existingMap = new Map(existingOpps.map(o => [o.sf_opportunity_id, o]));
  const seenSfIds = new Set<string>();

  for (const row of rows) {
    const sfId = row.dbFields['sf_opportunity_id'] as string;
    seenSfIds.add(sfId);

    try {
      const existing = existingMap.get(sfId);

      // Compute closed-state and authoritative closed_at from this row.
      const rowStage      = row.dbFields['stage'] as string | null;
      const rowIsLost     = rowStage === CLOSED_LOST_STAGE;
      const rowIsWon      = rowStage === CLOSED_WON_STAGE;
      const rowIsClosed   = rowIsLost || rowIsWon;
      const rowClosedAt   = pickClosedAt(row.dbFields);

      if (existing) {
        // ── UPDATE existing opportunity ──────────────────────────────────
        const setClauses: string[] = ['updated_at = now()', 'sf_raw_fields = $1'];
        const params: unknown[] = [JSON.stringify(row.rawFields)];

        // Closed-state transitions (all driven by the row's Stage value).
        const wasClosedLost = existing.is_closed_lost;
        const wasClosedWon  = existing.is_closed_won;
        const transitioningToClosed =
          (rowIsLost && !wasClosedLost) || (rowIsWon && !wasClosedWon);
        const reopening =
          (!rowIsClosed && (wasClosedLost || wasClosedWon));

        // Always keep is_active / is_closed_lost / is_closed_won aligned with Stage.
        setClauses.push(`is_closed_lost = ${rowIsLost}`);
        setClauses.push(`is_closed_won  = ${rowIsWon}`);
        setClauses.push(`is_active      = ${!rowIsClosed}`);
        setClauses.push(`stale_since    = NULL`); // re-appearing → not stale

        if (rowIsClosed) {
          if (rowClosedAt) {
            params.push(rowClosedAt);
            setClauses.push(`closed_at = $${params.length}::timestamptz`);
          } else if (transitioningToClosed) {
            setClauses.push(`closed_at = now()`);
          }
          // Fire unread badge when the deal flips from open → closed in this import.
          if (transitioningToClosed) {
            if (rowIsLost) {
              setClauses.push(`closed_lost_seen = false`);
              stats.closedLost++;
            }
            if (rowIsWon) {
              setClauses.push(`closed_won_seen = false`);
              stats.closedWon++;
            }
          }
        } else if (reopening) {
          setClauses.push(`closed_at = NULL`);
          setClauses.push(`closed_lost_seen = false`);
          setClauses.push(`closed_won_seen  = false`);
        }

        // Track stage change
        const newStage = row.dbFields['stage'] as string | null;
        if (newStage && newStage !== existing.stage) {
          setClauses.push(`stage_changed_at = now()`);
          setClauses.push(`previous_stage = $${params.length + 1}`);
          params.push(existing.stage);
        }

        // Track se_comments freshness + history
        const newSeComments = row.dbFields['se_comments'] as string | null;
        if (newSeComments !== existing.se_comments) {
          // Use the date parsed from the comment text when available; fall back to now()
          const parsedSe = parseSeCommentDate(newSeComments);
          if (parsedSe) {
            params.push(parsedSe.date.toISOString());
            setClauses.push(`se_comments_updated_at = $${params.length}`);
          } else {
            setClauses.push(`se_comments_updated_at = now()`);
          }
          fieldHistoryEntries.push({ opportunity_id: existing.id, field_name: 'se_comments', old_value: existing.se_comments, new_value: newSeComments });

          // Also persist the new SE comment as a Note on the opportunity so it
          // shows up in the Notes feed + Timeline. Only when there's actual
          // content (a clearing of SE Comments shouldn't create an empty note).
          if (newSeComments && newSeComments.trim() && sfImportUserId) {
            importNotes.push({
              opportunity_id: existing.id,
              content: newSeComments.trim(),
              created_at: parsedSe ? parsedSe.date : null,
            });
          }
        }

        // Track next_step_sf freshness + history. AEs stamp Next Step with a date
        // prefix the same way SEs stamp se_comments ("20260312: …", "BM_26SEPT: …"),
        // so the same parseSeCommentDate heuristic applies. Used by the Weekly
        // Digest "Stale Deals" filter so a fresh AE Next Step keeps a deal off
        // the stale list. Falls back to now() when no date prefix is parseable.
        const newNextStep = row.dbFields['next_step_sf'] as string | null;
        if (newNextStep !== existing.next_step_sf) {
          const parsedNextStep = parseSeCommentDate(newNextStep);
          if (parsedNextStep) {
            params.push(parsedNextStep.date.toISOString());
            setClauses.push(`next_step_updated_at = $${params.length}`);
          } else {
            setClauses.push(`next_step_updated_at = now()`);
          }
          fieldHistoryEntries.push({ opportunity_id: existing.id, field_name: 'next_step_sf', old_value: existing.next_step_sf, new_value: newNextStep });
        } else if (!existing.next_step_updated_at && newNextStep) {
          // Self-heal: value didn't change in this import, but the timestamp is
          // NULL (deal was created before migration 051 and Next Step never
          // changed since). Try to recover a timestamp from the embedded date
          // prefix. Silent no-op if the text has no parseable date — we just
          // leave it for the next import.
          const parsedNextStep = parseSeCommentDate(newNextStep);
          if (parsedNextStep) {
            params.push(parsedNextStep.date.toISOString());
            setClauses.push(`next_step_updated_at = $${params.length}`);
          }
        }

        // Track technical_blockers history
        const newTechBlockers = row.dbFields['technical_blockers'] as string | null;
        if (newTechBlockers !== existing.technical_blockers) {
          fieldHistoryEntries.push({ opportunity_id: existing.id, field_name: 'technical_blockers', old_value: existing.technical_blockers, new_value: newTechBlockers });
        }

        // Track manager_comments freshness + history
        const newMgrComments = row.dbFields['manager_comments'] as string | null;
        if (newMgrComments !== existing.manager_comments) {
          setClauses.push(`manager_comments_updated_at = now()`);
          fieldHistoryEntries.push({ opportunity_id: existing.id, field_name: 'manager_comments', old_value: existing.manager_comments, new_value: newMgrComments });
        }

        // Track agentic_qual history
        const newAgenticQual = row.dbFields['agentic_qual'] as string | null;
        if (newAgenticQual !== existing.agentic_qual) {
          fieldHistoryEntries.push({ opportunity_id: existing.id, field_name: 'agentic_qual', old_value: existing.agentic_qual, new_value: newAgenticQual });
        }

        // Track close_date history. Both sides are normalised to ISO YYYY-MM-DD
        // so we don't record phantom changes when SF exports "11/20/26" but the
        // DB returns "2026-11-20".
        const incomingCloseDate = normalizeDateToIso(row.dbFields['close_date'] as string | null);
        const existingCloseDate = existing.close_date ? String(existing.close_date).split('T')[0] : null;
        if (incomingCloseDate !== existingCloseDate) {
          fieldHistoryEntries.push({ opportunity_id: existing.id, field_name: 'close_date', old_value: existingCloseDate, new_value: incomingCloseDate });
        }

        // Track poc_status history
        const newPocStatus = row.dbFields['poc_status'] as string | null;
        if (newPocStatus !== existing.poc_status) {
          fieldHistoryEntries.push({ opportunity_id: existing.id, field_name: 'poc_status', old_value: existing.poc_status, new_value: newPocStatus });
        }

        // Add all SF-owned fields
        for (const [field, value] of Object.entries(row.dbFields)) {
          if (field === 'sf_opportunity_id') continue; // never update the key
          if (!SF_OWNED_FIELDS.has(field)) continue;
          params.push(value);
          setClauses.push(`${field} = $${params.length}`);
        }

        params.push(existing.id);
        await query(
          `UPDATE opportunities SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
          params
        );
        stats.updated++;
      } else {
        // ── INSERT new opportunity ──────────────────────────────────────
        // New rows may arrive already closed (feed now includes Closed Won/Lost),
        // so we seed is_active / is_closed_* / closed_at at insert time too.
        const fields = ['sf_raw_fields', 'first_seen_at', ...Object.keys(row.dbFields)];
        const placeholders = ['$1', 'now()', ...Object.keys(row.dbFields).map((_, i) => `$${i + 2}`)];
        const values = [JSON.stringify(row.rawFields), ...Object.values(row.dbFields)];

        fields.push('is_closed_lost'); values.push(rowIsLost); placeholders.push(`$${values.length}`);
        fields.push('is_closed_won');  values.push(rowIsWon);  placeholders.push(`$${values.length}`);
        fields.push('is_active');      values.push(!rowIsClosed); placeholders.push(`$${values.length}`);

        if (rowIsClosed && rowClosedAt) {
          fields.push('closed_at');
          values.push(rowClosedAt);
          placeholders.push(`$${values.length}::timestamptz`);
        } else if (rowIsClosed) {
          fields.push('closed_at');
          placeholders.push('now()');
        }
        if (rowIsLost) { fields.push('closed_lost_seen'); values.push(false); placeholders.push(`$${values.length}`); stats.closedLost++; }
        if (rowIsWon)  { fields.push('closed_won_seen');  values.push(false); placeholders.push(`$${values.length}`); stats.closedWon++; }

        // Set freshness timestamps on insert when the field already has content
        // (the UPDATE path only fires these when values *change* between imports,
        //  so initial inserts with pre-populated comments would otherwise show "never")
        const insertSeComments = row.dbFields['se_comments'] as string | null;
        if (insertSeComments) {
          const parsedSe = parseSeCommentDate(insertSeComments);
          fields.push('se_comments_updated_at');
          if (parsedSe) {
            values.push(parsedSe.date.toISOString());
            placeholders.push(`$${values.length}`);  // values.length after push = correct 1-based index
          } else {
            placeholders.push('now()');
          }
        }
        const insertMgrComments = row.dbFields['manager_comments'] as string | null;
        if (insertMgrComments) {
          fields.push('manager_comments_updated_at');
          placeholders.push('now()');
        }
        // Same date-stamp parsing as se_comments above — AEs use the same
        // "YYYYMMDD: …" / "Init_MMMDD …" prefixes in Next Step.
        const insertNextStep = row.dbFields['next_step_sf'] as string | null;
        if (insertNextStep) {
          const parsedNextStep = parseSeCommentDate(insertNextStep);
          fields.push('next_step_updated_at');
          if (parsedNextStep) {
            values.push(parsedNextStep.date.toISOString());
            placeholders.push(`$${values.length}`);
          } else {
            placeholders.push('now()');
          }
        }

        const inserted = await queryOne<{ id: number }>(
          `INSERT INTO opportunities (${fields.join(', ')}) VALUES (${placeholders.join(', ')})
           ON CONFLICT (sf_opportunity_id) DO NOTHING RETURNING id`,
          values
        );
        if (inserted) addedIds.push(inserted.id);
        stats.added++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.errors.push(`Row sf_id=${sfId}: ${msg}`);
    }
  }

  // ── Handle opps that disappeared from the feed ────────────────────────
  // The SF export now includes Closed Won / Closed Lost deals directly, so
  // closed state is driven by the Stage column (handled above). A previously-
  // active opp that is missing from this import is assumed deleted or merged
  // in SF and is soft-hidden via `stale_since` — NOT marked Closed Lost.
  // Already-closed opps that are missing are left completely untouched.
  for (const [sfId, opp] of existingMap.entries()) {
    if (seenSfIds.has(sfId)) continue;
    if (opp.is_closed_lost || opp.is_closed_won) continue; // leave closed history alone
    if (!opp.is_active) continue; // already stale from a prior import
    await query(
      `UPDATE opportunities
          SET is_active   = false,
              stale_since = now(),
              updated_at  = now()
        WHERE id = $1`,
      [opp.id]
    );
    stats.stale++;
  }

  return { stats, snapshot, addedIds, fieldHistoryEntries, importNotes, sfImportUserId };
}

// ── Enrich phase: derive products, persist field history + auto-notes ─────
interface EnrichCounts {
  productsDerived: number;
  autoTasksCreated: number;
  historyEntries: number;
  notesCreated: number;
}

async function doEnrich(importId: number, r: ReconcileResult): Promise<EnrichCounts> {
  const { productsDerived, autoTasksCreated } = await deriveProductsForAllOpps();

  // Insert field history entries linked to this import
  for (const entry of r.fieldHistoryEntries) {
    await query(
      `INSERT INTO opportunity_field_history (opportunity_id, import_id, field_name, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.opportunity_id, importId, entry.field_name, entry.old_value, entry.new_value]
    );
  }

  // Insert auto-generated SE Comment notes (one per opportunity whose SE
  // Comments value changed in this import).
  let notesCreated = 0;
  if (r.sfImportUserId && r.importNotes.length > 0) {
    const touchedOppIds = new Set<number>();
    for (const note of r.importNotes) {
      if (note.created_at) {
        await query(
          `INSERT INTO notes (opportunity_id, author_id, content, created_at)
           VALUES ($1, $2, $3, $4)`,
          [note.opportunity_id, r.sfImportUserId, note.content, note.created_at.toISOString()]
        );
      } else {
        await query(
          `INSERT INTO notes (opportunity_id, author_id, content)
           VALUES ($1, $2, $3)`,
          [note.opportunity_id, r.sfImportUserId, note.content]
        );
      }
      touchedOppIds.add(note.opportunity_id);
      notesCreated++;
    }
    // Bump last_note_at on each touched opp so freshness signals stay accurate.
    for (const oppId of touchedOppIds) {
      await query(`UPDATE opportunities SET last_note_at = now() WHERE id = $1`, [oppId]);
    }
  }

  return {
    productsDerived,
    autoTasksCreated,
    historyEntries: r.fieldHistoryEntries.length,
    notesCreated,
  };
}

// ── Finalize phase: clear caches + write final status to imports row ─────
async function doFinalize(importId: number, r: ReconcileResult): Promise<void> {
  await query(`DELETE FROM ai_summary_cache WHERE key LIKE 'meddpicc-coach-%'`);

  const s = r.stats;
  const status = s.errors.length === 0 ? 'success'
    : s.errors.length < s.rowCount ? 'partial'
    : 'failed';

  await query(
    `UPDATE imports SET
       row_count = $1,
       opportunities_added = $2,
       opportunities_updated = $3,
       opportunities_closed_lost = $4,
       opportunities_closed_won = $5,
       opportunities_stale = $6,
       status = $7,
       error_log = $8,
       rollback_data = $9,
       finished_at = now()
     WHERE id = $10`,
    [
      s.rowCount, s.added, s.updated, s.closedLost, s.closedWon, s.stale,
      status,
      s.errors.length > 0 ? s.errors.join('\n') : null,
      { opps: r.snapshot, added_ids: r.addedIds },
      importId,
    ]
  );
}

// ── Per-stage tracking helpers ─────────────────────────────────────────────

type StageName = 'parse' | 'validate' | 'reconcile' | 'enrich' | 'finalize';
type StageStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

interface StageLogEntry {
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  counts?: Record<string, unknown>;
  error?: string;
}

async function writeStage(importId: number, stage: StageName, value: StageLogEntry): Promise<void> {
  await query(
    `UPDATE imports
        SET stage_log = jsonb_set(COALESCE(stage_log, '{}'::jsonb), $1::text[], $2::jsonb, true)
      WHERE id = $3`,
    [[stage], JSON.stringify(value), importId]
  );
}

async function trackStage<T>(
  importId: number,
  stage: StageName,
  fn: () => Promise<{ value: T; counts?: Record<string, unknown> }>
): Promise<T> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  await writeStage(importId, stage, { status: 'running', startedAt });
  try {
    const { value, counts } = await fn();
    const finishedAtMs = Date.now();
    await writeStage(importId, stage, {
      status: 'success',
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      counts,
    });
    return value;
  } catch (e) {
    const finishedAtMs = Date.now();
    const error = e instanceof Error ? e.message : String(e);
    await writeStage(importId, stage, {
      status: 'failed',
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      error,
    });
    throw e;
  }
}

/** Mark the import as failed and flag any remaining stages as skipped. */
async function abortImport(importId: number, skipStages: StageName[]): Promise<void> {
  for (const s of skipStages) {
    await writeStage(importId, s, { status: 'skipped' });
  }
  await query(
    `UPDATE imports SET status = 'failed', finished_at = now() WHERE id = $1`,
    [importId]
  );
}

// ── Staged pipeline orchestrator ───────────────────────────────────────────
/** Run the 5-stage import pipeline asynchronously. The imports row is
 *  assumed to already exist with status='in_progress' (created by the route
 *  handler so the client has an ID to poll). Each stage writes its own entry
 *  to `stage_log`; on any stage failure the remaining stages are marked
 *  skipped and the import is marked failed. */
export async function runStagedImport(
  importId: number,
  buffer: Buffer,
  filename: string
): Promise<void> {
  void filename; // filename is already on the imports row; pipeline doesn't need it directly

  // ── Stage 1: Parse ────────────────────────────────────────────────────
  let matrix: string[][];
  let format: ImportFormat;
  try {
    const res = await trackStage(importId, 'parse', async () => {
      const out = readRawMatrix(buffer);
      return {
        value: out,
        counts: { rows: Math.max(out.matrix.length - 1, 0), format: out.format },
      };
    });
    matrix = res.matrix;
    format = res.format;
    void format;
  } catch {
    return abortImport(importId, ['validate', 'reconcile', 'enrich', 'finalize']);
  }

  // ── Stage 2: Validate ─────────────────────────────────────────────────
  let rows: ParsedRow[];
  try {
    rows = await trackStage(importId, 'validate', async () => {
      const parsed = buildParsedRows(matrix);
      return {
        value: parsed,
        counts: {
          mapped: parsed.length,
          dropped: Math.max(matrix.length - 1 - parsed.length, 0),
        },
      };
    });
  } catch {
    return abortImport(importId, ['reconcile', 'enrich', 'finalize']);
  }

  // ── Stage 3: Reconcile ────────────────────────────────────────────────
  let reconcileResult: ReconcileResult;
  try {
    reconcileResult = await trackStage(importId, 'reconcile', async () => {
      const r = await doReconcile(rows);
      return {
        value: r,
        counts: {
          added: r.stats.added,
          updated: r.stats.updated,
          stale: r.stats.stale,
          closedWon: r.stats.closedWon,
          closedLost: r.stats.closedLost,
          rowErrors: r.stats.errors.length,
        },
      };
    });
  } catch {
    return abortImport(importId, ['enrich', 'finalize']);
  }

  // ── Stage 4: Enrich ───────────────────────────────────────────────────
  try {
    await trackStage(importId, 'enrich', async () => {
      const counts = await doEnrich(importId, reconcileResult);
      return { value: counts, counts: counts as unknown as Record<string, unknown> };
    });
  } catch {
    return abortImport(importId, ['finalize']);
  }

  // ── Stage 5: Finalize ─────────────────────────────────────────────────
  try {
    await trackStage(importId, 'finalize', async () => {
      await doFinalize(importId, reconcileResult);
      return { value: null, counts: { cacheCleared: true } };
    });
  } catch {
    return abortImport(importId, []);
  }
}

// ── Dry-run diff (no DB writes) ────────────────────────────────────────────
export async function previewImport(rows: ParsedRow[]): Promise<ImportStats> {
  const stats: ImportStats = {
    rowCount: rows.length, added: 0, updated: 0,
    closedLost: 0, closedWon: 0, stale: 0, errors: [],
  };

  const existing = await query<{
    sf_opportunity_id: string;
    is_active: boolean; is_closed_lost: boolean; is_closed_won: boolean;
  }>(
    `SELECT sf_opportunity_id, is_active, is_closed_lost, is_closed_won FROM opportunities`
  );
  const existingMap = new Map(existing.map(o => [o.sf_opportunity_id, o]));
  const seenIds = new Set<string>();

  for (const row of rows) {
    const sfId = row.dbFields['sf_opportunity_id'] as string;
    seenIds.add(sfId);
    const rowStage    = row.dbFields['stage'] as string | null;
    const rowIsLost   = rowStage === CLOSED_LOST_STAGE;
    const rowIsWon    = rowStage === CLOSED_WON_STAGE;
    const prev        = existingMap.get(sfId);
    if (!prev) { stats.added++; }
    else       { stats.updated++; }
    if (prev && rowIsLost && !prev.is_closed_lost) stats.closedLost++;
    if (prev && rowIsWon  && !prev.is_closed_won)  stats.closedWon++;
    if (!prev && rowIsLost) stats.closedLost++;
    if (!prev && rowIsWon)  stats.closedWon++;
  }

  for (const [sfId, opp] of existingMap.entries()) {
    if (seenIds.has(sfId)) continue;
    if (opp.is_active && !opp.is_closed_lost && !opp.is_closed_won) stats.stale++;
  }

  return stats;
}
