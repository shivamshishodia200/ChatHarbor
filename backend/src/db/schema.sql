-- 360CRM Database Schema

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'sales_rep',
  api_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  account_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_imports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  destination_type TEXT NOT NULL CHECK(destination_type IN ('lead', 'contact')),
  destination_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  date_range_start TEXT,
  date_range_end TEXT,
  date_format TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CONSTRAINT uq_import_idempotency UNIQUE (tenant_id, destination_type, destination_id, content_hash, date_format, timezone)
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  destination_type TEXT NOT NULL CHECK(destination_type IN ('lead', 'contact')),
  destination_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  sender TEXT,
  content TEXT NOT NULL,
  timestamp_utc TEXT NOT NULL,
  original_timestamp TEXT,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  import_id TEXT REFERENCES whatsapp_imports(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_lookup ON timeline_events(tenant_id, destination_type, destination_id, timestamp_utc, sequence_order);
CREATE INDEX IF NOT EXISTS idx_import_lookup ON whatsapp_imports(tenant_id, destination_type, destination_id, content_hash);

