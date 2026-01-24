import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { query } from '../database/connection.js';
import { AuditAction, AUDIT_ACTIONS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

// Re-export for convenience
export { AUDIT_ACTIONS };

interface AuditContext {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export const logAudit = async (
  req: AuthenticatedRequest,
  context: AuditContext,
  success: boolean = true
): Promise<void> => {
  try {
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    await query(
      `INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id,
        ip_address, user_agent, details, session_id, success
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.user?.id || null,
        context.action,
        context.resourceType,
        context.resourceId || null,
        ipAddress,
        userAgent,
        context.details ? JSON.stringify(context.details) : null,
        req.sessionId || null,
        success,
      ]
    );

    logger.debug(`Audit log: ${context.action} on ${context.resourceType}${context.resourceId ? ` (${context.resourceId})` : ''}`);
  } catch (error) {
    logger.error('Failed to write audit log', error);
    // Don't throw - audit logging should not break the request
  }
};

export const auditMiddleware = (
  action: AuditAction,
  resourceType: string,
  getResourceId?: (req: AuthenticatedRequest) => string | undefined
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Store original end function
    const originalEnd = res.end;

    // Override end to log after response
    res.end = function (chunk?: unknown, encoding?: BufferEncoding | (() => void), cb?: () => void): Response {
      // Determine success based on status code
      const success = res.statusCode >= 200 && res.statusCode < 400;

      // Log the audit event
      const resourceId = getResourceId ? getResourceId(req) : undefined;

      logAudit(req, {
        action,
        resourceType,
        resourceId,
        details: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
        },
      }, success).catch((err) => {
        logger.error('Audit middleware error', err);
      });

      // Call original end
      if (typeof encoding === 'function') {
        return originalEnd.call(this, chunk, encoding);
      }
      return originalEnd.call(this, chunk, encoding, cb);
    };

    next();
  };
};
