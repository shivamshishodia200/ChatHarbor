import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance: DatabaseSync | null = null;

export function getDatabase(dbPath?: string): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const effectivePath = dbPath || process.env.DATABASE_PATH || ':memory:';
  const db = new DatabaseSync(effectivePath);
  db.exec('PRAGMA foreign_keys = ON;');

  // Run schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }

  seedInitialData(db);
  dbInstance = db;
  return dbInstance;
}

export function resetDatabaseForTests(): DatabaseSync {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
  }
  dbInstance = null;
  return getDatabase(':memory:');
}

export function seedInitialData(db: DatabaseSync): void {
  // Restrict demo seeding exclusively to local development and test environments
  const env = process.env.NODE_ENV || 'development';
  const isDevOrTest = env === 'development' || env === 'test' || process.env.SEED_DEMO_DATA === 'true';
  if (!isDevOrTest) {
    return;
  }

  // Check if already seeded
  const checkStmt = db.prepare('SELECT COUNT(*) as cnt FROM tenants');
  const result = checkStmt.get() as { cnt: number };
  if (result.cnt > 0) return;

  const now = new Date().toISOString();

  // Insert Tenants
  const insertTenant = db.prepare(`
    INSERT INTO tenants (id, name, timezone, created_at)
    VALUES (?, ?, ?, ?)
  `);
  insertTenant.run('tenant-acme', 'Acme Corporation', 'America/New_York', now);
  insertTenant.run('tenant-globex', 'Globex Corporation', 'Europe/London', now);

  // Insert Users
  const insertUser = db.prepare(`
    INSERT INTO users (id, tenant_id, username, password_hash, name, role, api_token, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Password for both is 'password123'
  insertUser.run(
    'user-acme-alice',
    'tenant-acme',
    'alice',
    'sha256_mock_hash_for_password123',
    'Alice Smith',
    'account_exec',
    'token-acme-alice-123',
    now
  );
  insertUser.run(
    'user-globex-hank',
    'tenant-globex',
    'hank',
    'sha256_mock_hash_for_password123',
    'Hank Scorpio',
    'sales_manager',
    'token-globex-hank-456',
    now
  );

  // Insert Leads
  const insertLead = db.prepare(`
    INSERT INTO leads (id, tenant_id, name, email, phone, company, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertLead.run(
    'lead-acme-1',
    'tenant-acme',
    'Bruce Wayne',
    'bruce@wayneenterprises.com',
    '+1-555-0100',
    'Wayne Enterprises',
    'qualified',
    now
  );
  insertLead.run(
    'lead-globex-1',
    'tenant-globex',
    'Homer Simpson',
    'homer@springfieldnuclear.com',
    '+1-555-0199',
    'Springfield Nuclear',
    'negotiation',
    now
  );

  // Insert Contacts
  const insertContact = db.prepare(`
    INSERT INTO contacts (id, tenant_id, name, email, phone, account_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertContact.run(
    'contact-acme-1',
    'tenant-acme',
    'Lucius Fox',
    'lucius@waynetech.com',
    '+1-555-0102',
    'Wayne Enterprises',
    now
  );
  insertContact.run(
    'contact-globex-1',
    'tenant-globex',
    'Waylon Smithers',
    'smithers@springfieldpower.com',
    '+1-555-0198',
    'Springfield Nuclear',
    now
  );

  // Insert existing timeline entries to verify existing timeline integration
  const insertTimeline = db.prepare(`
    INSERT INTO timeline_events (
      id, tenant_id, destination_type, destination_id, event_type, sender,
      content, timestamp_utc, original_timestamp, sequence_order, import_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTimeline.run(
    'timeline-seed-1',
    'tenant-acme',
    'lead',
    'lead-acme-1',
    'note',
    'Alice Smith',
    'Initial discovery call completed. Prospect interested in enterprise license.',
    '2024-01-10T15:00:00.000Z',
    'Jan 10, 2024 10:00 AM EST',
    0,
    null,
    now
  );
  insertTimeline.run(
    'timeline-seed-2',
    'tenant-acme',
    'contact',
    'contact-acme-1',
    'call',
    'Alice Smith',
    'Scheduled Q2 technical review.',
    '2024-02-01T14:30:00.000Z',
    'Feb 1, 2024 9:30 AM EST',
    0,
    null,
    now
  );
}

