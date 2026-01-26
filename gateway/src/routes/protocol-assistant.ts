import { Router, Request, Response, NextFunction } from 'express';
import { protocolAssistantController } from '../controllers/protocolAssistantController.js';
import { authenticate } from '../middleware/auth.js';
import { uploadMemory } from '../middleware/upload.js';
import { protocolAssistantProxy, UserContext } from '../services/protocolAssistantProxy.js';
import { ForbiddenError } from '../utils/errors.js';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    full_name?: string;
    role: string;
    institution_id?: string;
  };
}

// Health check - no auth required
router.get('/health', protocolAssistantController.healthCheck);

// Apply auth middleware to all other routes
router.use(authenticate);

// Document types (no session required)
router.get('/document-types', protocolAssistantController.getDocumentTypes);

// Sessions
router.post('/sessions', protocolAssistantController.createSession);
router.get('/sessions/:sessionId', protocolAssistantController.getSession);
router.patch('/sessions/:sessionId', protocolAssistantController.updateSession);
router.post('/sessions/:sessionId/close', protocolAssistantController.closeSession);

// Get or create session for project
router.get('/projects/:projectId/session', protocolAssistantController.getOrCreateProjectSession);

// Chat
router.post('/sessions/:sessionId/chat', protocolAssistantController.sendMessage);
router.get('/sessions/:sessionId/history', protocolAssistantController.getHistory);
router.get('/sessions/:sessionId/stream', protocolAssistantController.streamResponse);

// Documents
router.post('/sessions/:sessionId/documents/upload', uploadMemory.single('file'), protocolAssistantController.uploadDocument);
router.get('/sessions/:sessionId/documents', protocolAssistantController.getDocuments);
router.get('/sessions/:sessionId/protocol', protocolAssistantController.getExtractedProtocol);

// Gap questions
router.get('/sessions/:sessionId/gaps', protocolAssistantController.getGapQuestions);
router.post('/sessions/:sessionId/gaps/answers', protocolAssistantController.submitGapAnswers);

// Document generation
router.post('/sessions/:sessionId/generate/abstract', protocolAssistantController.generateAbstract);
router.post('/sessions/:sessionId/generate/consent', protocolAssistantController.generateConsentForm);
router.post('/sessions/:sessionId/generate/protocol', protocolAssistantController.generateProtocol);
router.post('/sessions/:sessionId/generate/recruitment', protocolAssistantController.generateRecruitmentMaterials);
router.post('/sessions/:sessionId/generate/data-management', protocolAssistantController.generateDataManagementPlan);
router.post('/sessions/:sessionId/generate', protocolAssistantController.generateDocument);
router.post('/sessions/:sessionId/generate-all', protocolAssistantController.generateAllDocuments);

// Form prefill
router.post('/sessions/:sessionId/prefill-form/:formId', protocolAssistantController.prefillForm);
router.post('/sessions/:sessionId/create-prefilled-form', protocolAssistantController.createPrefilledForm);

// Progress
router.get('/sessions/:sessionId/progress', protocolAssistantController.getProgress);

// Admin - stats endpoint (legacy)
router.get('/admin/stats', protocolAssistantController.getStats);

// Admin - generic proxy for all admin endpoints
// This forwards /admin/* requests to the protocol-assistant service
router.all('/admin/*', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Require admin role for admin endpoints
    if (req.user?.role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }

    const userContext: UserContext = {
      userId: req.user.id,
      role: req.user.role,
      email: req.user.email,
      name: req.user.full_name,
      institutionId: req.user.institution_id,
    };

    // Build the target path - remove /protocol-assistant prefix if present
    const targetPath = `/api${req.path}`;

    // Forward the request using axios
    const axios = (await import('axios')).default;
    const config = (await import('../config/index.js')).config;

    const response = await axios({
      method: req.method,
      url: `${config.protocolAssistant.url}${targetPath}`,
      params: req.query,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API-Key': config.protocolAssistant.apiKey,
        'X-User-ID': userContext.userId,
        'X-User-Role': userContext.role,
        ...(userContext.email && { 'X-User-Email': userContext.email }),
        ...(userContext.name && { 'X-User-Name': userContext.name }),
        ...(userContext.institutionId && { 'X-Institution-ID': userContext.institutionId }),
      },
      validateStatus: () => true, // Don't throw on non-2xx status
    });

    // Forward the response
    res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
});

export default router;
