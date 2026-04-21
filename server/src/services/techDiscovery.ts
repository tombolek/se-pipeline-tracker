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
  initiatives: Record<string, unknown>;
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
  initiatives?: Record<string, unknown>;
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

const JSONB_FIELDS = ['initiatives', 'tech_stack', 'enterprise_systems', 'existing_dmg'] as const;

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
            initiatives, tech_stack, enterprise_systems, existing_dmg,
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
              initiatives, tech_stack, enterprise_systems, existing_dmg,
              updated_by_id, created_at, updated_at
  `;

  const rows = await query<TechDiscovery>(sql, params);
  return rows[0];
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
    initiatives: {},
    tech_stack: {},
    enterprise_systems: {},
    existing_dmg: {},
    updated_by_id: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}
