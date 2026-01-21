import { Router } from 'express';
import { projectController } from '../controllers/projectController.js';
import { fileController } from '../controllers/fileController.js';
import { activityController } from '../controllers/activityController.js';
import { taskController } from '../controllers/taskController.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/roles.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CRUD routes
router.get('/', projectController.list);
router.post('/', projectController.create);
router.get('/:id', projectController.get);
router.put('/:id', projectController.update);
router.delete('/:id', projectController.delete);

// Admin review summary route (must be before :id routes to avoid conflicts)
router.get('/:projectId/review-summary', requireAdmin, asyncHandler(projectController.getProjectReviewSummary));

// Collaborator routes
router.get('/:id/collaborators', projectController.getCollaborators);
router.post('/:id/collaborators', projectController.addCollaborator);
router.delete('/:id/collaborators/:userId', projectController.removeCollaborator);

// File routes
router.get('/:projectId/files', asyncHandler(fileController.listProjectFiles));

// Activity routes
router.get('/:id/activity', asyncHandler(activityController.getProjectActivity));

// Task routes
router.get('/:projectId/tasks', asyncHandler(taskController.getProjectTasks));
router.get('/:projectId/task-progress', asyncHandler(taskController.getProjectTaskProgress));
router.post('/:projectId/tasks', asyncHandler(projectController.createProjectTask));

// Project approval workflow routes
router.post('/:id/submit-for-approval', asyncHandler(projectController.submitForApproval));
router.post('/:id/approve', asyncHandler(projectController.approveProject));
router.post('/:id/reject', asyncHandler(projectController.rejectProject));

export default router;
