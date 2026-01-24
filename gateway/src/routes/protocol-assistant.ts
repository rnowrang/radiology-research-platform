import { Router } from 'express';
import { protocolAssistantController } from '../controllers/protocolAssistantController.js';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

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
router.post('/sessions/:sessionId/documents/upload', upload.single('file'), protocolAssistantController.uploadDocument);
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

// Admin
router.get('/admin/stats', protocolAssistantController.getStats);

export default router;
