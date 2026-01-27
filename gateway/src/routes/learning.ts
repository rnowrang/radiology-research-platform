/**
 * Learning Routes - Proxy to Protocol Assistant learning endpoints
 *
 * Provides:
 * - User learning profile management
 * - Correction tracking
 * - Suggestion feedback
 * - Fact provenance
 */

import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config/index.js';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    full_name?: string;
    role: string;
    institution_id?: string;
  };
}

// Apply auth middleware to all routes
router.use(authenticate);

/**
 * Helper to proxy requests to protocol-assistant learning endpoints
 */
async function proxyToLearning(
  req: AuthenticatedRequest,
  res: Response,
  targetPath: string
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const response = await axios({
      method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      url: `${config.protocolAssistant.url}${targetPath}`,
      params: req.query,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API-Key': config.protocolAssistant.apiKey,
        'X-User-ID': req.user.id,
        'X-User-Role': req.user.role,
        ...(req.user.email && { 'X-User-Email': req.user.email }),
        ...(req.user.full_name && { 'X-User-Name': req.user.full_name }),
        ...(req.user.institution_id && { 'X-Institution-ID': req.user.institution_id }),
      },
      validateStatus: () => true, // Don't throw on non-2xx status
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error('Error proxying to learning service:', error.message);
    res.status(500).json({
      error: 'Failed to communicate with learning service',
      details: error.message,
    });
  }
}

// =============================================================================
// User Profile Endpoints
// =============================================================================

/**
 * GET /learning/profile
 * Get the current user's learning profile
 */
router.get('/profile', async (req: AuthenticatedRequest, res: Response) => {
  await proxyToLearning(req, res, '/learning/profile');
});

/**
 * GET /learning/profile/common-values
 * Get commonly used values for the current user
 */
router.get('/profile/common-values', async (req: AuthenticatedRequest, res: Response) => {
  await proxyToLearning(req, res, '/learning/profile/common-values');
});

// =============================================================================
// Correction Endpoints
// =============================================================================

/**
 * POST /learning/corrections
 * Record a user correction
 */
router.post('/corrections', async (req: AuthenticatedRequest, res: Response) => {
  await proxyToLearning(req, res, '/learning/corrections');
});

/**
 * GET /learning/corrections
 * Get user corrections
 */
router.get('/corrections', async (req: AuthenticatedRequest, res: Response) => {
  await proxyToLearning(req, res, '/learning/corrections');
});

/**
 * GET /learning/corrections/patterns
 * Analyze correction patterns
 */
router.get('/corrections/patterns', async (req: AuthenticatedRequest, res: Response) => {
  await proxyToLearning(req, res, '/learning/corrections/patterns');
});

// =============================================================================
// Feedback Endpoints
// =============================================================================

/**
 * POST /learning/feedback
 * Record feedback on an AI suggestion
 */
router.post('/feedback', async (req: AuthenticatedRequest, res: Response) => {
  await proxyToLearning(req, res, '/learning/feedback');
});

/**
 * GET /learning/feedback/stats
 * Get feedback statistics
 */
router.get('/feedback/stats', async (req: AuthenticatedRequest, res: Response) => {
  await proxyToLearning(req, res, '/learning/feedback/stats');
});

// =============================================================================
// Provenance Endpoints
// =============================================================================

/**
 * POST /learning/projects/:projectId/provenance
 * Create or update fact provenance
 */
router.post(
  '/projects/:projectId/provenance',
  async (req: AuthenticatedRequest, res: Response) => {
    await proxyToLearning(req, res, `/learning/projects/${req.params.projectId}/provenance`);
  }
);

/**
 * GET /learning/projects/:projectId/provenance/:factKey
 * Get provenance for a fact
 */
router.get(
  '/projects/:projectId/provenance/:factKey',
  async (req: AuthenticatedRequest, res: Response) => {
    await proxyToLearning(
      req,
      res,
      `/learning/projects/${req.params.projectId}/provenance/${req.params.factKey}`
    );
  }
);

/**
 * GET /learning/projects/:projectId/provenance/:factKey/history
 * Get history of a fact
 */
router.get(
  '/projects/:projectId/provenance/:factKey/history',
  async (req: AuthenticatedRequest, res: Response) => {
    await proxyToLearning(
      req,
      res,
      `/learning/projects/${req.params.projectId}/provenance/${req.params.factKey}/history`
    );
  }
);

/**
 * POST /learning/projects/:projectId/provenance/reference
 * Add a reference to a fact
 */
router.post(
  '/projects/:projectId/provenance/reference',
  async (req: AuthenticatedRequest, res: Response) => {
    await proxyToLearning(
      req,
      res,
      `/learning/projects/${req.params.projectId}/provenance/reference`
    );
  }
);

/**
 * POST /learning/projects/:projectId/provenance/:factKey/verify
 * Mark a fact as verified
 */
router.post(
  '/projects/:projectId/provenance/:factKey/verify',
  async (req: AuthenticatedRequest, res: Response) => {
    await proxyToLearning(
      req,
      res,
      `/learning/projects/${req.params.projectId}/provenance/${req.params.factKey}/verify`
    );
  }
);

// =============================================================================
// Learning Context Endpoints
// =============================================================================

/**
 * GET /learning/context/:fieldKey
 * Get learning context for a field
 */
router.get('/context/:fieldKey', async (req: AuthenticatedRequest, res: Response) => {
  await proxyToLearning(req, res, `/learning/context/${req.params.fieldKey}`);
});

export default router;
