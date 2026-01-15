import { Router } from 'express';
import { formsController } from '../controllers/formsController.js';
import { fileController } from '../controllers/fileController.js';
import { activityController } from '../controllers/activityController.js';
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

// Review queue (for reviewers/admins)
router.get('/review/queue', asyncHandler(formsController.getReviewQueue));

// Review workflow
router.post('/forms/:formId/submit', asyncHandler(formsController.submitForReview));
router.post('/forms/:formId/request-changes', asyncHandler(formsController.requestChanges));
router.post('/forms/:formId/approve', asyncHandler(formsController.approveForm));
router.post('/forms/:formId/reject', asyncHandler(formsController.rejectForm));
router.post('/forms/:formId/return-to-draft', asyncHandler(formsController.returnToDraft));
router.get('/forms/:formId/review-history', asyncHandler(formsController.getReviewHistory));

// Comments
router.get('/forms/:formId/comments', asyncHandler(formsController.getComments));
router.post('/forms/:formId/comments', asyncHandler(formsController.addComment));
router.post('/threads/:threadId/resolve', asyncHandler(formsController.resolveThread));
router.post('/threads/:threadId/reopen', asyncHandler(formsController.reopenThread));

// Export
router.post('/forms/:formId/generate', asyncHandler(formsController.generateDocuments));
router.get('/forms/:formId/docx', asyncHandler(formsController.downloadDocx));
router.get('/forms/:formId/pdf', asyncHandler(formsController.downloadPdf));

// Audit
router.get('/forms/:formId/audit', asyncHandler(formsController.getAuditLog));
router.get('/forms/:formId/audit/field/:fieldId', asyncHandler(formsController.getFieldHistory));

// Files
router.get('/forms/:formId/files', asyncHandler(fileController.listFormFiles));

// Activity
router.get('/forms/:formId/activity', asyncHandler(activityController.getFormActivity));

// Editing Locks (proxy to forms service)
router.get('/forms/:formId/lock', asyncHandler(formsController.checkLock));
router.post('/forms/:formId/lock', asyncHandler(formsController.acquireLock));
router.delete('/forms/:formId/lock', asyncHandler(formsController.releaseLock));
router.post('/forms/:formId/lock/extend', asyncHandler(formsController.extendLock));
router.get('/forms/:formId/locks', asyncHandler(formsController.getAllLocks));
router.get('/forms/:formId/sections/:sectionId/lock', asyncHandler(formsController.checkSectionLock));
router.post('/forms/:formId/sections/:sectionId/lock', asyncHandler(formsController.acquireSectionLock));
router.delete('/forms/:formId/sections/:sectionId/lock', asyncHandler(formsController.releaseSectionLock));

export default router;
