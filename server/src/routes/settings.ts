import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;

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
        { key: 'team', label: 'Team', source: 'column' },
        { key: 'record_type', label: 'Record Type', source: 'column' },
        { key: 'deploy_mode', label: 'Deploy', source: 'column' },
        { key: 'poc_status', label: 'PoC Status', source: 'column' },
        { key: 'rfx_status', label: 'RFx Status', source: 'column' },
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
    const result = await query('SELECT config FROM deal_info_config WHERE id = 1');
    const config = result.rows.length > 0 ? result.rows[0].config : DEFAULT_CONFIG;

    // Gather sf_raw_fields keys across all opps for the "add field" picker
    let sfRawKeys: string[] = [];
    try {
      const rawResult = await query(`
        SELECT DISTINCT k AS key
        FROM opportunities, LATERAL jsonb_object_keys(COALESCE(sf_raw_fields, '{}')) AS k
        ORDER BY k
        LIMIT 200
      `);
      sfRawKeys = rawResult.rows.map((r: { key: string }) => r.key);
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
      [JSON.stringify(config), user.id]
    );

    // Audit log
    try {
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, details, timestamp)
         VALUES ($1, 'update', 'deal_info_config', $2, now())`,
        [user.id, JSON.stringify({ sections_count: config.sections.length })]
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
      [JSON.stringify(DEFAULT_CONFIG), user.id]
    );
    res.json(ok({ config: DEFAULT_CONFIG }));
  } catch (error) {
    console.error('Failed to reset deal info config:', error);
    res.status(500).json(err('Failed to reset configuration'));
  }
});

export default router;
