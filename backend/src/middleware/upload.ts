import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  },
  fileFilter: (_req, file, cb) => {
    // Check filename extension if provided
    const lowerName = (file.originalname || '').toLowerCase();
    if (lowerName && !lowerName.endsWith('.txt')) {
      return cb(new Error('INVALID_FILE_TYPE: Only .txt files are supported for WhatsApp chat export.'));
    }
    cb(null, true);
  }
});

export const singleFileUpload = upload.single('file');

export function handleUploadErrors(
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!err) {
    return next();
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: 'File size exceeds the 5 MB limit. Please export without media or select a smaller chat.'
      });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  if (err.message && err.message.startsWith('INVALID_FILE_TYPE')) {
    res.status(400).json({ error: err.message });
    return;
  }

  res.status(400).json({ error: err.message || 'Error uploading file' });
}
