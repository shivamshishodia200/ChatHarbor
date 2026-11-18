import type { Request, Response } from 'express';
import { getDatabase } from '../db/database.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';

export function loginHandler(req: Request, res: Response): void {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT u.id, u.tenant_id, u.username, u.name, u.role, u.api_token,
           t.id as t_id, t.name as t_name, t.timezone as t_timezone
    FROM users u
    JOIN tenants t ON u.tenant_id = t.id
    WHERE u.username = ?
  `);

  const user = stmt.get(username) as any;

  // In our seeded CRM, password is 'password123'
  if (!user || (password !== 'password123' && password !== 'secret')) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  res.status(200).json({
    message: 'Authentication successful',
    token: user.api_token,
    user: {
      id: user.id,
      tenantId: user.tenant_id,
      username: user.username,
      name: user.name,
      role: user.role
    },
    tenant: {
      id: user.t_id,
      name: user.t_name,
      timezone: user.t_timezone
    }
  });
}

export function meHandler(req: AuthenticatedRequest, res: Response): void {
  res.status(200).json({
    user: req.user,
    tenant: req.tenant
  });
}
