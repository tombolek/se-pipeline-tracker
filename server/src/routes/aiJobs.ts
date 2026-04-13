import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ok } from '../types/index.js';
import { findRunningJob } from '../services/aiJobs.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /ai-jobs/by-key/:key — returns { running: boolean, job: AiJob | null }
// Used by the client to detect whether an AI generation for a given cache key is
// already in progress (so a user who navigated away can re-attach and poll for
// the result instead of kicking off a duplicate request).
router.get('/by-key/:key', auth, async (req: Request, res: Response): Promise<void> => {
  const key = req.params.key;
  const job = await findRunningJob(key);
  res.json(ok({ running: !!job, job }));
});

export default router;
