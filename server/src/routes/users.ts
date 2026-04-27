import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query, queryOne } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { AuthenticatedRequest, ColumnPrefs, User, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';

const USER_COLS = `id, email, name, role, is_admin, is_active, show_qualify, force_password_change, manager_id, quota_group_id, column_prefs, teams, theme, created_at, last_login_at`;

const VALID_THEMES = new Set(['light', 'dark', 'system']);

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;
const mgr  = requireManager as unknown as (req: Request, res: Response, next: () => void) => void;

// GET /users — list all non-deleted users (any authenticated user).
// Pipeline filters, owner/assignee dropdowns, mention pickers, and the SE
// Mapping page all need the user list to render — and the same names are
// already exposed across the app via opportunity rows. Mutations below stay
// manager-only.
router.get('/', auth, async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<User>(
    `SELECT ${USER_COLS} FROM users WHERE is_deleted = false ORDER BY name ASC`
  );
  res.json(ok(rows));
});

// POST /users — create user (Manager only)
router.post('/', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const { name, email, role, password, manager_id, quota_group_id, is_admin: reqIsAdmin } = req.body as {
    name?: string; email?: string; role?: string; password?: string;
    manager_id?: number | null; quota_group_id?: number | null; is_admin?: boolean;
  };

  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    res.status(400).json(err('name, email and password are required'));
    return;
  }
  if (role !== 'manager' && role !== 'se' && role !== 'viewer') {
    res.status(400).json(err('role must be manager, se, or viewer'));
    return;
  }

  // Only admins can set is_admin flag
  const setAdmin = reqIsAdmin && (req as AuthenticatedRequest).user?.isAdmin ? true : false;

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing) {
    res.status(409).json(err('A user with that email already exists'));
    return;
  }

  // Validate manager_id if provided — must exist and be a manager.
  // Only applied to SE role; managers don't have a manager_id of their own here.
  let resolvedManagerId: number | null = null;
  if (role === 'se' && manager_id !== undefined && manager_id !== null) {
    const mgrRow = await queryOne<{ id: number }>(
      `SELECT id FROM users WHERE id = $1 AND role = 'manager' AND is_deleted = false`,
      [manager_id]
    );
    if (!mgrRow) {
      res.status(400).json(err('manager_id must reference an existing manager'));
      return;
    }
    resolvedManagerId = mgrRow.id;
  }

  let resolvedQuotaGroupId: number | null = null;
  if (quota_group_id !== undefined && quota_group_id !== null) {
    const qgRow = await queryOne<{ id: number }>(`SELECT id FROM quota_groups WHERE id = $1`, [quota_group_id]);
    if (!qgRow) { res.status(400).json(err('quota_group_id must reference an existing quota group')); return; }
    resolvedQuotaGroupId = qgRow.id;
  }

  const password_hash = await bcrypt.hash(password, 10);
  const user = await queryOne<User>(
    `INSERT INTO users (name, email, role, password_hash, manager_id, quota_group_id, is_admin)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${USER_COLS}`,
    [name.trim(), email.toLowerCase().trim(), role, password_hash, resolvedManagerId, resolvedQuotaGroupId, setAdmin]
  );
  res.status(201).json(ok(user));
  logAudit(req, {
    action: 'CREATE_USER', resourceType: 'user',
    resourceId: user!.id, resourceName: user!.name,
    after: { email: user!.email, role, manager_id: resolvedManagerId },
  });
});

// PATCH /users/me/preferences — update show_qualify and/or column_prefs for current user
// MUST be before /:id to avoid 'me' being treated as an ID
router.patch('/me/preferences', auth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { show_qualify, column_prefs, theme } = req.body as {
    show_qualify?: boolean;
    column_prefs?: ColumnPrefs;
    theme?: string;
  };

  if (show_qualify === undefined && column_prefs === undefined && theme === undefined) {
    res.status(400).json(err('At least one of show_qualify, column_prefs, or theme must be provided'));
    return;
  }
  if (show_qualify !== undefined && typeof show_qualify !== 'boolean') {
    res.status(400).json(err('show_qualify must be a boolean'));
    return;
  }
  if (theme !== undefined && !VALID_THEMES.has(theme)) {
    res.status(400).json(err(`theme must be one of: ${[...VALID_THEMES].join(', ')}`));
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
                       END,
       theme         = COALESCE($3, theme)
     WHERE id = $4
     RETURNING ${USER_COLS}`,
    [
      show_qualify ?? null,
      column_prefs !== undefined ? JSON.stringify(column_prefs) : null,
      theme ?? null,
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
  const { name, email, role, is_active, manager_id, teams } = body as Partial<{
    name: string; email: string; role: string; is_active: boolean; manager_id: number | null; teams: string[];
  }>;

  if (role !== undefined && role !== 'manager' && role !== 'se' && role !== 'viewer') {
    res.status(400).json(err('role must be manager, se, or viewer'));
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
  if ('quota_group_id' in body) {
    const qgRaw = body.quota_group_id;
    const qg = typeof qgRaw === 'number' ? qgRaw : null;
    if (qg !== null) {
      const qgRow = await queryOne<{ id: number }>(`SELECT id FROM quota_groups WHERE id = $1`, [qg]);
      if (!qgRow) { res.status(400).json(err('quota_group_id must reference an existing quota group')); return; }
    }
    addField('quota_group_id', qg);
  }
  if ('teams' in body) addField('teams', Array.isArray(teams) ? teams : []);
  // Only admins can toggle is_admin
  if ('is_admin' in body && (req as AuthenticatedRequest).user?.isAdmin) {
    addField('is_admin', !!body.is_admin);
  }

  if (setClauses.length === 0) { res.status(400).json(err('No fields to update')); return; }

  params.push(id);
  const user = await queryOne<User>(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING ${USER_COLS}`,
    params
  );

  if (!user) { res.status(404).json(err('User not found')); return; }
  res.json(ok(user));
  const changedFields: Record<string, unknown> = {};
  if (name      !== undefined) changedFields.name      = name;
  if (email     !== undefined) changedFields.email     = email;
  if (role      !== undefined) changedFields.role      = role;
  if (is_active !== undefined) changedFields.is_active = is_active;
  logAudit(req, {
    action: 'UPDATE_USER', resourceType: 'user',
    resourceId: id, resourceName: user.name,
    after: changedFields,
  });
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
  logAudit(req, {
    action: 'RESET_PASSWORD', resourceType: 'user',
    resourceId: id, resourceName: user.name,
  });
});

// POST /users/:id/reassign-workload — transfer tasks + open opp ownership to another user (Manager only)
router.post('/:id/reassign-workload', auth, mgr, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json(err('Invalid user id')); return; }

  const { to_user_id } = req.body as { to_user_id?: number };
  if (!to_user_id || isNaN(Number(to_user_id))) {
    res.status(400).json(err('to_user_id is required'));
    return;
  }

  const target = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE id = $1 AND is_active = true AND is_deleted = false',
    [to_user_id]
  );
  if (!target) { res.status(400).json(err('Target user not found or inactive')); return; }

  const reassignedTasks = await query<{ id: number }>(
    `UPDATE tasks SET assigned_to_id = $1
     WHERE assigned_to_id = $2 AND is_deleted = false
     RETURNING id`,
    [to_user_id, id]
  );

  const reassignedOpps = await query<{ id: number }>(
    `UPDATE opportunities SET se_owner_id = $1, updated_at = now()
     WHERE se_owner_id = $2 AND is_closed_lost = false AND is_active = true
     RETURNING id`,
    [to_user_id, id]
  );

  res.json(ok({
    tasks_reassigned: reassignedTasks.length,
    opps_reassigned: reassignedOpps.length,
  }));
  logAudit(req, {
    action: 'REASSIGN_WORKLOAD', resourceType: 'user',
    resourceId: id,
    after: { to_user_id: to_user_id, tasks: reassignedTasks.length, opps: reassignedOpps.length },
  });
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
  logAudit(req, {
    action: 'DELETE_USER', resourceType: 'user',
    resourceId: id, resourceName: user.name,
  });
});

export default router;
