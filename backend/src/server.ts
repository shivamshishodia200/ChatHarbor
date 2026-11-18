import express, { type Express } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './db/database.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { authMiddleware } from './middleware/auth.ts';
import { singleFileUpload, handleUploadErrors } from './middleware/upload.ts';
import { loginHandler, meHandler } from './controllers/authController.ts';
import { getLeadsHandler, getLeadByIdHandler } from './controllers/leadsController.ts';
import { getContactsHandler, getContactByIdHandler } from './controllers/contactsController.ts';
import { getTimelineHandler } from './controllers/timelineController.ts';
import { importWhatsAppHandler } from './controllers/whatsappImportController.ts';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Initialize DB
  getDatabase();

  // Health check
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'healthy', service: 'ChatHarbor API' });
  });

  // Serve static frontend assets if built
  const publicPath = path.join(__dirname, '../public');
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(publicPath, 'index.html'));
      }
      next();
    });
  }

  // Auth routes
  app.post('/api/auth/login', loginHandler);
  app.get('/api/auth/me', authMiddleware, meHandler);

  // Leads routes
  app.get('/api/leads', authMiddleware, getLeadsHandler);
  app.get('/api/leads/:id', authMiddleware, getLeadByIdHandler);
  app.get('/api/leads/:id/timeline', authMiddleware, getTimelineHandler);
  app.post(
    '/api/leads/:id/whatsapp-import',
    authMiddleware,
    singleFileUpload,
    handleUploadErrors,
    importWhatsAppHandler
  );

  // Contacts routes
  app.get('/api/contacts', authMiddleware, getContactsHandler);
  app.get('/api/contacts/:id', authMiddleware, getContactByIdHandler);
  app.get('/api/contacts/:id/timeline', authMiddleware, getTimelineHandler);
  app.post(
    '/api/contacts/:id/whatsapp-import',
    authMiddleware,
    singleFileUpload,
    handleUploadErrors,
    importWhatsAppHandler
  );

  // Dedicated WhatsApp Import endpoint
  app.post(
    '/api/imports/whatsapp',
    authMiddleware,
    singleFileUpload,
    handleUploadErrors,
    importWhatsAppHandler
  );

  return app;
}

// Start server if run directly
const PORT = parseInt(process.env.PORT || '3000', 10);
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`ChatHarbor Backend running on http://localhost:${PORT}`);
  });
}
