import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { getDatabase } from '../db/database.ts';

export function getTimelineHandler(req: AuthenticatedRequest, res: Response): void {
  const tenantId = req.user?.tenant_id;
  let destinationType = (req.query.type || req.params.type) as 'lead' | 'contact' | undefined;
  if (!destinationType) {
    if (req.originalUrl && req.originalUrl.includes('/leads')) {
      destinationType = 'lead';
    } else if (req.originalUrl && req.originalUrl.includes('/contacts')) {
      destinationType = 'contact';
    }
  }
  const destinationId = (req.params.id || req.query.destinationId) as string;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  if (!destinationType || !destinationId) {
    res.status(400).json({ error: 'Missing destinationType or destinationId.' });
    return;
  }

  const db = getDatabase();

  // Verify access to destination
  const table = destinationType === 'lead' ? 'leads' : 'contacts';
  const checkStmt = db.prepare(`SELECT id, tenant_id FROM ${table} WHERE id = ?`);
  const record = checkStmt.get(destinationId) as { id: string; tenant_id: string } | undefined;

  if (!record) {
    res.status(404).json({ error: `${destinationType} not found.` });
    return;
  }

  if (record.tenant_id !== tenantId) {
    res.status(403).json({ error: 'Forbidden: Access to this record belongs to another tenant.' });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 500);
  const offset = Math.max(parseInt(req.query.offset as string || '0', 10), 0);
  const orderDir = (req.query.order as string || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  // Count total events
  const countStmt = db.prepare(`
    SELECT COUNT(*) as total
    FROM timeline_events
    WHERE tenant_id = ? AND destination_type = ? AND destination_id = ?
  `);
  const countResult = countStmt.get(tenantId, destinationType, destinationId) as { total: number };

  // Fetch paginated events
  const eventsStmt = db.prepare(`
    SELECT t.id, t.tenant_id, t.destination_type, t.destination_id,
           t.event_type, t.sender, t.content, t.timestamp_utc,
           t.original_timestamp, t.sequence_order, t.import_id, t.created_at,
           wi.message_count as import_message_count,
           wi.skipped_count as import_skipped_count,
           wi.created_at as import_created_at
    FROM timeline_events t
    LEFT JOIN whatsapp_imports wi ON t.import_id = wi.id
    WHERE t.tenant_id = ? AND t.destination_type = ? AND t.destination_id = ?
    ORDER BY t.timestamp_utc ${orderDir}, t.sequence_order ${orderDir}
    LIMIT ? OFFSET ?
  `);

  const rows = eventsStmt.all(tenantId, destinationType, destinationId, limit, offset);

  res.status(200).json({
    total: countResult.total,
    limit,
    offset,
    events: rows
  });
}
