import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { formsProxy } from '../services/formsProxy.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS, USER_ROLES } from '../config/constants.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';

export const reviewStageController = {
  // ==========================================================================
  // Admin Stage Management
  // ==========================================================================

  listStages: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const activeOnly = req.query.active_only !== 'false';
      const response = await formsProxy.getReviewStages(req.user.role, activeOnly);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  createStage: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const { code, name, description, sequence_order, default_deadline_days, requires_all_previous, is_active } = req.body;

      if (!code || !name || sequence_order === undefined) {
        throw new ValidationError('Code, name, and sequence_order are required');
      }

      const response = await formsProxy.createReviewStage(req.user.role, req.body);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'review_stage',
        resourceId: response.data?.id?.toString(),
        details: { code, name },
      });

      res.status(201).json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getStage: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const stageId = parseInt(req.params.stageId, 10);
      const response = await formsProxy.getReviewStage(req.user.role, stageId);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  updateStage: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const stageId = parseInt(req.params.stageId, 10);
      const response = await formsProxy.updateReviewStage(req.user.role, stageId, req.body);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'review_stage',
        resourceId: req.params.stageId,
        details: { fields: Object.keys(req.body) },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  deleteStage: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const stageId = parseInt(req.params.stageId, 10);
      const response = await formsProxy.deleteReviewStage(req.user.role, stageId);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'review_stage',
        resourceId: req.params.stageId,
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  reorderStages: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Admin access required');
      }

      const { stage_ids } = req.body;

      if (!stage_ids || !Array.isArray(stage_ids)) {
        throw new ValidationError('stage_ids array is required');
      }

      const response = await formsProxy.reorderReviewStages(req.user.role, stage_ids);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'review_stage',
        resourceId: 'reorder',
        details: { stage_ids },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // ==========================================================================
  // Form Review Progress
  // ==========================================================================

  getFormProgress: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const response = await formsProxy.getFormReviewProgress(formId);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  assignReviewer: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const formId = parseInt(req.params.formId, 10);
      const stageId = parseInt(req.params.stageId, 10);
      const { reviewer_id, deadline } = req.body;

      if (!reviewer_id) {
        throw new ValidationError('reviewer_id is required');
      }

      const response = await formsProxy.assignReviewerToStage(
        formId,
        stageId,
        req.user.role,
        reviewer_id,
        deadline
      );

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'form_review',
        resourceId: response.data?.review_id?.toString(),
        details: { form_id: formId, stage_id: stageId, reviewer_id },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  startStageReview: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Reviewer access required');
      }

      const formId = parseInt(req.params.formId, 10);
      const stageId = parseInt(req.params.stageId, 10);

      const response = await formsProxy.startStageReview(formId, stageId, req.user.id, req.user.role);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'form_review',
        resourceId: response.data?.review_id?.toString(),
        details: { form_id: formId, stage_id: stageId, action: 'start' },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  completeStage: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Reviewer access required');
      }

      const formId = parseInt(req.params.formId, 10);
      const stageId = parseInt(req.params.stageId, 10);
      const { status, comments } = req.body;

      if (!status) {
        throw new ValidationError('status is required (approved, rejected, or revision_required)');
      }

      const response = await formsProxy.completeStageReview(
        formId,
        stageId,
        req.user.id,
        req.user.role,
        status,
        comments
      );

      await logAudit(req, {
        action: status === 'approved' ? AUDIT_ACTIONS.APPROVE : AUDIT_ACTIONS.UPDATE,
        resourceType: 'form_review',
        resourceId: response.data?.review_id?.toString(),
        details: { form_id: formId, stage_id: stageId, status },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  advanceToNextStage: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const formId = parseInt(req.params.formId, 10);
      const { reviewer_id } = req.body;

      const response = await formsProxy.advanceFormToNextStage(formId, req.user.role, reviewer_id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'form',
        resourceId: formId.toString(),
        details: { action: 'advance_stage', next_stage: response.data?.next_stage },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },
};

export default reviewStageController;
