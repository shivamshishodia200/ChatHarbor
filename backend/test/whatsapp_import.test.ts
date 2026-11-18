import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WhatsAppService } from '../src/services/whatsappService.ts';
import { resetDatabaseForTests, getDatabase } from '../src/db/database.ts';
import { parseWhatsAppChat } from '../../shared/src/whatsappParser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, '../../fixtures');

describe('WhatsApp Import Service & Deduplication Tests', () => {
  beforeEach(() => {
    resetDatabaseForTests();
  });

  it('successfully imports a valid Android 12-hour WhatsApp export into a Lead', () => {
    const fileBuffer = fs.readFileSync(path.join(fixturesDir, 'android_12h_sample.txt'));
    const result = WhatsAppService.processImport({
      tenantId: 'tenant-acme',
      userId: 'user-acme-alice',
      destinationType: 'lead',
      destinationId: 'lead-acme-1',
      dateFormat: 'MM/DD/YYYY',
      timezone: 'America/New_York',
      fileBuffer
    });

    assert.strictEqual(result.statusCode, 201);
    assert.strictEqual(result.data.status, 'success');
    assert.strictEqual(result.data.messageCount, 2);
    assert.strictEqual(result.data.skippedCount, 1); // 1 system message skipped
    assert.deepStrictEqual(result.data.senderLabels.sort(), ['Alice Smith', 'Bob Jones'].sort());

    // Verify timeline records in database
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT event_type, sender, content, original_timestamp, timestamp_utc, sequence_order
      FROM timeline_events
      WHERE destination_id = 'lead-acme-1' AND event_type = 'whatsapp_message'
      ORDER BY sequence_order ASC
    `).all() as any[];

    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].sender, 'Alice Smith');
    assert.strictEqual(rows[0].sequence_order, 1);
    assert.strictEqual(rows[0].original_timestamp, '12/31/20, 11:59 PM');
    // 11:59 PM EST on 2020-12-31 is 2021-01-01T04:59:00.000Z
    assert.strictEqual(rows[0].timestamp_utc, '2021-01-01T04:59:00.000Z');
    assert.strictEqual(rows[1].sender, 'Bob Jones');
  });

  it('successfully imports an iOS bracketed export into a Contact', () => {
    const fileBuffer = fs.readFileSync(path.join(fixturesDir, 'ios_bracketed_sample.txt'));
    const result = WhatsAppService.processImport({
      tenantId: 'tenant-acme',
      userId: 'user-acme-alice',
      destinationType: 'contact',
      destinationId: 'contact-acme-1',
      dateFormat: 'DD/MM/YYYY',
      timezone: 'UTC',
      fileBuffer
    });

    assert.strictEqual(result.statusCode, 201);
    assert.strictEqual(result.data.status, 'success');
    assert.strictEqual(result.data.messageCount, 2);
    assert.strictEqual(result.data.skippedCount, 1);
    assert.deepStrictEqual(result.data.senderLabels.sort(), ['Dr. Evelyn Reed', 'Mark Spencer'].sort());
  });

  it('rejects cross-tenant imports with 403 Forbidden and writes 0 records', () => {
    const fileBuffer = fs.readFileSync(path.join(fixturesDir, 'android_12h_sample.txt'));
    
    // User from tenant-acme attempting to import into tenant-globex's lead
    const result = WhatsAppService.processImport({
      tenantId: 'tenant-acme',
      userId: 'user-acme-alice',
      destinationType: 'lead',
      destinationId: 'lead-globex-1', // Belongs to Globex!
      dateFormat: 'MM/DD/YYYY',
      timezone: 'America/New_York',
      fileBuffer
    });

    assert.strictEqual(result.statusCode, 403);
    assert.match(result.error || '', /Forbidden/i);

    // Verify 0 records were created for lead-globex-1
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT COUNT(*) as cnt FROM timeline_events WHERE destination_id = 'lead-globex-1' AND event_type = 'whatsapp_message'
    `).get() as { cnt: number };
    assert.strictEqual(rows.cnt, 0);

    const importRows = db.prepare(`
      SELECT COUNT(*) as cnt FROM whatsapp_imports WHERE destination_id = 'lead-globex-1'
    `).get() as { cnt: number };
    assert.strictEqual(importRows.cnt, 0);
  });

  it('is idempotent: same-file retry returns existing result and does not create duplicates', () => {
    const fileBuffer = fs.readFileSync(path.join(fixturesDir, 'android_24h_sample.txt'));
    const params = {
      tenantId: 'tenant-acme',
      userId: 'user-acme-alice',
      destinationType: 'lead' as const,
      destinationId: 'lead-acme-1',
      dateFormat: 'DD/MM/YYYY' as const,
      timezone: 'UTC',
      fileBuffer
    };

    // First submission
    const res1 = WhatsAppService.processImport(params);
    assert.strictEqual(res1.statusCode, 201);
    assert.strictEqual(res1.data.status, 'success');

    const db = getDatabase();
    const countBefore = (db.prepare(`
      SELECT COUNT(*) as cnt FROM timeline_events WHERE destination_id = 'lead-acme-1' AND event_type = 'whatsapp_message'
    `).get() as any).cnt;

    // Retry submission
    const res2 = WhatsAppService.processImport(params);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.data.status, 'already_imported');
    assert.strictEqual(res2.data.existing, true);

    const countAfter = (db.prepare(`
      SELECT COUNT(*) as cnt FROM timeline_events WHERE destination_id = 'lead-acme-1' AND event_type = 'whatsapp_message'
    `).get() as any).cnt;

    // Must be identical - no duplicates created!
    assert.strictEqual(countBefore, countAfter);
  });

  it('preserves multiline message body and emojis accurately', () => {
    const fileBuffer = fs.readFileSync(path.join(fixturesDir, 'multiline_emoji_sample.txt'));
    const result = WhatsAppService.processImport({
      tenantId: 'tenant-acme',
      userId: 'user-acme-alice',
      destinationType: 'lead',
      destinationId: 'lead-acme-1',
      dateFormat: 'DD/MM/YYYY',
      timezone: 'UTC',
      fileBuffer
    });

    assert.strictEqual(result.statusCode, 201);
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT content, sender FROM timeline_events
      WHERE destination_id = 'lead-acme-1' AND event_type = 'whatsapp_message'
      ORDER BY sequence_order ASC
    `).all() as any[];

    assert.strictEqual(rows.length, 2);
    assert.match(rows[0].content, /1\. Multi-tenant security/);
    assert.match(rows[0].content, /🚀/);
    assert.match(rows[1].content, /💻👍/);
  });

  it('rejects empty files with a clear 400 error', () => {
    const fileBuffer = Buffer.from('');
    const result = WhatsAppService.processImport({
      tenantId: 'tenant-acme',
      userId: 'user-acme-alice',
      destinationType: 'lead',
      destinationId: 'lead-acme-1',
      dateFormat: 'DD/MM/YYYY',
      timezone: 'UTC',
      fileBuffer
    });

    assert.strictEqual(result.statusCode, 400);
    assert.match(result.error || '', /empty/i);
  });

  it('rejects binary files with a clear 400 error', () => {
    // Buffer with binary null bytes
    const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    const result = WhatsAppService.processImport({
      tenantId: 'tenant-acme',
      userId: 'user-acme-alice',
      destinationType: 'lead',
      destinationId: 'lead-acme-1',
      dateFormat: 'DD/MM/YYYY',
      timezone: 'UTC',
      fileBuffer: binaryBuffer
    });

    assert.strictEqual(result.statusCode, 400);
    assert.match(result.error || '', /binary/i);
  });

  it('disambiguates dates correctly according to user-specified dateFormat', () => {
    const content = '05/06/2024, 10:00 - Alice: Meeting time\n';
    const buffer = Buffer.from(content, 'utf8');

    // Case A: User specifies DD/MM/YYYY -> June 5, 2024
    const resA = WhatsAppService.processImport({
      tenantId: 'tenant-acme',
      userId: 'user-acme-alice',
      destinationType: 'lead',
      destinationId: 'lead-acme-1',
      dateFormat: 'DD/MM/YYYY',
      timezone: 'UTC',
      fileBuffer: buffer
    });
    assert.strictEqual(resA.statusCode, 201);

    const db = getDatabase();
    const eventA = db.prepare(`
      SELECT timestamp_utc FROM timeline_events
      WHERE destination_id = 'lead-acme-1' AND event_type = 'whatsapp_message'
    `).get() as any;
    assert.strictEqual(eventA.timestamp_utc, '2024-06-05T10:00:00.000Z');
  });
});

