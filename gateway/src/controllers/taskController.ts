import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { formsProxy } from '../services/formsProxy.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS, USER_ROLES } from '../config/constants.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';

export const taskController = {
  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const response = await formsProxy.getTasks(req.user!.id, req.query as Record<string, unknown>);
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  },

  get: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const response = await formsProxy.getTask(taskId, req.user!.id);
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  },

  create: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title } = req.body;

      if (!title) {
        throw new ValidationError('Title is required');
      }

      const response = await formsProxy.createTask(req.body, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'task',
        resourceId: response.data.data?.id?.toString(),
        details: { title },
      });

      res.status(201).json(response.data);
    } catch (error) {
      next(error);
    }
  },

  update: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const response = await formsProxy.updateTask(taskId, req.body, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task',
        resourceId: req.params.id,
        details: { fields: Object.keys(req.body) },
      });

      res.json(response.data);
    } catch (error) {
      next(error);
    }
  },

  delete: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const response = await formsProxy.deleteTask(taskId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'task',
        resourceId: req.params.id,
      });

      res.json(response.data);
    } catch (error) {
      next(error);
    }
  },

  complete: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const response = await formsProxy.completeTask(taskId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task',
        resourceId: req.params.id,
        details: { action: 'complete' },
      });

      res.json(response.data);
    } catch (error) {
      next(error);
    }
  },

  // ==========================================================================
  // Task Workflow Actions
  // ==========================================================================

  /**
   * Submit a task for review
   * POST /api/tasks/:taskId/submit
   */
  submitTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.taskId, 10);
      const { notes } = req.body;

      const response = await formsProxy.submitTask(taskId, req.user!.id, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.SUBMIT,
        resourceType: 'task',
        resourceId: req.params.taskId,
        details: { action: 'submit_for_review', notes },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Approve a task (admin/reviewer only)
   * POST /api/tasks/:taskId/approve
   */
  approveTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const taskId = parseInt(req.params.taskId, 10);
      const { notes } = req.body;

      const response = await formsProxy.approveTask(taskId, req.user.id, req.user.role, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.APPROVE,
        resourceType: 'task',
        resourceId: req.params.taskId,
        details: { action: 'approve', notes },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reject a task (admin/reviewer only)
   * POST /api/tasks/:taskId/reject
   */
  rejectTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const taskId = parseInt(req.params.taskId, 10);
      const { notes } = req.body;

      if (!notes) {
        throw new ValidationError('Notes are required when rejecting a task');
      }

      const response = await formsProxy.rejectTask(taskId, req.user.id, req.user.role, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.REJECT,
        resourceType: 'task',
        resourceId: req.params.taskId,
        details: { action: 'reject', notes },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Request revision on a task (admin/reviewer only)
   * POST /api/tasks/:taskId/request-revision
   */
  requestRevision: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const taskId = parseInt(req.params.taskId, 10);
      const { notes } = req.body;

      if (!notes) {
        throw new ValidationError('Notes are required when requesting revision');
      }

      const response = await formsProxy.requestTaskRevision(taskId, req.user.id, req.user.role, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task',
        resourceId: req.params.taskId,
        details: { action: 'request_revision', notes },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get tasks pending review (admin/reviewer only)
   * GET /api/tasks/pending-review
   */
  getPendingReviewTasks: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const response = await formsProxy.getPendingReviewTasks(req.user.role);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // ==========================================================================
  // Project Tasks
  // ==========================================================================

  /**
   * Get all tasks for a project
   * GET /api/projects/:projectId/tasks
   */
  getProjectTasks: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params;
      const response = await formsProxy.getProjectTasks(projectId, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get task completion progress for a project
   * GET /api/projects/:projectId/task-progress
   */
  getProjectTaskProgress: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params;
      const response = await formsProxy.getProjectTaskProgress(projectId);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },
};

export default taskController;
