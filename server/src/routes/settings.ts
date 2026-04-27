import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const admin = requireAdmin as unknown as (req: Request, res: Response, next: () => void) => void;

/* ── Default config (matches migration seed) ── */
const DEFAULT_CONFIG = {
  sections: [
    {
      id: 'deal-info-grid', label: 'Deal Info', type: 'grid', defaultOpen: true,
      fields: [
        { key: 'stage', label: 'Stage', source: 'column' },
        { key: 'arr', label: 'ARR', source: 'column', format: 'arr' },
        { key: 'close_date', label: 'Close', source: 'column', format: 'date' },
        { key: 'ae_owner_name', label: 'AE Owner', source: 'column' },
        { key: 'se_owner', label: 'SE Owner', source: 'column', format: 'se_owner' },
        { key: 'se_contributors', label: 'SE Contributors', source: 'column', format: 'se_contributors' },
        { key: 'team', label: 'Team', source: 'column' },
        { key: 'record_type', label: 'Record Type', source: 'column' },
        { key: 'deploy_mode', label: 'Deploy', source: 'column' },
        { key: 'engaged_competitors', label: 'Competitors', source: 'column' },
        { key: 'products', label: 'Products', source: 'column', format: 'products' },
      ],
    },
    {
      id: 'sf-next-step', label: 'SF Next Step', type: 'collapsible', defaultOpen: true,
      fields: [{ key: 'next_step_sf', label: 'Next Step', source: 'column' }],
      extras: ['field_history:next_step_sf'],
    },
    {
      id: 'se-comments', label: 'SE Comments', type: 'collapsible', defaultOpen: true,
      fields: [{ key: 'se_comments', label: 'SE Comments', source: 'column' }],
      extras: ['freshness:se_comments_updated_at', 'field_history:se_comments'],
    },
    {
      id: 'manager-comments', label: 'Manager Comments', type: 'collapsible', defaultOpen: false,
      fields: [{ key: 'manager_comments', label: 'Manager Comments', source: 'column' }],
      visibility: 'manager_or_has_value',
    },
    {
      id: 'stage-history', label: 'Stage History', type: 'collapsible', defaultOpen: false,
      fields: [
        { key: 'previous_stage', label: 'Previous', source: 'column' },
        { key: 'stage_changed_at', label: 'Changed', source: 'column', format: 'date' },
      ],
      visibility: 'has_value:previous_stage',
    },
    { id: 'poc-rfx', label: 'PoC & RFx', type: 'computed', defaultOpen: true },
    { id: 'health-breakdown', label: 'Health Score Breakdown', type: 'computed', defaultOpen: true },
    { id: 'meddpicc', label: 'MEDDPICC', type: 'computed', defaultOpen: true },
    { id: 'see-all-fields', label: 'See All Fields', type: 'computed', defaultOpen: false },
  ],
};

/* ── Known column fields with labels (for the "Add field" picker) ── */
const KNOWN_COLUMN_FIELDS = [
  { key: 'stage', label: 'Stage' },
  { key: 'arr', label: 'ARR', format: 'arr' },
  { key: 'arr_converted', label: 'ARR (converted)', format: 'arr' },
  { key: 'close_date', label: 'Close Date', format: 'date' },
  { key: 'close_month', label: 'Close Month', format: 'date' },
  { key: 'fiscal_period', label: 'Fiscal Period' },
  { key: 'fiscal_year', label: 'Fiscal Year' },
  { key: 'ae_owner_name', label: 'AE Owner' },
  { key: 'se_owner', label: 'SE Owner', format: 'se_owner' },
  { key: 'se_contributors', label: 'SE Contributors', format: 'se_contributors' },
  { key: 'team', label: 'Team' },
  { key: 'record_type', label: 'Record Type' },
  { key: 'deploy_mode', label: 'Deploy Mode' },
  { key: 'deploy_location', label: 'Deploy Location' },
  { key: 'poc_status', label: 'PoC Status' },
  { key: 'poc_start_date', label: 'PoC Start Date', format: 'date' },
  { key: 'poc_end_date', label: 'PoC End Date', format: 'date' },
  { key: 'poc_type', label: 'PoC Type' },
  { key: 'poc_deploy_type', label: 'PoC Deploy Type' },
  { key: 'rfx_status', label: 'RFx Status' },
  { key: 'engaged_competitors', label: 'Competitors' },
  { key: 'products', label: 'Products', format: 'products' },
  { key: 'account_name', label: 'Account Name' },
  { key: 'account_segment', label: 'Account Segment' },
  { key: 'account_industry', label: 'Account Industry' },
  { key: 'key_deal', label: 'Key Deal' },
  { key: 'sales_plays', label: 'Sales Plays' },
  { key: 'lead_source', label: 'Lead Source' },
  { key: 'opportunity_source', label: 'Opportunity Source' },
  { key: 'channel_source', label: 'Channel Source' },
  { key: 'biz_dev', label: 'BizDev' },
  { key: 'next_step_sf', label: 'SF Next Step' },
  { key: 'se_comments', label: 'SE Comments' },
  { key: 'manager_comments', label: 'Manager Comments' },
  { key: 'psm_comments', label: 'PSM Comments' },
  { key: 'technical_blockers', label: 'Technical Blockers' },
  { key: 'budget', label: 'Budget' },
  { key: 'authority', label: 'Authority' },
  { key: 'need', label: 'Need' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'economic_buyer', label: 'Economic Buyer' },
  { key: 'decision_criteria', label: 'Decision Criteria' },
  { key: 'decision_process', label: 'Decision Process' },
  { key: 'paper_process', label: 'Paper Process' },
  { key: 'implicate_pain', label: 'Implicate the Pain' },
  { key: 'champion', label: 'Champion' },
  { key: 'agentic_qual', label: 'Agentic Qualification' },
  { key: 'sourcing_partner', label: 'Sourcing Partner' },
  { key: 'sourcing_partner_tier', label: 'Sourcing Partner Tier' },
  { key: 'influencing_partner', label: 'Influencing Partner' },
  { key: 'partner_manager', label: 'Partner Manager' },
  { key: 'previous_stage', label: 'Previous Stage' },
  { key: 'stage_changed_at', label: 'Stage Changed At', format: 'date' },
].map(f => ({ ...f, source: 'column' as const }));

/* ── GET /settings/deal-info-config ── */
router.get('/deal-info-config', auth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT config FROM deal_info_config WHERE id = 1') as { config: unknown }[];
    const config = result.length > 0 ? result[0].config : DEFAULT_CONFIG;

    // Gather sf_raw_fields keys across all opps for the "add field" picker
    let sfRawKeys: string[] = [];
    try {
      const rawResult = await query(`
        SELECT DISTINCT k AS key
        FROM opportunities, LATERAL jsonb_object_keys(COALESCE(sf_raw_fields, '{}')) AS k
        ORDER BY k
        LIMIT 200
      `) as { key: string }[];
      sfRawKeys = rawResult.map(r => r.key);
    } catch { /* sf_raw_fields may be empty */ }

    const sfRawFields = sfRawKeys.map(key => ({
      key,
      label: key, // use the raw SF column name as label
      source: 'sf_raw' as const,
    }));

    res.json(ok({
      config,
      available_fields: [...KNOWN_COLUMN_FIELDS, ...sfRawFields],
    }));
  } catch (error) {
    console.error('Failed to get deal info config:', error);
    res.status(500).json(err('Failed to load configuration'));
  }
});

/* ── PUT /settings/deal-info-config — manager only ── */
router.put('/deal-info-config', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'manager') {
    res.status(403).json(err('Manager role required'));
    return;
  }

  const { config } = req.body;
  if (!config || !Array.isArray(config.sections)) {
    res.status(400).json(err('Invalid config: must have a sections array'));
    return;
  }

  // Basic validation
  for (const section of config.sections) {
    if (!section.id || !section.label || !section.type) {
      res.status(400).json(err(`Invalid section: missing id, label, or type`));
      return;
    }
    if (!['grid', 'collapsible', 'computed'].includes(section.type)) {
      res.status(400).json(err(`Invalid section type: ${section.type}`));
      return;
    }
  }

  try {
    await query(
      `INSERT INTO deal_info_config (id, config, updated_by, updated_at)
       VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET config = $1, updated_by = $2, updated_at = now()`,
      [JSON.stringify(config), user.userId]
    );

    // Audit log
    try {
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, details, timestamp)
         VALUES ($1, 'update', 'deal_info_config', $2, now())`,
        [user.userId, JSON.stringify({ sections_count: config.sections.length })]
      );
    } catch { /* audit log is best-effort */ }

    res.json(ok({ config }));
  } catch (error) {
    console.error('Failed to save deal info config:', error);
    res.status(500).json(err('Failed to save configuration'));
  }
});

/* ── POST /settings/deal-info-config/reset — manager only ── */
router.post('/deal-info-config/reset', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'manager') {
    res.status(403).json(err('Manager role required'));
    return;
  }

  try {
    await query(
      `INSERT INTO deal_info_config (id, config, updated_by, updated_at)
       VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET config = $1, updated_by = $2, updated_at = now()`,
      [JSON.stringify(DEFAULT_CONFIG), user.userId]
    );
    res.json(ok({ config: DEFAULT_CONFIG }));
  } catch (error) {
    console.error('Failed to reset deal info config:', error);
    res.status(500).json(err('Failed to reset configuration'));
  }
});

// ── Quota Groups (Issue #94 — % to Target report) ───────────────────────────
// Each group has a name, target (USD), and a rule that decides which Closed Won
// deals count toward it. Groups can overlap (same deal in multiple groups).

type QuotaRuleType = 'global' | 'teams' | 'ae_owners';

interface QuotaGroupRow {
  id: number;
  name: string;
  rule_type: QuotaRuleType;
  rule_value: unknown;
  target_amount: string;
  sort_order: number;
}

interface QuarterlyTargetRow {
  quota_group_id: number;
  fiscal_year: string;
  quarter: number;
  target_amount: string;
}

interface QuarterlyTargetsByFY {
  [fiscalYear: string]: { q1: string | null; q2: string | null; q3: string | null; q4: string | null };
}

function normalizeRuleValue(ruleType: QuotaRuleType, raw: unknown): string[] {
  if (ruleType === 'global') return [];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(v => v.trim());
}

function validateGroupBody(body: Record<string, unknown>): { ok: true; data: { name: string; rule_type: QuotaRuleType; rule_value: string[]; target_amount: number; sort_order?: number } } | { ok: false; msg: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, msg: 'Name is required' };

  const rule_type = body.rule_type as QuotaRuleType;
  if (!['global', 'teams', 'ae_owners'].includes(rule_type)) {
    return { ok: false, msg: 'rule_type must be one of: global, teams, ae_owners' };
  }

  const rule_value = normalizeRuleValue(rule_type, body.rule_value);
  if (rule_type !== 'global' && rule_value.length === 0) {
    return { ok: false, msg: 'rule_value must be a non-empty array of strings for teams/ae_owners' };
  }

  const targetRaw = body.target_amount;
  const target_amount = typeof targetRaw === 'number' ? targetRaw : parseFloat(String(targetRaw));
  if (!isFinite(target_amount) || target_amount < 0) {
    return { ok: false, msg: 'target_amount must be a non-negative number' };
  }

  const sort_order = typeof body.sort_order === 'number' ? body.sort_order : undefined;
  return { ok: true, data: { name, rule_type, rule_value, target_amount, sort_order } };
}

router.get('/quota-groups', auth, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<QuotaGroupRow>(
    `SELECT id, name, rule_type, rule_value, target_amount, sort_order
     FROM quota_groups
     ORDER BY sort_order ASC, id ASC`
  );
  const quarterlyRows = await query<QuarterlyTargetRow>(
    `SELECT quota_group_id, fiscal_year, quarter, target_amount
     FROM quota_group_quarterly_targets`
  );
  const byGroup = new Map<number, QuarterlyTargetsByFY>();
  for (const r of quarterlyRows) {
    let fyMap = byGroup.get(r.quota_group_id);
    if (!fyMap) { fyMap = {}; byGroup.set(r.quota_group_id, fyMap); }
    let cell = fyMap[r.fiscal_year];
    if (!cell) { cell = { q1: null, q2: null, q3: null, q4: null }; fyMap[r.fiscal_year] = cell; }
    const key = `q${r.quarter}` as keyof typeof cell;
    cell[key] = r.target_amount;
  }
  const enriched = rows.map(g => ({ ...g, quarterly_targets: byGroup.get(g.id) ?? {} }));
  res.json(ok(enriched));
});

router.post('/quota-groups', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'manager') { res.status(403).json(err('Manager role required')); return; }

  const v = validateGroupBody(req.body as Record<string, unknown>);
  if (!v.ok) { res.status(400).json(err(v.msg)); return; }

  const nextOrderRow = await query<{ next_order: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM quota_groups`
  );
  const sort_order = v.data.sort_order ?? nextOrderRow[0]?.next_order ?? 1;

  try {
    const inserted = await query<QuotaGroupRow>(
      `INSERT INTO quota_groups (name, rule_type, rule_value, target_amount, sort_order)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       RETURNING id, name, rule_type, rule_value, target_amount, sort_order`,
      [v.data.name, v.data.rule_type, JSON.stringify(v.data.rule_value), v.data.target_amount, sort_order]
    );
    res.json(ok(inserted[0]));
  } catch (e) {
    const msg = (e as Error).message || 'Failed to create quota group';
    if (msg.includes('quota_groups_name_key')) {
      res.status(409).json(err(`A quota group named "${v.data.name}" already exists`));
      return;
    }
    res.status(500).json(err(msg));
  }
});

router.patch('/quota-groups/:id', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'manager') { res.status(403).json(err('Manager role required')); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid id')); return; }

  const existing = await query<QuotaGroupRow>(
    `SELECT id, name, rule_type, rule_value, target_amount, sort_order FROM quota_groups WHERE id = $1`,
    [id]
  );
  if (existing.length === 0) { res.status(404).json(err('Quota group not found')); return; }

  // Merge body onto existing for partial update
  const merged = {
    name: req.body.name ?? existing[0].name,
    rule_type: req.body.rule_type ?? existing[0].rule_type,
    rule_value: req.body.rule_value ?? existing[0].rule_value,
    target_amount: req.body.target_amount ?? existing[0].target_amount,
    sort_order: req.body.sort_order ?? existing[0].sort_order,
  };
  const v = validateGroupBody(merged as Record<string, unknown>);
  if (!v.ok) { res.status(400).json(err(v.msg)); return; }

  try {
    const updated = await query<QuotaGroupRow>(
      `UPDATE quota_groups
       SET name = $1, rule_type = $2, rule_value = $3::jsonb,
           target_amount = $4, sort_order = $5, updated_at = now()
       WHERE id = $6
       RETURNING id, name, rule_type, rule_value, target_amount, sort_order`,
      [v.data.name, v.data.rule_type, JSON.stringify(v.data.rule_value),
       v.data.target_amount, merged.sort_order, id]
    );
    res.json(ok(updated[0]));
  } catch (e) {
    const msg = (e as Error).message || 'Failed to update quota group';
    if (msg.includes('quota_groups_name_key')) {
      res.status(409).json(err(`A quota group named "${v.data.name}" already exists`));
      return;
    }
    res.status(500).json(err(msg));
  }
});

router.delete('/quota-groups/:id', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'manager') { res.status(403).json(err('Manager role required')); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json(err('Invalid id')); return; }

  await query(`DELETE FROM quota_groups WHERE id = $1`, [id]);
  res.json(ok({ deleted: id }));
});

// ── Quarterly quota targets ─────────────────────────────────────────────────
// Targets are stored per (group, fiscal_year, quarter). A blank quarter falls
// back to annual / 4 in readers — null means "not set", 0 means "explicitly
// zero". The PUT endpoint replaces all four quarters for the given FY in one
// transaction so the FY row in the UI is always coherent.

const FY_RE = /^FY\d{4}$/;

router.put('/quota-groups/:id/quarterly/:fy', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'manager') { res.status(403).json(err('Manager role required')); return; }

  const groupId = parseInt(req.params.id);
  if (isNaN(groupId)) { res.status(400).json(err('Invalid group id')); return; }

  const fy = req.params.fy;
  if (!FY_RE.test(fy)) { res.status(400).json(err('fiscal_year must look like FY2026')); return; }

  const groupExists = await query<{ id: number }>(`SELECT id FROM quota_groups WHERE id = $1`, [groupId]);
  if (groupExists.length === 0) { res.status(404).json(err('Quota group not found')); return; }

  const body = req.body as { q1?: unknown; q2?: unknown; q3?: unknown; q4?: unknown };
  const parsed: { quarter: number; value: number | null }[] = [];
  for (const q of [1, 2, 3, 4] as const) {
    const raw = body[`q${q}` as 'q1' | 'q2' | 'q3' | 'q4'];
    if (raw === null || raw === undefined || raw === '') {
      parsed.push({ quarter: q, value: null });
      continue;
    }
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (!isFinite(n) || n < 0) {
      res.status(400).json(err(`Q${q} must be a non-negative number or null`));
      return;
    }
    parsed.push({ quarter: q, value: n });
  }

  try {
    await withTransaction(async (client) => {
      for (const { quarter, value } of parsed) {
        if (value === null) {
          await client.query(
            `DELETE FROM quota_group_quarterly_targets
             WHERE quota_group_id = $1 AND fiscal_year = $2 AND quarter = $3`,
            [groupId, fy, quarter]
          );
        } else {
          await client.query(
            `INSERT INTO quota_group_quarterly_targets (quota_group_id, fiscal_year, quarter, target_amount)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (quota_group_id, fiscal_year, quarter)
             DO UPDATE SET target_amount = EXCLUDED.target_amount, updated_at = now()`,
            [groupId, fy, quarter, value]
          );
        }
      }
    });
  } catch (e) {
    res.status(500).json(err((e as Error).message || 'Failed to save quarterly targets'));
    return;
  }

  const rows = await query<QuarterlyTargetRow>(
    `SELECT quota_group_id, fiscal_year, quarter, target_amount
     FROM quota_group_quarterly_targets
     WHERE quota_group_id = $1 AND fiscal_year = $2`,
    [groupId, fy]
  );
  const cell = { q1: null as string | null, q2: null as string | null, q3: null as string | null, q4: null as string | null };
  for (const r of rows) {
    cell[`q${r.quarter}` as 'q1' | 'q2' | 'q3' | 'q4'] = r.target_amount;
  }
  res.json(ok({ quota_group_id: groupId, fiscal_year: fy, ...cell }));
});

router.delete('/quota-groups/:id/quarterly/:fy', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'manager') { res.status(403).json(err('Manager role required')); return; }

  const groupId = parseInt(req.params.id);
  if (isNaN(groupId)) { res.status(400).json(err('Invalid group id')); return; }

  const fy = req.params.fy;
  if (!FY_RE.test(fy)) { res.status(400).json(err('fiscal_year must look like FY2026')); return; }

  await query(
    `DELETE FROM quota_group_quarterly_targets
     WHERE quota_group_id = $1 AND fiscal_year = $2`,
    [groupId, fy]
  );
  res.json(ok({ quota_group_id: groupId, fiscal_year: fy, cleared: true }));
});

// ── Role-based page access ──────────────────────────────────────────────────

const VALID_ROLES = ['manager', 'se', 'viewer'] as const;

/* GET /settings/role-access — admin only: return all mappings */
router.get('/role-access', auth, admin, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<{ page_key: string; role: string }>(
    `SELECT page_key, role FROM role_page_access ORDER BY page_key, role`
  );
  res.json(ok(rows));
});

/* PUT /settings/role-access — admin only: bulk replace all mappings */
router.put('/role-access', auth, admin, async (req: Request, res: Response): Promise<void> => {
  const { mappings } = req.body as { mappings?: { page_key: string; role: string }[] };
  if (!Array.isArray(mappings)) {
    res.status(400).json(err('mappings must be an array of { page_key, role }'));
    return;
  }

  for (const m of mappings) {
    if (!m.page_key || !VALID_ROLES.includes(m.role as typeof VALID_ROLES[number])) {
      res.status(400).json(err(`Invalid mapping: page_key="${m.page_key}" role="${m.role}"`));
      return;
    }
  }

  try {
    await query('BEGIN');
    await query('DELETE FROM role_page_access');
    if (mappings.length > 0) {
      const values = mappings.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
      const params = mappings.flatMap(m => [m.page_key, m.role]);
      await query(`INSERT INTO role_page_access (page_key, role) VALUES ${values} ON CONFLICT DO NOTHING`, params);
    }
    await query('COMMIT');
    res.json(ok({ updated: mappings.length }));
  } catch (e) {
    await query('ROLLBACK').catch(() => {});
    res.status(500).json(err((e as Error).message || 'Failed to update role access'));
  }
});

/* GET /settings/role-access/me — authenticated: return page_keys for current user's role */
router.get('/role-access/me', auth, async (req: Request, res: Response): Promise<void> => {
  const { role } = (req as AuthenticatedRequest).user;
  const rows = await query<{ page_key: string }>(
    `SELECT page_key FROM role_page_access WHERE role = $1 ORDER BY page_key`,
    [role]
  );
  res.json(ok(rows.map(r => r.page_key)));
});

export default router;
