import * as cheerio from 'cheerio';
import { query, queryOne } from '../db/index.js';

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

// ── Parse HTML-in-XLS file ─────────────────────────────────────────────────
export function parseImportFile(buffer: Buffer): ParsedRow[] {
  const html = buffer.toString('utf8');
  const $ = cheerio.load(html);

  // Find the first table
  const table = $('table').first();
  if (!table.length) {
    throw new Error('No table found in file. Expected HTML-in-XLS format from Salesforce.');
  }

  const rows = table.find('tr').toArray();
  if (rows.length < 2) {
    throw new Error('File has no data rows (only a header row or empty).');
  }

  // Extract headers from first row (th or td)
  const headers = $(rows[0]).find('th, td').toArray().map(el =>
    $(el).text().trim().toLowerCase()
  );

  if (!headers.includes('opportunity id')) {
    throw new Error('Required column "Opportunity ID" not found. Check file format.');
  }

  const parsed: ParsedRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = $(rows[i]).find('td').toArray().map(el => $(el).text().trim());

    // Build raw fields object (preserves all columns for sf_raw_fields JSONB)
    const rawFields: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rawFields[h] = cells[idx] ?? '';
    });

    // Map to DB fields
    const dbFields: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      const dbField = COLUMN_MAP[header];
      if (dbField === undefined) return; // unknown column — goes to raw only
      if (dbField === null) return;       // explicitly raw-only column

      const raw = cells[idx] ?? '';
      const trimmed = raw.trim();

      if (BOOLEAN_FIELDS.has(dbField)) {
        dbFields[dbField] = trimmed.toLowerCase() === 'true' || trimmed === '1' || trimmed.toLowerCase() === 'yes';
      } else if (DATE_FIELDS.has(dbField)) {
        dbFields[dbField] = trimmed ? trimmed : null;
      } else if (NUMERIC_FIELDS.has(dbField)) {
        // Strip currency symbols, commas, spaces
        const cleaned = trimmed.replace(/[^0-9.-]/g, '');
        dbFields[dbField] = cleaned ? parseFloat(cleaned) : null;
      } else {
        dbFields[dbField] = trimmed || null;
      }
    });

    // Skip rows without an Opportunity ID
    if (!dbFields['sf_opportunity_id']) continue;

    parsed.push({ dbFields, rawFields });
  }

  return parsed;
}

// ── Run reconciliation ─────────────────────────────────────────────────────
export async function reconcileImport(
  rows: ParsedRow[],
  filename: string
): Promise<ImportStats> {
  const stats: ImportStats = { rowCount: rows.length, added: 0, updated: 0, closedLost: 0, errors: [] };

  // Get all currently active (non-closed) SF IDs
  const activeOpps = await query<{ id: number; sf_opportunity_id: string; stage: string; se_comments: string | null; manager_comments: string | null }>(
    `SELECT id, sf_opportunity_id, stage, se_comments, manager_comments
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

        // Track se_comments freshness
        const newSeComments = row.dbFields['se_comments'] as string | null;
        if (newSeComments !== existing.se_comments) {
          setClauses.push(`se_comments_updated_at = now()`);
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

        await query(
          `INSERT INTO opportunities (${fields.join(', ')}) VALUES (${placeholders.join(', ')})
           ON CONFLICT (sf_opportunity_id) DO NOTHING`,
          values
        );
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

  await query(
    `INSERT INTO imports
       (filename, row_count, opportunities_added, opportunities_updated,
        opportunities_closed_lost, status, error_log)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      filename,
      stats.rowCount,
      stats.added,
      stats.updated,
      stats.closedLost,
      status,
      stats.errors.length > 0 ? stats.errors.join('\n') : null,
    ]
  );

  return stats;
}
