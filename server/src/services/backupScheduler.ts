/**
 * Scheduled nightly backup — runs daily at 02:00 UTC (9 PM EST / 10 PM EDT).
 * Creates the same JSON snapshot as the manual "Back Up Now" button and uploads
 * it to APP_BACKUP_BUCKET so it appears in the Backup / Restore UI.
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { query } from '../db/index.js';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';
const s3 = new S3Client({ region: REGION });

// ── Core backup logic (shared by route handler and scheduler) ─────────────────

export async function createAppBackup(createdBy: string): Promise<{ s3Key: string; counts: Record<string, number> }> {
  const bucket = process.env.APP_BACKUP_BUCKET;
  if (!bucket) throw new Error('APP_BACKUP_BUCKET not configured');

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
    created_by: createdBy,
    users,
    tasks,
    notes,
    se_assignments: assignments,
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
    counts: { users: users.length, tasks: tasks.length, notes: notes.length, se_assignments: assignments.length },
  };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/** Schedule a function to run daily at a fixed UTC time, correcting for drift. */
function scheduleDailyUtc(hourUtc: number, minuteUtc: number, fn: () => Promise<void>): void {
  function next(): void {
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(hourUtc, minuteUtc, 0, 0);
    if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
    const delay = target.getTime() - now.getTime();
    console.log(`[backup-scheduler] Next scheduled backup in ${Math.round(delay / 60000)} min (${target.toISOString()})`);
    setTimeout(async () => {
      await fn();
      next(); // reschedule — avoids 24h drift from setInterval
    }, delay);
  }
  next();
}

/** Start the nightly backup schedule. Called once on server startup. */
export function startBackupScheduler(): void {
  if (!process.env.APP_BACKUP_BUCKET) {
    console.warn('[backup-scheduler] APP_BACKUP_BUCKET not set — scheduled backups disabled');
    return;
  }

  // 02:00 UTC = 9 PM EST / 10 PM EDT
  scheduleDailyUtc(2, 0, async () => {
    console.log('[backup-scheduler] Starting nightly backup…');
    try {
      const { s3Key, counts } = await createAppBackup('scheduled');
      console.log(`[backup-scheduler] Backup complete → ${s3Key}`, counts);
    } catch (e) {
      console.error('[backup-scheduler] Backup failed:', e);
    }
  });
}
