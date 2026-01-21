import { Router } from 'express';
import { notificationPreferencesController } from '../controllers/notificationPreferencesController.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/users/me/notification-preferences - Get all preferences for current user
router.get('/', asyncHandler(notificationPreferencesController.list));

// GET /api/users/me/notification-preferences/types - Get available notification types
router.get('/types', asyncHandler(notificationPreferencesController.getTypes));

// PUT /api/users/me/notification-preferences - Update multiple preferences at once
router.put('/', asyncHandler(notificationPreferencesController.updateAll));

// PUT /api/users/me/notification-preferences/:type - Update single preference by type
router.put('/:type', asyncHandler(notificationPreferencesController.update));

export default router;
