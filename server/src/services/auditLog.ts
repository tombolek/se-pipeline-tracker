import { query } from '../db/index.js';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';

function getIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
  return req.ip ?? '';
}

function getSessionId(req: Request): string {
  return (req.headers['x-session-id'] as string) ?? '';
}

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string | number;
  resourceName?: string;
  before?: unknown;
  after?: unknown;
  success?: boolean;
  failureReason?: string;
  /** Override the userId derived from JWT (use for login, where JWT isn't set yet) */
  userId?: number | null;
  /** Override the role derived from JWT */
  userRole?: string;
}

/**
 * Fire-and-forget audit log insert.
 * Never awaited — never blocks the request/response cycle.
 */
export function logAudit(req: Request, entry: AuditEntry): void {
  const authReq = req as AuthenticatedRequest;
  const userId   = entry.userId   !== undefined ? entry.userId   : (authReq.user?.userId ?? null);
  const userRole = entry.userRole !== undefined ? entry.userRole : (authReq.user?.role   ?? '');

  query(
    `INSERT INTO audit_log
       (user_id, user_role, action, resource_type, resource_id, resource_name,
        before_value, after_value, ip_address, session_id, success, failure_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      userId,
      userRole,
      entry.action,
      entry.resourceType,
      String(entry.resourceId ?? ''),
      entry.resourceName ?? null,
      entry.before !== undefined ? JSON.stringify(entry.before) : null,
      entry.after  !== undefined ? JSON.stringify(entry.after)  : null,
      getIp(req),
      getSessionId(req),
      entry.success ?? true,
      entry.failureReason ?? null,
    ]
  ).catch(e => console.error('[audit] insert failed:', e));
}
