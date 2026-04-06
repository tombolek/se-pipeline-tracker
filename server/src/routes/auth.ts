import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest, User, ok, err } from '../types/index.js';

const router = Router();

// POST /auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json(err('Email and password are required'));
    return;
  }

  const user = await queryOne<User & { password_hash: string }>(
    `SELECT id, email, name, role, is_active, show_qualify, force_password_change, column_prefs, team,
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

  const payload = { userId: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  } as jwt.SignOptions);

  const { password_hash: _, ...safeUser } = user;
  res.json(ok({ token, user: safeUser }));
});

// POST /auth/logout  (stateless — client discards token)
router.post('/logout', (_req: Request, res: Response): void => {
  res.json(ok({ message: 'Logged out' }));
});

// GET /auth/me
router.get('/me', requireAuth as unknown as (req: Request, res: Response, next: () => void) => void, async (req: Request, res: Response): Promise<void> => {
  const { userId } = (req as AuthenticatedRequest).user;
  const user = await queryOne<User>(
    `SELECT id, email, name, role, is_active, show_qualify, force_password_change, column_prefs, team,
            created_at, last_login_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!user) {
    res.status(404).json(err('User not found'));
    return;
  }
  res.json(ok(user));
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
     RETURNING id, email, name, role, is_active, show_qualify, force_password_change, column_prefs, team, created_at, last_login_at`,
    [password_hash, userId]
  );
  if (!user) { res.status(404).json(err('User not found')); return; }
  res.json(ok(user));
});

export default router;
