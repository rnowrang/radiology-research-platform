import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { query } from '../database/connection.js';
import { AuthenticatedRequest, User, TokenPayload } from '../types/index.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header or cookie
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.access_token;

    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (cookieToken) {
      token = cookieToken;
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
