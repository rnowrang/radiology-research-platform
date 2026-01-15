import { Router } from 'express';
import { amendmentController } from '../controllers/amendmentController.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Form-scoped endpoints
router.get('/forms/:formId/amendments', asyncHandler(amendmentController.listAmendments));
router.post('/forms/:formId/amendments', asyncHandler(amendmentController.createAmendment));

// Amendment-specific endpoints
router.get('/amendments/:amendmentId', asyncHandler(amendmentController.getAmendment));
router.put('/amendments/:amendmentId', asyncHandler(amendmentController.updateAmendment));
router.delete('/amendments/:amendmentId', asyncHandler(amendmentController.deleteAmendment));

// Field change endpoints
router.post('/amendments/:amendmentId/changes', asyncHandler(amendmentController.addFieldChange));
router.put('/amendments/:amendmentId/changes/:changeId', asyncHandler(amendmentController.updateFieldChange));
router.delete('/amendments/:amendmentId/changes/:changeId', asyncHandler(amendmentController.removeFieldChange));

// Workflow endpoints
router.post('/amendments/:amendmentId/submit', asyncHandler(amendmentController.submitAmendment));
router.post('/amendments/:amendmentId/approve', asyncHandler(amendmentController.approveAmendment));
router.post('/amendments/:amendmentId/reject', asyncHandler(amendmentController.rejectAmendment));
router.post('/amendments/:amendmentId/withdraw', asyncHandler(amendmentController.withdrawAmendment));

export default router;
