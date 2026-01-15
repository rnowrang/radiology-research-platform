import { Router } from 'express';
import { searchController } from '../controllers/searchController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/search - Full search with pagination
// Query params: q (required), type (all|projects|forms|users|files), page, limit
router.get('/', searchController.search);

// GET /api/search/quick - Quick search for autocomplete
// Query params: q (required, min 2 characters)
router.get('/quick', searchController.quickSearch);

export default router;
