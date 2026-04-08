import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { Client } from 'pg';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { query } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';

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

  const [users, tasks, notes, assignments] = await Promise.all([
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
  ]);

  const backup = {
    version: 1,
    created_at: new Date().toISOString(),
    created_by: actor.email,
    users,
    tasks,
    notes,
    se_assignments: assignments,
  };

  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const s3Key = `app-backups/${ts}_${actor.email}.json`;
  const body = JSON.stringify(backup, null, 2);

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: body,
    ContentType: 'application/json',
  }));

  await logAudit(req, {
    userId: actor.userId, userRole: actor.role,
    action: 'BACKUP_CREATED', resourceType: 'backup',
    resourceId: s3Key, resourceName: s3Key,
    after: { users: users.length, tasks: tasks.length, notes: notes.length },
    success: true,
  });

  res.json(ok({ s3_key: s3Key, backup }));
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

  // Validate structure
  const backupUsers  = (backup.users   as unknown[]) ?? [];
  const backupTasks  = (backup.tasks   as unknown[]) ?? [];
  const backupNotes  = (backup.notes   as unknown[]) ?? [];
  const backupAssign = (backup.se_assignments as unknown[]) ?? [];

  // Run restore in a transaction
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let usersProcessed = 0, tasksRestored = 0, tasksSkipped = 0,
      notesRestored = 0, assignmentsProcessed = 0;

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

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    await client.end();
    console.error('[restore] error:', e);
    res.status(500).json(err(e instanceof Error ? e.message : 'Restore failed'));
    return;
  }
  await client.end();

  await logAudit(req, {
    userId: actor.userId, userRole: actor.role,
    action: 'BACKUP_RESTORED', resourceType: 'backup',
    resourceId: req.body.s3_key ?? 'file-upload', resourceName: 'restore',
    after: { usersProcessed, tasksRestored, tasksSkipped, notesRestored, assignmentsProcessed },
    success: true,
  });

  res.json(ok({ usersProcessed, tasksRestored, tasksSkipped, notesRestored, assignmentsProcessed }));
});

export default router;
