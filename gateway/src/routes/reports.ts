import { Router } from 'express';
import { reportsController } from '../controllers/reportsController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// GET /api/admin/reports/overview - Get overview metrics
router.get('/overview', asyncHandler(reportsController.getOverview));

// GET /api/admin/reports/projects-by-type - Get projects grouped by type
router.get('/projects-by-type', asyncHandler(reportsController.getProjectsByType));

// GET /api/admin/reports/projects-by-status - Get projects grouped by status
router.get('/projects-by-status', asyncHandler(reportsController.getProjectsByStatus));

// GET /api/admin/reports/forms-by-status - Get forms grouped by status
router.get('/forms-by-status', asyncHandler(reportsController.getFormsByStatus));

// GET /api/admin/reports/forms-by-template - Get forms grouped by template
router.get('/forms-by-template', asyncHandler(reportsController.getFormsByTemplate));

// GET /api/admin/reports/tasks-by-status - Get tasks grouped by status
router.get('/tasks-by-status', asyncHandler(reportsController.getTasksByStatus));

// GET /api/admin/reports/tasks-by-priority - Get tasks grouped by priority
router.get('/tasks-by-priority', asyncHandler(reportsController.getTasksByPriority));

// GET /api/admin/reports/activity-trends - Get activity trends over time
router.get('/activity-trends', asyncHandler(reportsController.getActivityTrends));

// GET /api/admin/reports/top-researchers - Get top researchers by activity
router.get('/top-researchers', asyncHandler(reportsController.getTopResearchers));

// GET /api/admin/reports/department-stats - Get department statistics
router.get('/department-stats', asyncHandler(reportsController.getDepartmentStats));

// GET /api/admin/reports/review-metrics - Get review metrics (avg time, approval rate)
router.get('/review-metrics', asyncHandler(reportsController.getReviewMetrics));

// GET /api/admin/reports/monthly-submissions - Get monthly form submissions
router.get('/monthly-submissions', asyncHandler(reportsController.getMonthlySubmissions));

// GET /api/admin/reports/users-by-role - Get users grouped by role
router.get('/users-by-role', asyncHandler(reportsController.getUsersByRole));

export default router;
