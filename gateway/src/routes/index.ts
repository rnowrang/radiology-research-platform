import { Router } from 'express';
import authRoutes from './auth.js';
import formsRoutes from './forms.js';

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
router.use('/', formsRoutes);

export default router;
