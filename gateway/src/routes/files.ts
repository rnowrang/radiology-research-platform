import { Router } from 'express';
import { fileController } from '../controllers/fileController.js';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// File upload
// POST /api/files
router.post(
  '/',
  upload.single('file'),
  asyncHandler(fileController.upload)
);

// Download file
// GET /api/files/:id
router.get(
  '/:id',
  asyncHandler(fileController.download)
);

// Get files by task ID
// GET /api/files/task/:taskId
router.get(
  '/task/:taskId',
  asyncHandler(fileController.getFilesByTaskId)
);

// Get file metadata
// GET /api/files/:id/metadata
router.get(
  '/:id/metadata',
  asyncHandler(fileController.getMetadata)
);

// Preview file (inline viewing)
// GET /api/files/:id/preview
router.get(
  '/:id/preview',
  asyncHandler(fileController.previewFile)
);

// Soft delete file
// DELETE /api/files/:id
router.delete(
  '/:id',
  asyncHandler(fileController.delete)
);

export default router;
