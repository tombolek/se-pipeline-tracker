/**
 * App backup — JSON snapshot of every admin-editable table whose state is
 * hand-authored (not derivable from Salesforce imports or AI generations).
 *
 * Two callers:
 *   - User-triggered: routes/backup.ts → POST /api/v1/backup
 *   - Scheduled:      routes/backup.ts → POST /api/v1/backup/run-scheduled
 *                     (called once a day by an EventBridge-scheduled Lambda)
 *
 * The actual scheduling lives in CDK (infra/lib/stack.ts → EventBridge rule
 * + Lambda), not in this process. The previous in-process setTimeout
 * scheduler in services/backupScheduler.ts was retired once the Lambda
 * path was validated end-to-end.
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { query } from '../db/index.js';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';
const s3 = new S3Client({ region: REGION });

export async function createAppBackup(createdBy: string): Promise<{ s3Key: string; counts: Record<string, number> }> {
  const bucket = process.env.APP_BACKUP_BUCKET;
  if (!bucket) throw new Error('APP_BACKUP_BUCKET not configured');

  // Snapshot every admin-editable table whose state is hand-authored (not
  // derivable from Salesforce imports or AI generations). agent_prompt_versions
  // is included for audit portability but the restore path currently doesn't
  // rebuild version history — it creates a single "Restored from backup"
  // marker instead (see routes/backup.ts). See docs for the full list of
  // covered and intentionally-omitted tables.
  const [
    users, tasks, notes, assignments,
    agents, agentPromptVersions, templates,
    dealInfoConfig, quotaGroups, rolePageAccess, oppTechDiscovery,
  ] = await Promise.all([
    query(`
      SELECT id, email, name, role, is_active, show_qualify, force_password_change,
             manager_id, teams, created_at
      FROM users WHERE is_deleted = false ORDER BY role DESC, id ASC
    `),
    query(`
      SELECT id, opportunity_id, title, description, status, is_next_step,
             due_date, assigned_to_id, created_by_id, is_deleted, created_at, updated_at
      FROM tasks
    `),
    query(`
      SELECT id, opportunity_id, author_id, content, created_at FROM notes
    `),
    query(`
      SELECT o.sf_opportunity_id, u.email AS se_email
      FROM opportunities o
      JOIN users u ON u.id = o.se_owner_id
      WHERE o.se_owner_id IS NOT NULL AND o.is_active = true
    `),
    query(`
      SELECT id, feature, name, description, default_model, default_max_tokens,
             is_enabled, log_io, system_prompt_extra, prompt_template,
             active_version_id, created_at, updated_at
      FROM agents ORDER BY id ASC
    `),
    query(`
      SELECT id, agent_id, system_prompt_extra, prompt_template, default_model,
             default_max_tokens, is_enabled, log_io, note, created_at,
             created_by_user_id
      FROM agent_prompt_versions ORDER BY id ASC
    `),
    query(`
      SELECT id, kind, name, description, body, items, stage, is_deleted,
             created_by_id, created_at, updated_at
      FROM templates ORDER BY id ASC
    `),
    query(`SELECT id, config, updated_by, updated_at FROM deal_info_config`),
    query(`
      SELECT id, name, rule_type, rule_value, target_amount, sort_order,
             created_at, updated_at
      FROM quota_groups ORDER BY sort_order, id
    `),
    query(`SELECT page_key, role FROM role_page_access`),
    query(`
      SELECT opportunity_id, current_incumbent_solutions, tier1_integrations,
             data_details_and_users, ingestion_sources, planned_ingestion_sources,
             data_cleansing_remediation, deployment_preference, technical_constraints,
             open_technical_requirements, tech_stack, enterprise_systems, existing_dmg,
             updated_by_id, created_at, updated_at
      FROM opportunity_tech_discovery
    `),
  ]);

  const backup = {
    // v2 — added agents, agent_prompt_versions, templates, deal_info_config,
    // quota_groups, role_page_access, opportunity_tech_discovery. The restore
    // route still accepts v1 backups (missing keys default to []).
    version: 2,
    created_at: new Date().toISOString(),
    created_by: createdBy,
    users,
    tasks,
    notes,
    se_assignments: assignments,
    agents,
    agent_prompt_versions: agentPromptVersions,
    templates,
    deal_info_config: dealInfoConfig,
    quota_groups: quotaGroups,
    role_page_access: rolePageAccess,
    opportunity_tech_discovery: oppTechDiscovery,
  };

  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const s3Key = `app-backups/${ts}_${createdBy}.json`;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: JSON.stringify(backup, null, 2),
    ContentType: 'application/json',
  }));

  return {
    s3Key,
    counts: {
      users: users.length,
      tasks: tasks.length,
      notes: notes.length,
      se_assignments: assignments.length,
      agents: agents.length,
      agent_prompt_versions: agentPromptVersions.length,
      templates: templates.length,
      deal_info_config: dealInfoConfig.length,
      quota_groups: quotaGroups.length,
      role_page_access: rolePageAccess.length,
      opportunity_tech_discovery: oppTechDiscovery.length,
    },
  };
}
