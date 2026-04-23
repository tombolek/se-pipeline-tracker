/**
 * Agents service — first-class registry for AI features.
 *
 * Each `feature` string used in callAnthropic() / runAiJob() has a matching row
 * in `agents`. Admins can view, edit, and track history of per-agent settings
 * through the settings/agents UI.
 *
 * A small in-process cache sits in front of the DB read path because
 * getAgentByFeature() is called on every AI request; we invalidate the cache
 * on every write in this module, and auto-expire each entry after 60s so a
 * direct DB update still surfaces within a minute.
 */

import { query, queryOne } from '../db/index.js';
import { AGENT_TEMPLATES } from './agentTemplates.js';

export interface Agent {
  id: number;
  feature: string;
  name: string;
  description: string;
  default_model: string;
  default_max_tokens: number;
  is_enabled: boolean;
  log_io: boolean;
  system_prompt_extra: string;
  prompt_template: string | null;
  active_version_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgentPromptVersion {
  id: number;
  agent_id: number;
  system_prompt_extra: string;
  prompt_template: string | null;
  default_model: string;
  default_max_tokens: number;
  is_enabled: boolean;
  log_io: boolean;
  note: string | null;
  created_at: string;
  created_by_user_id: number | null;
  created_by_name?: string | null; // joined in listVersionsForAgent()
}

const CACHE_TTL_MS = 60_000;
type CacheEntry = { agent: Agent; fetchedAt: number };
const cache = new Map<string, CacheEntry>();

function cacheGet(feature: string): Agent | null {
  const hit = cache.get(feature);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > CACHE_TTL_MS) {
    cache.delete(feature);
    return null;
  }
  return hit.agent;
}

function cacheSet(agent: Agent): void {
  cache.set(agent.feature, { agent, fetchedAt: Date.now() });
}

export function invalidateAgentsCache(): void {
  cache.clear();
}

/** Called by callAnthropic() on every AI request. Fast path: cache hit. */
export async function getAgentByFeature(feature: string): Promise<Agent | null> {
  const hit = cacheGet(feature);
  if (hit) return hit;
  const row = await queryOne<Agent>(`SELECT * FROM agents WHERE feature = $1`, [feature]);
  if (row) cacheSet(row);
  return row;
}

export async function listAgents(): Promise<Agent[]> {
  return query<Agent>(`SELECT * FROM agents ORDER BY name ASC`);
}

export async function getAgentById(id: number): Promise<Agent | null> {
  return queryOne<Agent>(`SELECT * FROM agents WHERE id = $1`, [id]);
}

export interface AgentSettingsInput {
  default_model?: string;
  default_max_tokens?: number;
  is_enabled?: boolean;
  log_io?: boolean;
  system_prompt_extra?: string;
  prompt_template?: string;
  note?: string | null;
}

/**
 * Apply a settings change to an agent. Creates a new agent_prompt_versions row
 * capturing the resulting state and updates `agents.active_version_id`. The
 * caller passes `updatedByUserId` so version history can show who made the
 * change. Returns the updated agent.
 */
export async function updateAgentSettings(
  id: number,
  input: AgentSettingsInput,
  updatedByUserId: number | null,
): Promise<Agent> {
  const current = await getAgentById(id);
  if (!current) throw new Error(`Agent ${id} not found`);

  const next = {
    default_model: input.default_model ?? current.default_model,
    default_max_tokens: input.default_max_tokens ?? current.default_max_tokens,
    is_enabled: input.is_enabled ?? current.is_enabled,
    log_io: input.log_io ?? current.log_io,
    system_prompt_extra: input.system_prompt_extra ?? current.system_prompt_extra,
    prompt_template: input.prompt_template ?? current.prompt_template,
  };

  // Guard: max_tokens must be sane. Anthropic caps are well above this, but an
  // accidental 0 / negative / huge number would brick every invocation of the
  // agent or blow out response bills. 100..16000 is generous.
  if (next.default_max_tokens < 100 || next.default_max_tokens > 16000) {
    throw new Error('default_max_tokens must be between 100 and 16000');
  }

  const version = await queryOne<AgentPromptVersion>(
    `INSERT INTO agent_prompt_versions
       (agent_id, system_prompt_extra, prompt_template, default_model, default_max_tokens, is_enabled, log_io, note, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      next.system_prompt_extra,
      next.prompt_template,
      next.default_model,
      next.default_max_tokens,
      next.is_enabled,
      next.log_io,
      input.note ?? null,
      updatedByUserId,
    ],
  );

  const updated = await queryOne<Agent>(
    `UPDATE agents
     SET default_model       = $2,
         default_max_tokens  = $3,
         is_enabled          = $4,
         log_io              = $5,
         system_prompt_extra = $6,
         prompt_template     = $7,
         active_version_id   = $8,
         updated_at          = now()
     WHERE id = $1
     RETURNING *`,
    [id, next.default_model, next.default_max_tokens, next.is_enabled, next.log_io, next.system_prompt_extra, next.prompt_template, version!.id],
  );

  invalidateAgentsCache();
  return updated as Agent;
}

export async function listVersionsForAgent(agentId: number, limit = 50): Promise<AgentPromptVersion[]> {
  return query<AgentPromptVersion>(
    `SELECT v.*, u.name AS created_by_name
     FROM agent_prompt_versions v
     LEFT JOIN users u ON u.id = v.created_by_user_id
     WHERE v.agent_id = $1
     ORDER BY v.created_at DESC, v.id DESC
     LIMIT $2`,
    [agentId, limit],
  );
}

/**
 * On boot, fill in `agents.prompt_template` from the AGENT_TEMPLATES golden
 * baseline for any row that's still NULL. Also backfills the active
 * `agent_prompt_versions` row so the first "seeded" version has the template
 * text embedded — a future revert to that version is then fully specified.
 *
 * This intentionally only touches NULL rows. Once an admin edits a template
 * (even to an empty string ''), this will never overwrite it.
 *
 * Returns the number of agents that got seeded, for a boot log line.
 */
export async function seedMissingPromptTemplates(): Promise<number> {
  const rows = await query<{ id: number; feature: string; active_version_id: number | null }>(
    `SELECT id, feature, active_version_id FROM agents WHERE prompt_template IS NULL`,
  );
  if (rows.length === 0) return 0;

  let seeded = 0;
  for (const r of rows) {
    const tpl = AGENT_TEMPLATES[r.feature];
    if (!tpl) continue; // unknown feature — leave it NULL, will surface as AgentPromptMissingError

    await query(
      `UPDATE agents SET prompt_template = $2, updated_at = now() WHERE id = $1`,
      [r.id, tpl],
    );

    // Also backfill the initial "seeded" version row so version history
    // shows the template we just dropped in rather than NULL for v1.
    if (r.active_version_id != null) {
      await query(
        `UPDATE agent_prompt_versions SET prompt_template = $2 WHERE id = $1 AND prompt_template IS NULL`,
        [r.active_version_id, tpl],
      );
    }

    seeded++;
  }

  invalidateAgentsCache();
  return seeded;
}
