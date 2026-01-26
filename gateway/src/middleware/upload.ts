import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { logger } from '../utils/logger.js';

// Storage base path (in Docker: /app/storage, local: ./storage)
const STORAGE_BASE_PATH = process.env.STORAGE_PATH || '/app/storage';
const UPLOADS_PATH = path.join(STORAGE_BASE_PATH, 'uploads');

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'image/png',
  'image/jpeg',
  'image/gif',
]);

// Allowed extensions
const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
]);

// Configure storage
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    // Create date-based subdirectory for better organization
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const uploadDir = path.join(UPLOADS_PATH, `${year}`, `${month}`, `${day}`);

    // Create directory if it doesn't exist (multer will handle this with recursive: true)
    import('fs/promises').then(async (fs) => {
      try {
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
      } catch (error) {
        logger.error('Failed to create upload directory', error);
        cb(error as Error, uploadDir);
      }
    });
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Generate unique filename with UUID
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueId = uuidv4();
    const filename = `${uniqueId}${ext}`;
    cb(null, filename);
  },
});

// File filter
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    logger.warn(`Rejected file upload: invalid MIME type ${file.mimetype}`);
    cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: PDF, DOCX, DOC, XLSX, XLS, PNG, JPG, JPEG, GIF`));
    return;
  }

  // Check extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    logger.warn(`Rejected file upload: invalid extension ${ext}`);
    cb(new Error(`Invalid file extension: ${ext}. Allowed extensions: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`));
    return;
  }

  // File is valid
  cb(null, true);
};

// Create multer upload instance (disk storage for general uploads)
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only allow single file upload per request
  },
});

// Create multer upload instance with memory storage (for protocol assistant)
// This is needed because we forward the file buffer to the microservice
export const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});

// Export constants for use elsewhere
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES: Array.from(ALLOWED_MIME_TYPES),
  ALLOWED_EXTENSIONS: Array.from(ALLOWED_EXTENSIONS),
  UPLOADS_PATH,
};

export default upload;
