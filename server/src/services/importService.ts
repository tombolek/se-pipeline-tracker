import * as cheerio from 'cheerio';
import * as XLSX from 'xlsx';
import { query, queryOne } from '../db/index.js';
import { parseSeCommentDate } from '../utils/parseSeCommentDate.js';

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
  'technical blockers/risk':            'technical_blockers',
};

// DB fields that are booleans in the opportunities table
const BOOLEAN_FIELDS = new Set(['key_deal']);

// DB fields that are DATE type
const DATE_FIELDS = new Set(['close_date', 'close_month', 'poc_start_date', 'poc_end_date']);

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
  closedLost: number;
  errors: string[];
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
        dbFields[dbField] = trimmed || null;
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

// ── HTML-in-XLS parser (Salesforce default browser export) ────────────────
function parseHtml(html: string): ParsedRow[] {
  const $ = cheerio.load(html);
  const table = $('table').first();
  if (!table.length) {
    throw new Error('No table found in file. Expected HTML-in-XLS, .xlsx, or .csv format.');
  }
  const rows = table.find('tr').toArray();
  const matrix: string[][] = rows.map(row =>
    $(row).find('th, td').toArray().map(el => $(el).text().trim())
  );
  return buildParsedRows(matrix);
}

// ── OOXML .xlsx parser ────────────────────────────────────────────────────
function parseXlsx(buffer: Buffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('No worksheet found in Excel file.');
  const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false });
  return buildParsedRows(matrix as string[][]);
}

// ── CSV parser (UTF-8, UTF-8 BOM, UTF-16 LE/BE, double-BOM) ─────────────
function parseCsv(buffer: Buffer): ParsedRow[] {
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
  const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false });
  return buildParsedRows(matrix as string[][]);
}

// ── Main entry point — detects format from magic bytes ────────────────────
export function parseImportFile(buffer: Buffer): ParsedRow[] {
  // OOXML .xlsx — ZIP magic: PK (50 4B 03 04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    return parseXlsx(buffer);
  }
  // UTF-16 LE or BE BOM → CSV
  if ((buffer[0] === 0xFF && buffer[1] === 0xFE) ||
      (buffer[0] === 0xFE && buffer[1] === 0xFF)) {
    return parseCsv(buffer);
  }
  // UTF-8 BOM → could be CSV or HTML; check for table tag
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    const text = buffer.slice(3).toString('utf8');
    return text.includes('<table') ? parseHtml(text) : parseCsv(buffer);
  }
  // Plain text — HTML-in-XLS or plain UTF-8 CSV
  const text = buffer.toString('utf8');
  if (text.includes('<table')) {
    return parseHtml(text);
  }
  return parseCsv(buffer);
}

// ── Run reconciliation ─────────────────────────────────────────────────────
export async function reconcileImport(
  rows: ParsedRow[],
  filename: string
): Promise<ImportStats> {
  const stats: ImportStats = { rowCount: rows.length, added: 0, updated: 0, closedLost: 0, errors: [] };

  // Snapshot all currently active opps BEFORE making any changes (for rollback)
  const snapshot = await query<Record<string, unknown>>(
    `SELECT * FROM opportunities WHERE is_active = true AND is_closed_lost = false`
  );
  const addedIds: number[] = [];

  interface FieldHistoryEntry { opportunity_id: number; field_name: string; old_value: string | null; new_value: string | null; }
  const fieldHistoryEntries: FieldHistoryEntry[] = [];

  // Get all currently active (non-closed) SF IDs
  const activeOpps = await query<{ id: number; sf_opportunity_id: string; stage: string; se_comments: string | null; manager_comments: string | null; next_step_sf: string | null; technical_blockers: string | null }>(
    `SELECT id, sf_opportunity_id, stage, se_comments, manager_comments, next_step_sf, technical_blockers
     FROM opportunities
     WHERE is_active = true AND is_closed_lost = false`
  );
  const activeMap = new Map(activeOpps.map(o => [o.sf_opportunity_id, o]));
  const seenSfIds = new Set<string>();

  for (const row of rows) {
    const sfId = row.dbFields['sf_opportunity_id'] as string;
    seenSfIds.add(sfId);

    try {
      const existing = activeMap.get(sfId);

      if (existing) {
        // ── UPDATE existing opportunity ──────────────────────────────────
        const setClauses: string[] = ['updated_at = now()', 'sf_raw_fields = $1'];
        const params: unknown[] = [JSON.stringify(row.rawFields)];

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
        }

        // Track next_step_sf history
        const newNextStep = row.dbFields['next_step_sf'] as string | null;
        if (newNextStep !== existing.next_step_sf) {
          fieldHistoryEntries.push({ opportunity_id: existing.id, field_name: 'next_step_sf', old_value: existing.next_step_sf, new_value: newNextStep });
        }

        // Track technical_blockers history
        const newTechBlockers = row.dbFields['technical_blockers'] as string | null;
        if (newTechBlockers !== existing.technical_blockers) {
          fieldHistoryEntries.push({ opportunity_id: existing.id, field_name: 'technical_blockers', old_value: existing.technical_blockers, new_value: newTechBlockers });
        }

        // Track manager_comments freshness
        const newMgrComments = row.dbFields['manager_comments'] as string | null;
        if (newMgrComments !== existing.manager_comments) {
          setClauses.push(`manager_comments_updated_at = now()`);
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
        const fields = ['sf_raw_fields', 'first_seen_at', ...Object.keys(row.dbFields)];
        const placeholders = ['$1', 'now()', ...Object.keys(row.dbFields).map((_, i) => `$${i + 2}`)];
        const values = [JSON.stringify(row.rawFields), ...Object.values(row.dbFields)];

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

  // ── Mark Closed Lost: active opps not in this import ───────────────────
  for (const [sfId, opp] of activeMap.entries()) {
    if (!seenSfIds.has(sfId)) {
      await query(
        `UPDATE opportunities
         SET is_closed_lost = true, closed_at = now(), closed_lost_seen = false,
             is_active = false, updated_at = now()
         WHERE id = $1`,
        [opp.id]
      );
      stats.closedLost++;
    }
  }

  // ── Log to imports table ────────────────────────────────────────────────
  const status = stats.errors.length === 0 ? 'success'
    : stats.errors.length < stats.rowCount ? 'partial'
    : 'failed';

  const importLog = await queryOne<{ id: number }>(
    `INSERT INTO imports
       (filename, row_count, opportunities_added, opportunities_updated,
        opportunities_closed_lost, status, error_log, rollback_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      filename,
      stats.rowCount,
      stats.added,
      stats.updated,
      stats.closedLost,
      status,
      stats.errors.length > 0 ? stats.errors.join('\n') : null,
      { opps: snapshot, added_ids: addedIds },
    ]
  );

  // Insert field history entries linked to this import
  if (importLog && fieldHistoryEntries.length > 0) {
    for (const entry of fieldHistoryEntries) {
      await query(
        `INSERT INTO opportunity_field_history (opportunity_id, import_id, field_name, old_value, new_value)
         VALUES ($1, $2, $3, $4, $5)`,
        [entry.opportunity_id, importLog.id, entry.field_name, entry.old_value, entry.new_value]
      );
    }
  }

  return stats;
}

// ── Dry-run diff (no DB writes) ────────────────────────────────────────────
export async function previewImport(rows: ParsedRow[]): Promise<ImportStats> {
  const stats: ImportStats = { rowCount: rows.length, added: 0, updated: 0, closedLost: 0, errors: [] };

  const activeOpps = await query<{ sf_opportunity_id: string }>(
    `SELECT sf_opportunity_id FROM opportunities WHERE is_active = true AND is_closed_lost = false`
  );
  const activeIds = new Set(activeOpps.map(o => o.sf_opportunity_id));
  const seenIds = new Set<string>();

  for (const row of rows) {
    const sfId = row.dbFields['sf_opportunity_id'] as string;
    seenIds.add(sfId);
    if (activeIds.has(sfId)) {
      stats.updated++;
    } else {
      stats.added++;
    }
  }

  for (const sfId of activeIds) {
    if (!seenIds.has(sfId)) stats.closedLost++;
  }

  return stats;
}
