import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { formsProxy } from '../services/formsProxy.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS, USER_ROLES } from '../config/constants.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';

export const amendmentController = {
  // Get all amendments for a form
  listAmendments: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const { status } = req.query;

      const response = await formsProxy.getFormAmendments(formId, status as string);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Create a new amendment
  createAmendment: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const { amendment_type, description } = req.body;

      if (!amendment_type) {
        throw new ValidationError('Amendment type is required');
      }

      const response = await formsProxy.createAmendment(formId, req.user!.id, amendment_type, description);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'amendment',
        resourceId: response.data?.id?.toString(),
        details: { form_id: formId, amendment_type },
      });

      res.status(201).json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Get amendment details
  getAmendment: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const amendmentId = parseInt(req.params.amendmentId, 10);
      const response = await formsProxy.getAmendment(amendmentId);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Update a draft amendment
  updateAmendment: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const amendmentId = parseInt(req.params.amendmentId, 10);
      const { amendment_type, description } = req.body;

      const response = await formsProxy.updateAmendment(amendmentId, req.user!.id, {
        amendment_type,
        description,
      });

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'amendment',
        resourceId: amendmentId.toString(),
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Delete a draft amendment
  deleteAmendment: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const amendmentId = parseInt(req.params.amendmentId, 10);

      await formsProxy.deleteAmendment(amendmentId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'amendment',
        resourceId: amendmentId.toString(),
      });

      res.json({ success: true, message: 'Amendment deleted' });
    } catch (error) {
      next(error);
    }
  },

  // Add field change
  addFieldChange: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const amendmentId = parseInt(req.params.amendmentId, 10);
      const { field_id, field_label, old_value, new_value, justification } = req.body;

      if (!field_id) {
        throw new ValidationError('Field ID is required');
      }

      const response = await formsProxy.addAmendmentFieldChange(
        amendmentId,
        req.user!.id,
        { field_id, field_label, old_value, new_value, justification }
      );

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'amendment_field_change',
        resourceId: response.data?.id?.toString(),
        details: { amendment_id: amendmentId, field_id },
      });

      res.status(201).json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Update field change
  updateFieldChange: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const amendmentId = parseInt(req.params.amendmentId, 10);
      const changeId = parseInt(req.params.changeId, 10);
      const { field_label, old_value, new_value, justification } = req.body;

      const response = await formsProxy.updateAmendmentFieldChange(
        amendmentId,
        changeId,
        req.user!.id,
        { field_label, old_value, new_value, justification }
      );

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'amendment_field_change',
        resourceId: changeId.toString(),
        details: { amendment_id: amendmentId },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Remove field change
  removeFieldChange: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const amendmentId = parseInt(req.params.amendmentId, 10);
      const changeId = parseInt(req.params.changeId, 10);

      await formsProxy.removeAmendmentFieldChange(amendmentId, changeId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'amendment_field_change',
        resourceId: changeId.toString(),
        details: { amendment_id: amendmentId },
      });

      res.json({ success: true, message: 'Field change removed' });
    } catch (error) {
      next(error);
    }
  },

  // Submit amendment for review
  submitAmendment: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const amendmentId = parseInt(req.params.amendmentId, 10);

      const response = await formsProxy.submitAmendment(amendmentId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.SUBMIT,
        resourceType: 'amendment',
        resourceId: amendmentId.toString(),
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Approve amendment (reviewer only)
  approveAmendment: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Only reviewers can approve amendments');
      }

      const amendmentId = parseInt(req.params.amendmentId, 10);
      const { notes } = req.body;

      const response = await formsProxy.approveAmendment(amendmentId, req.user!.id, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.APPROVE,
        resourceType: 'amendment',
        resourceId: amendmentId.toString(),
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Reject amendment (reviewer only)
  rejectAmendment: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Only reviewers can reject amendments');
      }

      const amendmentId = parseInt(req.params.amendmentId, 10);
      const { notes } = req.body;

      if (!notes) {
        throw new ValidationError('Notes are required when rejecting an amendment');
      }

      const response = await formsProxy.rejectAmendment(amendmentId, req.user!.id, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.REJECT,
        resourceType: 'amendment',
        resourceId: amendmentId.toString(),
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Withdraw amendment (owner only)
  withdrawAmendment: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const amendmentId = parseInt(req.params.amendmentId, 10);

      const response = await formsProxy.withdrawAmendment(amendmentId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'amendment',
        resourceId: amendmentId.toString(),
        details: { action: 'withdraw' },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },
};

export default amendmentController;
