import { Router } from 'express';
import { projectController } from '../controllers/projectController.js';
import { fileController } from '../controllers/fileController.js';
import { activityController } from '../controllers/activityController.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CRUD routes
router.get('/', projectController.list);
router.post('/', projectController.create);
router.get('/:id', projectController.get);
router.put('/:id', projectController.update);
router.delete('/:id', projectController.delete);

// Collaborator routes
router.get('/:id/collaborators', projectController.getCollaborators);
router.post('/:id/collaborators', projectController.addCollaborator);
router.delete('/:id/collaborators/:userId', projectController.removeCollaborator);

// File routes
router.get('/:projectId/files', asyncHandler(fileController.listProjectFiles));

// Activity routes
router.get('/:id/activity', asyncHandler(activityController.getProjectActivity));

export default router;
