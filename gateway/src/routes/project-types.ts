import { Router } from 'express';
import { projectController } from '../controllers/projectController.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication (but not admin role)
router.use(authenticate);

// GET /api/project-types/:projectType/tasks - Get task definitions for a project type
// This endpoint is available to any authenticated user for previewing tasks during project creation
router.get('/:projectType/tasks', asyncHandler(projectController.getTasksForProjectType));

export default router;
