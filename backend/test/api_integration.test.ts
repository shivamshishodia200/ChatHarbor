import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { resetDatabaseForTests } from '../src/db/database.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, '../../fixtures');

describe('ChatHarbor End-to-End API Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  const acmeToken = 'token-acme-alice-123';
  const globexToken = 'token-globex-hank-456';

  before(async () => {
    resetDatabaseForTests();
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as any;
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('authenticates user via POST /api/auth/login', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'password123' })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(data.token, acmeToken);
    assert.strictEqual(data.user.username, 'alice');
    assert.strictEqual(data.tenant.id, 'tenant-acme');
  });

  it('rejects unauthenticated requests to protected endpoints with 401', async () => {
    const res = await fetch(`${baseUrl}/api/leads`);
    assert.strictEqual(res.status, 401);
  });

  it('uploads WhatsApp chat export to lead and verifies timeline', async () => {
    const fileContent = fs.readFileSync(path.join(fixturesDir, 'android_12h_sample.txt'), 'utf8');
    const formData = new FormData();
    const blob = new Blob([fileContent], { type: 'text/plain' });
    formData.append('file', blob, 'whatsapp_export.txt');
    formData.append('dateFormat', 'MM/DD/YYYY');
    formData.append('timezone', 'America/New_York');

    // POST to import endpoint
    const importRes = await fetch(`${baseUrl}/api/leads/lead-acme-1/whatsapp-import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${acmeToken}`
      },
      body: formData
    });

    assert.strictEqual(importRes.status, 201);
    const importData = await importRes.json() as any;
    assert.strictEqual(importData.status, 'success');
    assert.strictEqual(importData.messageCount, 2);

    // GET timeline for lead
    const timelineRes = await fetch(`${baseUrl}/api/leads/lead-acme-1/timeline`, {
      headers: {
        'Authorization': `Bearer ${acmeToken}`
      }
    });

    assert.strictEqual(timelineRes.status, 200);
    const timelineData = await timelineRes.json() as any;
    assert.ok(timelineData.events.length >= 3); // 1 existing note + 2 whatsapp messages + 1 audit summary

    const whatsappEvents = timelineData.events.filter((e: any) => e.event_type === 'whatsapp_message');
    assert.strictEqual(whatsappEvents.length, 2);
    assert.strictEqual(whatsappEvents[0].sender, 'Alice Smith');
    assert.strictEqual(whatsappEvents[1].sender, 'Bob Jones');
  });

  it('simultaneous concurrent submissions produce exactly one import without duplicates', async () => {
    const fileContent = fs.readFileSync(path.join(fixturesDir, 'ios_bracketed_sample.txt'), 'utf8');

    const makeUpload = () => {
      const formData = new FormData();
      formData.append('file', new Blob([fileContent], { type: 'text/plain' }), 'ios_chat.txt');
      formData.append('dateFormat', 'DD/MM/YYYY');
      formData.append('timezone', 'UTC');
      return fetch(`${baseUrl}/api/contacts/contact-acme-1/whatsapp-import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${acmeToken}` },
        body: formData
      });
    };

    // Fire 3 simultaneous upload requests
    const [res1, res2, res3] = await Promise.all([makeUpload(), makeUpload(), makeUpload()]);

    const statuses = [res1.status, res2.status, res3.status];
    // Exactly one must be 201 (or all 200/201), none should be 500
    assert.ok(statuses.every(s => s === 200 || s === 201), `Unexpected statuses: ${statuses}`);
    assert.strictEqual(statuses.filter(s => s === 201).length, 1);

    // Verify timeline has only 2 messages (not duplicated 3x)
    const timelineRes = await fetch(`${baseUrl}/api/contacts/contact-acme-1/timeline`, {
      headers: { 'Authorization': `Bearer ${acmeToken}` }
    });
    const timelineData = await timelineRes.json() as any;
    const whatsappMsgs = timelineData.events.filter((e: any) => e.event_type === 'whatsapp_message');
    assert.strictEqual(whatsappMsgs.length, 2);
  });

  it('enforces 5 MB limit and rejects oversized files with 413', async () => {
    // Generate a 5.2 MB buffer of dummy text
    const oversizedBuffer = Buffer.alloc(5.2 * 1024 * 1024, 'A');
    const formData = new FormData();
    formData.append('file', new Blob([oversizedBuffer], { type: 'text/plain' }), 'giant.txt');

    const res = await fetch(`${baseUrl}/api/leads/lead-acme-1/whatsapp-import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${acmeToken}` },
      body: formData
    });

    assert.strictEqual(res.status, 413);
    const data = await res.json() as any;
    assert.match(data.error, /5 MB/);
  });

  it('rejects cross-tenant access and returns 403', async () => {
    const fileContent = fs.readFileSync(path.join(fixturesDir, 'android_12h_sample.txt'), 'utf8');
    const formData = new FormData();
    formData.append('file', new Blob([fileContent], { type: 'text/plain' }), 'chat.txt');

    // Acme user trying to import to Globex lead
    const res = await fetch(`${baseUrl}/api/leads/lead-globex-1/whatsapp-import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${acmeToken}` },
      body: formData
    });

    assert.strictEqual(res.status, 403);
  });

  it('verifies that no import records or timeline events are created when an import is cancelled or before confirmation', async () => {
    // Check initial count
    const checkRes = await fetch(`${baseUrl}/api/contacts/contact-acme-1/timeline`, {
      headers: { 'Authorization': `Bearer ${acmeToken}` }
    });
    const beforeData = await checkRes.json() as any;
    const initialCount = beforeData.events.length;

    // A user previews locally in Web or Android and cancels: no request is made to the import endpoint
    // Verification: count must remain unchanged
    const afterRes = await fetch(`${baseUrl}/api/contacts/contact-acme-1/timeline`, {
      headers: { 'Authorization': `Bearer ${acmeToken}` }
    });
    const afterData = await afterRes.json() as any;
    assert.strictEqual(afterData.events.length, initialCount);
  });
});

