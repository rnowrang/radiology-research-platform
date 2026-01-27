import { Router } from 'express';
import { taskController } from '../controllers/taskController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// Task Review Queue (admin/reviewer only)
// =============================================================================

// GET /api/tasks/pending-review - Get tasks awaiting review
router.get('/pending-review', taskController.getPendingReviewTasks);

// =============================================================================
// CRUD Routes
// =============================================================================

router.get('/', taskController.list);
router.post('/', taskController.create);
router.get('/:id', taskController.get);
router.put('/:id', taskController.update);
router.patch('/:id', taskController.update);  // Support both PUT and PATCH for updates
router.delete('/:id', taskController.delete);

// =============================================================================
// Task Actions
// =============================================================================

// POST /api/tasks/:id/complete - Mark task as completed
router.post('/:id/complete', taskController.complete);

// POST /api/tasks/:id/start - Start a pending task
router.post('/:id/start', taskController.start);

// POST /api/tasks/:id/assign - Assign/reassign task
router.post('/:id/assign', taskController.assign);

// POST /api/tasks/:id/reopen - Reopen rejected/cancelled task
router.post('/:id/reopen', taskController.reopen);

// POST /api/tasks/:id/reopen-approved - Reopen approved/completed task for revision (admin/reviewer only)
router.post('/:id/reopen-approved', taskController.reopenApproved);

// POST /api/tasks/:id/unblock - Unblock a blocked task
router.post('/:id/unblock', taskController.unblock);

// =============================================================================
// Task Workflow Actions
// =============================================================================

// POST /api/tasks/:taskId/submit - Submit task for review
router.post('/:taskId/submit', taskController.submitTask);

// POST /api/tasks/:taskId/approve - Approve task (admin/reviewer only)
router.post('/:taskId/approve', taskController.approveTask);

// POST /api/tasks/:taskId/reject - Reject task (admin/reviewer only)
router.post('/:taskId/reject', taskController.rejectTask);

// POST /api/tasks/:taskId/request-revision - Request revision (admin/reviewer only)
router.post('/:taskId/request-revision', taskController.requestRevision);

// =============================================================================
// Create Form for Task
// =============================================================================

// POST /api/tasks/:taskId/create-form - Create a form instance for a form_completion task
router.post('/:taskId/create-form', taskController.createFormForTask);

export default router;
