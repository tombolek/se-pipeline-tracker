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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
