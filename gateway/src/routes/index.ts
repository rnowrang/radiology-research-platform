import { Router } from 'express';
import authRoutes from './auth.js';
import formsRoutes from './forms.js';
import projectRoutes from './projects.js';
import taskRoutes from './tasks.js';
import usersRoutes from './users.js';
import notificationRoutes from './notifications.js';
import filesRoutes from './files.js';
import searchRoutes from './search.js';
import activityRoutes from './activity.js';
import amendmentRoutes from './amendments.js';
import reviewStagesRoutes from './review-stages.js';
import reportsRoutes from './reports.js';
import emailRoutes from './email.js';
import taskDefinitionsRoutes from './task-definitions.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'gateway',
    },
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);
router.use('/tasks', taskRoutes);
router.use('/admin/users', usersRoutes);
router.use('/admin/reports', reportsRoutes);
router.use('/admin/email', emailRoutes);
router.use('/admin', taskDefinitionsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/files', filesRoutes);
router.use('/search', searchRoutes);
router.use('/activity', activityRoutes);
router.use('/', reviewStagesRoutes);
router.use('/', amendmentRoutes);
router.use('/', formsRoutes);

export default router;
