import { Response, NextFunction } from 'express';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { AuthenticatedRequest } from '../types/index.js';
import { fileService, FileCategory } from '../services/fileService.js';
import { fileQueries } from '../database/queries/fileQueries.js';
import { projectQueries } from '../database/queries/projectQueries.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Storage base path
const STORAGE_BASE_PATH = process.env.STORAGE_PATH || '/app/storage';

export const fileController = {
  /**
   * Upload a file
   * POST /api/files
   */
  upload: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      const { project_id, form_id, category } = req.body;

      // Validate project access if project_id provided
      if (project_id) {
        const project = await projectQueries.findById(project_id);
        if (!project) {
          throw new NotFoundError('Project not found');
        }

        // Check if user has access to project
        const collaborators = await projectQueries.getCollaborators(project_id);
        const isPI = project.principal_investigator_id === req.user!.id;
        const isCollaborator = collaborators.some(c => c.user_id === req.user!.id);
        const isAdmin = req.user!.role === 'admin';

        if (!isPI && !isCollaborator && !isAdmin) {
          throw new ForbiddenError('You do not have access to this project');
        }
      }

      // Save file
      const savedFile = await fileService.saveFile(
        req.file,
        req.user!.id,
        {
          projectId: project_id,
          formId: form_id ? parseInt(form_id, 10) : undefined,
          category: category as FileCategory,
        },
        req
      );

      res.status(201).json({
        success: true,
        data: savedFile,
        message: 'File uploaded successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Download a file
   * GET /api/files/:id
   */
  download: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const isAdmin = req.user!.role === 'admin';

      // Get file metadata
      const file = await fileService.getFileMetadata(id, req.user!.id, isAdmin);

      // Get full file path
      const filePath = path.join(STORAGE_BASE_PATH, file.storage_path);

      // Check if file exists on disk
      try {
        await fs.access(filePath);
      } catch {
        logger.error(`File not found on disk: ${filePath}`);
        throw new NotFoundError('File not found on disk');
      }

      // Log download audit
      await logAudit(req, {
        action: AUDIT_ACTIONS.DOWNLOAD,
        resourceType: 'file',
        resourceId: id,
        details: {
          original_file_name: file.original_file_name,
          file_size: file.file_size,
        },
      });

      // Set headers for download
      res.setHeader('Content-Type', file.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_file_name)}"`);
      res.setHeader('Content-Length', file.file_size);

      // Stream file to response
      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        logger.error('Error streaming file', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Error downloading file',
          });
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get file metadata without downloading
   * GET /api/files/:id/metadata
   */
  getMetadata: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const isAdmin = req.user!.role === 'admin';

      const file = await fileService.getFileMetadata(id, req.user!.id, isAdmin);

      res.json({
        success: true,
        data: {
          id: file.id,
          original_file_name: file.original_file_name,
          file_size: file.file_size,
          mime_type: file.mime_type,
          category: file.category,
          uploaded_by: {
            id: file.uploaded_by_id,
            name: file.uploaded_by_name,
            email: file.uploaded_by_email,
          },
          project_id: file.project_id,
          form_instance_id: file.form_instance_id,
          created_at: file.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Soft delete a file
   * DELETE /api/files/:id
   */
  delete: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const isAdmin = req.user!.role === 'admin';

      await fileService.deleteFile(id, req.user!.id, isAdmin, req);

      res.json({
        success: true,
        message: 'File deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List files for a project
   * GET /api/projects/:projectId/files
   */
  listProjectFiles: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const isAdmin = req.user!.role === 'admin';

      // Check project access
      const project = await projectQueries.findById(projectId);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      if (!isAdmin) {
        const collaborators = await projectQueries.getCollaborators(projectId);
        const isPI = project.principal_investigator_id === req.user!.id;
        const isCollaborator = collaborators.some(c => c.user_id === req.user!.id);

        if (!isPI && !isCollaborator) {
          throw new ForbiddenError('You do not have access to this project');
        }
      }

      const { files, total } = await fileService.listProjectFiles(projectId, page, limit);

      res.json({
        success: true,
        data: files.map(file => ({
          id: file.id,
          original_file_name: file.original_file_name,
          file_size: file.file_size,
          mime_type: file.mime_type,
          category: file.category,
          uploaded_by: {
            id: file.uploaded_by_id,
            name: file.uploaded_by_name,
            email: file.uploaded_by_email,
          },
          created_at: file.created_at,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List files for a form
   * GET /api/forms/:formId/files
   */
  listFormFiles: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { formId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const formIdNum = parseInt(formId, 10);
      if (isNaN(formIdNum)) {
        throw new ValidationError('Invalid form ID');
      }

      // Note: Form access control should be handled by the forms service
      // For now, we allow access if user is authenticated
      // In a production system, you would check form access through the forms service

      const { files, total } = await fileService.listFormFiles(formIdNum, page, limit);

      res.json({
        success: true,
        data: files.map(file => ({
          id: file.id,
          original_file_name: file.original_file_name,
          file_size: file.file_size,
          mime_type: file.mime_type,
          category: file.category,
          uploaded_by: {
            id: file.uploaded_by_id,
            name: file.uploaded_by_name,
            email: file.uploaded_by_email,
          },
          created_at: file.created_at,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default fileController;
