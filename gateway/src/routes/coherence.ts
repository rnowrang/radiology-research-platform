/**
 * Coherence Routes - Proxy to Coherence Service
 *
 * Provides endpoints for:
 * - Project coherence status
 * - Conflict management
 * - Rule information
 */

import express, { Response, Router } from 'express';
import axios, { AxiosError } from 'axios';
import { authenticate, requireAuth, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router: Router = express.Router();

// Coherence service URL from environment
const COHERENCE_SERVICE_URL = process.env.COHERENCE_SERVICE_URL || 'http://coherence-service:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// Axios client for coherence service
const coherenceClient = axios.create({
  baseURL: COHERENCE_SERVICE_URL,
  timeout: 30000,
});

/**
 * Build headers for coherence service requests.
 */
function buildHeaders(req: AuthRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Internal-API-Key': INTERNAL_API_KEY,
  };

  if (req.user) {
    headers['X-User-ID'] = req.user.id;
    headers['X-User-Email'] = req.user.email;
    headers['X-User-Role'] = req.user.role;
    if (req.user.institutionId) {
      headers['X-Institution-ID'] = req.user.institutionId;
    }
  }

  return headers;
}

/**
 * Handle errors from coherence service.
 */
function handleError(error: unknown, res: Response, context: string): void {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status || 500;
    const data = axiosError.response?.data || { error: 'Coherence service error' };

    logger.error(`Coherence ${context} error:`, {
      status,
      data,
      message: axiosError.message,
    });

    res.status(status).json(data);
  } else {
    logger.error(`Coherence ${context} error:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================================
// Status Endpoints
// ============================================================================

/**
 * GET /api/coherence/projects/:projectId/status
 * Get coherence status for a project.
 */
router.get(
  '/projects/:projectId/status',
  authenticate,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    try {
      const response = await coherenceClient.get(
        `/api/coherence/projects/${projectId}/status`,
        { headers: buildHeaders(req) }
      );
      res.json(response.data);
    } catch (error) {
      handleError(error, res, 'get status');
    }
  }
);

/**
 * POST /api/coherence/projects/:projectId/validate
 * Trigger full validation of a project.
 */
router.post(
  '/projects/:projectId/validate',
  authenticate,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    try {
      const response = await coherenceClient.post(
        `/api/coherence/projects/${projectId}/validate`,
        req.body,
        { headers: buildHeaders(req) }
      );
      res.json(response.data);
    } catch (error) {
      handleError(error, res, 'validate');
    }
  }
);

/**
 * POST /api/coherence/projects/:projectId/check-realtime
 * Real-time coherence check for a fact change.
 */
router.post(
  '/projects/:projectId/check-realtime',
  authenticate,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    try {
      const response = await coherenceClient.post(
        `/api/coherence/projects/${projectId}/check-realtime`,
        req.body,
        {
          headers: buildHeaders(req),
          timeout: 5000, // Quick timeout for hot-path
        }
      );
      res.json(response.data);
    } catch (error) {
      handleError(error, res, 'realtime check');
    }
  }
);

// ============================================================================
// Conflict Endpoints
// ============================================================================

/**
 * GET /api/coherence/projects/:projectId/conflicts
 * Get all conflicts for a project.
 */
router.get(
  '/projects/:projectId/conflicts',
  authenticate,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { status } = req.query;

    try {
      const params = status ? { status } : {};
      const response = await coherenceClient.get(
        `/api/coherence/projects/${projectId}/conflicts`,
        {
          headers: buildHeaders(req),
          params,
        }
      );
      res.json(response.data);
    } catch (error) {
      handleError(error, res, 'get conflicts');
    }
  }
);

/**
 * GET /api/coherence/projects/:projectId/conflicts/:conflictId
 * Get a specific conflict.
 */
router.get(
  '/projects/:projectId/conflicts/:conflictId',
  authenticate,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { projectId, conflictId } = req.params;

    try {
      const response = await coherenceClient.get(
        `/api/coherence/projects/${projectId}/conflicts/${conflictId}`,
        { headers: buildHeaders(req) }
      );
      res.json(response.data);
    } catch (error) {
      handleError(error, res, 'get conflict');
    }
  }
);

/**
 * POST /api/coherence/projects/:projectId/conflicts/:conflictId/resolve
 * Resolve a conflict.
 */
router.post(
  '/projects/:projectId/conflicts/:conflictId/resolve',
  authenticate,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { projectId, conflictId } = req.params;

    try {
      const response = await coherenceClient.post(
        `/api/coherence/projects/${projectId}/conflicts/${conflictId}/resolve`,
        req.body,
        { headers: buildHeaders(req) }
      );
      res.json(response.data);
    } catch (error) {
      handleError(error, res, 'resolve conflict');
    }
  }
);

// ============================================================================
// Rule Endpoints
// ============================================================================

/**
 * GET /api/coherence/rules
 * List all coherence rules.
 */
router.get(
  '/rules',
  authenticate,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { enabled_only, category } = req.query;

    try {
      const response = await coherenceClient.get('/api/coherence/rules', {
        headers: buildHeaders(req),
        params: { enabled_only, category },
      });
      res.json(response.data);
    } catch (error) {
      handleError(error, res, 'list rules');
    }
  }
);

/**
 * GET /api/coherence/rules/:ruleId
 * Get a specific rule.
 */
router.get(
  '/rules/:ruleId',
  authenticate,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { ruleId } = req.params;

    try {
      const response = await coherenceClient.get(
        `/api/coherence/rules/${ruleId}`,
        { headers: buildHeaders(req) }
      );
      res.json(response.data);
    } catch (error) {
      handleError(error, res, 'get rule');
    }
  }
);

/**
 * POST /api/coherence/rules/:ruleId/evaluate
 * Evaluate a single rule against a project.
 */
router.post(
  '/rules/:ruleId/evaluate',
  authenticate,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { ruleId } = req.params;
    const { project_id } = req.query;

    try {
      const response = await coherenceClient.post(
        `/api/coherence/rules/${ruleId}/evaluate`,
        req.body,
        {
          headers: buildHeaders(req),
          params: { project_id },
        }
      );
      res.json(response.data);
    } catch (error) {
      handleError(error, res, 'evaluate rule');
    }
  }
);

export default router;
