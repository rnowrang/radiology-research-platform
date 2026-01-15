import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { formsProxy } from '../services/formsProxy.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS, USER_ROLES } from '../config/constants.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';

export const formsController = {
  // Templates
  getTemplates: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const response = await formsProxy.getTemplates();
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getPublishedTemplates: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const response = await formsProxy.getPublishedTemplates();
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getTemplate: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templateId = parseInt(req.params.templateId, 10);
      const response = await formsProxy.getTemplate(templateId);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Forms
  getForms: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isAdminOrReviewer = req.user?.role === USER_ROLES.ADMIN || req.user?.role === USER_ROLES.REVIEWER;

      const response = isAdminOrReviewer
        ? await formsProxy.getAllForms(req.query as Record<string, unknown>)
        : await formsProxy.getForms(req.user!.id, req.query as Record<string, unknown>);

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getForm: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const response = await formsProxy.getForm(formId, req.user?.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.READ,
        resourceType: 'form',
        resourceId: formId.toString(),
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  createForm: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { template_id, title, project_id } = req.body;

      if (!template_id || !title) {
        throw new ValidationError('Missing required fields', {
          template_id: !template_id ? ['Template ID is required'] : [],
          title: !title ? ['Title is required'] : [],
        });
      }

      const response = await formsProxy.createForm(template_id, title, req.user!.id, project_id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'form',
        resourceId: response.data?.id?.toString(),
        details: { template_id, title },
      });

      res.status(201).json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  updateFormData: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const { changes } = req.body;

      if (!changes || !Array.isArray(changes)) {
        throw new ValidationError('Changes array is required');
      }

      const response = await formsProxy.updateFormData(formId, changes, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'form',
        resourceId: formId.toString(),
        details: { field_count: changes.length },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Versions
  getVersions: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const response = await formsProxy.getVersions(formId);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  createVersion: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const { label } = req.body;

      const response = await formsProxy.createVersion(formId, label || '', req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'form_version',
        resourceId: response.data?.id?.toString(),
        details: { form_id: formId, label },
      });

      res.status(201).json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Review actions
  submitForReview: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const { notes } = req.body;

      const response = await formsProxy.submitForReview(formId, req.user!.id, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.SUBMIT,
        resourceType: 'form',
        resourceId: formId.toString(),
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  requestChanges: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Only reviewers can request changes');
      }

      const formId = parseInt(req.params.formId, 10);
      const { notes } = req.body;

      const response = await formsProxy.requestChanges(formId, req.user!.id, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'form',
        resourceId: formId.toString(),
        details: { action: 'request_changes' },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  approveForm: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Only reviewers can approve forms');
      }

      const formId = parseInt(req.params.formId, 10);
      const { notes } = req.body;

      const response = await formsProxy.approveForm(formId, req.user!.id, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.APPROVE,
        resourceType: 'form',
        resourceId: formId.toString(),
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  rejectForm: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Only reviewers can reject forms');
      }

      const formId = parseInt(req.params.formId, 10);
      const { notes } = req.body;

      const response = await formsProxy.rejectForm(formId, req.user!.id, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.REJECT,
        resourceType: 'form',
        resourceId: formId.toString(),
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Comments
  getComments: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const response = await formsProxy.getComments(formId);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  addComment: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const { content, field_id, section_id, thread_id } = req.body;

      if (!content) {
        throw new ValidationError('Comment content is required');
      }

      const response = await formsProxy.addComment(
        formId,
        req.user!.id,
        content,
        field_id,
        section_id,
        thread_id
      );

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'comment',
        resourceId: response.data?.id?.toString(),
        details: { form_id: formId, field_id },
      });

      res.status(201).json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Export
  generateDocuments: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const { version_id } = req.body;

      const response = await formsProxy.generateDocuments(formId, version_id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.EXPORT,
        resourceType: 'form',
        resourceId: formId.toString(),
        details: { version_id },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  downloadDocx: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const versionId = req.query.version_id ? parseInt(req.query.version_id as string, 10) : undefined;

      const response = await formsProxy.getDocx(formId, versionId);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DOWNLOAD,
        resourceType: 'form',
        resourceId: formId.toString(),
        details: { format: 'docx', version_id: versionId },
      });

      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="form_${formId}.docx"`,
      });

      res.send(Buffer.from(response.data));
    } catch (error) {
      next(error);
    }
  },

  downloadPdf: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const versionId = req.query.version_id ? parseInt(req.query.version_id as string, 10) : undefined;

      const response = await formsProxy.getPdf(formId, versionId);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DOWNLOAD,
        resourceType: 'form',
        resourceId: formId.toString(),
        details: { format: 'pdf', version_id: versionId },
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="form_${formId}.pdf"`,
      });

      res.send(Buffer.from(response.data));
    } catch (error) {
      next(error);
    }
  },

  // Audit
  getAuditLog: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const response = await formsProxy.getAuditLog(formId, req.query as Record<string, unknown>);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getFieldHistory: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const formId = parseInt(req.params.formId, 10);
      const { fieldId } = req.params;
      const response = await formsProxy.getFieldHistory(formId, fieldId);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },
};

export default formsController;
