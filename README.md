# ChatHarbor - WhatsApp Chat Import Module

Production-ready, multi-tenant WhatsApp Chat Import feature for ChatHarbor across Web (React) and Android (Kotlin Companion App).

## 🚀 Key Features

1. **One-Time, Privacy-Preserving Import**:
   - Zero access requested to WhatsApp credentials, notifications, broad storage, or Accessibility APIs.
   - Operates strictly on the exported text `.txt` file explicitly selected or shared by the user.
   - Raw exports, message bodies, and filenames are never retained on disk or logged in telemetry.
   - Previews are parsed **100% locally on the client** (both Web and Android). **Zero chat content is transmitted over the network before the user explicitly clicks "Confirm Import"**.

2. **Contacts-First Primary Workflow**:
   - The user-facing dashboard, sidebar, and import destination picker are centered around **Contacts**.
   - Direct matching and importing to tenant-authorized Contacts.

3. **Cross-Platform Reliable Parsing**:
   - Handles standard Android formats (`12/31/20, 11:59 PM - Sender: Message` and `31/12/2020, 23:59:00 - Sender: Message`).
   - Handles iOS bracketed formats (`[12/31/20, 11:59:00 PM] Sender: Message`).
   - Cleans UTF-8 BOM (`\ufeff`), Unicode direction markers (`\u200e`, `\u200f`), and non-breaking spaces.
   - Multiline continuity: lines without timestamp headers remain attached to the preceding message.
   - Automatically detects ambiguous date formats (`DD/MM/YYYY` vs `MM/DD/YYYY` when day and month are both $\le 12$) and requires user selection in preview.
   - Filters and counts system events (encryption warnings, call logs, group actions) while reporting skipped lines transparently.

4. **Multi-Tenant Authenticated Backend**:
   - Strict tenant boundaries: Users cannot import or view records belonging to other tenants (cross-tenant requests return `403 Forbidden`).
   - Atomic database writes and database-backed unique constraint:
     `UNIQUE(tenant_id, destination_type, destination_id, content_hash, date_format, timezone)`
   - Concurrent submissions and retries are idempotent, returning existing import records without inserting duplicate timeline entries.
   - Stores normalized UTC ISO timestamps (`timestamp_utc`) alongside original text timestamps (`original_timestamp`) and sequence orders.
   - Pre-seeded demo accounts and credentials are strictly restricted to local development and test environments (`NODE_ENV !== 'production'`).

5. **Web UI Flow (React + Vite)**:
   - "Import WhatsApp Chat" button on Contact views.
   - Client-side 5 MB size validation, text validation, and local parsing preview before sending anything to the server.
   - Timezone selector defaulting to account timezone.
   - Plain-text escaped timeline rendering to prevent XSS.

6. **Android Companion App (Kotlin)**:
   - Registered for `ACTION_SEND` intent with `text/plain` (Android Share Sheet) and labeled **ChatHarbor**.
   - Document picker fallback for saved `.txt` files.
   - Defensive URI stream reading with strict 5 MB limit.
   - Session authentication with automatic resumption of pending import upon login.
   - Previews conversation locally before upload; Cancel cleans up all temporary files.

---

## 📂 Project Structure

```text
ChatHarbor/
├── backend/
│   ├── src/
│   │   ├── server.ts               # Express API and static app serving
│   │   ├── db/                     # SQLite schema and migration manager
│   │   ├── middleware/             # Tenant auth, 5MB text upload validation
│   │   ├── controllers/            # Import, Leads, Contacts, Timeline, Auth
│   │   ├── services/               # WhatsAppService (parsing, deduplication, atomic write)
│   │   └── utils/                  # Sanitized logger, SHA-256 hash
│   └── test/
│       ├── whatsapp_import.test.ts # Service unit tests
│       └── api_integration.test.ts # E2E HTTP integration tests
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Contacts primary layout, account switcher
│   │   ├── components/             # WhatsAppImportModal, WhatsAppPreview, TimelineView
│   │   └── api.ts                  # ChatHarbor API client
│   └── vite.config.ts
├── android/
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml     # ACTION_SEND intent filter
│   │   └── java/com/chatharbor/crm/
│   │       ├── parser/             # Kotlin WhatsApp parser
│   │       ├── util/               # SafeFileUtils (5MB check & cache cleanup)
│   │       ├── network/            # CrmApiClient
│   │       └── ui/                 # ShareImportActivity
│   └── app/src/test/               # Kotlin unit tests
├── fixtures/                       # Synthetic test exports
└── scripts/
    └── verify_all.sh               # Full test & build verification suite
```

---

## 🛠 Commands & Execution

### 1. Run All Tests & Build
```bash
./scripts/verify_all.sh
```

### 2. Run Backend Tests
```bash
node --experimental-strip-types --test backend/test/*.test.ts
```

### 3. Build Web Frontend
```bash
npx vite build frontend
```

### 4. Build Android Companion App
```bash
cd android
./gradlew testDebugUnitTest
./gradlew assembleDebug
```
The compiled debug APK is located at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 📱 Real Android Device Verification Steps

When testing on a physical Android phone:
1. Connect phone via USB with USB Debugging enabled:
   ```bash
   adb install -r /Users/rajjeet/.gemini/antigravity/scratch/ChatHarbor/android/app/build/outputs/apk/debug/app-debug.apk
   ```
2. Open WhatsApp on the phone and navigate to any conversation.
3. Tap **More (⋮) → More → Export chat → Without media**.
4. In the Android Share Sheet, select **ChatHarbor**.
5. Select destination contact from authorized contacts.
6. Verify local preview displays message counts and sender labels.
7. Tap **Confirm Import**; verify messages appear in the contact's timeline at [http://localhost:3000](http://localhost:3000).
8. Test **Cancel**; verify zero network requests and zero timeline events are created.
9. Re-share the same export; verify it returns the existing import with zero duplicate timeline records.
