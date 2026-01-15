import { Router } from 'express';
import { emailController } from '../controllers/emailController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// GET /api/admin/email/config - Get current email configuration
router.get('/config', asyncHandler(emailController.getConfig));

// POST /api/admin/email/test - Send a test email
router.post('/test', asyncHandler(emailController.testEmail));

// POST /api/admin/email/verify - Verify email server connection
router.post('/verify', asyncHandler(emailController.verifyConnection));

export default router;
