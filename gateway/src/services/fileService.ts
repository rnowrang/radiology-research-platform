import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileQueries, CreateFileData, FileWithUploader } from '../database/queries/fileQueries.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { AuthenticatedRequest } from '../types/index.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// File categories
export const FILE_CATEGORIES = {
  PROPOSAL: 'proposal',
  IRB_DOCUMENT: 'irb_document',
  CONSENT_FORM: 'consent_form',
  PROTOCOL: 'protocol',
  DATA: 'data',
  RESULT: 'result',
  OTHER: 'other',
} as const;

export type FileCategory = typeof FILE_CATEGORIES[keyof typeof FILE_CATEGORIES];

// Allowed MIME types
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
};

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Storage base path (in Docker: /app/storage, local: ./storage)
const STORAGE_BASE_PATH = process.env.STORAGE_PATH || '/app/storage';
const UPLOADS_PATH = path.join(STORAGE_BASE_PATH, 'uploads');

export interface SaveFileOptions {
  projectId?: string;
  formId?: number;
  category?: FileCategory;
}

export const fileService = {
  /**
   * Validate file type based on MIME type and extension
   */
  validateFileType: (mimetype: string, originalname: string): boolean => {
    const allowedExtensions = ALLOWED_MIME_TYPES[mimetype];
    if (!allowedExtensions) {
      return false;
    }

    const ext = path.extname(originalname).toLowerCase();
    return allowedExtensions.includes(ext);
  },

  /**
   * Validate file size
   */
  validateFileSize: (size: number): boolean => {
    return size > 0 && size <= MAX_FILE_SIZE;
  },

  /**
   * Generate SHA-256 checksum for a file
   */
  generateChecksum: async (filePath: string): Promise<string> => {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  },

  /**
   * Get full storage path for a file
   */
  getFilePath: async (fileId: string): Promise<string | null> => {
    const file = await fileQueries.findFileById(fileId);
    if (!file) {
      return null;
    }
    return path.join(STORAGE_BASE_PATH, file.storage_path);
  },

  /**
   * Save uploaded file and create database record
   */
  saveFile: async (
    file: Express.Multer.File,
    uploadedById: string,
    options: SaveFileOptions = {},
    req?: AuthenticatedRequest
  ): Promise<FileWithUploader> => {
    // Validate file type
    if (!fileService.validateFileType(file.mimetype, file.originalname)) {
      // Clean up uploaded file
      await fs.unlink(file.path).catch(() => {});
      throw new ValidationError('Invalid file type. Allowed types: PDF, DOCX, DOC, XLSX, XLS, PNG, JPG, JPEG, GIF');
    }

    // Validate file size
    if (!fileService.validateFileSize(file.size)) {
      // Clean up uploaded file
      await fs.unlink(file.path).catch(() => {});
      throw new ValidationError(`File size must be between 1 byte and ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Validate category if provided
    if (options.category && !Object.values(FILE_CATEGORIES).includes(options.category)) {
      await fs.unlink(file.path).catch(() => {});
      throw new ValidationError(`Invalid category. Allowed: ${Object.values(FILE_CATEGORIES).join(', ')}`);
    }

    try {
      // Generate checksum
      const checksum = await fileService.generateChecksum(file.path);

      // Calculate relative storage path (from STORAGE_BASE_PATH)
      const relativePath = path.relative(STORAGE_BASE_PATH, file.path);

      // Create database record
      const fileData: CreateFileData = {
        project_id: options.projectId,
        form_instance_id: options.formId,
        uploaded_by_id: uploadedById,
        file_name: file.filename,
        original_file_name: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        category: options.category || 'other',
        storage_path: relativePath,
        checksum,
        is_encrypted: false,
      };

      const savedFile = await fileQueries.createFile(fileData);

      // Get full file record with uploader info
      const fileWithUploader = await fileQueries.findFileById(savedFile.id);

      // Log audit event
      if (req) {
        await logAudit(req, {
          action: AUDIT_ACTIONS.UPLOAD,
          resourceType: 'file',
          resourceId: savedFile.id,
          details: {
            original_file_name: file.originalname,
            file_size: file.size,
            mime_type: file.mimetype,
            category: options.category || 'other',
            project_id: options.projectId,
            form_id: options.formId,
          },
        });
      }

      logger.info(`File uploaded: ${savedFile.id} (${file.originalname})`);

      return fileWithUploader!;
    } catch (error) {
      // Clean up uploaded file on error
      await fs.unlink(file.path).catch(() => {});
      throw error;
    }
  },

  /**
   * Get file metadata
   */
  getFileMetadata: async (fileId: string, userId: string, isAdmin: boolean = false): Promise<FileWithUploader> => {
    const file = await fileQueries.findFileById(fileId);

    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Check access
    if (!isAdmin) {
      const { hasAccess } = await fileQueries.checkFileAccess(fileId, userId);
      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this file');
      }
    }

    return file;
  },

  /**
   * Soft delete a file
   */
  deleteFile: async (
    fileId: string,
    userId: string,
    isAdmin: boolean = false,
    req?: AuthenticatedRequest
  ): Promise<void> => {
    const file = await fileQueries.findFileById(fileId);

    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Check access - only owner or admin can delete
    if (!isAdmin) {
      const { isOwner } = await fileQueries.checkFileAccess(fileId, userId);
      if (!isOwner) {
        throw new ForbiddenError('Only the file owner or an admin can delete this file');
      }
    }

    // Soft delete in database
    await fileQueries.softDeleteFile(fileId);

    // Log audit event
    if (req) {
      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'file',
        resourceId: fileId,
        details: {
          original_file_name: file.original_file_name,
          file_size: file.file_size,
          category: file.category,
        },
      });
    }

    logger.info(`File soft deleted: ${fileId} (${file.original_file_name})`);
  },

  /**
   * List files for a project
   */
  listProjectFiles: async (
    projectId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ files: FileWithUploader[]; total: number }> => {
    return fileQueries.findFilesByProjectId(projectId, page, limit);
  },

  /**
   * List files for a form
   */
  listFormFiles: async (
    formId: number,
    page: number = 1,
    limit: number = 50
  ): Promise<{ files: FileWithUploader[]; total: number }> => {
    return fileQueries.findFilesByFormId(formId, page, limit);
  },

  /**
   * Ensure uploads directory exists
   */
  ensureUploadsDir: async (): Promise<void> => {
    try {
      await fs.access(UPLOADS_PATH);
    } catch {
      await fs.mkdir(UPLOADS_PATH, { recursive: true });
      logger.info(`Created uploads directory: ${UPLOADS_PATH}`);
    }
  },
};

export default fileService;
