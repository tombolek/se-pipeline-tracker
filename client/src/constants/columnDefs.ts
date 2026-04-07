/**
 * Column definitions for the configurable column visibility feature (Issue #8).
 *
 * - ALL_COLUMNS: every displayable column across all list pages
 * - DEFAULT_COLUMNS: the out-of-box visible columns per page
 * - getColumnsForPage: merges saved prefs with defaults
 */

export interface ColumnDef {
  /** Field key — matches the opportunity object property (or a virtual key) */
  key: string;
  /** Human-readable column header */
  label: string;
  /** Group label shown in the ColumnPicker popover */
  group: string;
  /**
   * Long-text fields that should be truncated in a table cell with a tooltip.
   * The cell renderer in each page is responsible for applying truncation.
   */
  truncate?: boolean;
}

// ─── Column Groups ────────────────────────────────────────────────────────────

export const COLUMN_GROUPS = [
  'Deal Info',
  'Financials',
  'Ownership',
  'Activity',
  'MEDDPICC',
  'PoC',
  'RFx',
  'Partners',
] as const;

export type ColumnGroup = (typeof COLUMN_GROUPS)[number];

// ─── All Columns ──────────────────────────────────────────────────────────────

export const ALL_COLUMNS: ColumnDef[] = [
  // ── Deal Info ──────────────────────────────────────────────────────────────
  { key: 'name',              label: 'Opportunity Name',   group: 'Deal Info' },
  { key: 'account_name',      label: 'Account Name',       group: 'Deal Info' },
  { key: 'account_segment',   label: 'Account Segment',    group: 'Deal Info' },
  { key: 'account_industry',  label: 'Account Industry',   group: 'Deal Info' },
  { key: 'stage',             label: 'Stage',              group: 'Deal Info' },
  { key: 'record_type',       label: 'Record Type',        group: 'Deal Info' },
  { key: 'key_deal',          label: 'Key Deal',           group: 'Deal Info' },
  { key: 'close_date',        label: 'Close Date',         group: 'Deal Info' },
  { key: 'close_month',       label: 'Close Month',        group: 'Deal Info' },
  { key: 'fiscal_period',     label: 'Fiscal Period',      group: 'Deal Info' },
  { key: 'fiscal_year',       label: 'Fiscal Year',        group: 'Deal Info' },
  { key: 'deploy_mode',       label: 'Deploy Mode',        group: 'Deal Info' },
  { key: 'deploy_location',   label: 'Deploy Location',    group: 'Deal Info' },
  { key: 'sales_plays',       label: 'Sales Plays',        group: 'Deal Info', truncate: true },

  // ── Financials ─────────────────────────────────────────────────────────────
  { key: 'arr',               label: 'ARR',                group: 'Financials' },
  { key: 'arr_currency',      label: 'ARR Currency',       group: 'Financials' },
  { key: 'arr_converted',     label: 'ARR (Converted)',    group: 'Financials' },

  // ── Ownership ──────────────────────────────────────────────────────────────
  { key: 'ae_owner_name',     label: 'AE Owner',           group: 'Ownership' },
  { key: 'se_owner',          label: 'SE Owner',           group: 'Ownership' },
  { key: 'team',              label: 'Team',               group: 'Ownership' },
  { key: 'lead_source',       label: 'Lead Source',        group: 'Ownership' },
  { key: 'opportunity_source',label: 'Opportunity Source', group: 'Ownership' },
  { key: 'channel_source',    label: 'Channel Source',     group: 'Ownership' },
  { key: 'biz_dev',           label: 'BizDev',             group: 'Ownership' },

  // ── Activity ───────────────────────────────────────────────────────────────
  { key: 'health_score',           label: 'Health Score',        group: 'Activity' },
  { key: 'open_task_count',        label: 'Open Tasks',          group: 'Activity' },
  { key: 'se_comments_freshness',  label: 'SE Comments',         group: 'Activity' },
  { key: 'next_step_sf',           label: 'Next Step',           group: 'Activity', truncate: true },
  { key: 'manager_comments',       label: 'Manager Comments',    group: 'Activity', truncate: true },
  { key: 'se_comments',            label: 'SE Comments (text)',  group: 'Activity', truncate: true },
  { key: 'psm_comments',           label: 'PSM Comments',        group: 'Activity', truncate: true },
  { key: 'technical_blockers',     label: 'Technical Blockers',  group: 'Activity', truncate: true },
  { key: 'engaged_competitors',    label: 'Engaged Competitors', group: 'Activity', truncate: true },

  // ── MEDDPICC ───────────────────────────────────────────────────────────────
  { key: 'budget',            label: 'Budget',             group: 'MEDDPICC', truncate: true },
  { key: 'authority',         label: 'Authority',          group: 'MEDDPICC', truncate: true },
  { key: 'need',              label: 'Need',               group: 'MEDDPICC', truncate: true },
  { key: 'timeline',          label: 'Timeline',           group: 'MEDDPICC', truncate: true },
  { key: 'metrics',           label: 'Metrics',            group: 'MEDDPICC', truncate: true },
  { key: 'economic_buyer',    label: 'Economic Buyer',     group: 'MEDDPICC', truncate: true },
  { key: 'decision_criteria', label: 'Decision Criteria',  group: 'MEDDPICC', truncate: true },
  { key: 'decision_process',  label: 'Decision Process',   group: 'MEDDPICC', truncate: true },
  { key: 'paper_process',     label: 'Paper Process',      group: 'MEDDPICC', truncate: true },
  { key: 'implicate_pain',    label: 'Implicate Pain',     group: 'MEDDPICC', truncate: true },
  { key: 'champion',          label: 'Champion',           group: 'MEDDPICC', truncate: true },
  { key: 'agentic_qual',      label: 'Agentic Qual',       group: 'MEDDPICC', truncate: true },

  // ── PoC ────────────────────────────────────────────────────────────────────
  { key: 'poc_status',        label: 'PoC Status',         group: 'PoC' },
  { key: 'poc_start_date',    label: 'PoC Start Date',     group: 'PoC' },
  { key: 'poc_end_date',      label: 'PoC End Date',       group: 'PoC' },
  { key: 'poc_type',          label: 'PoC Type',           group: 'PoC' },
  { key: 'poc_deploy_type',   label: 'PoC Deploy Type',    group: 'PoC' },

  // ── RFx ────────────────────────────────────────────────────────────────────
  { key: 'rfx_status',        label: 'RFx Status',         group: 'RFx' },

  // ── Partners ───────────────────────────────────────────────────────────────
  { key: 'sourcing_partner',      label: 'Sourcing Partner',      group: 'Partners' },
  { key: 'sourcing_partner_tier', label: 'Sourcing Partner Tier', group: 'Partners' },
  { key: 'influencing_partner',   label: 'Influencing Partner',   group: 'Partners' },
  { key: 'partner_manager',       label: 'Partner Manager',       group: 'Partners' },
];

/** Quick lookup: key → ColumnDef */
export const COLUMN_BY_KEY = Object.fromEntries(
  ALL_COLUMNS.map(c => [c.key, c])
) as Record<string, ColumnDef>;

// ─── Per-page Defaults ────────────────────────────────────────────────────────

export const DEFAULT_COLUMNS = {
  pipeline: [
    'name',
    'account_name',
    'stage',
    'arr',
    'close_date',
    'ae_owner_name',
    'se_owner',
    'open_task_count',
    'se_comments_freshness',
    'health_score',
  ],
  closed_lost: [
    'name',
    'account_name',
    'stage',
    'arr',
    'ae_owner_name',
    'se_owner',
    'closed_at',
  ],
  se_mapping: [
    'name',
    'account_name',
    'stage',
    'arr',
    'close_date',
    'ae_owner_name',
    'se_owner',
    'se_comments_freshness',
  ],
} as const satisfies Record<string, string[]>;

export type PageKey = keyof typeof DEFAULT_COLUMNS;

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Returns the effective visible column keys for a given page,
 * merging saved user prefs with defaults.
 *
 * - If saved prefs exist for this page, use them as-is.
 * - Otherwise fall back to DEFAULT_COLUMNS[page].
 */
export function getColumnsForPage(
  page: PageKey,
  savedPrefs: { pipeline?: string[]; closed_lost?: string[]; se_mapping?: string[] } | null | undefined
): string[] {
  return savedPrefs?.[page] ?? [...DEFAULT_COLUMNS[page]];
}
