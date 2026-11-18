import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { getDatabase } from '../db/database.ts';

export function getContactsHandler(req: AuthenticatedRequest, res: Response): void {
  const tenantId = req.user?.tenant_id;
  const q = req.query.q as string | undefined;
  const db = getDatabase();

  let query = 'SELECT * FROM contacts WHERE tenant_id = ?';
  const params: any[] = [tenantId];

  if (q && q.trim()) {
    query += ' AND (name LIKE ? OR email LIKE ? OR account_name LIKE ?)';
    const term = `%${q.trim()}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY created_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params);
  res.status(200).json({ contacts: rows });
}

export function getContactByIdHandler(req: AuthenticatedRequest, res: Response): void {
  const tenantId = req.user?.tenant_id;
  const id = req.params.id;
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM contacts WHERE id = ?');
  const contact = stmt.get(id) as any;

  if (!contact) {
    res.status(404).json({ error: 'Contact not found.' });
    return;
  }

  if (contact.tenant_id !== tenantId) {
    res.status(403).json({ error: 'Forbidden: Contact belongs to another tenant.' });
    return;
  }

  res.status(200).json({ contact });
}
