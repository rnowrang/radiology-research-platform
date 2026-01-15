import { Router } from 'express';
import { taskController } from '../controllers/taskController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CRUD routes
router.get('/', taskController.list);
router.post('/', taskController.create);
router.get('/:id', taskController.get);
router.put('/:id', taskController.update);
router.delete('/:id', taskController.delete);

// Task actions
router.post('/:id/complete', taskController.complete);

export default router;
