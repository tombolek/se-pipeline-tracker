import { Request } from 'express';

export interface ColumnPrefs {
  pipeline: string[];
  closed_lost: string[];
  se_mapping: string[];
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'manager' | 'se' | 'viewer';
  is_admin: boolean;
  is_active: boolean;
  show_qualify: boolean;
  force_password_change: boolean;
  manager_id: number | null;
  column_prefs: ColumnPrefs | null;
  created_at: string;
  last_login_at: string | null;
}

export interface JwtPayload {
  userId: number;
  email: string;
  role: 'manager' | 'se' | 'viewer';
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export interface ApiResponse<T = unknown> {
  data: T;
  error: string | null;
  meta: Record<string, unknown>;
}

export function ok<T>(data: T, meta: Record<string, unknown> = {}): ApiResponse<T> {
  return { data, error: null, meta };
}

export function err(
  message: string,
  data: unknown = null,
): ApiResponse<unknown> {
  // Optional `data` payload for richer error responses (e.g. 409 conflict
  // where the client needs to see the current server state so the Review
  // Offline Changes screen can render "you tried X; it's now Y"). Defaults
  // to null to preserve the original shape for every existing caller.
  return { data, error: message, meta: {} };
}
