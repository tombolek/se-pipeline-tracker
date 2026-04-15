import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import deployRoutes from './routes/deploy.js';
import homeRoutes from './routes/home.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import forecastingBriefRoutes from './routes/forecastingBrief.js';
import aiJobsRoutes from './routes/aiJobs.js';
import changelogRoutes from './routes/changelog.js';
import templatesRoutes from './routes/templates.js';
import recentActionsRoutes from './routes/recentActions.js';
import mentionsRoutes from './routes/mentions.js';
import { query } from './db/index.js';
import { startBackupScheduler } from './services/backupScheduler.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
app.use('/api/v1/deploy', deployRoutes);
app.use('/api/v1/home', homeRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/forecasting-brief', forecastingBriefRoutes);
app.use('/api/v1/ai-jobs', aiJobsRoutes);
app.use('/api/v1/changelog', changelogRoutes);
app.use('/api/v1/templates', templatesRoutes);
app.use('/api/v1/recent-actions', recentActionsRoutes);
app.use('/api/v1/mentions', mentionsRoutes);

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

// Nightly backup — 02:00 UTC (9 PM EST / 10 PM EDT)
startBackupScheduler();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
