import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { query } from '../database/connection.js';
import { AuthenticatedRequest, User, TokenPayload } from '../types/index.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Check if request has valid internal API key authentication.
 * Internal services can authenticate using X-Internal-API-Key header.
 * Returns user if authenticated, null otherwise.
 */
const checkInternalAuth = async (req: AuthenticatedRequest): Promise<User | null> => {
  const internalApiKey = req.headers['x-internal-api-key'] as string | undefined;
  const userId = req.headers['x-user-id'] as string | undefined;

  // Check if this is an internal service call
  if (!internalApiKey || internalApiKey !== config.formsService.apiKey) {
    return null;
  }

  // X-User-ID is required for internal auth
  if (!userId) {
    logger.debug('Internal auth: X-Internal-API-Key provided but missing X-User-ID');
    return null;
  }

  // Look up user by ID
  const userResult = await query<User>(
    `SELECT id, email, full_name, role, is_active, email_verified, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    logger.warn(`Internal auth: User not found for ID ${userId}`);
    return null;
  }

  const user = userResult.rows[0];

  if (!user.is_active) {
    logger.warn(`Internal auth: User ${userId} is deactivated`);
    return null;
  }

  logger.debug(`Internal auth: Authenticated as user ${userId}`);
  return user;
};

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // First, try internal API key authentication (for service-to-service calls)
    const internalUser = await checkInternalAuth(req);
    if (internalUser) {
      req.user = internalUser;
      req.sessionId = undefined; // No session for internal auth
      return next();
    }

    // Fall back to JWT authentication
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.access_token;
    // Support token in query params for SSE connections (EventSource can't set headers)
    const queryToken = req.query.token as string | undefined;

    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (cookieToken) {
      token = cookieToken;
    } else if (queryToken) {
      token = queryToken;
    }

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;

    // Check session validity
    const sessionResult = await query<{ is_revoked: boolean; expires_at: Date }>(
      'SELECT is_revoked, expires_at FROM sessions WHERE id = $1',
      [decoded.sessionId]
    );

    if (sessionResult.rows.length === 0) {
      throw new UnauthorizedError('Session not found');
    }

    const session = sessionResult.rows[0];

    if (session.is_revoked) {
      throw new UnauthorizedError('Session has been revoked');
    }

    if (new Date(session.expires_at) < new Date()) {
      throw new UnauthorizedError('Session has expired');
    }

    // Get user
    const userResult = await query<User>(
      `SELECT id, email, full_name, role, is_active, email_verified, created_at, updated_at
       FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedError('User not found');
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      throw new ForbiddenError('Account is deactivated');
    }

    // Check if account is locked
    const lockResult = await query<{ locked_until: Date | null }>(
      'SELECT locked_until FROM users WHERE id = $1',
      [user.id]
    );

    if (lockResult.rows[0]?.locked_until) {
      const lockedUntil = new Date(lockResult.rows[0].locked_until);
      if (lockedUntil > new Date()) {
        throw new ForbiddenError('Account is temporarily locked');
      }
    }

    // Update session last activity
    await query(
      'UPDATE sessions SET last_activity_at = NOW() WHERE id = $1',
      [decoded.sessionId]
    );

    req.user = user;
    req.sessionId = decoded.sessionId;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await authenticate(req, res, () => {});
  } catch {
    // Ignore auth errors for optional auth
    logger.debug('Optional auth: no valid token provided');
  }
  next();
};

/**
 * Middleware that requires the user to be authenticated.
 * Should be used after authenticate middleware.
 */
export const requireAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }
  next();
};

// Re-export AuthenticatedRequest as AuthRequest for convenience
export type AuthRequest = AuthenticatedRequest;
