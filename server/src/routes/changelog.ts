import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { queryOne } from '../db/index.js';
import { AuthenticatedRequest, ok } from '../types/index.js';
import { loadChangelog } from '../services/changelogParser.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /api/v1/changelog
// Returns parsed changelog entries + this user's last-seen timestamp.
// Client computes unread count as entries with date > last_seen_at.
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const changelog = loadChangelog();
  // node-pg returns TIMESTAMPTZ as a JS Date, not a string. Normalise both to
  // an ISO string (yyyy-mm-ddThh:mm:ssZ) so `.slice(0, 10)` below is safe and
  // the client gets a stable wire format.
  const user = await queryOne<{ last_changelog_seen_at: Date | string | null }>(
    'SELECT last_changelog_seen_at FROM users WHERE id = $1',
    [userId],
  );
  const raw = user?.last_changelog_seen_at ?? null;
  const lastSeenAt: string | null =
    raw instanceof Date ? raw.toISOString() :
    typeof raw === 'string' ? raw : null;

  const unreadCount = lastSeenAt
    ? changelog.entries.filter(e => e.date > lastSeenAt.slice(0, 10)).length
    : changelog.entries.length;

  res.json(ok({
    entries: changelog.entries,
    latest_date: changelog.latest_date,
    last_seen_at: lastSeenAt,
    unread_count: unreadCount,
  }));
});

// POST /api/v1/changelog/mark-seen
// Sets the user's last-seen timestamp to the date of the newest entry (or now() as fallback).
router.post('/mark-seen', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const changelog = loadChangelog();
  const latest = changelog.latest_date;
  // Store the latest entry's date at end-of-day so a new entry written *on the same day*
  // won't look unread. If there are no entries at all, just use now().
  if (latest) {
    await queryOne(
      `UPDATE users SET last_changelog_seen_at = ($1::date + time '23:59:59')
       WHERE id = $2`,
      [latest, userId],
    );
  } else {
    await queryOne('UPDATE users SET last_changelog_seen_at = now() WHERE id = $1', [userId]);
  }
  res.json(ok({ marked: true, latest_date: latest }));
});

export default router;
