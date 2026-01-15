import { Router } from 'express';
import { notificationController } from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/notifications - Get user's notifications (paginated)
router.get('/', asyncHandler(notificationController.list));

// GET /api/notifications/unread-count - Get count for badge
router.get('/unread-count', asyncHandler(notificationController.getUnreadCount));

// POST /api/notifications/:id/read - Mark single notification as read
router.post('/:id/read', asyncHandler(notificationController.markAsRead));

// POST /api/notifications/read-all - Mark all as read
router.post('/read-all', asyncHandler(notificationController.markAllAsRead));

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', asyncHandler(notificationController.delete));

export default router;
