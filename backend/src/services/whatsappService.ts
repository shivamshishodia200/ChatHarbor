import { getDatabase } from '../db/database.ts';
import { parseWhatsAppChat } from '../../../shared/src/whatsappParser.ts';
import { computeSha256 } from '../utils/hash.ts';
import { logger } from '../utils/sanitizedLogger.ts';
import type { DateFormat } from '../../../shared/src/types.ts';

export interface ProcessImportParams {
  tenantId: string;
  userId: string;
  destinationType: 'lead' | 'contact';
  destinationId: string;
  dateFormat: DateFormat;
  timezone: string;
  fileBuffer: Buffer;
}

export interface ImportServiceResult {
  statusCode: number;
  data?: any;
  error?: string;
}

export class WhatsAppService {
  /**
   * Validates if a buffer is valid text (not binary, image, zip, etc.)
   */
  static isTextBuffer(buffer: Buffer): boolean {
    if (!buffer || buffer.length === 0) return false;
    // Check first 1024 bytes for null bytes (\0) which indicate binary files
    const sampleSize = Math.min(buffer.length, 1024);
    for (let i = 0; i < sampleSize; i++) {
      if (buffer[i] === 0) return false;
    }
    return true;
  }

  static processImport(params: ProcessImportParams): ImportServiceResult {
    const startTime = Date.now();
    const { tenantId, userId, destinationType, destinationId, dateFormat, timezone, fileBuffer } = params;

    // 1. Content validation
    if (!fileBuffer || fileBuffer.length === 0) {
      return {
        statusCode: 400,
        error: 'Empty export: The uploaded file contains no text.'
      };
    }

    if (!WhatsAppService.isTextBuffer(fileBuffer)) {
      return {
        statusCode: 400,
        error: 'Invalid file content: The uploaded file appears to be binary or corrupted. Only plain text (.txt) WhatsApp exports are supported.'
      };
    }

    const contentString = fileBuffer.toString('utf8');
    if (!contentString.trim()) {
      return {
        statusCode: 400,
        error: 'Empty export: The uploaded file contains no text.'
      };
    }

    const db = getDatabase();

    // 2. Tenant isolation and permission check
    const table = destinationType === 'lead' ? 'leads' : 'contacts';
    const recordStmt = db.prepare(`SELECT id, tenant_id FROM ${table} WHERE id = ?`);
    const record = recordStmt.get(destinationId) as { id: string; tenant_id: string } | undefined;

    if (!record) {
      return {
        statusCode: 404,
        error: `Destination ${destinationType} with ID '${destinationId}' not found.`
      };
    }

    if (record.tenant_id !== tenantId) {
      logger.warn('Cross-tenant import attempt rejected', {
        tenantId,
        destinationType,
        destinationId,
        action: 'cross_tenant_rejection'
      });
      return {
        statusCode: 403,
        error: 'Forbidden: You do not have permission to access or import to this destination record.'
      };
    }

    // 3. Compute Content Hash for Idempotency
    const contentHash = computeSha256(contentString);

    // 4. Check if duplicate import already exists
    const checkImportStmt = db.prepare(`
      SELECT id, tenant_id, destination_type, destination_id, content_hash,
             message_count, skipped_count, date_range_start, date_range_end,
             date_format, timezone, created_by, created_at
      FROM whatsapp_imports
      WHERE tenant_id = ?
        AND destination_type = ?
        AND destination_id = ?
        AND content_hash = ?
        AND date_format = ?
        AND timezone = ?
    `);

    const existing = checkImportStmt.get(
      tenantId,
      destinationType,
      destinationId,
      contentHash,
      dateFormat,
      timezone
    ) as any;

    if (existing) {
      logger.info('Duplicate WhatsApp import request detected; returning existing record', {
        tenantId,
        destinationType,
        destinationId,
        contentHash,
        status: 'already_imported',
        durationMs: Date.now() - startTime
      });

      return {
        statusCode: 200,
        data: {
          status: 'already_imported',
          existing: true,
          message: 'This WhatsApp chat export was already imported into this record with identical options.',
          import: {
            id: existing.id,
            tenantId: existing.tenant_id,
            destinationType: existing.destination_type,
            destinationId: existing.destination_id,
            contentHash: existing.content_hash,
            messageCount: existing.message_count,
            skippedCount: existing.skipped_count,
            dateRangeStart: existing.date_range_start,
            dateRangeEnd: existing.date_range_end,
            dateFormat: existing.date_format,
            timezone: existing.timezone,
            createdAt: existing.created_at
          }
        }
      };
    }

    // 5. Independent Backend Parsing
    let parseResult;
    try {
      parseResult = parseWhatsAppChat(contentString, {
        dateFormat,
        timezone
      });
    } catch (parseErr: any) {
      return {
        statusCode: 400,
        error: `Failed to parse WhatsApp export: ${parseErr.message}`
      };
    }

    if (parseResult.messageCount === 0) {
      return {
        statusCode: 400,
        error: 'No recognizable WhatsApp messages found in the file. Please ensure this is an unedited export file.'
      };
    }

    // 6. Atomic Transaction for Database Writes
    const importId = `imp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    try {
      db.exec('BEGIN IMMEDIATE;');

      // Double-check within transaction in case of race condition
      const raceCheck = checkImportStmt.get(
        tenantId,
        destinationType,
        destinationId,
        contentHash,
        dateFormat,
        timezone
      ) as any;

      if (raceCheck) {
        db.exec('ROLLBACK;');
        return {
          statusCode: 200,
          data: {
            status: 'already_imported',
            existing: true,
            message: 'This WhatsApp chat export was already imported concurrently.',
            import: raceCheck
          }
        };
      }

      // Insert Import Record
      const insertImport = db.prepare(`
        INSERT INTO whatsapp_imports (
          id, tenant_id, destination_type, destination_id, content_hash,
          message_count, skipped_count, date_range_start, date_range_end,
          date_format, timezone, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertImport.run(
        importId,
        tenantId,
        destinationType,
        destinationId,
        contentHash,
        parseResult.messageCount,
        parseResult.skippedCount,
        parseResult.dateRange?.start || null,
        parseResult.dateRange?.end || null,
        dateFormat,
        timezone,
        userId,
        now
      );

      // Insert Individual Message Timeline Events
      const insertTimeline = db.prepare(`
        INSERT INTO timeline_events (
          id, tenant_id, destination_type, destination_id, event_type,
          sender, content, timestamp_utc, original_timestamp, sequence_order,
          import_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const msg of parseResult.messages) {
        const eventId = `tle-${importId}-${msg.sequenceOrder}`;
        insertTimeline.run(
          eventId,
          tenantId,
          destinationType,
          destinationId,
          'whatsapp_message',
          msg.sender,
          msg.messageText,
          msg.timestampUtc,
          msg.originalTimestamp,
          msg.sequenceOrder,
          importId,
          now
        );
      }

      // Insert Import Audit Summary event in timeline
      const summaryEventId = `tle-${importId}-audit`;
      insertTimeline.run(
        summaryEventId,
        tenantId,
        destinationType,
        destinationId,
        'whatsapp_import',
        'System (WhatsApp Import)',
        `Imported ${parseResult.messageCount} messages (${parseResult.skippedCount} system events/skipped lines) spanning ${parseResult.dateRange?.start || 'N/A'} to ${parseResult.dateRange?.end || 'N/A'}.`,
        parseResult.dateRange?.end || now,
        'Import Audit',
        999999,
        importId,
        now
      );

      db.exec('COMMIT;');

      logger.info('WhatsApp import completed successfully', {
        tenantId,
        destinationType,
        destinationId,
        messageCount: parseResult.messageCount,
        skippedCount: parseResult.skippedCount,
        contentHash,
        durationMs: Date.now() - startTime
      });

      return {
        statusCode: 201,
        data: {
          status: 'success',
          importId,
          contentHash,
          destinationType,
          destinationId,
          messageCount: parseResult.messageCount,
          skippedCount: parseResult.skippedCount,
          dateRange: parseResult.dateRange,
          senderLabels: parseResult.senderLabels,
          createdAt: now
        }
      };
    } catch (dbErr: any) {
      try {
        db.exec('ROLLBACK;');
      } catch {}

      // Unique constraint check
      if (dbErr.message && dbErr.message.includes('UNIQUE constraint failed')) {
        const recheck = checkImportStmt.get(
          tenantId,
          destinationType,
          destinationId,
          contentHash,
          dateFormat,
          timezone
        ) as any;
        if (recheck) {
          return {
            statusCode: 200,
            data: {
              status: 'already_imported',
              existing: true,
              import: recheck
            }
          };
        }
      }

      logger.error('WhatsApp import transaction failed', {
        tenantId,
        destinationType,
        destinationId,
        error: dbErr.message
      });

      return {
        statusCode: 500,
        error: `Database transaction error: ${dbErr.message}`
      };
    }
  }
}
