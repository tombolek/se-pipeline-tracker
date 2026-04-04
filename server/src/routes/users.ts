import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { AuthenticatedRequest, ColumnPrefs, User, ok, err } from '../types/index.js';

const USER_COLS = `id, email, name, role, is_active, show_qualify, force_password_change, manager_id, column_prefs, created_at, last_login_at`;

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const mgr  = requireManager as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /users — list all non-deleted users (Manager only)
router.get('/', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<User>(
    `SELECT ${USER_COLS} FROM users WHERE is_deleted = false ORDER BY name ASC`
  );
  res.json(ok(rows));
});

// POST /users — create user (Manager only)
router.post('/', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const { name, email, role, password } = req.body as {
    name?: string; email?: string; role?: string; password?: string;
  };

  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    res.status(400).json(err('name, email and password are required'));
    return;
  }
  if (role !== 'manager' && role !== 'se') {
    res.status(400).json(err('role must be manager or se'));
    return;
  }

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing) {
    res.status(409).json(err('A user with that email already exists'));
    return;
  }

  const password_hash = await bcrypt.hash(password, 10);
  const user = await queryOne<User>(
    `INSERT INTO users (name, email, role, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING ${USER_COLS}`,
    [name.trim(), email.toLowerCase().trim(), role, password_hash]
  );
  res.status(201).json(ok(user));
});

// PATCH /users/me/preferences — update show_qualify and/or column_prefs for current user
// MUST be before /:id to avoid 'me' being treated as an ID
router.patch('/me/preferences', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { show_qualify, column_prefs } = req.body as {
    show_qualify?: boolean;
    column_prefs?: ColumnPrefs;
  };

  if (show_qualify === undefined && column_prefs === undefined) {
    res.status(400).json(err('At least one of show_qualify or column_prefs must be provided'));
    return;
  }
  if (show_qualify !== undefined && typeof show_qualify !== 'boolean') {
    res.status(400).json(err('show_qualify must be a boolean'));
    return;
  }
  if (column_prefs !== undefined) {
    const pages = ['pipeline', 'closed_lost', 'se_mapping'] as const;
    for (const page of pages) {
      if (column_prefs[page] !== undefined && !Array.isArray(column_prefs[page])) {
        res.status(400).json(err(`column_prefs.${page} must be an array`));
        return;
      }
    }
  }

  const user = await queryOne<User>(
    `UPDATE users SET
       show_qualify  = COALESCE($1, show_qualify),
       column_prefs  = CASE WHEN $2::jsonb IS NOT NULL
                            THEN COALESCE(column_prefs, '{}'::jsonb) || $2::jsonb
                            ELSE column_prefs
                       END
     WHERE id = $3
     RETURNING ${USER_COLS}`,
    [
      show_qualify ?? null,
      column_prefs !== undefined ? JSON.stringify(column_prefs) : null,
      userId,
    ]
  );
  res.json(ok(user));
});

// PATCH /users/:id — update name, email, role, is_active, manager_id (Manager only)
router.patch('/:id', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json(err('Invalid user id')); return; }

  const body = req.body as Record<string, unknown>;
  const { name, email, role, is_active, manager_id } = body as Partial<{
    name: string; email: string; role: string; is_active: boolean; manager_id: number | null;
  }>;

  if (role !== undefined && role !== 'manager' && role !== 'se') {
    res.status(400).json(err('role must be manager or se'));
    return;
  }

  // Build dynamic SET clause so manager_id can be explicitly set to null
  const setClauses: string[] = [];
  const params: unknown[] = [];
  function addField(col: string, val: unknown) { params.push(val); setClauses.push(`${col} = $${params.length}`); }

  if (name !== undefined) addField('name', name.trim());
  if (email !== undefined) addField('email', email.toLowerCase().trim());
  if (role !== undefined) addField('role', role);
  if (is_active !== undefined) addField('is_active', is_active);
  if ('manager_id' in body) addField('manager_id', typeof manager_id === 'number' ? manager_id : null);

  if (setClauses.length === 0) { res.status(400).json(err('No fields to update')); return; }

  params.push(id);
  const user = await queryOne<User>(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING ${USER_COLS}`,
    params
  );

  if (!user) { res.status(404).json(err('User not found')); return; }
  res.json(ok(user));
});

// POST /users/:id/reset-password — set a new password (Manager only)
router.post('/:id/reset-password', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json(err('Invalid user id')); return; }

  const { password } = req.body as { password?: string };
  if (!password?.trim() || password.trim().length < 6) {
    res.status(400).json(err('Password must be at least 6 characters'));
    return;
  }

  const password_hash = await bcrypt.hash(password.trim(), 10);
  const user = await queryOne<User>(
    `UPDATE users SET password_hash = $1, force_password_change = true WHERE id = $2 AND is_deleted = false
     RETURNING ${USER_COLS}`,
    [password_hash, id]
  );
  if (!user) { res.status(404).json(err('User not found')); return; }
  res.json(ok(user));
});

// DELETE /users/:id — mark as deleted (Manager only, can't self-delete)
router.delete('/:id', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { userId } = (req as AuthenticatedRequest).user;

  if (isNaN(id)) { res.status(400).json(err('Invalid user id')); return; }
  if (id === userId) { res.status(400).json(err('Cannot delete your own account')); return; }

  // Unassign from any opportunities they own
  await query(`UPDATE opportunities SET se_owner_id = NULL WHERE se_owner_id = $1`, [id]);

  const user = await queryOne<User>(
    `UPDATE users SET is_deleted = true, is_active = false WHERE id = $1 AND is_deleted = false
     RETURNING ${USER_COLS}`,
    [id]
  );
  if (!user) { res.status(404).json(err('User not found')); return; }
  res.json(ok(user));
});

export default router;
