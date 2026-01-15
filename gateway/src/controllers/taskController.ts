import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { formsProxy } from '../services/formsProxy.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { ValidationError } from '../utils/errors.js';

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
};

export default taskController;
