/**
 * Events Router - Server-Sent Events for real-time updates.
 *
 * Provides:
 * - SSE endpoint for project-specific real-time updates
 * - Event stream information endpoints
 */

import express, { Request, Response, Router } from 'express';
import { authenticate, requireAuth, AuthRequest } from '../middleware/auth.js';
import { getEventService } from '../services/eventService.js';
import { logger } from '../utils/logger.js';

const router: Router = express.Router();

/**
 * SSE endpoint for real-time project updates.
 *
 * GET /api/events/projects/:projectId/stream
 *
 * Clients should connect to this endpoint to receive real-time updates
 * for a specific project. Events include:
 * - Knowledge base changes
 * - Form field changes
 * - Coherence violations/resolutions
 * - Document uploads/extractions
 */
router.get(
  '/projects/:projectId/stream',
  authenticate,
  requireAuth,
  (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const eventService = getEventService();

    if (!eventService.isConnected()) {
      res.status(503).json({
        error: 'Event service unavailable',
        message: 'Real-time updates are temporarily unavailable',
      });
      return;
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Disable request timeout for SSE
    req.setTimeout(0);

    logger.info(`SSE client connected for project ${projectId}`, {
      userId: req.user?.id,
    });

    // Register client
    eventService.registerSSEClient(projectId, res);

    // Send keep-alive every 30 seconds
    const keepAlive = setInterval(() => {
      try {
        res.write(':keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 30000);

    // Clean up on close
    res.on('close', () => {
      clearInterval(keepAlive);
      logger.info(`SSE client disconnected for project ${projectId}`, {
        userId: req.user?.id,
      });
    });
  }
);

/**
 * Get event stream health/info.
 *
 * GET /api/events/health
 */
router.get('/health', async (_req: Request, res: Response) => {
  const eventService = getEventService();

  res.json({
    status: eventService.isConnected() ? 'connected' : 'disconnected',
    streams: eventService.isConnected() ? {
      knowledge: await eventService.getStreamInfo('knowledge'),
      forms: await eventService.getStreamInfo('forms'),
      coherence: await eventService.getStreamInfo('coherence'),
    } : null,
  });
});

/**
 * Get info about a specific event stream.
 *
 * GET /api/events/streams/:streamName
 */
router.get(
  '/streams/:streamName',
  authenticate,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { streamName } = req.params;
    const eventService = getEventService();

    if (!eventService.isConnected()) {
      res.status(503).json({
        error: 'Event service unavailable',
      });
      return;
    }

    const info = await eventService.getStreamInfo(streamName);
    res.json(info);
  }
);

export default router;
