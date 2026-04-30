import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { Client } from 'pg';
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';
import { createAppBackup } from '../services/createAppBackup.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const mgr  = requireManager as unknown as (req: Request, res: Response, next: () => void) => void;

const REGION = process.env.AWS_REGION ?? 'eu-west-1';
const s3 = new S3Client({ region: REGION });

function getBucket(): string | null {
  return process.env.APP_BACKUP_BUCKET ?? null;
}

// ── POST / — generate backup and upload to S3 ─────────────────────────────────
router.post('/', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const bucket = getBucket();
  if (!bucket) { res.status(503).json(err('APP_BACKUP_BUCKET not configured')); return; }

  const actor = (req as AuthenticatedRequest).user;

  try {
    const { s3Key, counts } = await createAppBackup(actor.email);

    await logAudit(req, {
      userId: actor.userId, userRole: actor.role,
      action: 'BACKUP_CREATED', resourceType: 'backup',
      resourceId: s3Key, resourceName: s3Key,
      after: counts,
      success: true,
    });

    res.json(ok({ s3_key: s3Key }));
  } catch (e) {
    console.error('[backup] create error:', e);
    res.status(500).json(err(e instanceof Error ? e.message : 'Backup failed'));
  }
});

// ── POST /run-scheduled — machine-only backup trigger ─────────────────────────
//
// Called by the EventBridge-scheduled Lambda once a day. Replaces the
// in-process setTimeout scheduler in services/backupScheduler.ts which
// duplicated/lost backups on rolling deploys and multi-replica deploys.
//
// Auth is a shared secret in the X-Backup-Trigger-Secret header (constant-
// time compared against BACKUP_TRIGGER_SECRET). NO JWT — the Lambda has no
// user. Both env vars are populated at deploy time:
//   - server: deploy.sh writes BACKUP_TRIGGER_SECRET into /app/.env.prod
//             from SSM Parameter Store
//   - Lambda: CDK injects the same value as a Lambda env var, also from SSM
function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  // Length-mismatch leaks only the secret length, which is fixed and high-
  // entropy on our side — acceptable trade-off, standard pattern.
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

router.post('/run-scheduled', async (req: Request, res: Response): Promise<void> => {
  const expected = process.env.BACKUP_TRIGGER_SECRET;
  if (!expected) {
    console.error('[scheduled-backup] BACKUP_TRIGGER_SECRET not configured — refusing to run');
    res.status(503).json(err('Scheduled backup endpoint not configured on this server'));
    return;
  }

  const provided = req.header('x-backup-trigger-secret') ?? '';
  if (!constantTimeEqual(expected, provided)) {
    console.warn('[scheduled-backup] denied: header missing or mismatched');
    res.status(401).json(err('Invalid or missing X-Backup-Trigger-Secret'));
    return;
  }

  const bucket = getBucket();
  if (!bucket) {
    console.error('[scheduled-backup] APP_BACKUP_BUCKET not configured');
    res.status(503).json(err('APP_BACKUP_BUCKET not configured'));
    return;
  }

  console.log('[scheduled-backup] triggered — starting backup');
  const startedAt = Date.now();
  try {
    const { s3Key, counts } = await createAppBackup('scheduled');
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[scheduled-backup] complete in ${elapsedSec}s → ${s3Key}`, counts);
    res.json(ok({ s3_key: s3Key, counts, elapsed_sec: elapsedSec }));
  } catch (e) {
    console.error('[scheduled-backup] failed:', e);
    res.status(500).json(err(e instanceof Error ? e.message : 'Scheduled backup failed'));
  }
});

// ── GET / — list S3 backups ───────────────────────────────────────────────────
router.get('/', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const bucket = getBucket();
  if (!bucket) { res.status(503).json(err('APP_BACKUP_BUCKET not configured')); return; }

  const result = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: 'app-backups/',
  }));

  const backups = (result.Contents ?? [])
    .filter(obj => obj.Key && obj.Key !== 'app-backups/')
    .map(obj => {
      // Key: app-backups/YYYY-MM-DDTHH-MM-SS_user@domain.com.json
      const filename = obj.Key!.split('/').pop() ?? '';
      const withoutExt = filename.replace(/\.json$/, '');
      // timestamp is exactly 19 chars: YYYY-MM-DDTHH-MM-SS
      const createdBy = withoutExt.length > 20 ? withoutExt.slice(20) : '';
      return {
        key: obj.Key!,
        size: obj.Size ?? 0,
        last_modified: obj.LastModified?.toISOString() ?? '',
        created_by: createdBy,
      };
    })
    .sort((a, b) => b.last_modified.localeCompare(a.last_modified));

  res.json(ok(backups));
});

// ── GET /download?key=... — proxy S3 object to client ────────────────────────
router.get('/download', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const bucket = getBucket();
  if (!bucket) { res.status(503).json(err('APP_BACKUP_BUCKET not configured')); return; }

  const key = req.query.key as string;
  if (!key || !key.startsWith('app-backups/')) {
    res.status(400).json(err('Invalid backup key')); return;
  }

  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const filename = key.split('/').pop() ?? 'backup.json';

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  (result.Body as NodeJS.ReadableStream).pipe(res);
});

// ── POST /restore — restore from S3 key or uploaded JSON ─────────────────────
router.post('/restore', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const bucket = getBucket();
  const actor = (req as AuthenticatedRequest).user;

  // Load backup from S3 key or from request body directly
  let backup: Record<string, unknown>;
  if (req.body.s3_key) {
    if (!bucket) { res.status(503).json(err('APP_BACKUP_BUCKET not configured')); return; }
    const key = req.body.s3_key as string;
    if (!key.startsWith('app-backups/')) { res.status(400).json(err('Invalid backup key')); return; }
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    backup = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } else if (req.body.backup) {
    backup = req.body.backup as Record<string, unknown>;
  } else {
    res.status(400).json(err('Provide s3_key or backup object')); return;
  }

  // Validate structure. Any missing key is defaulted to [] so a v1 backup
  // (pre-agents/templates/etc.) still restores cleanly on a v2 server.
  const backupUsers         = (backup.users                       as unknown[]) ?? [];
  const backupTasks         = (backup.tasks                       as unknown[]) ?? [];
  const backupNotes         = (backup.notes                       as unknown[]) ?? [];
  const backupAssign        = (backup.se_assignments              as unknown[]) ?? [];
  const backupAgents        = (backup.agents                      as unknown[]) ?? [];
  const backupTemplates     = (backup.templates                   as unknown[]) ?? [];
  const backupDealInfo      = (backup.deal_info_config            as unknown[]) ?? [];
  const backupQuotaGroups   = (backup.quota_groups                as unknown[]) ?? [];
  const backupRoleAccess    = (backup.role_page_access            as unknown[]) ?? [];
  const backupTechDiscovery = (backup.opportunity_tech_discovery  as unknown[]) ?? [];

  // Run restore in a transaction
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let usersProcessed = 0, tasksRestored = 0, tasksSkipped = 0,
      notesRestored = 0, assignmentsProcessed = 0,
      agentsRestored = 0, templatesRestored = 0, dealInfoConfigRestored = 0,
      quotaGroupsRestored = 0, rolePageAccessRestored = 0,
      techDiscoveryRestored = 0, techDiscoverySkipped = 0;

  try {
    await client.query('BEGIN');

    // ── Step 1: Upsert users (pass 1 — without manager_id to avoid FK circular deps)
    const tempHash = await bcrypt.hash('ChangeMe123!', 10);
    // Sort managers first so their IDs exist when SEs reference them
    const sortedUsers = [...backupUsers].sort((a: unknown, b: unknown) => {
      const ua = a as Record<string, unknown>;
      const ub = b as Record<string, unknown>;
      if (ua.role === 'manager' && ub.role !== 'manager') return -1;
      if (ua.role !== 'manager' && ub.role === 'manager') return 1;
      return 0;
    });

    for (const u of sortedUsers) {
      const user = u as Record<string, unknown>;
      await client.query(`
        INSERT INTO users (id, email, name, role, is_active, show_qualify,
                           force_password_change, teams, created_at, password_hash, manager_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL)
        ON CONFLICT (email) DO UPDATE SET
          name                  = EXCLUDED.name,
          role                  = EXCLUDED.role,
          is_active             = EXCLUDED.is_active,
          show_qualify          = EXCLUDED.show_qualify,
          force_password_change = EXCLUDED.force_password_change,
          teams                 = EXCLUDED.teams
      `, [
        user.id, user.email, user.name, user.role,
        user.is_active, user.show_qualify, user.force_password_change,
        user.teams ?? [], user.created_at, tempHash,
      ]);
      usersProcessed++;
    }

    // Reset users sequence
    await client.query(`SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1))`);

    // ── Step 1b: Update manager_id using email cross-reference (pass 2)
    const emailById = new Map<unknown, string>(
      backupUsers.map((u: unknown) => {
        const user = u as Record<string, unknown>;
        return [user.id, user.email as string];
      })
    );
    for (const u of backupUsers) {
      const user = u as Record<string, unknown>;
      if (user.manager_id) {
        const managerEmail = emailById.get(user.manager_id);
        if (managerEmail) {
          await client.query(`
            UPDATE users u SET manager_id = m.id
            FROM users m
            WHERE u.email = $1 AND m.email = $2
          `, [user.email, managerEmail]);
        }
      }
    }

    // ── Step 2: Restore SE assignments
    for (const a of backupAssign) {
      const assign = a as Record<string, unknown>;
      await client.query(`
        UPDATE opportunities o SET se_owner_id = u.id
        FROM users u
        WHERE u.email = $1 AND o.sf_opportunity_id = $2
      `, [assign.se_email, assign.sf_opportunity_id]);
      assignmentsProcessed++;
    }

    // ── Step 3: Upsert tasks (skip any whose opportunity_id no longer exists)
    const oppIds = new Set(
      (await client.query<{ id: number }>('SELECT id FROM opportunities')).rows.map(r => r.id)
    );
    for (const t of backupTasks) {
      const task = t as Record<string, unknown>;
      if (!oppIds.has(task.opportunity_id as number)) { tasksSkipped++; continue; }
      await client.query(`
        INSERT INTO tasks
          (id, opportunity_id, title, description, status, is_next_step,
           due_date, assigned_to_id, created_by_id, is_deleted, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO UPDATE SET
          title          = EXCLUDED.title,
          description    = EXCLUDED.description,
          status         = EXCLUDED.status,
          is_next_step   = EXCLUDED.is_next_step,
          due_date       = EXCLUDED.due_date,
          assigned_to_id = EXCLUDED.assigned_to_id,
          created_by_id  = EXCLUDED.created_by_id,
          is_deleted     = EXCLUDED.is_deleted,
          updated_at     = EXCLUDED.updated_at
      `, [
        task.id, task.opportunity_id, task.title, task.description ?? null,
        task.status, task.is_next_step, task.due_date ?? null,
        task.assigned_to_id ?? null, task.created_by_id ?? null,
        task.is_deleted ?? false, task.created_at, task.updated_at,
      ]);
      tasksRestored++;
    }
    await client.query(`SELECT setval('tasks_id_seq', COALESCE((SELECT MAX(id) FROM tasks), 1))`);

    // ── Step 4: Insert notes (ON CONFLICT(id) DO NOTHING — append-only, preserve existing)
    for (const n of backupNotes) {
      const note = n as Record<string, unknown>;
      await client.query(`
        INSERT INTO notes (id, opportunity_id, author_id, content, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `, [note.id, note.opportunity_id, note.author_id, note.content, note.created_at]);
      notesRestored++;
    }
    await client.query(`SELECT setval('notes_id_seq', COALESCE((SELECT MAX(id) FROM notes), 1))`);

    // ── Step 5: deal_info_config (singleton, upsert by id) ────────────────
    for (const c of backupDealInfo) {
      const cfg = c as Record<string, unknown>;
      await client.query(`
        INSERT INTO deal_info_config (id, config, updated_by, updated_at)
        VALUES (1, $1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          config     = EXCLUDED.config,
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at
      `, [cfg.config, cfg.updated_by ?? null, cfg.updated_at ?? new Date().toISOString()]);
      dealInfoConfigRestored++;
    }

    // ── Step 6: quota_groups (upsert by name; name is the stable natural key)
    for (const q of backupQuotaGroups) {
      const qg = q as Record<string, unknown>;
      await client.query(`
        INSERT INTO quota_groups
          (id, name, rule_type, rule_value, target_amount, sort_order, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (name) DO UPDATE SET
          rule_type     = EXCLUDED.rule_type,
          rule_value    = EXCLUDED.rule_value,
          target_amount = EXCLUDED.target_amount,
          sort_order    = EXCLUDED.sort_order,
          updated_at    = EXCLUDED.updated_at
      `, [
        qg.id, qg.name, qg.rule_type, qg.rule_value ?? [],
        qg.target_amount, qg.sort_order ?? 0,
        qg.created_at ?? new Date().toISOString(),
        qg.updated_at ?? new Date().toISOString(),
      ]);
      quotaGroupsRestored++;
    }
    await client.query(`SELECT setval('quota_groups_id_seq', COALESCE((SELECT MAX(id) FROM quota_groups), 1))`);

    // ── Step 7: role_page_access (composite PK; DO NOTHING on existing rows)
    for (const r of backupRoleAccess) {
      const rpa = r as Record<string, unknown>;
      await client.query(`
        INSERT INTO role_page_access (page_key, role)
        VALUES ($1, $2)
        ON CONFLICT (page_key, role) DO NOTHING
      `, [rpa.page_key, rpa.role]);
      rolePageAccessRestored++;
    }

    // ── Step 8: templates (upsert by id; preserves is_deleted) ────────────
    for (const t of backupTemplates) {
      const tpl = t as Record<string, unknown>;
      await client.query(`
        INSERT INTO templates
          (id, kind, name, description, body, items, stage, is_deleted,
           created_by_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          kind        = EXCLUDED.kind,
          name        = EXCLUDED.name,
          description = EXCLUDED.description,
          body        = EXCLUDED.body,
          items       = EXCLUDED.items,
          stage       = EXCLUDED.stage,
          is_deleted  = EXCLUDED.is_deleted,
          updated_at  = EXCLUDED.updated_at
      `, [
        tpl.id, tpl.kind, tpl.name, tpl.description ?? null,
        tpl.body ?? null, tpl.items ?? null, tpl.stage ?? null,
        tpl.is_deleted ?? false, tpl.created_by_id ?? null,
        tpl.created_at, tpl.updated_at,
      ]);
      templatesRestored++;
    }
    await client.query(`SELECT setval('templates_id_seq', COALESCE((SELECT MAX(id) FROM templates), 1))`);

    // ── Step 9: opportunity_tech_discovery (upsert by opportunity_id) ─────
    // Skip rows whose opportunity is missing — the SF import decides what
    // exists in `opportunities`; don't resurrect deals via a restore.
    for (const td of backupTechDiscovery) {
      const rec = td as Record<string, unknown>;
      if (!oppIds.has(rec.opportunity_id as number)) { techDiscoverySkipped++; continue; }
      await client.query(`
        INSERT INTO opportunity_tech_discovery
          (opportunity_id, current_incumbent_solutions, tier1_integrations,
           data_details_and_users, ingestion_sources, planned_ingestion_sources,
           data_cleansing_remediation, deployment_preference, technical_constraints,
           open_technical_requirements, tech_stack, enterprise_systems, existing_dmg,
           updated_by_id, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (opportunity_id) DO UPDATE SET
          current_incumbent_solutions = EXCLUDED.current_incumbent_solutions,
          tier1_integrations          = EXCLUDED.tier1_integrations,
          data_details_and_users      = EXCLUDED.data_details_and_users,
          ingestion_sources           = EXCLUDED.ingestion_sources,
          planned_ingestion_sources   = EXCLUDED.planned_ingestion_sources,
          data_cleansing_remediation  = EXCLUDED.data_cleansing_remediation,
          deployment_preference       = EXCLUDED.deployment_preference,
          technical_constraints       = EXCLUDED.technical_constraints,
          open_technical_requirements = EXCLUDED.open_technical_requirements,
          tech_stack                  = EXCLUDED.tech_stack,
          enterprise_systems          = EXCLUDED.enterprise_systems,
          existing_dmg                = EXCLUDED.existing_dmg,
          updated_by_id               = EXCLUDED.updated_by_id,
          updated_at                  = EXCLUDED.updated_at
      `, [
        rec.opportunity_id,
        rec.current_incumbent_solutions ?? null,
        rec.tier1_integrations ?? null,
        rec.data_details_and_users ?? null,
        rec.ingestion_sources ?? null,
        rec.planned_ingestion_sources ?? null,
        rec.data_cleansing_remediation ?? null,
        rec.deployment_preference ?? null,
        rec.technical_constraints ?? null,
        rec.open_technical_requirements ?? null,
        rec.tech_stack ?? {},
        rec.enterprise_systems ?? {},
        rec.existing_dmg ?? {},
        rec.updated_by_id ?? null,
        rec.created_at,
        rec.updated_at,
      ]);
      techDiscoveryRestored++;
    }

    // ── Step 10: agents (upsert by feature) + marker version row ──────────
    // Restore upserts current state and emits a fresh "Restored from backup"
    // version row per agent (matching the audit pattern — every config change
    // to an agent creates a new version). Version history itself is kept in
    // the backup JSON for future portability but not rebuilt here: remapping
    // backup version ids onto live ones safely would require id-collision
    // handling that's not worth the complexity for the common restore case.
    for (const a of backupAgents) {
      const agent = a as Record<string, unknown>;
      await client.query(`
        INSERT INTO agents
          (feature, name, description, default_model, default_max_tokens,
           is_enabled, log_io, system_prompt_extra, prompt_template,
           created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (feature) DO UPDATE SET
          name                = EXCLUDED.name,
          description         = EXCLUDED.description,
          default_model       = EXCLUDED.default_model,
          default_max_tokens  = EXCLUDED.default_max_tokens,
          is_enabled          = EXCLUDED.is_enabled,
          log_io              = EXCLUDED.log_io,
          system_prompt_extra = EXCLUDED.system_prompt_extra,
          prompt_template     = EXCLUDED.prompt_template,
          updated_at          = now()
      `, [
        agent.feature, agent.name, agent.description,
        agent.default_model, agent.default_max_tokens,
        agent.is_enabled, agent.log_io,
        agent.system_prompt_extra ?? '',
        agent.prompt_template ?? null,
        agent.created_at ?? new Date().toISOString(),
        agent.updated_at ?? new Date().toISOString(),
      ]);

      // Look up the live agent id (stable for upsert; fresh for new rows).
      const liveAgentRows = (await client.query<{ id: number }>(
        `SELECT id FROM agents WHERE feature = $1`, [agent.feature]
      )).rows;
      if (liveAgentRows.length === 0) continue;
      const liveAgentId = liveAgentRows[0].id;

      const newVersion = (await client.query<{ id: number }>(`
        INSERT INTO agent_prompt_versions
          (agent_id, system_prompt_extra, prompt_template, default_model,
           default_max_tokens, is_enabled, log_io, note, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        liveAgentId,
        agent.system_prompt_extra ?? '',
        agent.prompt_template ?? null,
        agent.default_model, agent.default_max_tokens,
        agent.is_enabled, agent.log_io,
        'Restored from backup',
        actor.userId,
      ])).rows[0];
      await client.query(
        `UPDATE agents SET active_version_id = $1 WHERE id = $2`,
        [newVersion.id, liveAgentId]
      );
      agentsRestored++;
    }
    await client.query(`SELECT setval('agents_id_seq', COALESCE((SELECT MAX(id) FROM agents), 1))`);
    await client.query(`SELECT setval('agent_prompt_versions_id_seq', COALESCE((SELECT MAX(id) FROM agent_prompt_versions), 1))`);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    await client.end();
    console.error('[restore] error:', e);
    res.status(500).json(err(e instanceof Error ? e.message : 'Restore failed'));
    return;
  }
  await client.end();

  const result = {
    usersProcessed, tasksRestored, tasksSkipped, notesRestored, assignmentsProcessed,
    agentsRestored, templatesRestored, dealInfoConfigRestored, quotaGroupsRestored,
    rolePageAccessRestored, techDiscoveryRestored, techDiscoverySkipped,
  };

  await logAudit(req, {
    userId: actor.userId, userRole: actor.role,
    action: 'BACKUP_RESTORED', resourceType: 'backup',
    resourceId: req.body.s3_key ?? 'file-upload', resourceName: 'restore',
    after: result,
    success: true,
  });

  res.json(ok(result));
});

export default router;
