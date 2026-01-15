import { Router } from 'express';
import { formsController } from '../controllers/formsController.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Templates
router.get('/templates', asyncHandler(formsController.getTemplates));
router.get('/templates/published', asyncHandler(formsController.getPublishedTemplates));
router.get('/templates/:templateId', asyncHandler(formsController.getTemplate));

// Forms
router.get('/forms', asyncHandler(formsController.getForms));
router.post('/forms', asyncHandler(formsController.createForm));
router.get('/forms/:formId', asyncHandler(formsController.getForm));
router.post('/forms/:formId/data', asyncHandler(formsController.updateFormData));

// Versions
router.get('/forms/:formId/versions', asyncHandler(formsController.getVersions));
router.post('/forms/:formId/versions', asyncHandler(formsController.createVersion));

// Review workflow
router.post('/forms/:formId/submit', asyncHandler(formsController.submitForReview));
router.post('/forms/:formId/request-changes', asyncHandler(formsController.requestChanges));
router.post('/forms/:formId/approve', asyncHandler(formsController.approveForm));
router.post('/forms/:formId/reject', asyncHandler(formsController.rejectForm));

// Comments
router.get('/forms/:formId/comments', asyncHandler(formsController.getComments));
router.post('/forms/:formId/comments', asyncHandler(formsController.addComment));

// Export
router.post('/forms/:formId/generate', asyncHandler(formsController.generateDocuments));
router.get('/forms/:formId/docx', asyncHandler(formsController.downloadDocx));
router.get('/forms/:formId/pdf', asyncHandler(formsController.downloadPdf));

// Audit
router.get('/forms/:formId/audit', asyncHandler(formsController.getAuditLog));
router.get('/forms/:formId/audit/field/:fieldId', asyncHandler(formsController.getFieldHistory));

export default router;
