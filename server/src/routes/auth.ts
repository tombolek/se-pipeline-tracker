import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest, User, JwtPayload, ok, err } from '../types/index.js';
import { logAudit } from '../services/auditLog.js';

function signToken(user: { id: number; email: string; role: string; is_admin: boolean }): string {
  const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role as JwtPayload['role'], isAdmin: !!user.is_admin };
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' } as jwt.SignOptions);
}

const router = Router();

// POST /auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json(err('Email and password are required'));
    return;
  }

  const user = await queryOne<User & { password_hash: string }>(
    `SELECT id, email, name, role, is_admin, is_active, show_qualify, force_password_change, column_prefs, teams,
            created_at, last_login_at, password_hash
     FROM users WHERE email = $1 AND is_active = true AND is_deleted = false`,
    [email.toLowerCase().trim()]
  );

  if (!user) {
    res.status(401).json(err('Invalid email or password'));
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json(err('Invalid email or password'));
    return;
  }

  await queryOne(
    'UPDATE users SET last_login_at = now() WHERE id = $1',
    [user.id]
  );

  const token = signToken(user);

  const { password_hash: _, ...safeUser } = user;
  res.json(ok({ token, user: safeUser }));

  logAudit(req, {
    action: 'LOGIN', resourceType: 'user',
    resourceId: user.id, resourceName: user.name,
    userId: user.id, userRole: user.role,
  });
});

// POST /auth/logout  (stateless — client discards token)
router.post('/logout', (req: Request, res: Response): void => {
  res.json(ok({ message: 'Logged out' }));
  logAudit(req, { action: 'LOGOUT', resourceType: 'user', resourceId: '' });
});

// GET /auth/me
router.get('/me', requireAuth as unknown as (req: Request, res: Response, next: () => void) => void, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const user = await queryOne<User>(
    `SELECT id, email, name, role, is_admin, is_active, show_qualify, force_password_change, column_prefs, teams,
            created_at, last_login_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!user) {
    res.status(404).json(err('User not found'));
    return;
  }
  // Return a fresh token so existing sessions pick up is_admin without re-login
  const freshToken = signToken(user);
  res.json(ok({ ...user, token: freshToken }));
});

// POST /auth/change-password — for force_password_change flow
router.post('/change-password', requireAuth as unknown as (req: Request, res: Response, next: () => void) => void, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { password } = req.body as { password?: string };

  if (!password?.trim() || password.trim().length < 6) {
    res.status(400).json(err('Password must be at least 6 characters'));
    return;
  }

  const password_hash = await bcrypt.hash(password.trim(), 10);
  const user = await queryOne<User>(
    `UPDATE users SET password_hash = $1, force_password_change = false
     WHERE id = $2
     RETURNING id, email, name, role, is_admin, is_active, show_qualify, force_password_change, column_prefs, teams, created_at, last_login_at`,
    [password_hash, userId]
  );
  if (!user) { res.status(404).json(err('User not found')); return; }
  res.json(ok(user));
});

export default router;
