import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import authRoutes from './routes/auth.js';
import opportunitiesRoutes from './routes/opportunities.js';
import tasksRoutes from './routes/tasks.js';
import notesRoutes from './routes/notes.js';
import insightsRoutes from './routes/insights.js';
import inboxRoutes from './routes/inbox.js';
import usersRoutes from './routes/users.js';
import auditRoutes from './routes/audit.js';
import backupRoutes from './routes/backup.js';
import homeRoutes from './routes/home.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import forecastingBriefRoutes from './routes/forecastingBrief.js';
import aiJobsRoutes from './routes/aiJobs.js';
import changelogRoutes from './routes/changelog.js';
import templatesRoutes from './routes/templates.js';
import recentActionsRoutes from './routes/recentActions.js';
import mentionsRoutes from './routes/mentions.js';
import agentsRoutes from './routes/agents.js';
import { query } from './db/index.js';
import { sweepStaleRunningJobs } from './services/aiJobs.js';
import { seedMissingPromptTemplates } from './services/agents.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// 50 MB ceiling. Sized for the largest realistic JSON body the API receives:
// the Backup → Restore endpoint accepts a full snapshot of users + tasks +
// notes + agents + templates etc., which in production runs to ~30–60 MB
// once the project has been live for a while. Process Call Notes transcripts
// (the previous reason for the 5 MB ceiling) sit comfortably under this.
// body-parser's default is 100 KB, so without an explicit limit any big POST
// throws PayloadTooLargeError before our handlers see it.
app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Lightweight no-auth ping for the client-side offline heartbeat (Issue #117
// Phase 3.1). 204 No Content is cheap to produce and cheap to transfer;
// the client's axios response interceptor uses the success/failure signal to
// flip the connection indicator and trigger a queue flush on recovery.
app.get('/api/v1/ping', (_req, res) => {
  res.status(204).end();
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/opportunities', opportunitiesRoutes);
app.use('/api/v1/tasks', tasksRoutes);
app.use('/api/v1/opportunities/:id/notes', notesRoutes);
app.use('/api/v1/insights', insightsRoutes);
app.use('/api/v1/inbox', inboxRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/backup', backupRoutes);
app.use('/api/v1/home', homeRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/forecasting-brief', forecastingBriefRoutes);
app.use('/api/v1/ai-jobs', aiJobsRoutes);
app.use('/api/v1/agents', agentsRoutes);
app.use('/api/v1/changelog', changelogRoutes);
app.use('/api/v1/templates', templatesRoutes);
app.use('/api/v1/recent-actions', recentActionsRoutes);
app.use('/api/v1/mentions', mentionsRoutes);

// ── Static frontend (only when CLIENT_DIST_PATH points at a real dir) ────────
// On the current AWS deploy (S3 + CloudFront), the frontend is uploaded
// directly to S3 and the server never serves HTML/JS/CSS — leaving
// CLIENT_DIST_PATH unset is correct there. On the AICrew port (ALB + ECS),
// the container colocates `client/dist` and serves it from this process,
// so the deploy sets CLIENT_DIST_PATH and the middleware below mounts.
//
// Either way: if the path is missing or doesn't exist on disk, this block
// is a no-op — no behaviour change for EC2.
const CLIENT_DIST_PATH = process.env.CLIENT_DIST_PATH;
if (CLIENT_DIST_PATH && fs.existsSync(CLIENT_DIST_PATH)) {
  console.log(`[static] serving SPA from ${CLIENT_DIST_PATH}`);
  app.use(express.static(CLIENT_DIST_PATH));
  // SPA fallback for any non-API GET — return index.html so client-side
  // routing can take over. API calls fall through to the 404 / error handler.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
} else if (CLIENT_DIST_PATH) {
  console.warn(`[static] CLIENT_DIST_PATH set to ${CLIENT_DIST_PATH} but the directory does not exist; skipping static middleware`);
}

// ── Safety net: catch unhandled async route errors ────────────────────────────
// Express 4 does NOT forward rejected promises from `async` route handlers to
// the default error middleware. Unhandled rejections in Node 20 crash the
// process by default (see the changelog EISDIR incident). This global handler
// logs the error, returns a 500 to the triggering request, and — crucially —
// keeps the server alive for everyone else.
import type { NextFunction } from 'express';
import type { Request, Response } from 'express';
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  console.error(`[unhandled] ${req.method} ${req.originalUrl}\n${msg}`);
  if (!res.headersSent) {
    // body-parser PayloadTooLargeError → 413 with an actionable message so the
    // Process Call Notes page can show "transcript too long" instead of a
    // generic 500. Anything else is still a 500.
    const e = err as { type?: string; status?: number } | null;
    if (e && (e.type === 'entity.too.large' || e.status === 413)) {
      res.status(413).json({
        data: null,
        error: 'Request body is too large (limit 50 MB). Trim the input and try again.',
        meta: {},
      });
      return;
    }
    res.status(500).json({ data: null, error: 'Internal server error', meta: {} });
  }
});

// Belt-and-braces: if a handler forgets to `next(err)`, an unhandled promise
// rejection will still reach here. Log and move on — don't crash.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
  console.error(`[unhandledRejection] ${msg}`);
});
process.on('uncaughtException', (err) => {
  console.error(`[uncaughtException] ${err.stack || err.message}`);
});

// Retention cleanup — purge rows older than 180 days on startup
query(`DELETE FROM events    WHERE timestamp < now() - interval '180 days'`).catch(() => {});
query(`DELETE FROM audit_log WHERE timestamp < now() - interval '180 days'`).catch(() => {});
// Soft-deleted tasks + inbox items past the 30-day restore window (Issue #114)
query(`DELETE FROM tasks        WHERE is_deleted = true AND deleted_at < now() - interval '30 days'`).catch(() => {});
query(`DELETE FROM inbox_items  WHERE is_deleted = true AND deleted_at < now() - interval '30 days'`).catch(() => {});

// AI jobs orphaned by a previous process crash — move them out of 'running' so
// the admin view doesn't show ghosts and the dedup lookup stops waiting on them.
sweepStaleRunningJobs().then(n => {
  if (n > 0) console.log(`[ai] swept ${n} stale running job(s) on startup`);
}).catch(err => console.error(`[ai] stale-job sweep failed: ${err?.message ?? err}`));

// Imports orphaned by a process crash or container replacement — same idea.
// The 5-stage import pipeline (Parse → Validate → Reconcile → Enrich →
// Finalize) runs in-process; if the server is killed mid-flight the row sits
// at status='in_progress' forever and the Import History page polls it
// indefinitely. On startup, mark anything that's been 'in_progress' for over
// 30 minutes as 'failed' so the UI surfaces a terminal state and the admin
// can retry. 30 min is well above the worst observed total runtime (~2 min
// for a 5K-row XLS); anything older is definitely a ghost.
query<{ id: number }>(
  `UPDATE imports
      SET status     = 'failed',
          error_log  = COALESCE(error_log, 'Server restarted before import completed'),
          finished_at = COALESCE(finished_at, now())
    WHERE status = 'in_progress'
      AND started_at < now() - interval '30 minutes'
    RETURNING id`
)
  .then(rows => {
    if (rows.length > 0) {
      console.log(`[imports] swept ${rows.length} stale in_progress import(s) on startup`);
    }
  })
  .catch(err => console.error(`[imports] stale-import sweep failed: ${err?.message ?? err}`));

// Fill agents.prompt_template from the golden baseline in agentTemplates.ts
// for any row that's still NULL. Admin edits (non-NULL) are never overwritten.
seedMissingPromptTemplates().then(n => {
  if (n > 0) console.log(`[ai] seeded prompt_template for ${n} agent(s) from baseline`);
}).catch(err => console.error(`[ai] prompt template seed failed: ${err?.message ?? err}`));

// Nightly backup is triggered externally by an EventBridge-scheduled Lambda
// that POSTs to /api/v1/backup/run-scheduled (see infra/lib/stack.ts and
// docs/deploy.md). This was previously an in-process setTimeout scheduler;
// see CHANGELOG 2026-04-30 "Removed: in-process nightly-backup scheduler".

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
