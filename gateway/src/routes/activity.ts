import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';
import { activityController } from '../controllers/activityController.js';

const router = Router();

// All activity routes require authentication
router.use(authenticate);

// Global activity feed (admin only)
router.get('/', requireAdmin, activityController.getGlobalActivity);

// Current user's own activity
router.get('/me', activityController.getMyActivity);

export default router;
