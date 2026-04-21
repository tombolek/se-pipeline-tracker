import { query, queryOne } from '../db/index.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface TechDiscovery {
  opportunity_id: number;
  current_incumbent_solutions: string | null;
  tier1_integrations: string | null;
  data_details_and_users: string | null;
  ingestion_sources: string | null;
  planned_ingestion_sources: string | null;
  data_cleansing_remediation: string | null;
  deployment_preference: string | null;
  technical_constraints: string | null;
  open_technical_requirements: string | null;
  tech_stack: Record<string, unknown>;
  enterprise_systems: Record<string, unknown>;
  existing_dmg: Record<string, unknown>;
  updated_by_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Patch shape — every field optional; missing fields stay unchanged server-side. */
export interface TechDiscoveryPatch {
  current_incumbent_solutions?: string | null;
  tier1_integrations?: string | null;
  data_details_and_users?: string | null;
  ingestion_sources?: string | null;
  planned_ingestion_sources?: string | null;
  data_cleansing_remediation?: string | null;
  deployment_preference?: string | null;
  technical_constraints?: string | null;
  open_technical_requirements?: string | null;
  tech_stack?: Record<string, unknown>;
  enterprise_systems?: Record<string, unknown>;
  existing_dmg?: Record<string, unknown>;
}

// ── Known keys (allow-list the text prose fields that are safe to patch) ────

const PROSE_FIELDS = [
  'current_incumbent_solutions',
  'tier1_integrations',
  'data_details_and_users',
  'ingestion_sources',
  'planned_ingestion_sources',
  'data_cleansing_remediation',
  'deployment_preference',
  'technical_constraints',
  'open_technical_requirements',
] as const;

const JSONB_FIELDS = ['tech_stack', 'enterprise_systems', 'existing_dmg'] as const;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch the tech discovery row for an opportunity, or null if one has never
 * been edited. Route handlers should substitute a default empty shape for the
 * null case before returning to the client.
 */
export async function getTechDiscovery(oppId: number): Promise<TechDiscovery | null> {
  return await queryOne<TechDiscovery>(
    `SELECT opportunity_id,
            current_incumbent_solutions, tier1_integrations, data_details_and_users,
            ingestion_sources, planned_ingestion_sources, data_cleansing_remediation,
            deployment_preference, technical_constraints, open_technical_requirements,
            tech_stack, enterprise_systems, existing_dmg,
            updated_by_id, created_at, updated_at
     FROM opportunity_tech_discovery
     WHERE opportunity_id = $1`,
    [oppId]
  );
}

/**
 * Partial update. Creates the row on first edit via INSERT … ON CONFLICT
 * DO UPDATE. Only fields present in `patch` are touched; everything else is
 * preserved. JSONB fields are replaced wholesale, not merged — the frontend
 * always sends the full object for those.
 */
export async function upsertTechDiscovery(
  oppId: number,
  patch: TechDiscoveryPatch,
  userId: number
): Promise<TechDiscovery> {
  // Build dynamic column list for the UPDATE side of ON CONFLICT.
  const setParts: string[] = ['updated_by_id = $2', 'updated_at = now()'];
  const insertCols: string[] = ['opportunity_id', 'updated_by_id'];
  const insertPlaceholders: string[] = ['$1', '$2'];
  const params: unknown[] = [oppId, userId];

  let idx = 3;
  for (const field of PROSE_FIELDS) {
    if (field in patch) {
      const value = (patch as Record<string, unknown>)[field];
      insertCols.push(field);
      insertPlaceholders.push(`$${idx}`);
      setParts.push(`${field} = $${idx}`);
      params.push(value ?? null);
      idx++;
    }
  }
  for (const field of JSONB_FIELDS) {
    if (field in patch) {
      const value = (patch as Record<string, unknown>)[field];
      insertCols.push(field);
      insertPlaceholders.push(`$${idx}::jsonb`);
      setParts.push(`${field} = $${idx}::jsonb`);
      params.push(JSON.stringify(value ?? {}));
      idx++;
    }
  }

  const sql = `
    INSERT INTO opportunity_tech_discovery (${insertCols.join(', ')})
    VALUES (${insertPlaceholders.join(', ')})
    ON CONFLICT (opportunity_id) DO UPDATE SET ${setParts.join(', ')}
    RETURNING opportunity_id,
              current_incumbent_solutions, tier1_integrations, data_details_and_users,
              ingestion_sources, planned_ingestion_sources, data_cleansing_remediation,
              deployment_preference, technical_constraints, open_technical_requirements,
              tech_stack, enterprise_systems, existing_dmg,
              updated_by_id, created_at, updated_at
  `;

  const rows = await query<TechDiscovery>(sql, params);
  return rows[0];
}

/**
 * Render the Tech Discovery row as a readable text block for AI prompts. Used
 * by Call Prep and Demo Prep so the model understands the customer's stack,
 * enterprise systems, existing DMG tools, and discovery-notes prose.
 * Empty sections are omitted; returns a "none captured" sentinel when the row
 * has no content at all.
 */
export function formatTechDiscoveryForPrompt(td: TechDiscovery | null): string {
  if (!td) return '(No Tech Discovery captured yet.)';

  const stack = (td.tech_stack ?? {}) as Record<string, unknown>;
  const stackLabels: Array<[string, string]> = [
    ['data_infrastructure', 'Data Infrastructure'],
    ['data_lake', 'Data Lake'],
    ['data_lake_metastore', 'Data Lake Metastore'],
    ['data_warehouse', 'Data Warehouse'],
    ['database', 'Database'],
    ['datalake_processing', 'Datalake Processing'],
    ['etl', 'ETL/ELT/Ingestion'],
    ['business_intelligence', 'Business Intelligence'],
    ['nosql', 'NoSQL'],
    ['streaming', 'Streaming'],
  ];
  const stackLines = stackLabels
    .map(([k, label]) => {
      const sel = Array.isArray(stack[k]) ? (stack[k] as string[]) : [];
      return sel.length ? `  ${label}: ${sel.join(', ')}` : null;
    })
    .filter((x): x is string => x !== null);

  const es = (td.enterprise_systems ?? {}) as Record<string, string>;
  const esLabels: Array<[string, string]> = [
    ['crm', 'CRM'], ['erp', 'ERP'], ['finance', 'Finance'], ['hr', 'HR'],
    ['claims', 'Claims'], ['marketing', 'Marketing'], ['procurement', 'Procurement'],
    ['inventory_management', 'Inventory Mgmt'], ['order_management', 'Order Mgmt'],
  ];
  const esLines = esLabels
    .map(([k, label]) => (es[k]?.trim() ? `  ${label}: ${es[k]}` : null))
    .filter((x): x is string => x !== null);

  const dmg = (td.existing_dmg ?? {}) as Record<string, string>;
  const dmgLabels: Array<[string, string]> = [
    ['catalog', 'Catalog'], ['dq', 'DQ'], ['mdm', 'MDM'], ['lineage', 'Lineage'],
  ];
  const dmgLines = dmgLabels
    .map(([k, label]) => (dmg[k]?.trim() ? `  ${label}: ${dmg[k]}` : null))
    .filter((x): x is string => x !== null);

  const proseLabels: Array<[keyof TechDiscovery, string]> = [
    ['current_incumbent_solutions', 'Current & Incumbent Solutions'],
    ['tier1_integrations', 'Priority (Tier 1) Integrations'],
    ['data_details_and_users', 'Data Details & Users'],
    ['ingestion_sources', 'Ingestion Sources'],
    ['planned_ingestion_sources', 'Planned Ingestion Sources'],
    ['data_cleansing_remediation', 'Data Cleansing & Remediation'],
    ['deployment_preference', 'Deployment Preference'],
    ['technical_constraints', 'Technical Constraints'],
    ['open_technical_requirements', 'Open Technical Requirements'],
  ];
  const proseLines = proseLabels
    .map(([k, label]) => {
      const v = (td[k] as string | null) ?? '';
      return v.trim() ? `  ${label}: ${v.trim()}` : null;
    })
    .filter((x): x is string => x !== null);

  const sections: string[] = [];
  if (stackLines.length) sections.push(`Technology Stack:\n${stackLines.join('\n')}`);
  if (esLines.length) sections.push(`Enterprise Systems:\n${esLines.join('\n')}`);
  if (dmgLines.length) sections.push(`Existing Data Mgmt & Governance tools:\n${dmgLines.join('\n')}`);
  if (proseLines.length) sections.push(`Discovery Notes:\n${proseLines.join('\n')}`);

  return sections.length ? sections.join('\n\n') : '(No Tech Discovery captured yet.)';
}

/**
 * Returns an empty TechDiscovery shape for an opp that has never been edited.
 * Keeps the client code simpler — it always gets the same shape back.
 */
export function emptyTechDiscovery(oppId: number): TechDiscovery {
  return {
    opportunity_id: oppId,
    current_incumbent_solutions: null,
    tier1_integrations: null,
    data_details_and_users: null,
    ingestion_sources: null,
    planned_ingestion_sources: null,
    data_cleansing_remediation: null,
    deployment_preference: null,
    technical_constraints: null,
    open_technical_requirements: null,
    tech_stack: {},
    enterprise_systems: {},
    existing_dmg: {},
    updated_by_id: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}
