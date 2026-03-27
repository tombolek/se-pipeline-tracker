import { Request } from 'express';

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'manager' | 'se';
  is_active: boolean;
  show_qualify: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface JwtPayload {
  userId: number;
  email: string;
  role: 'manager' | 'se';
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

export function err(message: string): ApiResponse<null> {
  return { data: null, error: message, meta: {} };
}
