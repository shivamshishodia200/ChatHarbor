import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { getDatabase } from '../db/database.ts';

export function getLeadsHandler(req: AuthenticatedRequest, res: Response): void {
  const tenantId = req.user?.tenant_id;
  const q = req.query.q as string | undefined;
  const db = getDatabase();

  let query = 'SELECT * FROM leads WHERE tenant_id = ?';
  const params: any[] = [tenantId];

  if (q && q.trim()) {
    query += ' AND (name LIKE ? OR email LIKE ? OR company LIKE ?)';
    const term = `%${q.trim()}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY created_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params);
  res.status(200).json({ leads: rows });
}

export function getLeadByIdHandler(req: AuthenticatedRequest, res: Response): void {
  const tenantId = req.user?.tenant_id;
  const id = req.params.id;
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM leads WHERE id = ?');
  const lead = stmt.get(id) as any;

  if (!lead) {
    res.status(404).json({ error: 'Lead not found.' });
    return;
  }

  if (lead.tenant_id !== tenantId) {
    res.status(403).json({ error: 'Forbidden: Lead belongs to another tenant.' });
    return;
  }

  res.status(200).json({ lead });
}
