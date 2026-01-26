import { Request, Response, NextFunction } from 'express';
import { protocolAssistantProxy, UserContext } from '../services/protocolAssistantProxy.js';
import { logger } from '../utils/logger.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';
import { logAudit, AUDIT_ACTIONS } from '../middleware/audit.js';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    full_name?: string;
    role: string;
    institution_id?: string;
  };
}

/**
 * Build UserContext from authenticated request user.
 */
function getUserContext(user: AuthenticatedRequest['user']): UserContext {
  return {
    userId: user!.id,
    role: user!.role,
    email: user!.email,
    name: user!.full_name,
    institutionId: user!.institution_id,
  };
}

export const protocolAssistantController = {
  // Sessions
  createSession: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { project_id } = req.body;
      if (!project_id) {
        throw new ValidationError('project_id is required');
      }

      const response = await protocolAssistantProxy.createSession(project_id, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'protocol_assistant_session',
        resourceId: response.data.session_id,
        details: { project_id },
      });

      res.status(201).json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getSession: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.getSession(sessionId, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  updateSession: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.updateSession(sessionId, req.body, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  closeSession: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.closeSession(sessionId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'protocol_assistant_session',
        resourceId: sessionId,
        details: { action: 'close' },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  resetSessionProtocol: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.resetSessionProtocol(sessionId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'protocol_assistant_session',
        resourceId: sessionId,
        details: { action: 'reset_protocol' },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getOrCreateProjectSession: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params;
      const response = await protocolAssistantProxy.getOrCreateProjectSession(projectId, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Chat
  sendMessage: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const { content, message_type = 'chat' } = req.body;

      if (!content) {
        throw new ValidationError('content is required');
      }

      const response = await protocolAssistantProxy.sendMessage(sessionId, content, message_type, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getHistory: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const response = await protocolAssistantProxy.getHistory(sessionId, limit, offset, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Streaming
  streamResponse: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const message = req.query.message as string;

      if (!message) {
        throw new ValidationError('message query parameter is required');
      }

      const response = await protocolAssistantProxy.streamResponse(sessionId, message, req.user!.id);

      // Forward SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Pipe the stream
      response.data.pipe(res);
    } catch (error) {
      next(error);
    }
  },

  // Document upload
  uploadDocument: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const file = req.file;

      if (!file) {
        throw new ValidationError('File is required');
      }

      const response = await protocolAssistantProxy.uploadDocument(
        sessionId,
        file.buffer,
        file.originalname,
        file.mimetype,
        req.user!.id
      );

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'protocol_document',
        resourceId: sessionId,
        details: { filename: file.originalname, mimetype: file.mimetype },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getDocuments: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.getDocuments(sessionId, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getExtractedProtocol: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.getExtractedProtocol(sessionId, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Gap questions
  getGapQuestions: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.getGapQuestions(sessionId, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  submitGapAnswers: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const { answers } = req.body;

      if (!answers || typeof answers !== 'object') {
        throw new ValidationError('answers object is required');
      }

      const response = await protocolAssistantProxy.submitGapAnswers(sessionId, answers, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Document generation
  generateAbstract: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const wordLimit = parseInt(req.query.word_limit as string) || 350;

      const response = await protocolAssistantProxy.generateAbstract(sessionId, wordLimit, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'generated_abstract',
        resourceId: sessionId,
        details: { word_limit: wordLimit },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  generateConsentForm: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.generateConsentForm(sessionId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'generated_consent_form',
        resourceId: sessionId,
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  generateProtocol: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.generateProtocol(sessionId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'generated_protocol',
        resourceId: sessionId,
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  generateRecruitmentMaterials: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.generateRecruitmentMaterials(sessionId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'generated_recruitment',
        resourceId: sessionId,
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  generateDataManagementPlan: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.generateDataManagementPlan(sessionId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'generated_data_management_plan',
        resourceId: sessionId,
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  generateDocument: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const docType = req.query.doc_type as string;
      const wordLimit = req.query.word_limit ? parseInt(req.query.word_limit as string) : undefined;

      if (!docType) {
        throw new ValidationError('doc_type query parameter is required');
      }

      const response = await protocolAssistantProxy.generateDocument(sessionId, docType, wordLimit, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'generated_document',
        resourceId: sessionId,
        details: { doc_type: docType },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  generateAllDocuments: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const docTypes = req.query.doc_types as string[] | undefined;

      const response = await protocolAssistantProxy.generateAllDocuments(sessionId, docTypes, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'generated_documents_bulk',
        resourceId: sessionId,
        details: { doc_types: docTypes },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Form prefill
  prefillForm: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId, formId } = req.params;
      const response = await protocolAssistantProxy.prefillForm(sessionId, parseInt(formId), req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'form_prefill',
        resourceId: formId,
        details: { session_id: sessionId },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  createPrefilledForm: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const templateId = parseInt(req.query.template_id as string);
      const title = req.query.title as string | undefined;
      const projectId = req.query.project_id as string | undefined;

      if (!templateId) {
        throw new ValidationError('template_id query parameter is required');
      }

      const response = await protocolAssistantProxy.createPrefilledForm(
        sessionId,
        templateId,
        title,
        projectId,
        req.user!.id
      );

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'prefilled_form',
        resourceId: response.data.form_id?.toString(),
        details: { session_id: sessionId, template_id: templateId },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Document types
  getDocumentTypes: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const response = await protocolAssistantProxy.getDocumentTypes();
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Progress
  getProgress: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.getProgress(sessionId, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Admin
  getStats: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== 'admin' && req.user?.role !== 'reviewer') {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const userContext = getUserContext(req.user);
      const response = await protocolAssistantProxy.getStats(userContext);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Health check
  healthCheck: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const response = await protocolAssistantProxy.healthCheck();
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // Wizard endpoints
  getWizardQuestions: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.getWizardQuestions(sessionId, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  submitWizardAnswer: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId, questionId } = req.params;
      const response = await protocolAssistantProxy.submitWizardAnswer(
        sessionId,
        questionId,
        req.body,
        req.user!.id
      );
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  skipWizardQuestion: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId, questionId } = req.params;
      const response = await protocolAssistantProxy.skipWizardQuestion(
        sessionId,
        questionId,
        req.user!.id
      );
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getWizardProgress: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.getWizardProgress(sessionId, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getQuestionSuggestions: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId, questionId } = req.params;
      const response = await protocolAssistantProxy.getQuestionSuggestions(
        sessionId,
        questionId,
        req.user!.id
      );
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  getFormPrefillPreview: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const formId = req.query.formId as string | undefined;
      const response = await protocolAssistantProxy.getFormPrefillPreview(
        sessionId,
        formId,
        req.user!.id
      );
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  prefillFormFromWizard: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const response = await protocolAssistantProxy.prefillFormFromWizard(
        sessionId,
        req.body,
        req.user!.id
      );
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },
};

export default protocolAssistantController;
