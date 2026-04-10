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

// Retention cleanup — purge rows older than 180 days on startup
query(`DELETE FROM events    WHERE timestamp < now() - interval '180 days'`).catch(() => {});
query(`DELETE FROM audit_log WHERE timestamp < now() - interval '180 days'`).catch(() => {});

// Nightly backup — 02:00 UTC (9 PM EST / 10 PM EDT)
startBackupScheduler();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
