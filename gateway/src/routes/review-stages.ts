import { Router } from 'express';
import { reviewStageController } from '../controllers/reviewStageController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// Admin Routes - Review Stage Management
// =============================================================================

// GET /api/admin/review-stages - List all stages
router.get('/admin/review-stages', reviewStageController.listStages);

// POST /api/admin/review-stages - Create a new stage
router.post('/admin/review-stages', reviewStageController.createStage);

// GET /api/admin/review-stages/:stageId - Get a specific stage
router.get('/admin/review-stages/:stageId', reviewStageController.getStage);

// PUT /api/admin/review-stages/:stageId - Update a stage
router.put('/admin/review-stages/:stageId', reviewStageController.updateStage);

// DELETE /api/admin/review-stages/:stageId - Delete (deactivate) a stage
router.delete('/admin/review-stages/:stageId', reviewStageController.deleteStage);

// POST /api/admin/review-stages/reorder - Reorder stages
router.post('/admin/review-stages/reorder', reviewStageController.reorderStages);

// =============================================================================
// Form Review Routes - Stage Progress and Actions
// =============================================================================

// GET /api/review/forms/:formId/stages - Get form review progress
router.get('/review/forms/:formId/stages', reviewStageController.getFormProgress);

// POST /api/review/forms/:formId/stages/:stageId/assign - Assign reviewer to stage
router.post('/review/forms/:formId/stages/:stageId/assign', reviewStageController.assignReviewer);

// POST /api/review/forms/:formId/stages/:stageId/start - Start stage review
router.post('/review/forms/:formId/stages/:stageId/start', reviewStageController.startStageReview);

// POST /api/review/forms/:formId/stages/:stageId/complete - Complete stage review
router.post('/review/forms/:formId/stages/:stageId/complete', reviewStageController.completeStage);

// POST /api/review/forms/:formId/advance - Advance to next stage
router.post('/review/forms/:formId/advance', reviewStageController.advanceToNextStage);

export default router;
