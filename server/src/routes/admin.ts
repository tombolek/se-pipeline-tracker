import { Router, Request, Response } from 'express';
import path from 'path';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import { importKnowledgeBase } from '../services/kbImportService.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;

// POST /admin/kb/import — re-import all KB markdown files into the database
router.post('/kb/import', auth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'manager') {
    res.status(403).json(err('Manager role required'));
    return;
  }

  try {
    // KB directory is at repo root /kb
    const kbDir = path.resolve(process.cwd(), 'kb');
    const result = await importKnowledgeBase(kbDir);
    res.json(ok(result));
  } catch (error) {
    console.error('KB import error:', error);
    res.status(500).json(err(`KB import failed: ${(error as Error).message}`));
  }
});

// GET /admin/kb/status — check current KB state
router.get('/kb/status', auth, async (_req: Request, res: Response): Promise<void> => {
  const [ppCount, diffCount, importLog] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*)::text AS count FROM kb_proof_points', []),
    query<{ count: string }>('SELECT COUNT(*)::text AS count FROM kb_differentiators', []),
    query<{ file_name: string; record_type: string; record_count: number; imported_at: string }>(
      'SELECT file_name, record_type, record_count, imported_at FROM kb_import_log ORDER BY imported_at DESC',
      []
    ),
  ]);

  res.json(ok({
    proof_points: parseInt(ppCount[0]?.count ?? '0'),
    differentiators: parseInt(diffCount[0]?.count ?? '0'),
    import_log: importLog,
  }));
});

export default router;
