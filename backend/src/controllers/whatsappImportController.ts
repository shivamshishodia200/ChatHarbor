import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { WhatsAppService } from '../services/whatsappService.ts';
import { parseWhatsAppChat } from '../../../shared/src/whatsappParser.ts';
import type { DateFormat } from '../../../shared/src/types.ts';

export async function importWhatsAppHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = req.user?.tenant_id;
  const userId = req.user?.id;

  if (!tenantId || !userId) {
    res.status(401).json({ error: 'Unauthorized: User or Tenant missing.' });
    return;
  }

  // Determine destination
  let destinationType = (req.body.destinationType || req.params.type) as 'lead' | 'contact' | undefined;
  if (!destinationType) {
    if (req.originalUrl && req.originalUrl.includes('/leads')) {
      destinationType = 'lead';
    } else if (req.originalUrl && req.originalUrl.includes('/contacts')) {
      destinationType = 'contact';
    }
  }
  const destinationId = (req.body.destinationId || req.params.id) as string;

  if (!destinationType || !destinationId) {
    res.status(400).json({ error: 'Missing destinationType or destinationId.' });
    return;
  }

  if (destinationType !== 'lead' && destinationType !== 'contact') {
    res.status(400).json({ error: "Invalid destinationType. Must be 'lead' or 'contact'." });
    return;
  }

  const dateFormat = (req.body.dateFormat || 'DD/MM/YYYY') as DateFormat;
  const timezone = (req.body.timezone || req.tenant?.timezone || 'UTC') as string;

  if (!req.file || !req.file.buffer) {
    res.status(400).json({ error: 'No export file uploaded. Please attach a .txt WhatsApp export file.' });
    return;
  }

  const result = WhatsAppService.processImport({
    tenantId,
    userId,
    destinationType,
    destinationId,
    dateFormat,
    timezone,
    fileBuffer: req.file.buffer
  });

  if (result.error) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }

  res.status(result.statusCode).json(result.data);
}

export async function previewWhatsAppHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.file || !req.file.buffer) {
    res.status(400).json({ error: 'No file uploaded for preview.' });
    return;
  }

  if (!WhatsAppService.isTextBuffer(req.file.buffer)) {
    res.status(400).json({ error: 'Invalid file content: Plain text export required.' });
    return;
  }

  const content = req.file.buffer.toString('utf8');
  const dateFormat = (req.body.dateFormat || undefined) as DateFormat | undefined;
  const timezone = (req.body.timezone || req.tenant?.timezone || 'UTC') as string;

  try {
    const parseResult = parseWhatsAppChat(content, { dateFormat, timezone });
    res.status(200).json({
      status: 'preview_ready',
      ...parseResult
    });
  } catch (err: any) {
    res.status(400).json({ error: `Preview parsing failed: ${err.message}` });
  }
}
