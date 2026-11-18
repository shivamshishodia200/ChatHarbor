import type { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/database.ts';

export interface AuthenticatedUser {
  id: string;
  tenant_id: string;
  username: string;
  name: string;
  role: string;
  api_token: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  timezone: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  tenant?: TenantInfo;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiTokenHeader = req.headers['x-api-token'] as string | undefined;
  const tokenQuery = req.query.token as string | undefined;

  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (apiTokenHeader) {
    token = apiTokenHeader.trim();
  } else if (tokenQuery) {
    token = tokenQuery.trim();
  }

  if (!token) {
    res.status(401).json({
      error: 'Authentication required. Please provide a valid Bearer token or x-api-token header.'
    });
    return;
  }

  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT u.id, u.tenant_id, u.username, u.name, u.role, u.api_token,
           t.id as t_id, t.name as t_name, t.timezone as t_timezone
    FROM users u
    JOIN tenants t ON u.tenant_id = t.id
    WHERE u.api_token = ?
  `);

  const row = stmt.get(token) as any;
  if (!row) {
    res.status(401).json({ error: 'Invalid authentication credentials.' });
    return;
  }

  req.user = {
    id: row.id,
    tenant_id: row.tenant_id,
    username: row.username,
    name: row.name,
    role: row.role,
    api_token: row.api_token
  };

  req.tenant = {
    id: row.t_id,
    name: row.t_name,
    timezone: row.t_timezone
  };

  next();
}
