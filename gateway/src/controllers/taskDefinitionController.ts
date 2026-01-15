import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { formsProxy } from '../services/formsProxy.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS, USER_ROLES } from '../config/constants.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';

export const taskDefinitionController = {
  // ==========================================================================
  // Task Definitions - Admin Management
  // ==========================================================================

  /**
   * List all task definitions
   * GET /api/admin/task-definitions
   */
  getTaskDefinitions: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const activeOnly = req.query.active_only !== 'false';
      const response = await formsProxy.getTaskDefinitions(activeOnly);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create a new task definition
   * POST /api/admin/task-definitions
   */
  createTaskDefinition: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const { name, task_type } = req.body;

      if (!name || !task_type) {
        throw new ValidationError('name and task_type are required');
      }

      const response = await formsProxy.createTaskDefinition(req.body);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'task_definition',
        resourceId: response.data?.id?.toString(),
        details: { name, task_type },
      });

      res.status(201).json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a task definition
   * PUT /api/admin/task-definitions/:id
   */
  updateTaskDefinition: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const definitionId = parseInt(req.params.id, 10);
      const response = await formsProxy.updateTaskDefinition(definitionId, req.body);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task_definition',
        resourceId: req.params.id,
        details: { fields: Object.keys(req.body) },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete (deactivate) a task definition
   * DELETE /api/admin/task-definitions/:id
   */
  deleteTaskDefinition: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const definitionId = parseInt(req.params.id, 10);
      const response = await formsProxy.deleteTaskDefinition(definitionId);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'task_definition',
        resourceId: req.params.id,
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // ==========================================================================
  // Project Type Mappings - Admin Management
  // ==========================================================================

  /**
   * List all project type mappings
   * GET /api/admin/project-type-mappings
   */
  getProjectTypeMappings: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const response = await formsProxy.getProjectTypeMappings();
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get mappings for a specific project type
   * GET /api/admin/project-type-mappings/:projectType
   */
  getProjectTypeMappingsByType: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const { projectType } = req.params;
      const response = await formsProxy.getProjectTypeMappingsByType(projectType);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create a new project type mapping
   * POST /api/admin/project-type-mappings
   */
  createProjectTypeMapping: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const { project_type, task_definition_id } = req.body;

      if (!project_type || !task_definition_id) {
        throw new ValidationError('project_type and task_definition_id are required');
      }

      const response = await formsProxy.createProjectTypeMapping(req.body);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'project_type_mapping',
        resourceId: response.data?.id?.toString(),
        details: { project_type, task_definition_id },
      });

      res.status(201).json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a project type mapping
   * DELETE /api/admin/project-type-mappings/:id
   */
  deleteProjectTypeMapping: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const mappingId = parseInt(req.params.id, 10);
      const response = await formsProxy.deleteProjectTypeMapping(mappingId);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'project_type_mapping',
        resourceId: req.params.id,
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },
};

export default taskDefinitionController;
