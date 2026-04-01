import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { AuthenticatedRequest, ColumnPrefs, User, ok, err } from '../types/index.js';

const USER_COLS = `id, email, name, role, is_active, show_qualify, column_prefs, created_at, last_login_at`;

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const mgr  = requireManager as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /users — list all users (Manager only)
router.get('/', auth, mgr, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<User>(
    `SELECT ${USER_COLS} FROM users ORDER BY name ASC`
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

// PATCH /users/:id — update name, email, role, is_active (Manager only)
router.patch('/:id', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json(err('Invalid user id')); return; }

  const { name, email, role, is_active } = req.body as Partial<{
    name: string; email: string; role: string; is_active: boolean;
  }>;

  if (role !== undefined && role !== 'manager' && role !== 'se') {
    res.status(400).json(err('role must be manager or se'));
    return;
  }

  const user = await queryOne<User>(
    `UPDATE users SET
       name      = COALESCE($1, name),
       email     = COALESCE($2, email),
       role      = COALESCE($3, role),
       is_active = COALESCE($4, is_active)
     WHERE id = $5
     RETURNING ${USER_COLS}`,
    [name?.trim() ?? null, email?.toLowerCase().trim() ?? null, role ?? null, is_active ?? null, id]
  );

  if (!user) { res.status(404).json(err('User not found')); return; }
  res.json(ok(user));
});

// DELETE /users/:id — soft delete (Manager only, can't self-delete)
router.delete('/:id', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { userId } = (req as AuthenticatedRequest).user;

  if (isNaN(id)) { res.status(400).json(err('Invalid user id')); return; }
  if (id === userId) { res.status(400).json(err('Cannot deactivate your own account')); return; }

  const user = await queryOne<User>(
    `UPDATE users SET is_active = false WHERE id = $1
     RETURNING ${USER_COLS}`,
    [id]
  );
  if (!user) { res.status(404).json(err('User not found')); return; }
  res.json(ok(user));
});

export default router;
