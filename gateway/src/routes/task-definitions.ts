import { Router } from 'express';
import { taskDefinitionController } from '../controllers/taskDefinitionController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';

const router = Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// =============================================================================
// Task Definitions - Admin Routes
// =============================================================================

// GET /api/admin/task-definitions - List all task definitions
router.get('/task-definitions', taskDefinitionController.getTaskDefinitions);

// POST /api/admin/task-definitions - Create a new task definition
router.post('/task-definitions', taskDefinitionController.createTaskDefinition);

// PUT /api/admin/task-definitions/:id - Update a task definition
router.put('/task-definitions/:id', taskDefinitionController.updateTaskDefinition);

// DELETE /api/admin/task-definitions/:id - Delete (deactivate) a task definition
router.delete('/task-definitions/:id', taskDefinitionController.deleteTaskDefinition);

// =============================================================================
// Project Type Mappings - Admin Routes
// =============================================================================

// GET /api/admin/project-type-mappings - List all mappings
router.get('/project-type-mappings', taskDefinitionController.getProjectTypeMappings);

// GET /api/admin/project-type-mappings/:projectType - Get mappings for a specific project type
router.get('/project-type-mappings/:projectType', taskDefinitionController.getProjectTypeMappingsByType);

// POST /api/admin/project-type-mappings - Create a new mapping
router.post('/project-type-mappings', taskDefinitionController.createProjectTypeMapping);

// DELETE /api/admin/project-type-mappings/:id - Delete a mapping
router.delete('/project-type-mappings/:id', taskDefinitionController.deleteProjectTypeMapping);

export default router;
