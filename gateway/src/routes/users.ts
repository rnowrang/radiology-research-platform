import { Router } from 'express';
import { userController } from '../controllers/userController.js';
import { activityController } from '../controllers/activityController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// GET /api/admin/users - List all users (paginated, filterable)
router.get('/', asyncHandler(userController.list));

// GET /api/admin/users/:id - Get user details
router.get('/:id', asyncHandler(userController.get));

// POST /api/admin/users - Create new user
router.post('/', asyncHandler(userController.create));

// PUT /api/admin/users/:id - Update user
router.put('/:id', asyncHandler(userController.update));

// DELETE /api/admin/users/:id - Deactivate user (soft delete)
router.delete('/:id', asyncHandler(userController.deactivate));

// POST /api/admin/users/:id/reset-password - Admin reset password
router.post('/:id/reset-password', asyncHandler(userController.resetPassword));

// POST /api/admin/users/:id/unlock - Unlock locked account
router.post('/:id/unlock', asyncHandler(userController.unlock));

// GET /api/admin/users/:id/activity - Get user activity (admin only)
router.get('/:id/activity', asyncHandler(activityController.getUserActivity));

export default router;
